// MARK e-commerce — server HTTP senza dipendenze esterne (Node 22+).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, DATA_DIR, now, J, getSetting, setSetting, tx } = require('./db');
const { seed } = require('./seed');
const { quote, loadProduct, availablePayments, r2 } = require('./pricing');
const pay = require('./payments');

seed();
const PORT = Number(process.env.PORT || 3000);
const PUBLIC = path.join(__dirname, '..', 'public');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) console.warn('[!] Accesso amministratore disabilitato: configura ADMIN_PASSWORD nei Secrets.');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.pdf': 'application/pdf' };

// ---------- helper
const rid = (n = 16) => crypto.randomBytes(n).toString('hex');
class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const bad = (msg, code = 400) => { throw new HttpError(code, msg); };
function send(res, code, data, headers = {}) {
  const body = typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': typeof data === 'object' && !Buffer.isBuffer(data) ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', ...headers });
  res.end(body);
}
function readBody(req, limit = 45 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new HttpError(413, 'File troppo grande')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=').map(decodeURIComponent)).filter((p) => p[0]));
const cookie = (name, val, maxAge) => `${name}=${encodeURIComponent(val)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
const baseUrl = (req) => process.env.PUBLIC_URL || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;

function hashPw(pw) { const salt = rid(8); return `${salt}:${crypto.scryptSync(pw, salt, 32).toString('hex')}`; }
function checkPw(pw, h) { if (!h) return false; const [salt, k] = h.split(':'); const t = crypto.scryptSync(pw, salt, 32).toString('hex'); return crypto.timingSafeEqual(Buffer.from(t), Buffer.from(k)); }
function newSession(kind, ref) { const t = rid(24); db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(t, kind, ref, Date.now() + 30 * 864e5); return t; }
function session(req, kind) {
  const t = cookies(req)[kind === 'admin' ? 'mark_admin' : 'mark_cli'];
  if (!t) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token=? AND kind=?').get(t, kind);
  return s && s.expires_at > Date.now() ? s : null;
}
const requireAdmin = (req) => session(req, 'admin') || bad('Accesso riservato', 401);

function saveDataUrl(dataUrl, dir, name, allowed = ['png', 'jpeg', 'webp']) {
  const m = /^data:image\/(png|jpeg|webp|svg\+xml);base64,(.+)$/.exec(dataUrl || '');
  if (!m) bad('Formato immagine non valido');
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1] === 'svg+xml' ? 'svg' : m[1];
  if (!allowed.includes(m[1])) bad('Formato immagine non consentito');
  const file = `${name}.${ext}`;
  fs.writeFileSync(path.join(dir, file), Buffer.from(m[2], 'base64'));
  return file;
}

// ---------- domain
const productOut = (p) => ({ ...p, active: !!p.active, customizable: !!p.customizable });
function listProducts(all = false) {
  return db.prepare(`SELECT * FROM products ${all ? '' : 'WHERE active=1'} ORDER BY sort, id`).all().map((p) => {
    const full = { ...p, variants: J(p.variants, []), print_options: J(p.print_options, []), profile: J(p.profile, {}) };
    full.tiers = db.prepare('SELECT option_code, min_qty, unit_price FROM price_tiers WHERE product_id=? ORDER BY option_code, min_qty').all(p.id);
    full.from_price = full.tiers.length ? Math.min(...full.tiers.map((t) => t.unit_price)) : null;
    return productOut(full);
  });
}

function commissionFor(orderId, customer, lines, isReorder) {
  let partner = customer.partner_id ? db.prepare('SELECT * FROM partners WHERE id=? AND active=1').get(customer.partner_id) : null;
  if (!partner) return;
  if (isReorder && partner.reorder_months > 0 && customer.first_order_at) {
    const limit = new Date(customer.first_order_at); limit.setMonth(limit.getMonth() + partner.reorder_months);
    if (new Date() > limit) return;
  }
  const base = r2(lines.reduce((a, l) => a + l.goods + (partner.include_setup ? l.setup : 0), 0));
  const rate = isReorder ? partner.rate_reorder : partner.rate_first;
  db.prepare('INSERT INTO commissions(order_id,partner_id,kind,base,rate,amount,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(orderId, partner.id, isReorder ? 'riordino' : 'primo_ordine', base, rate, r2(base * rate / 100), 'in_attesa_pagamento', now(), now());
}
function markPaid(orderId, ref) {
  tx(() => {
    db.prepare("UPDATE orders SET payment_status='pagato', payment_ref=COALESCE(NULLIF(?,''),payment_ref), updated_at=? WHERE id=?").run(ref || '', now(), orderId);
    db.prepare("UPDATE commissions SET status='maturata', updated_at=? WHERE order_id=? AND status='in_attesa_pagamento'").run(now(), orderId);
  });
}
function cancelOrder(orderId, note) {
  tx(() => {
    db.prepare("UPDATE orders SET payment_status='annullato', production_status='annullato', updated_at=? WHERE id=?").run(now(), orderId);
    db.prepare("UPDATE commissions SET status='rettificata', adjusted_amount=0, note=?, updated_at=? WHERE order_id=? AND status!='liquidata'").run(note || 'Ordine annullato', now(), orderId);
  });
}
const orderOut = (o) => o && ({ ...o, billing: J(o.billing, {}), shipping: J(o.shipping, {}), items: J(o.items, []), totals: J(o.totals, {}) });

// ---------- routing
const routes = [];
const route = (method, pattern, fn) => routes.push({ method, re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), fn });

// --- pubblico
route('GET', '/api/config', () => ({
  shop: getSetting('shop', {}), vatRate: getSetting('vat_rate', 22), inks: getSetting('inks', []),
  fonts: db.prepare('SELECT family, category FROM fonts WHERE enabled=1 ORDER BY sort').all(),
  payments: availablePayments(), shippingConfigured: !!getSetting('shipping', {}).configured,
}));
route('GET', '/api/products', () => listProducts());
route('GET', '/api/products/:slug', (req, { slug }) => { const p = listProducts().find((x) => x.slug === slug); return p || bad('Prodotto non trovato', 404); });
route('GET', '/api/templates', (req, params, url) => db.prepare('SELECT id, group_name, name, design FROM templates WHERE enabled=1 AND shape=? ORDER BY sort, id')
  .all(url.searchParams.get('shape') || 'sachet').map((t) => ({ ...t, design: J(t.design, {}) })));
route('POST', '/api/quote', async (req, p, u, body) => quote(body.items, { paymentMethod: body.paymentMethod, customerId: (session(req, 'customer') || {}).ref }));

route('POST', '/api/uploads', async (req, p, u, body) => {
  const file = saveDataUrl(body.dataUrl, path.join(DATA_DIR, 'uploads'), rid(12));
  return { url: `/uploads/${file}` };
});

// bozze (progetti salvati)
route('POST', '/api/projects', async (req, p, u, body) => {
  if (!body.design || !body.productSlug) bad('Dati mancanti');
  const cli = session(req, 'customer');
  const token = body.token && db.prepare('SELECT token FROM projects WHERE token=?').get(body.token) ? body.token : rid(10);
  db.prepare(`INSERT INTO projects(token,product_slug,name,design,customer_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(token) DO UPDATE SET design=excluded.design, name=excluded.name, customer_id=COALESCE(excluded.customer_id, projects.customer_id), updated_at=excluded.updated_at`)
    .run(token, body.productSlug, body.name || '', JSON.stringify(body.design), cli ? cli.ref : null, now(), now());
  return { token };
});
route('GET', '/api/projects/:token', (req, { token }) => {
  const r = db.prepare('SELECT * FROM projects WHERE token=?').get(token) || bad('Progetto non trovato', 404);
  return { ...r, design: J(r.design, {}) };
});
route('POST', '/api/projects/:token/duplicate', (req, { token }) => {
  const r = db.prepare('SELECT * FROM projects WHERE token=?').get(token) || bad('Progetto non trovato', 404);
  const t = rid(10);
  db.prepare('INSERT INTO projects(token,product_slug,name,design,customer_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
    .run(t, r.product_slug, `${r.name || 'Progetto'} (copia)`, r.design, r.customer_id, now(), now());
  return { token: t };
});

// grafica confermata → immutabile
route('POST', '/api/designs', async (req, p, u, body) => {
  const prod = loadProduct(body.productSlug) || bad('Prodotto non trovato');
  if (!prod.customizable) bad('Prodotto non personalizzabile');
  const opt = prod.print_options.find((o) => o.code === body.option) || bad('Tipo di stampa non valido');
  const CONFIRM = 'Ho controllato attentamente la grafica e confermo che testi, nomi, immagini, colori e posizionamento sono corretti.';
  if (body.confirmText !== CONFIRM) bad('Conferma della grafica obbligatoria');
  const d = body.design || bad('Grafica mancante');
  const userObjects = Object.values(d.sides || {}).flatMap((s) => (s.objects || []).filter((o) => !o.fixed));
  if (!userObjects.length) bad('La grafica è vuota');
  const checks = Array.isArray(body.checks) ? body.checks : [];
  if (checks.some((c) => c.level === 'error')) bad('La grafica presenta errori bloccanti: correggili prima di confermare');
  if (d.mode && d.mode !== opt.mode) bad('Modalità colore non coerente con il tipo di stampa');
  const id = rid(12);
  const dir = path.join(DATA_DIR, 'designs', id); fs.mkdirSync(dir, { recursive: true });
  const files = {};
  for (const [k, v] of Object.entries(body.files || {})) {
    if (!/^(preview|production|mockup)_(front|back|side3)$/.test(k) && !/^svg_(front|back|side3)$/.test(k)) continue;
    if (k.startsWith('svg_')) { fs.writeFileSync(path.join(dir, `${k}.svg`), String(v)); files[k] = `${k}.svg`; }
    else files[k] = saveDataUrl(v, dir, k, ['png']);
  }
  fs.writeFileSync(path.join(dir, 'design.json'), JSON.stringify({ design: d, profile: prod.profile, option: opt }, null, 2));
  const usesSide3 = ((d.sides && d.sides.side3 && d.sides.side3.objects) || []).some((o) => !o.fixed) ? 1 : 0;
  db.prepare('INSERT INTO designs(id,product_slug,option_code,design,profile_snapshot,checks,files,uses_side3,confirm_text,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(id, prod.slug, opt.code, JSON.stringify(d), JSON.stringify(prod.profile), JSON.stringify(checks), JSON.stringify(files), usesSide3, CONFIRM, now());
  return { designId: id, usesSide3: !!usesSide3 };
});
route('GET', '/api/designs/:id', (req, { id }) => {
  const d = db.prepare('SELECT id, product_slug, option_code, design, files, uses_side3, review_status, created_at FROM designs WHERE id=?').get(id) || bad('Grafica non trovata', 404);
  return { ...d, design: J(d.design, {}), files: Object.keys(J(d.files, {})) };
});
route('GET', '/api/designs/:id/img/:name', (req, { id, name }) => {
  if (!/^(preview|mockup)_(front|back|side3)$/.test(name)) bad('Non disponibile', 404);
  const d = db.prepare('SELECT files FROM designs WHERE id=?').get(id) || bad('Non trovata', 404);
  const f = J(d.files, {})[name] || bad('Non disponibile', 404);
  return { __file: path.join(DATA_DIR, 'designs', id, f) };
});

// ordini
route('POST', '/api/orders', async (req, p, u, body) => {
  const c = body.customer || {};
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email || '')) bad('Email non valida');
  if (!c.name || !body.shipping || !body.shipping.address || !body.shipping.city || !body.shipping.zip) bad('Compila nome e indirizzo di spedizione');
  if (!body.termsAccepted) bad('Accetta le condizioni di vendita');
  const email = c.email.trim().toLowerCase();
  const sess = session(req, 'customer');
  let cust = sess ? db.prepare('SELECT * FROM customers WHERE id=?').get(sess.ref) : db.prepare('SELECT * FROM customers WHERE email=?').get(email);
  if (!cust) {
    const ref = cookies(req).mark_ref;
    const partner = (ref && db.prepare('SELECT id FROM partners WHERE code=? AND active=1').get(ref)) || db.prepare('SELECT id FROM partners WHERE is_default=1 AND active=1').get();
    const r = db.prepare('INSERT INTO customers(email,name,company,vat,phone,password_hash,partner_id,created_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(email, c.name, c.company || '', c.vat || '', c.phone || '', body.password ? hashPw(body.password) : null, partner ? partner.id : null, now());
    cust = db.prepare('SELECT * FROM customers WHERE id=?').get(r.lastInsertRowid);
  } else if (body.password && !cust.password_hash) {
    db.prepare('UPDATE customers SET password_hash=? WHERE id=?').run(hashPw(body.password), cust.id);
  }
  const q = quote(body.items, { paymentMethod: body.paymentMethod, customerId: cust.id, requireDesign: true });
  if (!q.lines.length) bad('Il carrello è vuoto');
  if (q.errors.length) bad(q.errors.join(' · '));
  const isReorder = !!db.prepare("SELECT 1 FROM orders WHERE customer_id=? AND payment_status!='annullato'").get(cust.id);
  const token = rid(16);
  const order = tx(() => {
    const r = db.prepare(`INSERT INTO orders(number,token,customer_id,billing,shipping,items,totals,payment_method,production_status,is_reorder,notes,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(`TMP-${token}`, token, cust.id, JSON.stringify({ ...c, email }), JSON.stringify(body.shipping),
      JSON.stringify(q.lines), JSON.stringify(q.totals), body.paymentMethod, q.lines.some((l) => l.customizable) ? 'grafica_da_verificare' : 'in_produzione',
      isReorder ? 1 : 0, body.notes || '', now(), now());
    const id = Number(r.lastInsertRowid);
    const number = `MK${new Date().getFullYear()}-${String(id).padStart(5, '0')}`;
    db.prepare('UPDATE orders SET number=? WHERE id=?').run(number, id);
    if (!cust.first_order_at) db.prepare('UPDATE customers SET first_order_at=? WHERE id=?').run(now(), cust.id);
    commissionFor(id, cust, q.lines, isReorder);
    return { id, number, token, total: q.totals.total, email };
  });
  const out = { orderNumber: order.number, token, total: order.total };
  if (body.paymentMethod === 'stripe' || body.paymentMethod === 'paypal') {
    try {
      const s = body.paymentMethod === 'stripe' ? await pay.stripeCheckout(order, baseUrl(req)) : await pay.paypalCreate(order, baseUrl(req));
      db.prepare('UPDATE orders SET payment_ref=? WHERE id=?').run(s.ref, order.id);
      out.redirect = s.url;
    } catch (e) { console.error(e); out.paymentError = 'Pagamento online non avviato: puoi riprovare dalla pagina dell\'ordine.'; }
  }
  return out;
});
route('GET', '/api/orders/:token', (req, { token }) => {
  const o = orderOut(db.prepare('SELECT * FROM orders WHERE token=?').get(token)) || bad('Ordine non trovato', 404);
  const pm = getSetting('payments', {});
  return { number: o.number, created_at: o.created_at, items: o.items, totals: o.totals, payment_method: o.payment_method, payment_status: o.payment_status,
    production_status: o.production_status, tracking: o.tracking, shipping: o.shipping,
    bank: o.payment_method === 'bonifico' ? { iban: pm.bonifico.iban, holder: pm.bonifico.holder, bank: pm.bonifico.bank, causale: `Ordine ${o.number}` } : null };
});
route('POST', '/api/orders/:token/pay', async (req, { token }) => {
  const o = db.prepare('SELECT * FROM orders WHERE token=?').get(token) || bad('Ordine non trovato', 404);
  if (o.payment_status !== 'in_attesa' || !['stripe', 'paypal'].includes(o.payment_method)) bad('Pagamento non disponibile');
  const ord = { ...o, total: J(o.totals).total, email: J(o.billing).email };
  const s = o.payment_method === 'stripe' ? await pay.stripeCheckout(ord, baseUrl(req)) : await pay.paypalCreate(ord, baseUrl(req));
  db.prepare('UPDATE orders SET payment_ref=? WHERE id=?').run(s.ref, o.id);
  return { redirect: s.url };
});
route('GET', '/api/pay/stripe/return', async (req, p, url) => {
  const o = db.prepare('SELECT * FROM orders WHERE token=?').get(url.searchParams.get('order')) || bad('Ordine non trovato', 404);
  const s = await pay.stripeSessionPaid(url.searchParams.get('session_id'));
  if (s.paid && s.token === o.token && o.payment_status === 'in_attesa') markPaid(o.id, s.ref);
  return { __redirect: `/ordine.html?t=${o.token}` };
});
route('POST', '/api/webhooks/stripe', async (req, p, u, body, raw) => {
  const ev = pay.stripeVerifyWebhook(raw, req.headers['stripe-signature']) || bad('Firma non valida');
  if (ev.type === 'checkout.session.completed' && ev.data.object.payment_status === 'paid') {
    const o = db.prepare('SELECT * FROM orders WHERE token=?').get(ev.data.object.metadata.order_token);
    if (o && o.payment_status === 'in_attesa') markPaid(o.id, ev.data.object.payment_intent);
  }
  return { received: true };
});
route('GET', '/api/pay/paypal/return', async (req, p, url) => {
  const o = db.prepare('SELECT * FROM orders WHERE token=?').get(url.searchParams.get('order')) || bad('Ordine non trovato', 404);
  const ppId = url.searchParams.get('token');
  if (o.payment_status === 'in_attesa' && ppId === o.payment_ref) { const c = await pay.paypalCapture(ppId); if (c.paid) markPaid(o.id, c.ref); }
  return { __redirect: `/ordine.html?t=${o.token}` };
});
route('GET', '/r/:code', (req, { code }) => ({ __redirect: '/', __cookie: cookie('mark_ref', code.toUpperCase(), 90 * 864e5) }));

