// Dati iniziali: catalogo MARK 2026 (prezzi IVA esclusa), font, template, impostazioni.
// Eseguito solo se il database è vuoto. Tutto è poi modificabile dal pannello admin.
const { db, now, getSetting, setSetting, tx } = require('./db');

const SACHET_INKS = [
  { name: 'Nero (Black C)', hex: '#2D2926' },
  { name: 'Rosso 485 C', hex: '#DA291C' },
  { name: 'Blu 286 C', hex: '#0033A0' },
  { name: 'Blu Reflex C', hex: '#001489' },
  { name: 'Verde 348 C', hex: '#00843D' },
  { name: 'Bordeaux 7421 C', hex: '#651D32' },
  { name: 'Marrone 4625 C', hex: '#4F2C1D' },
  { name: 'Oro 7562 C', hex: '#BD9B60' },
  { name: 'Arancio 021 C', hex: '#FE5000' },
  { name: 'Grigio Cool Gray 9 C', hex: '#75787B' },
];

const SACHET_PROFILE = {
  shape: 'sachet', widthMm: 70, heightMm: 45, safeMm: 4, sealMm: 3,
  sides: [{ code: 'front', label: 'Fronte' }, { code: 'back', label: 'Retro' }],
  minTextPt: 5, warnTextPt: 6, minDpi: 150, warnDpi: 300,
  paper: '#ffffff', specsToVerify: false,
  // diciture fisse obbligatorie (come da bozza MARK): bloccate, non modificabili dal cliente
  fixedObjects: {
    front: [
      { type: 'text', text: 'Zucchero', font: 'Montserrat', sizePt: 4.5, x: 35, y: 6.2, align: 'center' },
      { type: 'text', text: 'Confezionato da MARK & Co Srl - ☎ 081 528.53.14', font: 'Montserrat', sizePt: 3.6, x: 35, y: 41.2, align: 'center' },
    ],
    back: [
      { type: 'text', text: 'Non vendibile singolarmente', font: 'Montserrat', sizePt: 3.6, x: 35, y: 41.2, align: 'center' },
    ],
  },
};

const cupProfile = (w, h) => ({
  shape: 'cup', widthMm: w, heightMm: h, safeMm: 3, sides: [{ code: 'front', label: 'Lato stampa' }],
  minTextPt: 6, warnTextPt: 7, minDpi: 150, warnDpi: 300, paper: '#ffffff', specsToVerify: true, fixedObjects: {},
});
const boxProfile = (w, h, third) => ({
  shape: 'box', widthMm: w, heightMm: h, safeMm: 4,
  sides: [{ code: 'front', label: 'Lato A' }, { code: 'back', label: 'Lato B' }].concat(third ? [{ code: 'side3', label: 'Lato C (+10%)', optional: true }] : []),
  side3SurchargePct: third ? 10 : 0,
  minTextPt: 6, warnTextPt: 7, minDpi: 150, warnDpi: 300, paper: '#ffffff', specsToVerify: true, fixedObjects: {},
});

const OPT_1C = { code: '1C', label: 'Stampa 1 colore', mode: 'mono' };
const OPT_4C = { code: '4C', label: 'Stampa 2-4 colori', mode: 'multi', maxColors: 4 };
const OPT_DIG = { code: 'DIG', label: 'Stampa digitale a colori', mode: 'full' };
const OPT_N = { code: 'N', label: 'Neutro', mode: 'none' };

const CUBE_VARIANTS = [{ code: 'bianco', label: 'Bianco', color: '#f4f4f2' }, { code: 'nero', label: 'Nero', color: '#1d1d1d' }, { code: 'marrone', label: 'Marrone', color: '#4a2e20' }];
const LATTA_VARIANTS = [{ code: 'bianca', label: 'Bianca', color: '#f2f2f0' }, { code: 'nera', label: 'Nera', color: '#1f1f1f' }];

