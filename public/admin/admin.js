// Gestionale MARK
(() => {
  const { qs, qsa, api, money, esc, toast } = Mark;
  const main = qs('#main'); const drawer = qs('#drawer');
  const PAY = { in_attesa: 'In attesa', pagato: 'Pagato', rimborsato: 'Rimborsato', annullato: 'Annullato' };
  const PROD = { grafica_da_verificare: 'Grafica da verificare', in_produzione: 'In produzione', spedito: 'Spedito', consegnato: 'Consegnato', annullato: 'Annullato' };
  const PM = { bonifico: 'Bonifico', contrassegno: 'Contrassegno', stripe: 'Carta (Stripe)', paypal: 'PayPal' };
  const COMM = { in_attesa_pagamento: 'In attesa di pagamento', maturata: 'Maturata', da_liquidare: 'Da liquidare', liquidata: 'Liquidata', rettificata: 'Rettificata' };
  const pillPay = (s) => `<span class="pill ${s === 'pagato' ? 'ok' : s === 'annullato' ? 'err' : 'warn'}">${PAY[s] || s}</span>`;
  const date = (d) => (d ? new Date(d).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : '');
  const save = async (url, body, method = 'PUT') => { try { await api(url, { method, body }); toast('Salvato'); return true; } catch (e) { toast(e.message, 'err'); return false; } };

  async function start() {
    const me = await api('/api/admin/me');
    qs('#login').hidden = me.admin; qs('#app').hidden = !me.admin;
    if (me.admin) go(location.hash.slice(1) || 'dash');
  }
  qs('#lf').onsubmit = async (e) => { e.preventDefault(); try { await api('/api/admin/login', { body: Object.fromEntries(new FormData(e.target)) }); start(); } catch (err) { toast(err.message, 'err'); } };
  qs('#logout').onclick = async () => { await api('/api/admin/logout', { body: {} }); location.reload(); };
  qsa('#nav [data-s]').forEach((b) => { b.onclick = () => go(b.dataset.s); });
  function go(s) { location.hash = s; qsa('#nav [data-s]').forEach((b) => b.classList.toggle('on', b.dataset.s === s)); drawer.hidden = true; (SECTIONS[s] || SECTIONS.dash)().catch((e) => { main.innerHTML = `<div class="alert err">${esc(e.message)}</div>`; }); }

  const SECTIONS = {
    async dash() {
      const d = await api('/api/admin/dashboard');
      const c = Object.fromEntries(d.commissions.map((x) => [x.status, x.tot || 0]));
      main.innerHTML = `<h2>Dashboard</h2>${d.warnings.map((w) => `<div class="alert warn">${esc(w)}</div>`).join('')}
        <div class="kpis"><div class="card">Ordini attivi<b>${d.stats.n || 0}</b></div><div class="card">Incassato<b>${money(d.stats.incassato || 0)}</b></div>
        <div class="card">Grafiche da verificare<b>${d.stats.grafiche || 0}</b></div><div class="card">In attesa di pagamento<b>${d.stats.attesa || 0}</b></div>
        <div class="card">Provvigioni maturate<b>${money(c.maturata || 0)}</b></div><div class="card">Da liquidare<b>${money(c.da_liquidare || 0)}</b></div><div class="card">Liquidate<b>${money(c.liquidata || 0)}</b></div></div>`;
    },

    async orders() {
      const f = sessionStorage.getItem('ofilter') || '';
      const list = await api(`/api/admin/orders${f ? `?status=${f}` : ''}`);
      main.innerHTML = `<h2>Ordini e produzione</h2><div class="row" style="margin-bottom:12px"><select id="of" style="max-width:280px"><option value="">Tutti</option>${Object.entries({ ...PROD, ...PAY }).map(([k, v]) => `<option value="${k}" ${k === f ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="card tbl-wrap"><table class="t"><tr><th>Ordine</th><th>Data</th><th>Cliente</th><th>Totale</th><th>Pagamento</th><th>Produzione</th></tr>
        ${list.map((o) => `<tr data-id="${o.id}" style="cursor:pointer"><td><b>${esc(o.number)}</b>${o.is_reorder ? ' <span class="pill">riordino</span>' : ''}</td><td>${date(o.created_at)}</td><td>${esc(o.billing.company || o.billing.name)}<div class="small muted">${esc(o.email)}</div></td>
        <td>${money(o.totals.total)}</td><td>${pillPay(o.payment_status)}<div class="small muted">${PM[o.payment_method] || o.payment_method}</div></td><td>${PROD[o.production_status] || o.production_status}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nessun ordine</td></tr>'}</table></div>`;
      qs('#of').onchange = (e) => { sessionStorage.setItem('ofilter', e.target.value); go('orders'); };
      qsa('tr[data-id]').forEach((tr) => { tr.onclick = () => openOrder(tr.dataset.id); });
    },

    async products() {
      const list = await api('/api/admin/products');
      main.innerHTML = `<h2>Prodotti e listini</h2><p class="muted">Prezzi IVA esclusa. Il listino è l'unica fonte dei prezzi del sito.</p><button id="newP" class="btn-sm">+ Nuovo prodotto</button>
        <div class="card tbl-wrap" style="margin-top:12px"><table class="t"><tr><th>Prodotto</th><th>Categoria</th><th>Unità</th><th>Fasce di prezzo</th><th>Stato</th></tr>
        ${list.map((p) => `<tr data-id="${p.id}" style="cursor:pointer"><td><b>${esc(p.name)}</b><div class="small muted">${esc(p.slug)}${p.profile.specsToVerify ? ' · <span style="color:var(--warn)">misure da verificare</span>' : ''}</div></td><td>${esc(p.category)}</td><td>${esc(p.unit_label)}</td>
        <td class="small">${p.tiers.map((t) => `${t.option_code} ≥${t.min_qty}: ${money(t.unit_price)}`).join('<br>')}</td><td>${p.active ? '<span class="pill ok">Attivo</span>' : '<span class="pill">Disattivo</span>'}</td></tr>`).join('')}</table></div>`;
      qsa('tr[data-id]').forEach((tr) => { tr.onclick = () => openProduct(list.find((p) => String(p.id) === tr.dataset.id)); });
      qs('#newP').onclick = () => openProduct({ name: 'Nuovo prodotto', slug: '', category: 'Altro', unit_label: 'pezzo', unit_detail: '', qty_step: 1, setup_fee: 50, customizable: true, active: false, variants: [], print_options: [{ code: 'DIG', label: 'Stampa digitale a colori', mode: 'full' }], profile: { shape: 'box', widthMm: 100, heightMm: 60, safeMm: 4, sides: [{ code: 'front', label: 'Fronte' }], minTextPt: 6, warnTextPt: 7, minDpi: 150, warnDpi: 300, paper: '#ffffff', specsToVerify: true, fixedObjects: {} }, tiers: [] });
    },

    async templates() {
      const list = await api('/api/admin/templates'); const prods = await api('/api/admin/products');
      const ed = (shape) => (prods.find((p) => p.customizable && p.profile.shape === shape) || {}).slug;
      main.innerHTML = `<h2>Template grafici</h2><p class="muted">Per crearne uno nuovo apri l'editor da amministratore e usa «Salva come template». Le modifiche ai template non toccano le grafiche già confermate dai clienti.</p>
        <div class="row" style="margin-bottom:10px">${[...new Set(prods.filter((p) => p.customizable).map((p) => p.profile.shape))].map((s) => `<a class="btn btn-sm" target="_blank" href="/editor.html?p=${ed(s)}">Nuovo template ${s === 'sachet' ? 'bustina' : s === 'cup' ? 'bicchiere' : 'portatovaglioli/portabustine'}</a>`).join('')}</div>
        <div class="card tbl-wrap"><table class="t"><tr><th>Nome</th><th>Categoria</th><th>Formato</th><th>Ordine</th><th>Attivo</th><th></th></tr>
        ${list.map((t) => `<tr data-id="${t.id}"><td><input value="${esc(t.name)}" data-f="name"></td><td><input value="${esc(t.group_name)}" data-f="group_name"></td><td>${esc(t.shape)}</td>
        <td><input class="mini" type="number" value="${t.sort}" data-f="sort"></td><td><input type="checkbox" ${t.enabled ? 'checked' : ''} data-f="enabled"></td>
        <td class="row"><a class="btn btn-light btn-sm" target="_blank" href="/editor.html?p=${ed(t.shape)}&template=${t.id}">Modifica grafica</a><button class="btn-light btn-sm" data-del>Elimina</button></td></tr>`).join('')}</table></div>`;
      qsa('tr[data-id]').forEach((tr) => {
        tr.querySelectorAll('[data-f]').forEach((i) => { i.onchange = () => save(`/api/admin/templates/${tr.dataset.id}`, { [i.dataset.f]: i.type === 'checkbox' ? i.checked : i.type === 'number' ? Number(i.value) : i.value }); });
        tr.querySelector('[data-del]').onclick = async () => { if (confirm('Eliminare il template?')) { await api(`/api/admin/templates/${tr.dataset.id}`, { method: 'DELETE' }); go('templates'); } };
      });
    },

    async fonts() {
      const list = await api('/api/admin/fonts');
      main.innerHTML = `<h2>Font</h2><p class="muted">Usa solo font con licenza compatibile con stampa e uso commerciale (es. Google Fonts, licenza SIL OFL). Il nome deve corrispondere esattamente a quello su fonts.google.com.</p>
        <div class="card row" style="margin-bottom:12px"><input id="nf" placeholder="Nome font Google (es. Lato)" class="grow" style="max-width:300px"><input id="nc" placeholder="Categoria" style="max-width:260px"><button id="addF" class="btn-sm">Aggiungi</button></div>
        <div class="card tbl-wrap"><table class="t"><tr><th>Font</th><th>Categoria</th><th>Attivo</th></tr>${list.map((f) => `<tr><td style="font-family:'${esc(f.family)}';font-size:20px">${esc(f.family)}</td><td>${esc(f.category)}</td><td><input type="checkbox" data-f="${esc(f.family)}" data-c="${esc(f.category)}" ${f.enabled ? 'checked' : ''}></td></tr>`).join('')}</table></div>`;
      Mark.loadFonts(list.map((f) => f.family));
      qsa('[data-f]').forEach((i) => { i.onchange = () => save('/api/admin/fonts', { family: i.dataset.f, category: i.dataset.c, enabled: i.checked }, 'POST'); });
      qs('#addF').onclick = async () => { if (await save('/api/admin/fonts', { family: qs('#nf').value.trim(), category: qs('#nc').value.trim() || 'Moderni e minimalisti' }, 'POST')) go('fonts'); };
    },

    async inks() {
      const s = await api('/api/admin/settings'); let inks = s.inks || [];
      const render = () => {
        main.innerHTML = `<h2>Colori di stampa</h2><p class="muted">Colori Pantone disponibili per le stampe a 1 colore e 2-4 colori. Il colore a video (HEX) è indicativo; in produzione vale il nome Pantone.</p>
          <div class="card"><table class="t"><tr><th>Nome Pantone</th><th>Colore a video</th><th></th></tr>${inks.map((i, k) => `<tr><td><input value="${esc(i.name)}" data-k="${k}" data-f="name"></td><td><input type="color" value="${i.hex}" data-k="${k}" data-f="hex"></td><td><button class="btn-light btn-sm" data-rm="${k}">Rimuovi</button></td></tr>`).join('')}</table>
          <div class="row" style="margin-top:10px"><button class="btn-light btn-sm" id="addI">+ Colore</button><button id="saveI">Salva colori</button></div></div>`;
        qsa('[data-f]').forEach((i) => { i.oninput = () => { inks[i.dataset.k][i.dataset.f] = i.value.toUpperCase ? (i.dataset.f === 'hex' ? i.value.toUpperCase() : i.value) : i.value; }; });
        qsa('[data-rm]').forEach((b) => { b.onclick = () => { inks.splice(Number(b.dataset.rm), 1); render(); }; });
        qs('#addI').onclick = () => { inks.push({ name: 'Nuovo Pantone', hex: '#000000' }); render(); };
        qs('#saveI').onclick = () => save('/api/admin/settings', { inks });
      };
      render();
    },

    async shipping() {
      const s = await api('/api/admin/settings'); const sh = { configured: false, bands: [], freeOverSubtotal: null, extraPerKgOver: null, ...(s.shipping || {}) };
      const render = () => {
        main.innerHTML = `<h2>Spedizioni</h2><p class="muted">Il costo si calcola sul peso totale dell'ordine (peso per unità impostato in ogni prodotto) secondo le fasce qui sotto. Importi IVA esclusa. Finché le spedizioni non sono attive gli ordini sono bloccati.</p>
          <div class="card"><label class="row" style="font-weight:600"><input type="checkbox" id="conf" ${sh.configured ? 'checked' : ''}> Spedizioni configurate e attive</label>
          <table class="t" style="margin-top:10px"><tr><th>Fino a kg</th><th>Costo €</th><th></th></tr>${sh.bands.map((b, k) => `<tr><td><input type="number" step="0.1" value="${b.maxKg}" data-k="${k}" data-f="maxKg"></td><td><input type="number" step="0.01" value="${b.cost}" data-k="${k}" data-f="cost"></td><td><button class="btn-light btn-sm" data-rm="${k}">Rimuovi</button></td></tr>`).join('')}</table>
          <button class="btn-light btn-sm" id="addB" style="margin-top:8px">+ Fascia</button>
          <div class="grid2"><div><label>Oltre l'ultima fascia: € per ogni kg in più</label><input type="number" step="0.01" id="extra" value="${sh.extraPerKgOver ?? ''}"></div>
          <div><label>Spedizione gratuita sopra (€ imponibile merce + impianti)</label><input type="number" step="0.01" id="free" value="${sh.freeOverSubtotal ?? ''}"></div></div>
          <label>Nota interna</label><input id="note" value="${esc(sh.note || '')}"><button id="saveS" style="margin-top:14px">Salva spedizioni</button></div>`;
        qsa('[data-f]').forEach((i) => { i.oninput = () => { sh.bands[i.dataset.k][i.dataset.f] = Number(i.value); }; });
        qsa('[data-rm]').forEach((b) => { b.onclick = () => { sh.bands.splice(Number(b.dataset.rm), 1); render(); }; });
        qs('#addB').onclick = () => { sh.bands.push({ maxKg: 0, cost: 0 }); render(); };
        qs('#saveS').onclick = () => {
          sh.configured = qs('#conf').checked; sh.extraPerKgOver = qs('#extra').value === '' ? null : Number(qs('#extra').value); sh.freeOverSubtotal = qs('#free').value === '' ? null : Number(qs('#free').value); sh.note = qs('#note').value;
          if (sh.configured && !sh.bands.length) return toast('Aggiungi almeno una fascia', 'err');
          save('/api/admin/settings', { shipping: sh });
        };
      };
      render();
    },

    async payments() {
      const s = await api('/api/admin/settings'); const p = s.payments; const env = s.env;
      const field = (m, k, lbl, type = 'text') => `<div><label>${lbl}</label><input data-m="${m}" data-k="${k}" type="${type}" ${type === 'number' ? 'step="0.01"' : ''} value="${esc(p[m][k] ?? '')}"></div>`;
      main.innerHTML = `<h2>Pagamenti</h2><p class="muted">Supplementi IVA esclusa, applicati sul totale merce + impianti + spedizione. Le chiavi di Stripe e PayPal si inseriscono nei Secrets di Replit (vedi README), mai qui.</p>
        ${['bonifico', 'contrassegno', 'stripe', 'paypal'].map((m) => `<div class="card" style="margin-bottom:12px"><label class="row" style="font-size:16px"><input type="checkbox" data-m="${m}" data-k="enabled" ${p[m].enabled ? 'checked' : ''}> ${PM[m]}</label>
          <div class="grid2">${field(m, 'label', 'Nome mostrato al cliente')}${field(m, 'surchargeFixed', 'Supplemento fisso €', 'number')}${field(m, 'surchargePct', 'Supplemento %', 'number')}
          ${m === 'bonifico' ? field(m, 'iban', 'IBAN') + field(m, 'holder', 'Intestatario') + field(m, 'bank', 'Banca') : ''}${m === 'contrassegno' ? field(m, 'maxTotal', 'Importo massimo ordine €', 'number') : ''}</div>
          ${m === 'stripe' ? `<p class="small">Chiave segreta: ${env.stripe ? '<span class="pill ok">presente</span>' : '<span class="pill err">mancante (STRIPE_SECRET_KEY)</span>'} · Webhook: ${env.stripeWebhook ? '<span class="pill ok">presente</span>' : '<span class="pill warn">STRIPE_WEBHOOK_SECRET consigliata</span>'}<br>URL webhook: <code>${location.origin}/api/webhooks/stripe</code> (evento checkout.session.completed)</p>` : ''}
          ${m === 'paypal' ? `<p class="small">Credenziali: ${env.paypal ? `<span class="pill ok">presenti (${esc(env.paypalEnv)})</span>` : '<span class="pill err">mancanti (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET)</span>'}</p>` : ''}</div>`).join('')}
        <button id="saveP">Salva pagamenti</button>`;
      qs('#saveP').onclick = () => {
        qsa('[data-m]').forEach((i) => { const m = i.dataset.m; const k = i.dataset.k; p[m][k] = i.type === 'checkbox' ? i.checked : i.type === 'number' ? (i.value === '' ? (k === 'maxTotal' ? null : 0) : Number(i.value)) : i.value; });
        save('/api/admin/settings', { payments: p });
      };
    },

    async partners() {
      const [partners, comms] = await Promise.all([api('/api/admin/partners'), api(`/api/admin/commissions${sessionStorage.getItem('cfilter') ? `?status=${sessionStorage.getItem('cfilter')}` : ''}`)]);
      const tot = {}; comms.forEach((c) => { const k = `${c.partner}|${c.status}`; tot[k] = (tot[k] || 0) + (c.adjusted_amount ?? c.amount); });
      main.innerHTML = `<h2>Partner e provvigioni</h2>
        <p class="muted">Il sito è a marchio MARK e tutti gli incassi sono di MARK. Le provvigioni del partner digitale e commerciale sono calcolate automaticamente sull'imponibile merce (opzionalmente anche sugli impianti), con percentuali distinte per primo ordine e riordini. Un cliente resta associato al partner con cui è arrivato (link <code>/r/CODICE</code>) o al partner predefinito.</p>
        <div class="card tbl-wrap"><table class="t"><tr><th>Partner</th><th>Codice</th><th>% primo ordine</th><th>% riordini</th><th>Riordini per (mesi, 0 = sempre)</th><th>Base incl. impianto</th><th>Predefinito</th><th>Attivo</th><th>Link</th></tr>
        ${partners.map((p) => `<tr data-id="${p.id}"><td><input value="${esc(p.name)}" data-f="name"></td><td><input class="mini" value="${esc(p.code)}" data-f="code"></td><td><input class="mini" type="number" step="0.1" value="${p.rate_first}" data-f="rate_first"></td>
          <td><input class="mini" type="number" step="0.1" value="${p.rate_reorder}" data-f="rate_reorder"></td><td><input class="mini" type="number" value="${p.reorder_months}" data-f="reorder_months"></td>
          <td><input type="checkbox" ${p.include_setup ? 'checked' : ''} data-f="include_setup"></td><td><input type="radio" name="def" ${p.is_default ? 'checked' : ''} data-f="is_default"></td><td><input type="checkbox" ${p.active ? 'checked' : ''} data-f="active"></td>
          <td class="small"><code>${location.origin}/r/${esc(p.code)}</code></td></tr>`).join('')}</table><button class="btn-light btn-sm" id="addP" style="margin-top:10px">+ Partner</button></div>
        <h3>Riepilogo per stato</h3><div class="card tbl-wrap"><table class="t"><tr><th>Partner</th>${Object.values(COMM).map((v) => `<th>${v}</th>`).join('')}</tr>
        ${partners.map((p) => `<tr><td>${esc(p.name)}</td>${Object.keys(COMM).map((k) => `<td>${money(tot[`${p.name}|${k}`] || 0)}</td>`).join('')}</tr>`).join('')}</table></div>
        <h3>Movimenti</h3><div class="row" style="margin-bottom:10px"><select id="cf" style="max-width:260px"><option value="">Tutti gli stati</option>${Object.entries(COMM).map(([k, v]) => `<option value="${k}" ${sessionStorage.getItem('cfilter') === k ? 'selected' : ''}>${v}</option>`).join('')}</select><button class="btn-light btn-sm" id="csv">Esporta CSV</button></div>
        <div class="card tbl-wrap"><table class="t"><tr><th>Ordine</th><th>Partner</th><th>Tipo</th><th>Base</th><th>%</th><th>Importo</th><th>Stato</th><th>Rettifica €</th><th>Nota</th><th></th></tr>
        ${comms.map((c) => `<tr data-c="${c.id}"><td>${esc(c.number)}<div class="small muted">${date(c.order_date)} · ${esc(c.email)}</div></td><td>${esc(c.partner)}</td><td>${c.kind === 'riordino' ? 'Riordino' : 'Primo ordine'}</td><td>${money(c.base)}</td><td>${c.rate}%</td>
          <td><b>${money(c.adjusted_amount ?? c.amount)}</b>${c.adjusted_amount != null ? `<div class="small muted">orig. ${money(c.amount)}</div>` : ''}</td>
          <td><select data-st>${Object.entries(COMM).map(([k, v]) => `<option value="${k}" ${k === c.status ? 'selected' : ''}>${v}</option>`).join('')}</select>${c.paid_at ? `<div class="small muted">liquidata ${date(c.paid_at)}</div>` : ''}</td>
          <td><input class="mini" type="number" step="0.01" data-adj value="${c.adjusted_amount ?? ''}"></td><td><input data-note value="${esc(c.note || '')}"></td><td><button class="btn-sm" data-save>Salva</button></td></tr>`).join('') || '<tr><td colspan="10" class="muted">Nessuna provvigione</td></tr>'}</table></div>`;
      qsa('tr[data-id]').forEach((tr) => tr.querySelectorAll('[data-f]').forEach((i) => { i.onchange = () => save(`/api/admin/partners/${tr.dataset.id}`, { [i.dataset.f]: i.type === 'checkbox' || i.type === 'radio' ? i.checked : i.type === 'number' ? Number(i.value) : i.value }).then(() => i.type === 'radio' && go('partners')); }));
      qs('#addP').onclick = async () => { const name = prompt('Nome partner'); if (!name) return; const code = prompt('Codice (lettere/numeri, usato nel link)', name.replace(/\W/g, '').toUpperCase().slice(0, 10)); await api('/api/admin/partners', { body: { name, code } }); go('partners'); };
      qs('#cf').onchange = (e) => { sessionStorage.setItem('cfilter', e.target.value); go('partners'); };
      qsa('tr[data-c]').forEach((tr) => { tr.querySelector('[data-save]').onclick = async () => { if (await save(`/api/admin/commissions/${tr.dataset.c}`, { status: tr.querySelector('[data-st]').value, adjusted_amount: tr.querySelector('[data-adj]').value, note: tr.querySelector('[data-note]').value }, 'PATCH')) go('partners'); }; });
      qs('#csv').onclick = () => {
        const rows = [['Ordine', 'Data', 'Cliente', 'Partner', 'Tipo', 'Base', 'Percentuale', 'Importo', 'Importo rettificato', 'Stato', 'Liquidata il', 'Nota']].concat(comms.map((c) => [c.number, c.order_date, c.email, c.partner, c.kind, c.base, c.rate, c.amount, c.adjusted_amount ?? '', COMM[c.status], c.paid_at || '', c.note || '']));
        const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv' })); a.download = 'provvigioni-mark.csv'; a.click();
      };
    },

    async customers() {
      const [list, partners] = await Promise.all([api('/api/admin/customers'), api('/api/admin/partners')]);
      main.innerHTML = `<h2>Clienti</h2><div class="card tbl-wrap"><table class="t"><tr><th>Cliente</th><th>Telefono</th><th>Ordini</th><th>Primo ordine</th><th>Partner</th></tr>
        ${list.map((c) => `<tr><td><b>${esc(c.company || c.name)}</b><div class="small muted">${esc(c.email)}</div></td><td>${esc(c.phone)}</td><td>${c.orders}</td><td>${date(c.first_order_at)}</td>
        <td><select data-c="${c.id}"><option value="">— nessuno —</option>${partners.map((p) => `<option value="${p.id}" ${p.id === c.partner_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nessun cliente</td></tr>'}</table></div>`;
      qsa('[data-c]').forEach((s) => { s.onchange = () => save(`/api/admin/customers/${s.dataset.c}`, { partner_id: s.value ? Number(s.value) : null }); });
    },

    async settings() {
      const s = await api('/api/admin/settings'); const shop = s.shop || {};
      main.innerHTML = `<h2>Impostazioni</h2><div class="card"><div class="grid2">
        <div><label>Nome negozio</label><input id="sn" value="${esc(shop.name || '')}"></div><div><label>Ragione sociale</label><input id="sl" value="${esc(shop.legal || '')}"></div>
        <div><label>Email</label><input id="se" value="${esc(shop.email || '')}"></div><div><label>Telefono</label><input id="sp" value="${esc(shop.phone || '')}"></div>
        <div><label>Sito</label><input id="ss" value="${esc(shop.site || '')}"></div><div><label>Aliquota IVA %</label><input id="vat" type="number" step="0.1" value="${s.vat_rate}"></div></div>
        <label class="row" style="font-weight:400;margin-top:14px"><input type="checkbox" id="rsf" ${s.reorder_setup_fee ? 'checked' : ''}> Addebita il contributo impianto stampa anche sui riordini della stessa grafica</label>
        <button id="saveG" style="margin-top:14px">Salva</button></div>`;
      qs('#saveG').onclick = () => save('/api/admin/settings', { shop: { name: qs('#sn').value, legal: qs('#sl').value, email: qs('#se').value, phone: qs('#sp').value, site: qs('#ss').value }, vat_rate: Number(qs('#vat').value), reorder_setup_fee: qs('#rsf').checked });
    },
  };

  async function openOrder(id) {
    const o = await api(`/api/admin/orders/${id}`); drawer.hidden = false;
    const t = o.totals;
    drawer.innerHTML = `<div class="row"><h2 class="grow" style="margin:0">${esc(o.number)}</h2><button class="btn-light btn-sm" id="cl">Chiudi</button></div>
      <p class="muted">${date(o.created_at)} · ${PM[o.payment_method] || o.payment_method}${o.payment_ref ? ` · rif. ${esc(o.payment_ref)}` : ''}${o.is_reorder ? ' · riordino' : ''}</p>
      <div class="grid2"><div class="card"><b>Fatturazione</b><div class="small">${esc(o.billing.company)}<br>${esc(o.billing.name)}<br>${esc(o.billing.email)} · ${esc(o.billing.phone)}<br>P.IVA/CF: ${esc(o.billing.vat)}<br>SDI/PEC: ${esc(o.billing.sdi)}</div></div>
      <div class="card"><b>Spedizione</b><div class="small">${esc(o.shipping.name)}<br>${esc(o.shipping.address)}<br>${esc(o.shipping.zip)} ${esc(o.shipping.city)}<br>${esc(o.shipping.phone)}</div>${o.notes ? `<p class="small"><b>Note:</b> ${esc(o.notes)}</p>` : ''}</div></div>
      <h3>Righe</h3><table class="t">${o.items.map((l) => `<tr><td><b>${esc(l.productName)}</b><div class="small muted">${esc(l.optionLabel)}${l.variantLabel ? ` · ${esc(l.variantLabel)}` : ''}${l.side3 ? ' · terzo lato' : ''}</div></td><td>${l.qty} ${esc(l.unitLabel)} × ${money(l.unitPrice)}</td><td>${money(l.goods)}</td><td>impianto ${money(l.setup)}</td></tr>`).join('')}</table>
      <div style="max-width:340px;margin-left:auto"><div class="sum-row"><span>${esc(t.shippingLabel)}</span><span>${money(t.shipping)}</span></div>${t.surcharge ? `<div class="sum-row"><span>Supplemento</span><span>${money(t.surcharge)}</span></div>` : ''}<div class="sum-row"><span>IVA</span><span>${money(t.vat)}</span></div><div class="sum-row total"><span>Totale</span><span>${money(t.total)}</span></div></div>
      <h3>Grafiche confermate dal cliente</h3>${o.designs.map((d) => `<div class="card" style="margin-bottom:10px"><div class="row"><b class="grow">Grafica ${esc(d.id)}</b>
        <select data-review="${d.id}">${[['da_verificare', 'Da verificare'], ['approvata', 'Approvata per la produzione'], ['da_correggere', 'Da correggere']].map(([k, v]) => `<option value="${k}" ${k === d.review_status ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="row" style="margin:8px 0">${Object.keys(d.files).filter((k) => k.startsWith('preview_')).map((k) => `<img src="/api/designs/${d.id}/img/${k}" style="width:240px;border:1px solid var(--line);border-radius:6px">`).join('')}</div>
        <div class="row small">${Object.keys(d.files).map((k) => `<a class="btn btn-light btn-sm" href="/api/admin/designs/${d.id}/file/${k}">${k.replace('production_', 'PNG produzione ').replace('svg_', 'SVG ').replace('preview_', 'Anteprima ').replace('mockup_', 'Mockup ')}</a>`).join('')}<a class="btn btn-light btn-sm" href="/api/admin/designs/${d.id}/file/design.json">Progetto JSON</a></div>
        ${d.checks.length ? `<div class="small" style="margin-top:6px"><b>Avvisi accettati dal cliente:</b><ul>${d.checks.map((c) => `<li>${esc(c.msg)}</li>`).join('')}</ul></div>` : ''}</div>`).join('') || '<p class="muted small">Nessun prodotto personalizzato.</p>'}
      <h3>Stato</h3><div class="grid2"><div><label>Pagamento</label><select id="ps">${Object.entries(PAY).map(([k, v]) => `<option value="${k}" ${k === o.payment_status ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div><label>Produzione</label><select id="prs">${Object.entries(PROD).map(([k, v]) => `<option value="${k}" ${k === o.production_status ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div><label>Tracking spedizione</label><input id="trk" value="${esc(o.tracking)}"></div><div><label>Note interne</label><input id="an" value="${esc(o.admin_notes)}"></div></div>
      <button id="saveO" style="margin-top:12px">Salva stato</button>
      <h3>Provvigioni</h3>${o.commissions.map((c) => `<div class="small">${esc(c.partner)} · ${c.kind === 'riordino' ? 'riordino' : 'primo ordine'} · ${c.rate}% su ${money(c.base)} = <b>${money(c.adjusted_amount ?? c.amount)}</b> · ${COMM[c.status]}</div>`).join('') || '<p class="small muted">Nessuna provvigione su questo ordine.</p>'}`;
    qs('#cl').onclick = () => { drawer.hidden = true; };
    drawer.querySelectorAll('[data-review]').forEach((s) => { s.onchange = () => save(`/api/admin/designs/${s.dataset.review}`, { review_status: s.value }, 'PATCH'); });
    qs('#saveO').onclick = async () => {
      const body = { tracking: qs('#trk').value, admin_notes: qs('#an').value };
      if (qs('#ps').value !== o.payment_status) body.payment_status = qs('#ps').value;
      if (qs('#prs').value !== o.production_status) body.production_status = qs('#prs').value;
      if ((body.payment_status === 'annullato' || body.production_status === 'annullato') && !confirm('Annullare l\'ordine? Le provvigioni collegate verranno azzerate.')) return;
      if (await save(`/api/admin/orders/${o.id}`, body, 'PATCH')) { openOrder(id); if (location.hash === '#orders') SECTIONS.orders(); }
    };
  }

  function openProduct(p) {
    drawer.hidden = false; const opts = p.print_options;
    const tierRows = (p.tiers || []).map((t) => ({ ...t }));
    const render = () => {
      drawer.innerHTML = `<div class="row"><h2 class="grow" style="margin:0">${esc(p.name)}</h2><button class="btn-light btn-sm" id="cl">Chiudi</button></div>
        <div class="grid2"><div><label>Nome</label><input id="pn" value="${esc(p.name)}"></div><div><label>Slug (URL)</label><input id="ps" value="${esc(p.slug)}"></div>
        <div><label>Categoria</label><input id="pc" value="${esc(p.category)}"></div><div><label>Ordine in catalogo</label><input id="po" type="number" value="${p.sort || 0}"></div>
        <div><label>Unità di vendita</label><input id="pu" value="${esc(p.unit_label)}"></div><div><label>Dettaglio unità</label><input id="pud" value="${esc(p.unit_detail || '')}"></div>
        <div><label>Multipli di</label><input id="pq" type="number" value="${p.qty_step || 1}"></div><div><label>Peso per unità (kg, per spedizione)</label><input id="pw" type="number" step="0.01" value="${p.unit_weight_kg ?? ''}"></div>
        <div><label>Contributo impianto stampa €</label><input id="pf" type="number" step="0.01" value="${p.setup_fee || 0}"></div><div><label>&nbsp;</label><label class="row" style="font-weight:400"><input type="checkbox" id="pcu" ${p.customizable ? 'checked' : ''}> Personalizzabile</label><label class="row" style="font-weight:400"><input type="checkbox" id="pa" ${p.active ? 'checked' : ''}> Attivo in catalogo</label></div></div>
        <label>Descrizione</label><textarea id="pd" rows="2">${esc(p.description || '')}</textarea>
        <h3>Listino (prezzo per unità, IVA esclusa)</h3><table class="t"><tr><th>Tipo stampa</th><th>Da quantità</th><th>Prezzo €</th><th></th></tr>
        ${tierRows.map((t, k) => `<tr><td><select data-k="${k}" data-f="option_code">${opts.map((o) => `<option value="${o.code}" ${o.code === t.option_code ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></td><td><input type="number" data-k="${k}" data-f="min_qty" value="${t.min_qty}"></td><td><input type="number" step="0.01" data-k="${k}" data-f="unit_price" value="${t.unit_price}"></td><td><button class="btn-light btn-sm" data-rm="${k}">×</button></td></tr>`).join('')}</table>
        <button class="btn-light btn-sm" id="addT">+ Fascia</button>
        <h3>Tipi di stampa</h3><p class="small muted">mode: <code>mono</code> = 1 colore Pantone · <code>multi</code> = fino a maxColors colori Pantone · <code>full</code> = stampa digitale a colori · <code>none</code> = prodotto neutro</p>
        <textarea class="code" id="pjo">${esc(JSON.stringify(opts, null, 2))}</textarea>
        <h3>Varianti colore prodotto</h3><textarea class="code" id="pjv" style="min-height:80px">${esc(JSON.stringify(p.variants || [], null, 2))}</textarea>
        <h3>Profilo tecnico dell'editor</h3><p class="small muted">Misure in mm: widthMm/heightMm (area di stampa), safeMm (margine di sicurezza), sealMm (saldatura bustina), sides (lati; optional = lato facoltativo), side3SurchargePct, minTextPt/warnTextPt, minDpi/warnDpi, paper (colore supporto), shape (sachet|cup|box: mockup), specsToVerify, fixedObjects (diciture obbligatorie bloccate). Le modifiche valgono solo per le nuove grafiche: quelle confermate conservano il proprio profilo.</p>
        <textarea class="code" id="pjp" style="min-height:260px">${esc(JSON.stringify(p.profile || {}, null, 2))}</textarea>
        <div class="row" style="margin-top:14px"><button id="saveP">Salva prodotto</button>${p.id && p.customizable ? `<a class="btn btn-light" target="_blank" href="/editor.html?p=${encodeURIComponent(p.slug)}">Apri nell'editor</a>` : ''}</div>`;
      qs('#cl').onclick = () => { drawer.hidden = true; };
      drawer.querySelectorAll('[data-f]').forEach((i) => { i.onchange = () => { tierRows[i.dataset.k][i.dataset.f] = i.dataset.f === 'option_code' ? i.value : Number(i.value); }; });
      drawer.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { tierRows.splice(Number(b.dataset.rm), 1); render(); }; });
      qs('#addT').onclick = () => { tierRows.push({ option_code: (opts[0] || {}).code, min_qty: 1, unit_price: 0 }); render(); };
      qs('#saveP').onclick = async () => {
        let print_options; let variants; let profile;
        try { print_options = JSON.parse(qs('#pjo').value); variants = JSON.parse(qs('#pjv').value); profile = JSON.parse(qs('#pjp').value); } catch { return toast('JSON non valido in tipi di stampa, varianti o profilo', 'err'); }
        const body = { name: qs('#pn').value, slug: qs('#ps').value.trim(), category: qs('#pc').value, sort: Number(qs('#po').value), unit_label: qs('#pu').value, unit_detail: qs('#pud').value,
          qty_step: Number(qs('#pq').value) || 1, unit_weight_kg: qs('#pw').value === '' ? null : Number(qs('#pw').value), setup_fee: Number(qs('#pf').value) || 0,
          customizable: qs('#pcu').checked, active: qs('#pa').checked, description: qs('#pd').value, print_options, variants, profile, tiers: tierRows };
        if (!body.slug) return toast('Indica lo slug', 'err');
        const ok = p.id ? await save(`/api/admin/products/${p.id}`, body) : await save('/api/admin/products', body, 'POST');
        if (ok) { drawer.hidden = true; go('products'); }
      };
    };
    render();
  }

  start();
})();