// area clienti
route('POST', '/api/account/register', async (req, p, u, b) => {
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || String(b.password || '').length < 8) bad('Email valida e password di almeno 8 caratteri');
  const ex = db.prepare('SELECT * FROM customers WHERE email=?').get(email);
  if (ex && ex.password_hash) bad('Account già esistente: accedi');
  let id;
  if (ex) { db.prepare('UPDATE customers SET password_hash=?, name=COALESCE(NULLIF(?,\'\'),name) WHERE id=?').run(hashPw(b.password), b.name || '', ex.id); id = ex.id; }
  else {
    const ref = cookies(req).mark_ref;
    const partner = (ref && db.prepare('SELECT id FROM partners WHERE code=? AND active=1').get(ref)) || db.prepare('SELECT id FROM partners WHERE is_default=1 AND active=1').get();
    id = Number(db.prepare('INSERT INTO customers(email,name,password_hash,partner_id,created_at) VALUES(?,?,?,?,?)').run(email, b.name || '', hashPw(b.password), partner ? partner.id : null, now()).lastInsertRowid);
  }
  return { ok: true, __cookie: cookie('mark_cli', newSession('customer', id), 30 * 86400) };
});
route('POST', '/api/account/login', async (req, p, u, b) => {
  const c = db.prepare('SELECT * FROM customers WHERE email=?').get(String(b.email || '').trim().toLowerCase());
  if (!c || !checkPw(String(b.password || ''), c.password_hash)) bad('Credenziali non valide', 401);
  return { ok: true, __cookie: cookie('mark_cli', newSession('customer', c.id), 30 * 86400) };
});
route('POST', '/api/account/logout', () => ({ ok: true, __cookie: cookie('mark_cli', '', 0) }));
route('GET', '/api/account', (req) => {
  const s = session(req, 'customer') || bad('Non autenticato', 401);
  const c = db.prepare('SELECT id,email,name,company,vat,phone FROM customers WHERE id=?').get(s.ref);
  const orders = db.prepare('SELECT * FROM orders WHERE customer_id=? ORDER BY id DESC').all(s.ref).map(orderOut)
    .map((o) => ({ number: o.number, token: o.token, created_at: o.created_at, items: o.items, total: o.totals.total, payment_status: o.payment_status, production_status: o.production_status, tracking: o.tracking }));
  const projects = db.prepare('SELECT token, product_slug, name, updated_at FROM projects WHERE customer_id=? ORDER BY updated_at DESC').all(s.ref);
  return { customer: c, orders, projects };
});