const PRODUCTS = [
  // --- Bustine (categoria principale)
  { slug: 'bustine-extrafine', name: 'Bustine di zucchero Extrafine personalizzate', category: 'Bustine di zucchero',
    description: 'Bustine 70×45 mm stampate fronte e retro con il tuo logo. Cartone da 10 kg.', unit_label: 'cartone',
    unit_detail: '10 kg · circa 1.818 bustine da 5,5 g', unit_weight_kg: 10, setup_fee: 50, sort: 1,
    print_options: [OPT_1C, OPT_4C], profile: SACHET_PROFILE,
    tiers: { '1C': [[5, 22], [10, 20], [50, 18]], '4C': [[60, 18.5]] } },
  { slug: 'bustine-canna', name: 'Bustine di zucchero di Canna personalizzate', category: 'Bustine di zucchero',
    description: 'Bustine di zucchero di canna 70×45 mm, stampa 1 colore fronte e retro. Cartone da 5 kg.', unit_label: 'cartone',
    unit_detail: '5 kg · circa 909 bustine da 5,5 g', unit_weight_kg: 5, setup_fee: 50, sort: 2,
    print_options: [OPT_1C], profile: { ...SACHET_PROFILE, paper: '#f3e6cf' },
    tiers: { '1C': [[5, 13], [30, 11]] } },
  // --- Bicchieri (confezioni da 50 pezzi)
  ...[['75', 90, 40, [[40, 2.0], [120, 1.5], [200, 1.3]]], ['90', 95, 45, [[40, 2.3], [120, 1.6], [200, 1.35]]], ['240', 120, 65, [[20, 5.0], [60, 4.0], [100, 3.3]]]]
    .map(([cc, w, h, t], i) => ({ slug: `bicchieri-${cc}cc`, name: `Bicchieri in carta riciclabile ${cc} cc personalizzati`, category: 'Bicchieri',
      description: `Bicchieri in carta riciclabile da ${cc} cc con stampa 1 colore.`, unit_label: 'confezione', unit_detail: '50 bicchieri',
      setup_fee: 50, sort: 10 + i, print_options: [OPT_1C], profile: cupProfile(w, h), tiers: { '1C': t } })),
  ...[['75', 25], ['90', 30], ['240', 35]].map(([cc, p], i) => ({ slug: `coperchi-${cc}cc`, name: `Coperchi per bicchiere ${cc} cc`, category: 'Bicchieri',
    description: 'Coperchi neutri.', customizable: 0, unit_label: 'confezione', unit_detail: '1.000 coperchi', sort: 20 + i,
    print_options: [OPT_N], profile: {}, tiers: { N: [[1, p]] } })),
  // --- Portatovaglioli 17x17 (stampa digitale 2 lati, cartone 12 pz)
  { slug: 'portatovaglioli-cube', name: 'Portatovaglioli 17×17 Cube', category: 'Portatovaglioli', variants: CUBE_VARIANTS,
    tiers: { DIG: [[12, 7.6], [24, 7.3], [48, 7.0]] } },
  { slug: 'portatovaglioli-cube-trasparente', name: 'Portatovaglioli 17×17 Cube trasparente', category: 'Portatovaglioli',
    tiers: { DIG: [[12, 9.0], [24, 8.6], [48, 8.25]] } },
  { slug: 'portatovaglioli-latta', name: 'Portatovaglioli 17×17 in latta', category: 'Portatovaglioli', variants: LATTA_VARIANTS,
    tiers: { DIG: [[12, 7.8], [24, 7.5], [48, 7.2]] } },
  { slug: 'portatovaglioli-latta-silver', name: 'Portatovaglioli 17×17 in latta Silver', category: 'Portatovaglioli',
    tiers: { DIG: [[12, 6.9], [24, 6.6], [48, 5.3]] } },
  // --- Portabustine (stampa digitale 2 lati, cartone 12 pz, minimo 2 cartoni)
  { slug: 'portabustine-cube', name: 'Portabustine Cube', category: 'Portabustine', variants: CUBE_VARIANTS, tiers: { DIG: [[24, 4.2], [48, 3.9]] } },
  { slug: 'portabustine-cube-trasparente', name: 'Portabustine Cube trasparente', category: 'Portabustine', tiers: { DIG: [[24, 4.9], [48, 4.5]] } },
  { slug: 'portabustine-latta', name: 'Portabustine in latta', category: 'Portabustine', variants: LATTA_VARIANTS, tiers: { DIG: [[24, 4.5], [48, 4.2]] } },
  { slug: 'portabustine-latta-silver', name: 'Portabustine in latta Silver', category: 'Portabustine', tiers: { DIG: [[24, 4.15], [48, 3.85]] } },
  { slug: 'portabustine-incasso-latta', name: 'Portabustine da incasso in latta', category: 'Portabustine', variants: LATTA_VARIANTS, tiers: { DIG: [[24, 5.1], [48, 4.7]] } },
  { slug: 'portabustine-incasso-silver', name: 'Portabustine da incasso in latta Silver', category: 'Portabustine', tiers: { DIG: [[24, 3.5], [48, 3.25]] } },
  // --- Prodotti neutri
  { slug: 'zucchero-extrafine-2-5kg', name: 'Zucchero Extrafine 2,5 kg', category: 'Zuccheri', customizable: 0, unit_label: 'pezzo', unit_detail: 'sacchetto 2,5 kg',
    unit_weight_kg: 2.5, print_options: [OPT_N], profile: {}, tiers: { N: [[1, 3.75]] }, sort: 60 },
  { slug: 'zucchero-muscovado-1kg', name: 'Zucchero Muscovado 1 kg', category: 'Zuccheri', customizable: 0, unit_label: 'pezzo', unit_detail: 'confezione 1 kg',
    unit_weight_kg: 1, print_options: [OPT_N], profile: {}, tiers: { N: [[1, 8.0]] }, sort: 61 },
];

