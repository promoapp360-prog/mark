// Motore prezzi: unica fonte di verità per preventivo, carrello e ordine.
// Usa esclusivamente le regole configurate nel gestionale (listini, impianto, spedizione, pagamenti, IVA).
const { db, J, getSetting } = require('./db');

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function loadProduct(slug) {
  const p = db.prepare('SELECT * FROM products WHERE slug=? AND active=1').get(slug);
  if (!p) return null;
  p.variants = J(p.variants, []); p.print_options = J(p.print_options, []); p.profile = J(p.profile, {});
  p.tiers = db.prepare('SELECT option_code, min_qty, unit_price FROM price_tiers WHERE product_id=? ORDER BY option_code, min_qty').all(p.id);
  return p;
}

function priceLine(item, ctx) {
  const p = loadProduct(item.productSlug);
  if (!p) throw new Error('Prodotto non disponibile');
  const opt = p.print_options.find((o) => o.code === item.option) || p.print_options[0];
  const tiers = p.tiers.filter((t) => t.option_code === opt.code);
  if (!tiers.length) throw new Error(`Nessun listino configurato per ${p.name}`);
  const qty = Math.floor(Number(item.qty) || 0);
  const minQty = tiers[0].min_qty;
  if (qty < minQty) throw new Error(`${p.name}: quantità minima ${minQty} ${p.unit_label}`);
  if (qty % (p.qty_step || 1)) throw new Error(`${p.name}: la quantità deve essere multipla di ${p.qty_step}`);
  const tier = tiers.filter((t) => t.min_qty <= qty).pop();
  let unit = tier.unit_price;
  let side3 = false;
  let design = null;
  if (p.customizable) {
    if (item.designId) {
      design = db.prepare('SELECT id, product_slug, option_code, uses_side3 FROM designs WHERE id=?').get(item.designId);
      if (!design || design.product_slug !== p.slug) throw new Error('Grafica non valida per questo prodotto');
      side3 = !!design.uses_side3;
    } else if (ctx.requireDesign) throw new Error(`${p.name}: manca la grafica confermata`);
    else side3 = !!item.side3;
  }
  const side3Pct = side3 ? Number(p.profile.side3SurchargePct || 0) : 0;
  if (side3Pct) unit = unit * (1 + side3Pct / 100);
  unit = r2(unit);
  const goods = r2(unit * qty);

  // impianto stampa: una volta per grafica; sui riordini della stessa grafica secondo impostazione
  let setup = 0;
  if (p.customizable && p.setup_fee) {
    const reused = design && ctx.customerId && db.prepare(`SELECT 1 FROM orders o WHERE o.customer_id=? AND o.payment_status!='annullato'
      AND EXISTS (SELECT 1 FROM json_each(o.items) j WHERE json_extract(j.value,'$.designId')=?)`).get(ctx.customerId, design.id);
    const chargeOnReorder = getSetting('reorder_setup_fee', false);
    setup = reused && !chargeOnReorder ? 0 : p.setup_fee;
    if (design && ctx.seenDesigns.has(design.id)) setup = 0; // stessa grafica due volte nello stesso carrello
    if (design) ctx.seenDesigns.add(design.id);
  }
  const nextTier = tiers.find((t) => t.min_qty > qty);
  return {
    productSlug: p.slug, productName: p.name, category: p.category, customizable: !!p.customizable,
    option: opt.code, optionLabel: opt.label, variant: item.variant || null,
    variantLabel: (p.variants.find((v) => v.code === item.variant) || {}).label || null,
    qty, unitLabel: p.unit_label, unitDetail: p.unit_detail, unitPrice: unit, side3, side3Pct,
    goods, setup, designId: design ? design.id : null,
    weightKg: p.unit_weight_kg == null ? null : r2(p.unit_weight_kg * qty),
    tierInfo: nextTier ? `Da ${nextTier.min_qty} ${p.unit_label}: € ${nextTier.unit_price.toFixed(2)} cad.` : null,
  };
}

function shippingFor(lines, subtotal) {
  const s = getSetting('shipping', { configured: false });
  if (!s.configured) return { cost: null, label: 'Spedizione non ancora configurata', blocked: true };
  if (s.freeOverSubtotal != null && s.freeOverSubtotal !== '' && subtotal >= Number(s.freeOverSubtotal)) return { cost: 0, label: 'Spedizione gratuita' };
  const unknown = lines.some((l) => l.weightKg == null);
  const kg = lines.reduce((a, l) => a + (l.weightKg || 0), 0);
  const bands = (s.bands || []).slice().sort((a, b) => a.maxKg - b.maxKg);
  if (!bands.length) return { cost: null, label: 'Spedizione non ancora configurata', blocked: true };
  const band = bands.find((b) => kg <= Number(b.maxKg)) || bands[bands.length - 1];
  const extra = s.extraPerKgOver && kg > Number(bands[bands.length - 1].maxKg) ? (kg - bands[bands.length - 1].maxKg) * Number(s.extraPerKgOver) : 0;
  return { cost: r2(Number(band.cost) + extra), label: `Spedizione (${unknown ? 'peso stimato ' : ''}${r2(kg)} kg)` };
}

function availablePayments() {
  const p = getSetting('payments', {});
  const out = [];
  for (const [code, m] of Object.entries(p)) {
    if (!m.enabled) continue;
    if (code === 'stripe' && !process.env.STRIPE_SECRET_KEY) continue;
    if (code === 'paypal' && !(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET)) continue;
    out.push({ code, label: m.label, surchargePct: Number(m.surchargePct || 0), surchargeFixed: Number(m.surchargeFixed || 0), maxTotal: m.maxTotal ?? null });
  }
  return out;
}

function quote(items, opts = {}) {
  const ctx = { customerId: opts.customerId || null, requireDesign: !!opts.requireDesign, seenDesigns: new Set() };
  const lines = []; const errors = [];
  for (const it of items || []) {
    try { lines.push(priceLine(it, ctx)); } catch (e) { errors.push(e.message); }
  }
  const goods = r2(lines.reduce((a, l) => a + l.goods, 0));
  const setup = r2(lines.reduce((a, l) => a + l.setup, 0));
  const subtotal = r2(goods + setup);
  const ship = lines.length ? shippingFor(lines, subtotal) : { cost: 0, label: 'Spedizione' };
  let surcharge = 0; let paymentLabel = null;
  if (opts.paymentMethod) {
    const pm = availablePayments().find((m) => m.code === opts.paymentMethod);
    if (!pm) errors.push('Metodo di pagamento non disponibile');
    else {
      surcharge = r2(pm.surchargeFixed + (subtotal + (ship.cost || 0)) * pm.surchargePct / 100);
      paymentLabel = pm.label;
    }
  }
  const vatRate = Number(getSetting('vat_rate', 22));
  const taxable = r2(subtotal + (ship.cost || 0) + surcharge);
  const vat = r2(taxable * vatRate / 100);
  const total = r2(taxable + vat);
  if (opts.paymentMethod) {
    const pm = availablePayments().find((m) => m.code === opts.paymentMethod);
    if (pm && pm.maxTotal && total > Number(pm.maxTotal)) errors.push(`${pm.label} disponibile fino a € ${Number(pm.maxTotal).toFixed(2)}`);
  }
  if (ship.blocked) errors.push('Le spese di spedizione non sono ancora state configurate da MARK: l\'ordine non può essere completato.');
  return { lines, errors, totals: { goods, setup, subtotal, shipping: ship.cost, shippingLabel: ship.label, surcharge, paymentLabel, vatRate, vat, taxable, total } };
}

module.exports = { quote, loadProduct, availablePayments, r2 };