// --- admin
route('POST', '/api/admin/login', async (req, p, u, b) => {
  if (!ADMIN_PASSWORD) bad('Accesso amministratore non configurato', 503);
  const a = Buffer.from(String(b.password || '')); const e = Buffer.from(ADMIN_PASSWORD);
  if (a.length !== e.length || !crypto.timingSafeEqual(a, e)) bad('Password errata', 401);
  return { ok: true, __cookie: cookie('mark_admin', newSession('admin', 0), 7 * 86400) };
});
route('POST', '/api/admin/logout', () => ({ ok: true, __cookie: cookie('mark_admin', '', 0) }));
route('GET', '/api/admin/me', (req) => ({ admin: !!session(req, 'admin'), configured: !!ADMIN_PASSWORD }));
route('GET', '/api/admin/dashboard', (req) => {
  requireAdmin(req);
  const warnings = [];
  const ship = getSetting('shipping', {}); const pm = getSetting('payments', {});
  if (!ship.configured) warnings.push('Spedizioni non configurate: gli ordini sono bloccati finché non le imposti (Impostazioni → Spedizioni).');
  if (pm.bonifico && pm.bonifico.enabled && !pm.bonifico.iban) warnings.push('Bonifico attivo ma IBAN mancante.');
  if (pm.contrassegno && pm.contrassegno.enabled && !Number(pm.contrassegno.surchargeFixed) && !Number(pm.contrassegno.surchargePct)) warnings.push('Contrassegno attivo senza supplemento impostato.');
  if (pm.stripe && pm.stripe.enabled && !process.env.STRIPE_SECRET_KEY) warnings.push('Stripe attivo ma STRIPE_SECRET_KEY non impostata nei Secrets.');
  if (pm.paypal && pm.paypal.enabled && !(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET)) warnings.push('PayPal attivo ma credenziali non impostate nei Secrets.');
  if (db.prepare('SELECT 1 FROM partners WHERE active=1 AND rate_first=0 AND rate_reorder=0').get()) warnings.push('Ci sono partner con percentuali di provvigione a 0%.');
  if (!ADMIN_PASSWORD) warnings.push('Accesso amministratore non configurato: imposta ADMIN_PASSWORD nei Secrets.');
  if (db.prepare("SELECT 1 FROM products WHERE active=1 AND customizable=1 AND json_extract(profile,'$.specsToVerify')=1").get()) warnings.push('Alcuni prodotti hanno misure di stampa da verificare (Prodotti → profilo tecnico).');
  const noWeight = db.prepare('SELECT COUNT(*) c FROM products WHERE active=1 AND unit_weight_kg IS NULL').get().c;
  if (noWeight) warnings.push(`${noWeight} prodotti attivi senza peso per unità: il costo di spedizione per questi articoli è calcolato a 0 kg (Prodotti → peso per unità).`);
  const st = db.prepare(`SELECT COUNT(*) n, SUM(CASE WHEN payment_status='pagato' THEN json_extract(totals,'$.total') ELSE 0 END) incassato,
    SUM(CASE WHEN production_status='grafica_da_verificare' THEN 1 ELSE 0 END) grafiche, SUM(CASE WHEN payment_status='in_attesa' THEN 1 ELSE 0 END) attesa FROM orders WHERE payment_status!='annullato'`).get();
  const comm = db.prepare('SELECT status, SUM(COALESCE(adjusted_amount, amount)) tot, COUNT(*) n FROM commissions GROUP BY status').all();
  return { warnings, stats: st, commissions: comm };
});
route('GET', '/api/admin/orders', (req, p, url) => {
  requireAdmin(req);
  const s = url.searchParams.get('status');
  const rows = db.prepare(`SELECT o.*, c.email, c.name cname FROM orders o JOIN customers c ON c.id=o.customer_id ${s ? 'WHERE o.production_status=? OR o.payment_status=?' : ''} ORDER BY o.id DESC LIMIT 500`)
    .all(...(s ? [s, s] : []));
  return rows.map(orderOut);
});
route('GET', '/api/admin/orders/:id', (req, { id }) => {
  requireAdmin(req);
  const o = orderOut(db.prepare('SELECT o.*, c.email, c.partner_id FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.id=?').get(id)) || bad('Non trovato', 404);
  o.designs = o.items.filter((i) => i.designId).map((i) => {
    const d = db.prepare('SELECT id, option_code, files, checks, review_status, uses_side3, created_at FROM designs WHERE id=?').get(i.designId);
    return d && { ...d, files: J(d.files, {}), checks: J(d.checks, []) };
  }).filter(Boolean);
  o.commissions = db.prepare('SELECT c.*, p.name partner FROM commissions c JOIN partners p ON p.id=c.partner_id WHERE order_id=?').all(id);
  return o;
});
route('PATCH', '/api/admin/orders/:id', async (req, { id }, u, b) => {
  requireAdmin(req);
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(id) || bad('Non trovato', 404);
  if (b.payment_status === 'pagato' && o.payment_status !== 'pagato') markPaid(o.id, b.payment_ref);
  if (b.payment_status === 'annullato' || b.production_status === 'annullato') cancelOrder(o.id, b.note);
  if (b.payment_status === 'rimborsato') { db.prepare("UPDATE orders SET payment_status='rimborsato' WHERE id=?").run(o.id); db.prepare("UPDATE commissions SET status='rettificata', adjusted_amount=0, note='Ordine rimborsato', updated_at=? WHERE order_id=? AND status!='liquidata'").run(now(), o.id); }
  if (b.production_status && b.production_status !== 'annullato') {
    if (b.production_status === 'in_produzione') {
      const pending = J(o.items, []).filter((i) => i.designId).some((i) => (db.prepare('SELECT review_status FROM designs WHERE id=?').get(i.designId) || {}).review_status !== 'approvata');
      if (pending) bad('Approva tutte le grafiche dell\'ordine prima di avviare la produzione');
    }
    db.prepare('UPDATE orders SET production_status=?, updated_at=? WHERE id=?').run(b.production_status, now(), o.id);
  }
  for (const f of ['tracking', 'admin_notes']) if (b[f] != null) db.prepare(`UPDATE orders SET ${f}=?, updated_at=? WHERE id=?`).run(String(b[f]), now(), o.id);
  return { ok: true };
});
route('PATCH', '/api/admin/designs/:id', async (req, { id }, u, b) => {
  requireAdmin(req);
  if (!['da_verificare', 'approvata', 'da_correggere'].includes(b.review_status)) bad('Stato non valido');
  db.prepare('UPDATE designs SET review_status=? WHERE id=?').run(b.review_status, id);
  return { ok: true };
});
route('GET', '/api/admin/designs/:id/file/:name', (req, { id, name }) => {
  requireAdmin(req);
  const d = db.prepare('SELECT files FROM designs WHERE id=?').get(id) || bad('Non trovata', 404);
  if (name === 'design.json') return { __file: path.join(DATA_DIR, 'designs', id, 'design.json'), __download: `${id}-design.json` };
  const f = J(d.files, {})[name] || bad('File non disponibile', 404);
  return { __file: path.join(DATA_DIR, 'designs', id, f), __download: `${id}-${f}` };
});