// completa i campi comuni di portatovaglioli/portabustine
for (const p of PRODUCTS) {
  if (p.category === 'Portatovaglioli' || p.category === 'Portabustine') {
    const napkin = p.category === 'Portatovaglioli';
    Object.assign(p, {
      description: p.description || `${napkin ? 'Portatovaglioli 17×17' : 'Portabustine'} con stampa digitale a colori su due lati${napkin ? ' (terzo lato +10%)' : ''}. Cartoni da 12 pezzi.`,
      unit_label: 'pezzo', unit_detail: 'cartoni da 12 pezzi', qty_step: 12, setup_fee: 50,
      print_options: [OPT_DIG], profile: napkin ? boxProfile(150, 90, true) : boxProfile(110, 55, false),
      sort: napkin ? 30 : 40,
    });
  }
}

const FONTS = {
  'Eleganti e raffinati': ['Playfair Display', 'Cormorant Garamond', 'Cinzel', 'Italiana'],
  'Moderni e minimalisti': ['Montserrat', 'Poppins', 'Raleway', 'Josefin Sans', 'Inter'],
  'Classici': ['Libre Baskerville', 'Lora', 'EB Garamond', 'Merriweather'],
  'Scrittura a mano': ['Caveat', 'Kalam', 'Shadows Into Light', 'Patrick Hand'],
  'Calligrafici': ['Great Vibes', 'Dancing Script', 'Allura', 'Parisienne'],
  'Divertenti': ['Pacifico', 'Fredoka', 'Lobster', 'Bangers'],
  'Vintage': ['Abril Fatface', 'Rye', 'Alfa Slab One', 'Bebas Neue'],
  'Ristoranti e caffetterie': ['Oswald', 'Amatic SC', 'Satisfy', 'Yeseva One'],
  'Matrimoni e cerimonie': ['Pinyon Script', 'Tangerine', 'Cormorant Upright'],
};

// ---- Template (coordinate in mm su base 70×45; l'editor li adatta agli altri formati)
const T = (text, font, sizePt, x, y, o = {}) => ({ type: 'text', text, font, sizePt, x, y, align: 'center', ...o });
const I = (icon, x, y, s) => ({ type: 'icon', icon, x, y, w: s, h: s });
const BACK = (l1, l2) => [T(l1, 'Montserrat', 6, 35, 20), T(l2, 'Montserrat', 6, 35, 26)];
const ADDR = BACK('Via Roma 1 · 00100 Città', 'Tel. 000 0000000 · seguici sui social');

