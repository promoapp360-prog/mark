// Configuratore grafico MARK — editor interattivo per tutti i prodotti personalizzabili.
// Il comportamento dipende solo dal "profilo tecnico" del prodotto (misure, lati, margini, colori),
// quindi un nuovo prodotto si aggiunge dal gestionale senza modificare questo file.
(async () => {
  const { qs, qsa, esc, api, money, toast } = Mark;
  Mark.header();
  await MarkProductVisuals.ready;
  const params = new URLSearchParams(location.search);
  const slug = params.get('p') || 'bustine-extrafine';
  const [cfg, product] = await Promise.all([api('/api/config'), api(`/api/products/${encodeURIComponent(slug)}`)]).catch((e) => { toast(e.message, 'err'); throw e; });
  if (!product.customizable) { location.href = '/#catalogo'; return; }
  const P = product.profile; const W = P.widthMm; const H = P.heightMm;
  const inks = cfg.inks || [];
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)).slice(0, 12);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const DRAFT_KEY = `mark_draft_${slug}`;

  // ---------------- stato
  let option = product.print_options[0];
  let variant = (product.variants || [])[0] || null;
  let qty = Math.min(...product.tiers.filter((t) => t.option_code === option.code).map((t) => t.min_qty));
  let side = P.sides[0].code; let selId = null; let view = 'edit';
  let zoom = 1; let panX = 0; let panY = 0;
  let projectToken = params.get('project') || null;
  let design = blankDesign();
  const hist = []; let hIdx = -1;

  function blankDesign() {
    const d = { v: 1, mode: option.mode, ink: inks[0] ? inks[0].hex : '#2D2926', inkName: inks[0] ? inks[0].name : 'Nero', sides: {} };
    P.sides.forEach((s) => { d.sides[s.code] = { objects: [] }; });
    return withFixed(d);
  }
  function withFixed(d) {
    P.sides.forEach((s) => {
      d.sides[s.code] = d.sides[s.code] || { objects: [] };
      const own = d.sides[s.code].objects.filter((o) => !o.fixed);
      const fixed = ((P.fixedObjects || {})[s.code] || []).map((o) => ({ ...clone(o), id: uid(), fixed: true, locked: true }));
      d.sides[s.code].objects = [...own, ...fixed];
    });
    return d;
  }
  const objs = () => design.sides[side].objects;
  const sel = () => objs().find((o) => o.id === selId) || null;

  // ---------------- caricamento iniziale (progetto salvato / grafica precedente / bozza locale)
  try {
    if (projectToken) { const pr = await api(`/api/projects/${projectToken}`); design = withFixed(pr.design); }
    else if (params.get('design')) { const dz = await api(`/api/designs/${params.get('design')}`); design = withFixed(dz.design); }
    else { const saved = localStorage.getItem(DRAFT_KEY); if (saved) { const s = JSON.parse(saved); design = withFixed(s.design); if (s.option) option = product.print_options.find((o) => o.code === s.option) || option; if (s.qty) qty = s.qty; if (s.variant) variant = (product.variants || []).find((v) => v.code === s.variant) || variant; } }
  } catch (e) { toast(e.message, 'err'); }
  design.mode = option.mode;
  if (params.get('qty')) qty = Number(params.get('qty'));

  // ---------------- font
  const fontsUsed = () => [...new Set(Object.values(design.sides).flatMap((s) => s.objects.filter((o) => o.type === 'text').map((o) => o.font)))];
  await Mark.loadFonts(['Montserrat', ...fontsUsed()]);

  // ---------------- storia (annulla/ripristina) + salvataggio automatico
  let saveT; let serverT;
  function commit() {
    hist.splice(hIdx + 1); hist.push(JSON.stringify(design)); if (hist.length > 80) hist.shift(); hIdx = hist.length - 1;
    clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ design, option: option.code, qty, variant: variant && variant.code })); } catch {} }, 300);
    if (projectToken) { clearTimeout(serverT); serverT = setTimeout(() => saveProject(true), 2500); }
    refresh();
  }
  function undo() { if (hIdx > 0) { hIdx--; design = JSON.parse(hist[hIdx]); selId = null; refresh(); } }
  function redo() { if (hIdx < hist.length - 1) { hIdx++; design = JSON.parse(hist[hIdx]); refresh(); } }

  // ---------------- canvas
  const stage = qs('#stage'); const cv = qs('#cv'); const ctx = cv.getContext('2d');
  let S = 1; let OX = 0; let OY = 0; let dpr = 1;
  function layout() {
    dpr = window.devicePixelRatio || 1; const r = stage.getBoundingClientRect();
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    const fit = Math.min((r.width - 50) / W, (r.height - 110) / H);
    S = fit * zoom; OX = r.width / 2 - (W * S) / 2 + panX; OY = r.height / 2 - (H * S) / 2 + panY + 10;
  }
  const toMm = (px, py) => [(px - OX) / S, (py - OY) / S];

  function draw() {
    layout();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    const r = stage.getBoundingClientRect();
    if (view === 'mock' || view === 'compare') {
      const off = document.createElement('canvas'); const opt = { productSlug: slug, variantColor: variant && variant.color, transparent: /trasparente/.test(slug) };
      if (view === 'mock') { off.width = r.width * dpr; off.height = r.height * dpr; MarkRender.mockup(off, design, side, P, opt); ctx.drawImage(off, 0, 0, r.width, r.height); }
      else {
        const neutral = withFixed({ mode: design.mode, ink: design.ink, sides: {} });
        const half = r.width / 2; off.width = half * dpr; off.height = r.height * dpr;
        MarkRender.mockup(off, neutral, side, P, opt); ctx.drawImage(off, 0, 0, half, r.height);
        const off2 = document.createElement('canvas'); off2.width = off.width; off2.height = off.height;
        MarkRender.mockup(off2, design, side, P, opt); ctx.drawImage(off2, half, 0, half, r.height);
        ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.font = '600 13px Inter'; ctx.fillText('Prodotto neutro', 16, r.height - 18); ctx.fillText('La tua personalizzazione', half + 16, r.height - 18);
      }
      return;
    }
    ctx.save(); ctx.translate(OX, OY);
    ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8; ctx.fillStyle = P.paper || '#fff'; ctx.fillRect(0, 0, W * S, H * S); ctx.shadowColor = 'transparent';
    MarkRender.drawSide(ctx, design, side, P, S, { guides: true, paper: variantPaper() });
    if (view === 'tech') techOverlay();
    ctx.restore();
    const o = sel(); if (o && view === 'edit') drawSelection(o);
  }
  function variantPaper() { if (P.shape !== 'box') return P.paper; if (/trasparente/.test(slug)) return '#e9eef2'; return (variant && variant.color) || P.paper; }
  function techOverlay() {
    ctx.save(); ctx.fillStyle = '#c0392b'; ctx.strokeStyle = '#c0392b'; ctx.font = '12px Inter'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(W * S, -18); ctx.moveTo(-18, 0); ctx.lineTo(-18, H * S); ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillText(`${W} mm`, (W * S) / 2, -24);
    ctx.save(); ctx.translate(-26, (H * S) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(`${H} mm`, 0, 0); ctx.restore();
    ctx.textAlign = 'left'; ctx.fillStyle = '#555';
    ctx.fillText(`Area sicura: margine ${P.safeMm} mm${P.sealMm ? ` · saldatura ${P.sealMm} mm` : ''} · ${option.label}${design.mode !== 'full' ? ` · ${design.inkName || design.ink}` : ''}`, 0, H * S + 22);
    ctx.restore();
  }
  function selCorners(o) { return MarkRender.corners(o).map(([x, y]) => [OX + x * S, OY + y * S]); }
  function handles(o) {
    const c = selCorners(o); const a = ((o.rot || 0) * Math.PI) / 180;
    const topMid = [(c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2];
    return { corners: c, scale: c[2], rotate: [topMid[0] + Math.sin(a) * 28, topMid[1] - Math.cos(a) * 28], topMid };
  }
  function drawSelection(o) {
    const h = handles(o); ctx.save(); ctx.strokeStyle = '#e8731a'; ctx.lineWidth = 1.5; ctx.setLineDash(o.locked ? [4, 3] : []);
    ctx.beginPath(); h.corners.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
    if (!o.locked) {
      ctx.beginPath(); ctx.moveTo(...h.topMid); ctx.lineTo(...h.rotate); ctx.stroke();
      for (const [p, label] of [[h.scale, '⤡'], [h.rotate, '⟳']]) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p[0], p[1], 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#e8731a'; ctx.font = '14px Inter'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, p[0], p[1] + 1); }
    }
    ctx.restore();
  }
  MarkRender.setOnAsset(() => { draw(); });
  window.addEventListener('resize', draw);
  document.fonts && document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', () => draw());

  // ---------------- interazione mouse / touch
  function hit(mx, my) {
    const list = objs();
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i]; if (o.hidden || o.fixed) continue;
      const { w, h } = MarkRender.boxOf(o); const a = (-(o.rot || 0) * Math.PI) / 180;
      const dx = mx - o.x; const dy = my - o.y; const lx = dx * Math.cos(a) - dy * Math.sin(a); const ly = dx * Math.sin(a) + dy * Math.cos(a);
      const pad = 1.5 / zoom; if (Math.abs(lx) <= w / 2 + pad && Math.abs(ly) <= h / 2 + pad) return o;
    }
    return null;
  }
  const pts = new Map(); let drag = null; let changed = false;
  cv.addEventListener('pointerdown', (e) => {
    if (view !== 'edit') return;
    cv.setPointerCapture(e.pointerId); const r = cv.getBoundingClientRect(); const px = e.clientX - r.left; const py = e.clientY - r.top;
    pts.set(e.pointerId, [px, py]);
    if (pts.size === 2) { startPinch(); return; }
    const o = sel();
    if (o && !o.locked) {
      const h = handles(o); const near = (p) => Math.hypot(p[0] - px, p[1] - py) < 18;
      if (near(h.scale)) { drag = { mode: 'scale', o, start: snap(o), d0: Math.hypot(px - (OX + o.x * S), py - (OY + o.y * S)) }; return; }
      if (near(h.rotate)) { drag = { mode: 'rotate', o }; return; }
    }
    const [mx, my] = toMm(px, py); const t = hit(mx, my);
    if (t) { selId = t.id; drag = t.locked ? null : { mode: 'move', o: t, dx: mx - t.x, dy: my - t.y }; refreshSide(); }
    else { selId = null; drag = { mode: 'pan', px, py, panX, panY }; refreshSide(); }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    const r = cv.getBoundingClientRect(); const px = e.clientX - r.left; const py = e.clientY - r.top; pts.set(e.pointerId, [px, py]);
    if (pts.size === 2 && drag && drag.mode === 'pinch') return movePinch();
    if (!drag) return;
    const [mx, my] = toMm(px, py);
    if (drag.mode === 'move') {
      let nx = mx - drag.dx; let ny = my - drag.dy; const tol = 1.2 / zoom;
      if (Math.abs(nx - W / 2) < tol) nx = W / 2; if (Math.abs(ny - H / 2) < tol) ny = H / 2;
      drag.o.x = +nx.toFixed(2); drag.o.y = +ny.toFixed(2); changed = true;
    } else if (drag.mode === 'scale') {
      const d = Math.hypot(px - (OX + drag.o.x * S), py - (OY + drag.o.y * S)); applyScale(drag.o, drag.start, Math.max(0.05, d / drag.d0)); changed = true;
    } else if (drag.mode === 'rotate') {
      let a = (Math.atan2(my - drag.o.y, mx - drag.o.x) * 180) / Math.PI + 90; if (a > 180) a -= 360;
      for (const s of [0, 90, -90, 180, -180, 45, -45]) if (Math.abs(a - s) < 4) a = s;
      drag.o.rot = Math.round(a * 10) / 10; changed = true;
    } else if (drag.mode === 'pan') { panX = drag.panX + px - drag.px; panY = drag.panY + py - drag.py; }
    draw(); if (changed) renderProps(true);
  });
  const endPtr = (e) => {
    pts.delete(e.pointerId);
    if (pts.size === 0) { if (changed) commit(); changed = false; drag = null; }
    else if (drag && drag.mode === 'pinch') drag = null;
  };
  cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
  cv.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.1 : 0.9)); }, { passive: false });
  const snap = (o) => ({ sizePt: o.sizePt, w: o.w, h: o.h, letterSpacing: o.letterSpacing, strokeMm: o.strokeMm });
  function applyScale(o, st, f) {
    if (o.type === 'text') { o.sizePt = Math.max(2, +(st.sizePt * f).toFixed(2)); if (st.letterSpacing) o.letterSpacing = +(st.letterSpacing * f).toFixed(2); }
    else { o.w = Math.max(1, +(st.w * f).toFixed(2)); o.h = Math.max(o.type === 'shape' && o.shape === 'line' ? 0.1 : 1, +(st.h * f).toFixed(2)); }
  }
  function startPinch() {
    const [a, b] = [...pts.values()]; const o = sel();
    drag = { mode: 'pinch', o: o && !o.locked ? o : null, d0: Math.hypot(a[0] - b[0], a[1] - b[1]), a0: Math.atan2(b[1] - a[1], b[0] - a[0]), z0: zoom, start: o ? snap(o) : null, rot0: o ? o.rot || 0 : 0 };
  }
  function movePinch() {
    const [a, b] = [...pts.values()]; const f = Math.hypot(a[0] - b[0], a[1] - b[1]) / drag.d0;
    if (drag.o) { applyScale(drag.o, drag.start, f); drag.o.rot = +(drag.rot0 + ((Math.atan2(b[1] - a[1], b[0] - a[0]) - drag.a0) * 180) / Math.PI).toFixed(1); changed = true; renderProps(true); }
    else setZoom(drag.z0 * f, true);
    draw();
  }
  function setZoom(z, quiet) { zoom = Math.min(6, Math.max(0.4, z)); if (!quiet) draw(); }
  qs('#zIn').onclick = () => setZoom(zoom * 1.25); qs('#zOut').onclick = () => setZoom(zoom / 1.25); qs('#zFit').onclick = () => { zoom = 1; panX = panY = 0; draw(); };
  document.addEventListener('keydown', (e) => {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    const o = sel();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (!o || o.locked) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); return; }
    const step = e.shiftKey ? 1 : 0.2; const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (mv) { e.preventDefault(); o.x = +(o.x + mv[0]).toFixed(2); o.y = +(o.y + mv[1]).toFixed(2); commit(); }
  });

  // ---------------- azioni su elementi
  function addObj(o) { o.id = uid(); o.x = o.x ?? W / 2; o.y = o.y ?? H / 2; o.rot = o.rot || 0; objs().push(o); selId = o.id; commit(); }
  function duplicate() { const o = sel(); if (!o || o.locked) return; const c = { ...clone(o), id: uid(), x: o.x + 2, y: o.y + 2 }; objs().push(c); selId = c.id; commit(); }
  function remove() { const o = sel(); if (!o || o.locked) return; design.sides[side].objects = objs().filter((x) => x.id !== o.id); selId = null; commit(); }
  function reorder(id, dir) { const l = objs(); const i = l.findIndex((o) => o.id === id); const j = i + dir; if (j < 0 || j >= l.length || l[j].fixed) return; [l[i], l[j]] = [l[j], l[i]]; commit(); }
  qs('#undo').onclick = undo; qs('#redo').onclick = redo; qs('#dup').onclick = duplicate; qs('#del').onclick = remove;
  qs('#fwd').onclick = () => selId && reorder(selId, 1); qs('#back').onclick = () => selId && reorder(selId, -1);
  qs('#cx').onclick = () => { const o = sel(); if (o && !o.locked) { o.x = W / 2; commit(); } };
  qs('#cy').onclick = () => { const o = sel(); if (o && !o.locked) { o.y = H / 2; commit(); } };
  qsa('[data-view]').forEach((b) => { b.onclick = () => { view = b.dataset.view; qsa('[data-view]').forEach((x) => x.classList.toggle('on', x === b)); draw(); }; });

  const defaultColor = () => (design.mode === 'full' ? '#1d1d1b' : design.ink);
  const firstFont = () => (cfg.fonts[0] || { family: 'Montserrat' }).family;
  const addText = (text, font, sizePt, extra = {}) => Mark.loadFonts([font]).then(() => addObj({ type: 'text', text, font, sizePt, align: 'center', color: defaultColor(), ...extra }));
  qs('#addText').onclick = () => addText('Il tuo testo', firstFont(), 10);
  qs('#addTitle').onclick = () => addText('NOME LOCALE', 'Playfair Display', 15, { bold: true });
  qs('#addSub').onclick = () => addText('il tuo slogan', 'Cormorant Garamond', 8, { italic: true });
  qs('#addMono').onclick = () => addText('A&B', 'Great Vibes', 20);

  // ---------------- pannelli sinistri
  qsa('#tabs button').forEach((b) => { b.onclick = () => { qsa('#tabs button').forEach((x) => x.classList.toggle('on', x === b)); qsa('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== b.dataset.tab; }); if (b.dataset.tab === 'text') renderFonts(); if (b.dataset.tab === 'layers') renderLayers(); }; });

  // modelli
  // modelli specifici del formato + modelli bustina adattati automaticamente alle misure del prodotto
  const templates = [...await api(`/api/templates?shape=${P.shape}`).catch(() => []), ...(P.shape !== 'sachet' ? await api('/api/templates?shape=sachet').catch(() => []) : [])];
  async function renderTemplates() {
    const el = qs('#tplList'); el.innerHTML = '';
    const blank = document.createElement('button'); blank.className = 'btn-light'; blank.style.width = '100%'; blank.textContent = P.shape === 'sachet' ? 'Bustina bianca (parti da zero)' : 'Prodotto neutro (parti da zero)';
    blank.onclick = () => { if (userObjCount() && !confirm('Vuoi cancellare la grafica attuale?')) return; design = blankDesign(); design.mode = option.mode; selId = null; commit(); };
    el.append(blank);
    const fams = [...new Set(templates.flatMap((t) => Object.values(t.design.sides || {}).flat().filter((o) => o.type === 'text').map((o) => o.font)))];
    await Mark.loadFonts(fams);
    for (const g of [...new Set(templates.map((t) => t.group_name))]) {
      const h = document.createElement('label'); h.textContent = g; el.append(h);
      const grid = document.createElement('div'); grid.className = 'tplgrid';
      for (const t of templates.filter((x) => x.group_name === g)) {
        const b = document.createElement('button'); const d = templateToDesign(t);
        const c = MarkRender.flatPreview(d, P.sides[0].code, P, 300, variantPaper()); b.append(c); b.append(document.createTextNode(t.name));
        b.onclick = () => { if (userObjCount() && !confirm('Applicare il modello? La grafica attuale verrà sostituita.')) return; design = templateToDesign(t); selId = null; commit(); toast('Modello applicato: tocca i testi per modificarli'); };
        grid.append(b);
      }
      el.append(grid);
    }
  }
  function templateToDesign(t) {
    const bw = t.design.baseW || W; const bh = t.design.baseH || H; const sx = W / bw; const sy = H / bh; const s = Math.min(sx, sy);
    const d = { v: 1, mode: option.mode, ink: design.ink, inkName: design.inkName, sides: {} };
    P.sides.forEach((sd, i) => {
      const src = (t.design.sides || {})[sd.code] || (i === 0 ? (t.design.sides || {}).front : null) || [];
      const list = Array.isArray(src) ? src : src.objects || [];
      d.sides[sd.code] = { objects: list.filter((o) => !o.fixed).map((o) => {
        const n = { ...clone(o), id: uid(), x: o.x * sx, y: o.y * sy };
        if (n.type === 'text') n.sizePt = +(o.sizePt * s).toFixed(2); else { n.w = +(o.w * s).toFixed(2); n.h = +(o.h * s).toFixed(2); }
        if (!n.color || design.mode !== 'full') n.color = design.mode === 'full' ? '#1d1d1b' : design.ink;
        return n;
      }) };
    });
    return withFixed(d);
  }
  const userObjCount = () => Object.values(design.sides).reduce((a, s) => a + s.objects.filter((o) => !o.fixed).length, 0);

  // font
  let fontsLoadedAll = false;
  async function renderFonts() {
    const term = qs('#fontSearch').value.toLowerCase(); const el = qs('#fontList'); el.innerHTML = ''; const o = sel();
    const cats = [...new Set(cfg.fonts.map((f) => f.category))];
    for (const c of cats) {
      const list = cfg.fonts.filter((f) => f.category === c && (!term || f.family.toLowerCase().includes(term) || c.toLowerCase().includes(term)));
      if (!list.length) continue;
      const h = document.createElement('div'); h.className = 'cat'; h.textContent = c; el.append(h);
      for (const f of list) {
        const b = document.createElement('button'); b.style.fontFamily = `"${f.family}"`; b.textContent = (o && o.type === 'text' ? o.text.split('\n')[0].slice(0, 22) : '') || f.family;
        b.title = f.family; if (o && o.font === f.family) b.classList.add('on');
        b.onclick = async () => { await Mark.loadFonts([f.family]); const s = sel(); if (s && s.type === 'text' && !s.locked) { s.font = f.family; commit(); } else addText('Il tuo testo', f.family, 10); renderFonts(); };
        el.append(b);
      }
    }
    if (!fontsLoadedAll) { fontsLoadedAll = true; Mark.loadFonts(cfg.fonts.map((f) => f.family)); }
  }
  qs('#fontSearch').oninput = renderFonts;

  // immagini
  const myUploads = JSON.parse(sessionStorage.getItem('mark_uploads') || '[]');
  function renderUploads() {
    const el = qs('#uploads'); el.innerHTML = '';
    myUploads.forEach((u) => { const b = document.createElement('button'); b.innerHTML = `<img src="${esc(u.url)}" style="max-width:100%;max-height:40px">`; b.onclick = () => insertImage(u); el.append(b); });
  }
  function insertImage(u) {
    const ar = u.natW / u.natH; let w = W * 0.55; let h = w / ar; if (h > H * 0.6) { h = H * 0.6; w = h * ar; }
    addObj({ type: 'image', src: u.url, natW: u.natW, natH: u.natH, w: +w.toFixed(2), h: +h.toFixed(2), removeBg: false, threshold: 160, color: defaultColor() });
  }
  qs('#fileIn').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (f.size > 30 * 1024 * 1024) return toast('Immagine troppo grande (max 30 MB)', 'err');
    toast('Caricamento in corso…');
    try {
      let dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Immagine non leggibile')); i.src = dataUrl; });
      let natW = img.naturalWidth; let natH = img.naturalHeight;
      if (f.size > 12 * 1024 * 1024 || Math.max(natW, natH) > 6000) {
        const k = Math.min(1, 6000 / Math.max(natW, natH)); const c = document.createElement('canvas'); c.width = Math.round(natW * k); c.height = Math.round(natH * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); dataUrl = c.toDataURL(f.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.92); natW = c.width; natH = c.height;
      }
      const { url } = await api('/api/uploads', { body: { dataUrl } });
      const u = { url, natW, natH }; myUploads.unshift(u); sessionStorage.setItem('mark_uploads', JSON.stringify(myUploads.slice(0, 20)));
      renderUploads(); insertImage(u);
    } catch (err) { toast(err.message, 'err'); }
  };

  // decorazioni
  function renderDeco() {
    const t = qs('#decoSearch').value.toLowerCase().trim();
    const ig = qs('#iconGrid'); ig.innerHTML = '';
    for (const [k, ic] of Object.entries(MarkIcons.ICONS)) {
      if (t && !`${ic.label} ${ic.tags}`.toLowerCase().includes(t)) continue;
      const b = document.createElement('button'); b.title = ic.label;
      b.innerHTML = `<svg viewBox="0 0 24 24"><path d="${ic.d}" fill="currentColor" fill-rule="evenodd"/>${ic.stroke ? `<path d="${ic.stroke}" stroke="currentColor" fill="none" stroke-width="1.2"/>` : ''}</svg>`;
      b.onclick = () => addObj({ type: 'icon', icon: k, w: Math.min(10, H * 0.3), h: Math.min(10, H * 0.3), color: defaultColor() }); ig.append(b);
    }
    const sg = qs('#shapeGrid'); sg.innerHTML = '';
    [['line', '—', 'Linea'], ['frame', '▭', 'Cornice'], ['circle', '◯', 'Cerchio'], ['rect', '■', 'Rettangolo pieno']].forEach(([s, ch, lbl]) => {
      const b = document.createElement('button'); b.textContent = ch; b.title = lbl;
      b.onclick = () => {
        const sm = P.safeMm || 3;
        if (s === 'line') addObj({ type: 'shape', shape: 'line', w: W * 0.4, h: 0.4, strokeMm: 0.3, color: defaultColor() });
        else if (s === 'frame') addObj({ type: 'shape', shape: 'frame', w: W - 2 * sm - 1, h: H - 2 * sm - 1, strokeMm: 0.35, color: defaultColor() });
        else if (s === 'circle') addObj({ type: 'shape', shape: 'circle', w: H * 0.4, h: H * 0.4, strokeMm: 0.35, color: defaultColor() });
        else addObj({ type: 'shape', shape: 'frame', filled: true, w: W * 0.3, h: H * 0.15, color: defaultColor() });
      };
      sg.append(b);
    });
    const eg = qs('#emojiGrid'); eg.innerHTML = '';
    MarkIcons.EMOJI.filter((e) => !t || e.tags.includes(t)).forEach((e) => {
      const b = document.createElement('button'); b.textContent = e.ch; b.title = e.tags;
      b.onclick = () => addObj({ type: 'emoji', ch: e.ch, w: Math.min(9, H * 0.25), h: Math.min(9, H * 0.25), color: defaultColor() }); eg.append(b);
    });
  }
  qs('#decoSearch').oninput = renderDeco;

  // QR
  qs('#addQr').onclick = () => {
    const v = qs('#qrIn').value.trim(); if (!v) return toast('Inserisci un link o un testo', 'err');
    const s = Math.min(H * 0.55, 20); addObj({ type: 'qr', value: v, w: s, h: s, color: defaultColor() });
  };

  // livelli
  function renderLayers() {
    const el = qs('#layerList'); el.innerHTML = '';
    const list = objs().slice().reverse();
    if (!list.length) el.innerHTML = '<p class="small muted">Nessun elemento su questo lato.</p>';
    list.forEach((o) => {
      const d = document.createElement('div'); d.className = `ly${o.id === selId ? ' on' : ''}`;
      const name = o.type === 'text' ? `T · ${o.text}` : o.type === 'image' ? 'Immagine' : o.type === 'icon' ? `Decoro · ${(MarkIcons.ICONS[o.icon] || {}).label || ''}` : o.type === 'emoji' ? `Emoji ${o.ch}` : o.type === 'qr' ? 'QR code' : 'Forma';
      d.innerHTML = `<span class="n">${o.fixed ? '🔒 ' : ''}${esc(name)}${o.fixed ? ' (dicitura obbligatoria)' : ''}</span>`;
      if (!o.fixed) {
        for (const [lbl, fn, title] of [['▲', () => reorder(o.id, 1), 'Avanti'], ['▼', () => reorder(o.id, -1), 'Indietro'], [o.hidden ? '◌' : '◉', () => { o.hidden = !o.hidden; commit(); }, 'Mostra/nascondi'], [o.locked ? '🔒' : '🔓', () => { o.locked = !o.locked; commit(); }, 'Blocca']]) {
          const b = document.createElement('button'); b.textContent = lbl; b.title = title; b.onclick = (ev) => { ev.stopPropagation(); fn(); }; d.append(b);
        }
      }
      d.onclick = () => { if (!o.fixed) { selId = o.id; refreshSide(); } };
      el.append(d);
    });
  }

  // ---------------- pannello destro: prodotto, colori, proprietà
  qs('#prodName').textContent = product.name; qs('#prodDetail').textContent = `${product.unit_detail} · formato ${W}×${H} mm`;
  if (P.specsToVerify) qs('#specWarn').innerHTML = '<div class="alert info small">Le misure dell\'area di stampa di questo prodotto sono in fase di verifica: MARK controllerà la grafica prima della produzione.</div>';
  qs('#helpLink').href = `mailto:${cfg.shop.email}?subject=${encodeURIComponent(`Richiesta su ${product.name}`)}`;
  const optSel = qs('#optSel'); optSel.innerHTML = product.print_options.map((o) => `<option value="${o.code}">${esc(o.label)}</option>`).join('');
  optSel.value = option.code;
  optSel.onchange = () => {
    option = product.print_options.find((o) => o.code === optSel.value); design.mode = option.mode;
    const min = Math.min(...product.tiers.filter((t) => t.option_code === option.code).map((t) => t.min_qty)); if (qty < min) qty = min;
    commit(); renderProduct();
  };
  if ((product.variants || []).length) {
    qs('#variantBox').innerHTML = `<label>Colore del prodotto</label><div class="swatches" id="varSw"></div>`;
  }
  function renderProduct() {
    const vs = qs('#varSw'); if (vs) { vs.innerHTML = ''; product.variants.forEach((v) => { const b = document.createElement('button'); b.style.background = v.color; b.title = v.label; b.classList.toggle('on', variant && v.code === variant.code); b.onclick = () => { variant = v; renderProduct(); draw(); commit(); }; vs.append(b); }); }
    qs('#inkBox').hidden = design.mode !== 'mono';
    const sw = qs('#inkSw'); sw.innerHTML = '';
    inks.forEach((i) => { const b = document.createElement('button'); b.style.background = i.hex; b.title = i.name; b.classList.toggle('on', design.ink === i.hex); b.onclick = () => { design.ink = i.hex; design.inkName = i.name; commit(); renderProduct(); }; sw.append(b); });
    qs('#inkName').textContent = design.mode === 'mono' ? `${design.inkName || ''} · i colori a video sono indicativi, in stampa si usa il Pantone indicato` : '';
    const step = product.qty_step || 1; const q = qs('#qtyIn'); q.step = step; q.min = Math.min(...product.tiers.filter((t) => t.option_code === option.code).map((t) => t.min_qty)); q.value = qty;
    qs('#unitLbl').textContent = `${product.unit_label}${step > 1 ? `, multipli di ${step}` : ''}`;
    qs('#tierInfo').innerHTML = product.tiers.filter((t) => t.option_code === option.code).map((t) => `da ${t.min_qty}: <b>${money(t.unit_price)}</b>`).join(' · ') + ` / ${esc(product.unit_label)} + IVA`;
  }
  qs('#qtyIn').onchange = () => { qty = Math.max(1, Math.round(Number(qs('#qtyIn').value) || 0)); commit(); };

  function colorControl(o) {
    if (design.mode === 'mono') return `<div class="small muted" style="margin-top:8px">Stampa a 1 colore: tutti gli elementi sono stampati in ${esc(design.inkName || design.ink)}.</div>`;
    const pal = design.mode === 'multi' ? inks : [{ hex: '#1d1d1b', name: 'Nero' }, { hex: '#ffffff', name: 'Bianco' }, ...inks];
    return `<label>Colore${design.mode === 'multi' ? ` (max ${option.maxColors} colori in totale)` : ''}</label><div class="swatches" data-pal>${pal.map((i) => `<button style="background:${i.hex}" title="${esc(i.name)}" data-c="${i.hex}" class="${(o.color || '').toUpperCase() === i.hex.toUpperCase() ? 'on' : ''}"></button>`).join('')}
      ${design.mode === 'full' ? `<input type="color" data-k="color" value="${o.color || '#1d1d1b'}">` : ''}</div>`;
  }
  function renderProps(soft) {
    const el = qs('#props'); const o = sel();
    if (!o) { el.innerHTML = '<p class="small muted" style="margin-top:14px">Seleziona un elemento sulla bustina per modificarlo. Trascina per spostarlo, usa ⤡ per ridimensionare e ⟳ per ruotare.</p>'; return; }
    if (soft && el.dataset.id === o.id) {
      for (const k of ['sizePt', 'rot', 'w']) { const i = el.querySelector(`[data-k="${k}"]`); if (i && document.activeElement !== i) i.value = k === 'w' ? (+o.w).toFixed(1) : (+o[k] || 0).toFixed(1); }
      return;
    }
    el.dataset.id = o.id;
    let h = `<hr style="border:0;border-top:1px solid var(--line);margin:16px 0"><strong>${{ text: 'Testo', image: 'Immagine', icon: 'Decorazione', emoji: 'Emoji', qr: 'QR code', shape: 'Forma' }[o.type]}</strong>`;
    if (o.type === 'text') {
      h += `<label>Testo</label><textarea data-k="text" rows="2">${esc(o.text)}</textarea>
      <div class="grid2"><div><label>Dimensione (pt)</label><input type="number" step="0.5" min="2" data-k="sizePt" value="${o.sizePt}"></div><div><label>Spaziatura (mm)</label><input type="number" step="0.1" data-k="letterSpacing" value="${o.letterSpacing || 0}"></div></div>
      <label>Stile e allineamento</label><div class="seg"><button data-t="bold" class="${o.bold ? 'on' : ''}"><b>G</b></button><button data-t="italic" class="${o.italic ? 'on' : ''}"><i>C</i></button><button data-t="underline" class="${o.underline ? 'on' : ''}"><u>S</u></button>
      <button data-a="left" class="${o.align === 'left' ? 'on' : ''}">⇤</button><button data-a="center" class="${(o.align || 'center') === 'center' ? 'on' : ''}">≡</button><button data-a="right" class="${o.align === 'right' ? 'on' : ''}">⇥</button></div>
      <label>Interlinea</label><input type="range" min="0.8" max="2" step="0.05" data-k="lineHeight" value="${o.lineHeight || 1.15}">
      <div class="small muted">Font: <b style="font-family:'${esc(o.font)}'">${esc(o.font)}</b> · cambialo dalla scheda Testo</div>`;
    } else if (o.type === 'qr') {
      h += `<label>Contenuto</label><input data-k="value" value="${esc(o.value)}"><label>Lato (mm)</label><input type="number" step="0.5" data-k="w" value="${(+o.w).toFixed(1)}">`;
    } else {
      h += `<label>Larghezza (mm)</label><input type="number" step="0.5" data-k="w" value="${(+o.w).toFixed(1)}">`;
      if (o.type === 'image') {
        h += `<label class="row" style="font-weight:400"><input type="checkbox" data-b="removeBg" ${o.removeBg ? 'checked' : ''}> Rimuovi sfondo bianco</label>`;
        if (design.mode !== 'full') h += `<label>Soglia conversione a 1 colore</label><input type="range" min="40" max="250" step="5" data-k="threshold" value="${o.threshold || 160}">`;
      }
      if (o.type === 'shape') h += `<label>Spessore linea (mm)</label><input type="number" step="0.05" min="0.1" data-k="strokeMm" value="${o.strokeMm || 0.3}">`;
    }
    h += `<label>Rotazione (°)</label><input type="number" step="1" data-k="rot" value="${(+o.rot || 0).toFixed(1)}">`;
    h += `<label>Opacità</label><input type="range" min="0.2" max="1" step="0.05" data-k="opacity" value="${o.opacity ?? 1}">`;
    h += colorControl(o);
    h += `<div class="row" style="margin-top:12px"><button class="btn-light btn-sm grow" data-act="dup">Duplica</button><button class="btn-light btn-sm grow" data-act="del">Elimina</button>${P.sides.length > 1 ? `<button class="btn-light btn-sm grow" data-act="copyside">Copia su ${esc(P.sides.find((s) => s.code !== side).label)}</button>` : ''}</div>`;
    el.innerHTML = h;
    el.querySelectorAll('[data-k]').forEach((i) => {
      const ev = i.tagName === 'TEXTAREA' || i.type === 'range' || i.type === 'color' || i.dataset.k === 'value' ? 'input' : 'change';
      i.addEventListener(ev, () => {
        const k = i.dataset.k; let v = i.type === 'number' || i.type === 'range' ? Number(i.value) : i.value;
        if (k === 'w' && o.w) { const ar = o.h / o.w; o.w = v; o.h = o.type === 'shape' ? o.h : +(v * ar).toFixed(2); if (o.type === 'qr') o.h = v; }
        else o[k] = v;
        draw(); clearTimeout(i._t); i._t = setTimeout(commit, 400);
      });
    });
    el.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { o[b.dataset.t] = !o[b.dataset.t]; el.dataset.id = ''; commit(); }; });
    el.querySelectorAll('[data-a]').forEach((b) => { b.onclick = () => { o.align = b.dataset.a; el.dataset.id = ''; commit(); }; });
    el.querySelectorAll('[data-b]').forEach((b) => { b.onchange = () => { o[b.dataset.b] = b.checked; commit(); }; });
    el.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => { o.color = b.dataset.c; el.dataset.id = ''; commit(); }; });
    el.querySelector('[data-act="dup"]').onclick = duplicate; el.querySelector('[data-act="del"]').onclick = remove;
    const cs = el.querySelector('[data-act="copyside"]'); if (cs) cs.onclick = () => { const other = P.sides.find((s) => s.code !== side).code; design.sides[other].objects.splice(design.sides[other].objects.filter((x) => !x.fixed).length, 0, { ...clone(o), id: uid() }); commit(); toast('Elemento copiato'); };
  }

  // lati
  function renderSides() {
    const el = qs('#sidePick'); el.innerHTML = '';
    if (P.sides.length < 2) return;
    P.sides.forEach((s) => { const b = document.createElement('button'); b.textContent = s.label; b.classList.toggle('on', s.code === side); b.onclick = () => { side = s.code; selId = null; refresh(); }; el.append(b); });
  }

  // ---------------- controlli e prezzo
  let lastChecks = [];
  function runChecks() {
    lastChecks = MarkRender.checkDesign(design, P, option, { inks });
    const el = qs('#checks');
    el.innerHTML = lastChecks.length ? lastChecks.map((c) => `<li class="${c.level}" data-id="${c.id || ''}" data-side="${c.side || ''}" style="cursor:pointer">${c.level === 'error' ? '⛔' : '⚠️'} ${esc(c.msg)}</li>`).join('') : '<li style="color:var(--ok)">✔ Nessun problema rilevato</li>';
    el.querySelectorAll('li[data-id]').forEach((li) => { li.onclick = () => { if (li.dataset.id) { side = li.dataset.side || side; selId = li.dataset.id; refresh(); } }; });
  }
  const usesSide3 = () => ((design.sides.side3 || {}).objects || []).some((o) => !o.fixed && !o.hidden);
  let quoteT; let lastQuote = null;
  function requestQuote() {
    clearTimeout(quoteT);
    quoteT = setTimeout(async () => {
      try {
        lastQuote = await api('/api/quote', { body: { items: [{ productSlug: slug, option: option.code, qty, variant: variant && variant.code, side3: usesSide3() }] } });
        const l = lastQuote.lines[0]; const t = lastQuote.totals;
        qs('#summary').innerHTML = (l ? `<div class="sum-row"><span>${esc(product.name)}</span></div>
          <div class="sum-row"><span>${esc(option.label)}${variant ? ` · ${esc(variant.label)}` : ''}</span></div>
          <div class="sum-row"><span>${l.qty} ${esc(product.unit_label)} × ${money(l.unitPrice)}${l.side3 ? ' (terzo lato +10%)' : ''}</span><span>${money(l.goods)}</span></div>
          <div class="sum-row"><span>Contributo impianto stampa</span><span>${money(l.setup)}</span></div>
          <div class="sum-row"><span>${esc(t.shippingLabel)}</span><span>${t.shipping == null ? '—' : money(t.shipping)}</span></div>
          <div class="sum-row"><span>IVA ${t.vatRate}%</span><span>${money(t.vat)}</span></div>
          <div class="sum-row total"><span>Totale</span><span>${money(t.total)}</span></div>${l.tierInfo ? `<div class="small muted">${esc(l.tierInfo)}</div>` : ''}` : '')
          + lastQuote.errors.map((e) => `<div class="alert err small">${esc(e)}</div>`).join('');
        qs('#mTot').textContent = money(t.total);
      } catch (e) { qs('#summary').innerHTML = `<div class="alert err small">${esc(e.message)}</div>`; }
    }, 250);
  }

  function refreshSide() { draw(); renderProps(); renderLayers(); }
  function refresh() { renderSides(); draw(); renderProps(); renderLayers(); runChecks(); requestQuote(); qs('#specBar').textContent = `${P.sides.find((s) => s.code === side).label} · ${W}×${H} mm · area sicura tratteggiata`; }

  // ---------------- salvataggio progetto
  async function saveProject(silent) {
    try {
      const r = await api('/api/projects', { body: { token: projectToken, productSlug: slug, design, name: product.name } });
      projectToken = r.token; const u = new URL(location.href); u.searchParams.set('project', r.token); history.replaceState(null, '', u);
      qs('#saveInfo').innerHTML = `Salvato. Riprendi da questo link: <a href="${esc(u.href)}">copia link</a>`;
      if (!silent) { try { await navigator.clipboard.writeText(u.href); toast('Progetto salvato: link copiato'); } catch { toast('Progetto salvato'); } }
    } catch (e) { if (!silent) toast(e.message, 'err'); }
  }
  qs('#saveBtn').onclick = () => saveProject(false);
  qs('#dupProj').onclick = async () => {
    if (!projectToken) await saveProject(true);
    const r = await api(`/api/projects/${projectToken}/duplicate`, { body: {} }); location.href = `/editor.html?p=${slug}&project=${r.token}`;
  };

  // ---------------- conferma finale → grafica immutabile → carrello
  const CONFIRM = qs('#confirmTxt').textContent.trim();
  async function openConfirm() {
    selId = null; draw(); runChecks();
    const m = qs('#confirmModal'); m.hidden = false;
    const v = qs('#finalViews'); v.innerHTML = '';
    const opt = { productSlug: slug, variantColor: variant && variant.color, transparent: /trasparente/.test(slug) };
    for (const s of P.sides) {
      if (s.optional && !((design.sides[s.code] || {}).objects || []).some((o) => !o.fixed)) continue;
      const box = document.createElement('div');
      const flat = MarkRender.flatPreview(design, s.code, P, 1000, variantPaper());
      const mk = document.createElement('canvas'); mk.width = 1000; mk.height = 700; MarkRender.mockup(mk, design, s.code, P, opt);
      box.innerHTML = `<strong>${esc(s.label)}</strong>`; box.append(flat, mk); flat.style.border = '1px solid var(--line)'; flat.style.marginBottom = '8px';
      v.append(box);
    }
    const errs = lastChecks.filter((c) => c.level === 'error'); const warns = lastChecks.filter((c) => c.level === 'warn');
    qs('#finalChecks').innerHTML = (errs.length ? `<div class="alert err"><b>Da correggere prima di procedere:</b><ul>${errs.map((c) => `<li>${esc(c.msg)}</li>`).join('')}</ul></div>` : '')
      + (warns.length ? `<div class="alert warn"><b>Avvisi:</b><ul>${warns.map((c) => `<li>${esc(c.msg)}</li>`).join('')}</ul></div>` : '')
      + (!errs.length && !warns.length ? '<div class="alert ok">Controllo tecnico superato.</div>' : '');
    qs('#warnAckRow').hidden = !warns.length; qs('#warnAck').checked = false; qs('#confirmChk').checked = false;
    const t = lastQuote && lastQuote.totals; const l = lastQuote && lastQuote.lines[0];
    qs('#finalSummary').innerHTML = l ? `<div class="sum-row"><span>${esc(product.name)} · ${esc(option.label)}${variant ? ` · ${esc(variant.label)}` : ''}${design.mode === 'mono' ? ` · ${esc(design.inkName)}` : ''}</span></div>
      <div class="sum-row"><span>${l.qty} ${esc(product.unit_label)} × ${money(l.unitPrice)}</span><span>${money(l.goods)}</span></div><div class="sum-row"><span>Impianto stampa</span><span>${money(l.setup)}</span></div>
      <div class="sum-row"><span>${esc(t.shippingLabel)}</span><span>${t.shipping == null ? '—' : money(t.shipping)}</span></div><div class="sum-row"><span>IVA</span><span>${money(t.vat)}</span></div>
      <div class="sum-row total"><span>Totale</span><span>${money(t.total)}</span></div>` : '';
    const upd = () => { qs('#addToCart').disabled = !!errs.length || !qs('#confirmChk').checked || (warns.length && !qs('#warnAck').checked) || !l; };
    qs('#confirmChk').onchange = upd; qs('#warnAck').onchange = upd; upd();
  }
  qs('#confirmBtn').onclick = openConfirm; qs('#mConfirm').onclick = openConfirm;
  qs('#closeModal').onclick = () => { qs('#confirmModal').hidden = true; };
  qs('#addToCart').onclick = async () => {
    const btn = qs('#addToCart'); btn.disabled = true; btn.textContent = 'Preparazione file di produzione…';
    try {
      await Mark.loadFonts(fontsUsed());
      const files = {}; const dpi = Math.max(W, H) > 100 ? 300 : 600;
      for (const s of P.sides) {
        const has = ((design.sides[s.code] || {}).objects || []).some((o) => !o.fixed && !o.hidden);
        if (s.optional && !has) continue;
        files[`preview_${s.code}`] = MarkRender.flatPreview(design, s.code, P, 1000, variantPaper()).toDataURL('image/png');
        const mk = document.createElement('canvas'); mk.width = 1000; mk.height = 700; MarkRender.mockup(mk, design, s.code, P, { productSlug: slug, variantColor: variant && variant.color, transparent: /trasparente/.test(slug) });
        files[`mockup_${s.code}`] = mk.toDataURL('image/png');
        files[`production_${s.code}`] = MarkRender.exportPNG(design, s.code, P, dpi);
        files[`svg_${s.code}`] = MarkRender.exportSVG(design, s.code, P, Mark.fontsCssUrl(fontsUsed()));
      }
      const r = await api('/api/designs', { body: { productSlug: slug, option: option.code, design, files, checks: lastChecks, confirmText: CONFIRM } });
      Mark.cart.add({ productSlug: slug, option: option.code, variant: variant && variant.code, qty, designId: r.designId, name: product.name, preview: `/api/designs/${r.designId}/img/preview_${P.sides[0].code}` });
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
      location.href = '/carrello.html';
    } catch (e) { toast(e.message, 'err'); btn.disabled = false; btn.textContent = 'Conferma e aggiungi al carrello'; }
  };

  // ---------------- modalità admin: salva come template
  api('/api/admin/me').then(async (r) => {
    if (!r.admin) return;
    const b = qs('#tplSave'); b.hidden = false;
    const tid = params.get('template');
    if (tid) { const all = await api('/api/admin/templates'); const t = all.find((x) => String(x.id) === tid); if (t) { design = templateToDesign(t); commit(); b.textContent = `Aggiorna template «${t.name}» (admin)`; } }
    b.onclick = async () => {
      const sides = {}; P.sides.forEach((s) => { sides[s.code] = design.sides[s.code].objects.filter((o) => !o.fixed).map(({ id, ...o }) => o); });
      const tpl = { baseW: W, baseH: H, sides };
      if (tid) { await api(`/api/admin/templates/${tid}`, { method: 'PUT', body: { design: tpl } }); toast('Template aggiornato'); return; }
      const name = prompt('Nome del template'); if (!name) return;
      const group = prompt('Categoria (es. "Bar e ristoranti" oppure "Eventi")', 'Bar e ristoranti') || 'Bar e ristoranti';
      await api('/api/admin/templates', { body: { shape: P.shape, group_name: group, name, design: tpl } }); toast('Template salvato');
    };
  }).catch(() => {});

  // ---------------- avvio
  renderProduct(); renderUploads(); renderDeco(); renderTemplates();
  if (!hist.length) { hist.push(JSON.stringify(design)); hIdx = 0; }
  refresh();
})();