// prodotti
route('GET', '/api/admin/products', (req) => { requireAdmin(req); return listProducts(true); });
function saveProduct(id, b) {
  const fields = ['slug', 'name', 'category', 'description', 'customizable', 'unit_label', 'unit_detail', 'qty_step', 'unit_weight_kg', 'setup_fee', 'image', 'sort', 'active'];
  const jsonFields = ['variants', 'print_options', 'profile'];
  tx(() => {
    if (!id) id = Number(db.prepare("INSERT INTO products(slug,name,category,unit_label) VALUES(?,?,?,?)").run(b.slug || `prodotto-${rid(3)}`, b.name || 'Nuovo prodotto', b.category || 'Altro', b.unit_label || 'pezzo').lastInsertRowid);
    for (const f of fields) if (b[f] !== undefined) db.prepare(`UPDATE products SET ${f}=? WHERE id=?`).run(typeof b[f] === 'boolean' ? Number(b[f]) : b[f], id);
    for (const f of jsonFields) if (b[f] !== undefined) db.prepare(`UPDATE products SET ${f}=? WHERE id=?`).run(JSON.stringify(b[f]), id);
    if (Array.isArray(b.tiers)) {
      db.prepare('DELETE FROM price_tiers WHERE product_id=?').run(id);
      for (const t of b.tiers) db.prepare('INSERT INTO price_tiers(product_id,option_code,min_qty,unit_price) VALUES(?,?,?,?)').run(id, t.option_code, Number(t.min_qty), Number(t.unit_price));
    }
  });
  return { ok: true, id };
}
route('POST', '/api/admin/products', async (req, p, u, b) => { requireAdmin(req); return saveProduct(null, b); });
route('PUT', '/api/admin/products/:id', async (req, { id }, u, b) => { requireAdmin(req); return saveProduct(Number(id), b); });