const TEMPLATES = [
  ['Bar e ristoranti', 'Classico bar italiano', [I('cup', 35, 15, 9), T('BAR ITALIA', 'Playfair Display', 15, 35, 26, { bold: true }), T('dal 1980', 'Cormorant Garamond', 8, 35, 33, { italic: true })], ADDR],
  ['Bar e ristoranti', 'Caffetteria moderna', [T('caffè', 'Poppins', 7, 35, 14, { letterSpacing: 2 }), T('NOME', 'Montserrat', 18, 35, 23, { bold: true, letterSpacing: 1 }), T('coffee · bakery · brunch', 'Montserrat', 5.5, 35, 31)], ADDR],
  ['Bar e ristoranti', 'Bar elegante premium', [I('crown', 35, 13, 7), T('Nome Locale', 'Cinzel', 13, 35, 24), T('— LOUNGE BAR —', 'Cormorant Garamond', 6.5, 35, 31, { letterSpacing: 2 })], ADDR],
  ['Bar e ristoranti', 'Pasticceria artigianale', [I('cake', 35, 13, 8), T('Pasticceria', 'Great Vibes', 15, 35, 24), T('NOME · ARTIGIANALE', 'Raleway', 6, 35, 31, { letterSpacing: 1.5 })], ADDR],
  ['Bar e ristoranti', 'Ristorante gourmet', [T('Nome', 'Cormorant Garamond', 18, 35, 20, { italic: true }), T('RISTORANTE', 'Josefin Sans', 6.5, 35, 28, { letterSpacing: 3 }), I('leaf', 35, 34, 4)], ADDR],
  ['Bar e ristoranti', 'Pizzeria', [I('pizza', 35, 13, 8), T('PIZZERIA NOME', 'Alfa Slab One', 12, 35, 24), T('forno a legna', 'Satisfy', 8, 35, 31)], ADDR],
  ['Bar e ristoranti', 'Hotel e B&B', [I('star', 29, 12, 3.5), I('star', 35, 12, 3.5), I('star', 41, 12, 3.5), T('Hotel Nome', 'Libre Baskerville', 13, 35, 23), T('Benvenuti', 'Parisienne', 9, 35, 31)], ADDR],
  ['Bar e ristoranti', 'Gelateria', [I('icecream', 35, 13, 8), T('Gelateria', 'Pacifico', 13, 35, 24), T('NOME', 'Fredoka', 7, 35, 31, { letterSpacing: 2 })], ADDR],
  ['Bar e ristoranti', 'Pub e cocktail bar', [I('cocktail', 35, 13, 8), T('NOME PUB', 'Bebas Neue', 17, 35, 24), T('cocktail · birre · musica', 'Oswald', 5.5, 35, 31)], ADDR],
  ['Bar e ristoranti', 'Torrefazione', [I('bean', 35, 13, 7), T('TORREFAZIONE', 'Oswald', 11, 35, 23, { letterSpacing: 1.5 }), T('Nome · dal 1960', 'Lora', 7, 35, 30, { italic: true })], ADDR],
  ['Bar e ristoranti', 'Locale vintage', [T('— EST. 1950 —', 'Rye', 5.5, 35, 13), T('Nome Bar', 'Abril Fatface', 15, 35, 23), T('CAFFÈ & LIQUORI', 'Rye', 6, 35, 31)], ADDR],
  ['Bar e ristoranti', 'Design minimalista', [T('nome', 'Inter', 16, 35, 22, { letterSpacing: 1 }), T('caffè', 'Inter', 6, 35, 29, { letterSpacing: 4 })], BACK('nome.it', '@nome')],
  ['Eventi', 'Matrimonio', [I('rings', 35, 13, 8), T('Giulia & Marco', 'Great Vibes', 15, 35, 24), T('12 · 06 · 2027', 'Cormorant Garamond', 7, 35, 31, { letterSpacing: 2 })], [I('heart', 35, 17, 6), T('Grazie di condividere con noi questo giorno', 'Cormorant Garamond', 6.5, 35, 27, { italic: true })]],
  ['Eventi', 'Diciottesimo', [T('18', 'Abril Fatface', 30, 35, 21), T('Sofia', 'Dancing Script', 13, 35, 32)], [T('Auguri per i tuoi 18 anni!', 'Dancing Script', 10, 35, 22)]],
  ['Eventi', 'Laurea', [I('laurel', 35, 14, 9), T('Dott.ssa Nome Cognome', 'Playfair Display', 9, 35, 25), T('Laurea · 2027', 'Montserrat', 6, 35, 31)], [T('Grazie per aver festeggiato con me', 'Lora', 7, 35, 22, { italic: true })]],
  ['Eventi', 'Anniversario', [T('25', 'Cinzel', 24, 35, 19), T('Anna & Paolo', 'Allura', 12, 35, 30)], [I('heart', 35, 17, 6), T('Insieme da 25 anni', 'Lora', 7, 35, 27, { italic: true })]],
  ['Eventi', 'Battesimo', [I('dove', 35, 13, 8), T('Leonardo', 'Dancing Script', 15, 35, 24), T('Battesimo · 3 maggio 2027', 'Montserrat', 5.5, 35, 31)], [T('Grazie di essere con noi', 'Dancing Script', 10, 35, 22)]],
  ['Eventi', 'Comunione', [I('cross', 35, 13, 7), T('Prima Comunione', 'Parisienne', 12, 35, 24), T('Matteo · 2027', 'Montserrat', 6, 35, 31)], [T('Grazie di condividere questa gioia', 'Lora', 7, 35, 22, { italic: true })]],
  ['Eventi', 'Festa privata', [I('star', 35, 12, 6), T("Let's party!", 'Pacifico', 14, 35, 23), T('Nome · 2027', 'Montserrat', 6, 35, 31)], [T('Grazie per essere qui!', 'Pacifico', 9, 35, 22)]],
  ['Eventi', 'Evento aziendale', [T('NOME AZIENDA', 'Montserrat', 12, 35, 20, { bold: true }), T('Convention 2027', 'Raleway', 7, 35, 28)], [T('www.azienda.it', 'Montserrat', 7, 35, 22)]],
];