// template, font
route('GET', '/api/admin/templates', (req) => { requireAdmin(req); return db.prepare('SELECT * FROM templates ORDER BY shape, sort, id').all().map((t) => ({ ...t, design: J(t.design, {}) })); });
route('POST', '/api/admin/templates', async (req, p, u, b) => {
  requireAdmin(req);
  const r = db.prepare('INSERT INTO templates(shape,group_name,name,design,sort) VALUES(?,?,?,?,?)').run(b.shape || 'sachet', b.group_name || 'Bar e ristoranti', b.name || 'Nuovo template', JSON.stringify(b.design || {}), Number(b.sort || 99));
  return { id: Number(r.lastInsertRowid) };
});
route('PUT', '/api/admin/templates/:id', async (req, { id }, u, b) => {
  requireAdmin(req);
  for (const f of ['group_name', 'name', 'enabled', 'sort', 'shape']) if (b[f] !== undefined) db.prepare(`UPDATE templates SET ${f}=? WHERE id=?`).run(typeof b[f] === 'boolean' ? Number(b[f]) : b[f], id);
  if (b.design) db.prepare('UPDATE templates SET design=? WHERE id=?').run(JSON.stringify(b.design), id);
  return { ok: true };
});
route('DELETE', '/api/admin/templates/:id', (req, { id }) => { requireAdmin(req); db.prepare('DELETE FROM templates WHERE id=?').run(id); return { ok: true }; });
route('GET', '/api/admin/fonts', (req) => { requireAdmin(req); return db.prepare('SELECT * FROM fonts ORDER BY sort').all(); });
route('POST', '/api/admin/fonts', async (req, p, u, b) => {
  requireAdmin(req);
  if (!b.family) bad('Nome font mancante');
  db.prepare('INSERT INTO fonts(family,category,enabled,sort) VALUES(?,?,?,?) ON CONFLICT(family) DO UPDATE SET category=excluded.category, enabled=excluded.enabled')
    .run(b.family, b.category || 'Moderni e minimalisti', b.enabled === false ? 0 : 1, 999);
  return { ok: true };
});