function seed() {
  const has = db.prepare('SELECT COUNT(*) c FROM products').get().c;
  if (has) return;
  tx(() => {
    const ip = db.prepare(`INSERT INTO products(slug,name,category,description,customizable,unit_label,unit_detail,qty_step,unit_weight_kg,setup_fee,variants,print_options,profile,sort)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const it = db.prepare('INSERT INTO price_tiers(product_id,option_code,min_qty,unit_price) VALUES(?,?,?,?)');
    for (const p of PRODUCTS) {
      const r = ip.run(p.slug, p.name, p.category, p.description || '', p.customizable ?? 1, p.unit_label, p.unit_detail || '', p.qty_step || 1,
        p.unit_weight_kg ?? null, p.setup_fee || 0, JSON.stringify(p.variants || []), JSON.stringify(p.print_options), JSON.stringify(p.profile || {}), p.sort || 0);
      for (const [code, rows] of Object.entries(p.tiers)) for (const [q, pr] of rows) it.run(r.lastInsertRowid, code, q, pr);
    }
    const ifo = db.prepare('INSERT INTO fonts(family,category,sort) VALUES(?,?,?)');
    let s = 0; for (const [cat, list] of Object.entries(FONTS)) for (const f of list) ifo.run(f, cat, s++);
    const itp = db.prepare('INSERT INTO templates(shape,group_name,name,design,sort) VALUES(?,?,?,?,?)');
    TEMPLATES.forEach(([g, n, front, back], i) => itp.run('sachet', g, n, JSON.stringify({ baseW: 70, baseH: 45, sides: { front, back } }), i));
    db.prepare("INSERT INTO partners(name,code,rate_first,rate_reorder,reorder_months,is_default,notes) VALUES('PromoApp','PROMOAPP',0,0,0,1,'Partner digitale e commerciale. Impostare le percentuali concordate.')").run();
  });
  if (!getSetting('shop')) setSetting('shop', { name: 'MARK', legal: 'MARK & Co Srl', email: 'info@marksugar.it', phone: '081 528 5314', site: 'www.marksugar.it' });
  if (getSetting('vat_rate') == null) setSetting('vat_rate', 22);
  if (!getSetting('inks')) setSetting('inks', SACHET_INKS);
  if (!getSetting('shipping')) setSetting('shipping', { configured: false, bands: [], freeOverSubtotal: null, note: '' });
  if (!getSetting('payments')) setSetting('payments', {
    bonifico: { enabled: true, label: 'Bonifico bancario anticipato', iban: '', holder: 'MARK & Co Srl', bank: '', surchargePct: 0, surchargeFixed: 0 },
    contrassegno: { enabled: true, label: 'Contrassegno', surchargePct: 0, surchargeFixed: 0, maxTotal: null },
    stripe: { enabled: false, label: 'Carta di credito / debito' },
    paypal: { enabled: false, label: 'PayPal' },
  });
  if (getSetting('reorder_setup_fee') == null) setSetting('reorder_setup_fee', false);
  console.log('[seed] catalogo MARK 2026 caricato');
}

module.exports = { seed };