// impostazioni
const SETTING_KEYS = ['shop', 'vat_rate', 'inks', 'shipping', 'payments', 'reorder_setup_fee'];
route('GET', '/api/admin/settings', (req) => {
  requireAdmin(req);
  const out = Object.fromEntries(SETTING_KEYS.map((k) => [k, getSetting(k, null)]));
  out.env = { stripe: !!process.env.STRIPE_SECRET_KEY, stripeWebhook: !!process.env.STRIPE_WEBHOOK_SECRET, paypal: !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET), paypalEnv: process.env.PAYPAL_ENV || 'sandbox' };
  return out;
});
route('PUT', '/api/admin/settings', async (req, p, u, b) => {
  requireAdmin(req);
  for (const k of SETTING_KEYS) if (b[k] !== undefined) setSetting(k, b[k]);
  return { ok: true };
});

// partner, clienti, provvigioni
route('GET', '/api/admin/partners', (req) => { requireAdmin(req); return db.prepare('SELECT * FROM partners ORDER BY id').all(); });
route('POST', '/api/admin/partners', async (req, p, u, b) => {
  requireAdmin(req);
  const r = db.prepare('INSERT INTO partners(name,code) VALUES(?,?)').run(b.name || 'Nuovo partner', String(b.code || rid(3)).toUpperCase());
  return { id: Number(r.lastInsertRowid) };
});
route('PUT', '/api/admin/partners/:id', async (req, { id }, u, b) => {
  requireAdmin(req);
  tx(() => {
    if (b.is_default) db.prepare('UPDATE partners SET is_default=0').run();
    for (const f of ['name', 'code', 'rate_first', 'rate_reorder', 'reorder_months', 'include_setup', 'is_default', 'active', 'notes'])
      if (b[f] !== undefined) db.prepare(`UPDATE partners SET ${f}=? WHERE id=?`).run(typeof b[f] === 'boolean' ? Number(b[f]) : b[f], id);
  });
  return { ok: true };
});
route('GET', '/api/admin/customers', (req) => {
  requireAdmin(req);
  return db.prepare(`SELECT c.id,c.email,c.name,c.company,c.phone,c.partner_id,c.first_order_at,c.created_at,
    (SELECT COUNT(*) FROM orders o WHERE o.customer_id=c.id AND o.payment_status!='annullato') orders FROM customers c ORDER BY c.id DESC`).all();
});
route('PUT', '/api/admin/customers/:id', async (req, { id }, u, b) => {
  requireAdmin(req);
  db.prepare('UPDATE customers SET partner_id=? WHERE id=?').run(b.partner_id || null, id);
  return { ok: true };
});
route('GET', '/api/admin/commissions', (req, p, url) => {
  requireAdmin(req);
  const st = url.searchParams.get('status');
  return db.prepare(`SELECT cm.*, p.name partner, o.number, o.created_at order_date, c.email FROM commissions cm JOIN partners p ON p.id=cm.partner_id
    JOIN orders o ON o.id=cm.order_id JOIN customers c ON c.id=o.customer_id ${st ? 'WHERE cm.status=?' : ''} ORDER BY cm.id DESC`).all(...(st ? [st] : []));
});
route('PATCH', '/api/admin/commissions/:id', async (req, { id }, u, b) => {
  requireAdmin(req);
  const c = db.prepare('SELECT * FROM commissions WHERE id=?').get(id) || bad('Non trovata', 404);
  const allowed = { maturata: ['da_liquidare', 'rettificata'], da_liquidare: ['liquidata', 'maturata', 'rettificata'], liquidata: ['rettificata'], rettificata: ['da_liquidare', 'maturata'], in_attesa_pagamento: ['rettificata'] };
  if (b.status && b.status !== c.status) {
    if (!(allowed[c.status] || []).includes(b.status)) bad(`Passaggio da "${c.status}" a "${b.status}" non consentito`);
    if (b.status === 'rettificata' && (b.adjusted_amount === undefined || b.adjusted_amount === '')) bad('Indica l\'importo rettificato');
    db.prepare('UPDATE commissions SET status=?, updated_at=?, paid_at=CASE WHEN ?=\'liquidata\' THEN ? ELSE paid_at END WHERE id=?').run(b.status, now(), b.status, now(), id);
  }
  if (b.adjusted_amount !== undefined && b.adjusted_amount !== '') db.prepare('UPDATE commissions SET adjusted_amount=? WHERE id=?').run(Number(b.adjusted_amount), id);
  if (b.note !== undefined) db.prepare('UPDATE commissions SET note=? WHERE id=?').run(b.note, id);
  return { ok: true };
});
route('POST', '/api/admin/uploads', async (req, p, u, b) => { requireAdmin(req); return { url: `/uploads/${saveDataUrl(b.dataUrl, path.join(DATA_DIR, 'uploads'), rid(12))}` }; });

// ---------- server
function serveFile(res, file, download) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, { error: 'Non trovato' });
  const h = { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' };
  if (download) h['Content-Disposition'] = `attachment; filename="${download}"`;
  if (path.extname(file) === '.svg') h['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src https:";
  res.writeHead(200, h); fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  try {
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.re.exec(p); if (!m) continue;
      const raw = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : '';
      let body = {};
      if (raw && !p.startsWith('/api/webhooks')) { try { body = JSON.parse(raw); } catch { bad('JSON non valido'); } }
      const out = await r.fn(req, m.groups || {}, url, body, raw);
      if (out && out.__file) return serveFile(res, out.__file, out.__download);
      const headers = {};
      if (out && out.__cookie) { headers['Set-Cookie'] = out.__cookie; delete out.__cookie; }
      if (out && out.__redirect) { res.writeHead(302, { Location: out.__redirect, ...headers }); return res.end(); }
      return send(res, 200, out, headers);
    }
    if (p.startsWith('/api/')) return send(res, 404, { error: 'Endpoint non trovato' });
    if (p.startsWith('/uploads/')) return serveFile(res, path.join(DATA_DIR, 'uploads', path.basename(p)));
    let file = path.normalize(path.join(PUBLIC, p === '/' ? 'index.html' : p));
    if (!file.startsWith(PUBLIC)) return send(res, 403, 'Vietato');
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    return serveFile(res, file);
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    send(res, e.code || 500, { error: e instanceof HttpError ? e.message : 'Errore interno' });
  }
});
server.listen(PORT, '0.0.0.0', () => console.log(`MARK in ascolto su http://localhost:${PORT}`));
module.exports = server;
