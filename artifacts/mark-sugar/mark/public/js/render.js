// Motore di rendering condiviso: editor, anteprime, mockup ed esportazione file di produzione.
// Tutte le coordinate della grafica sono in millimetri reali del prodotto (x, y = centro dell'elemento).
(function (root) {
  const PT = 0.3528; // 1 punto tipografico in mm
  const imgCache = new Map(); const procCache = new Map(); const qrCache = new Map();
  let onAsset = () => {};

  function getImage(src) {
    let e = imgCache.get(src);
    if (!e) {
      const img = new Image(); e = { img, ok: false };
      img.onload = () => { e.ok = true; onAsset(); };
      img.onerror = () => { e.err = true; onAsset(); };
      img.src = src; imgCache.set(src, e);
    }
    return e;
  }
  function emojiCanvas(ch) {
    const key = `emoji:${ch}`;
    if (!procCache.has(key)) {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const x = c.getContext('2d'); x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = '200px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; x.fillText(ch, 128, 140);
      procCache.set(key, c);
    }
    return procCache.get(key);
  }
  // elaborazione immagine: rimozione fondo bianco e/o conversione monocromatica nel colore di stampa
  function processed(srcCanvasOrImg, key, o, color) {
    const k = `${key}|${o.removeBg ? 1 : 0}|${color || ''}|${o.threshold || 160}`;
    if (procCache.has(k)) return procCache.get(k);
    const w0 = srcCanvasOrImg.naturalWidth || srcCanvasOrImg.width; const h0 = srcCanvasOrImg.naturalHeight || srcCanvasOrImg.height;
    const f = Math.min(1, 2400 / Math.max(w0, h0));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w0 * f)); c.height = Math.max(1, Math.round(h0 * f));
    const x = c.getContext('2d'); x.drawImage(srcCanvasOrImg, 0, 0, c.width, c.height);
    if (o.removeBg || color) {
      const d = x.getImageData(0, 0, c.width, c.height); const p = d.data;
      const rgb = color ? hexRgb(color) : null; const th = o.threshold || 160;
      for (let i = 0; i < p.length; i += 4) {
        const lum = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
        if (o.removeBg && p[i] > 235 && p[i + 1] > 235 && p[i + 2] > 235) p[i + 3] = 0;
        if (rgb) {
          const on = p[i + 3] > 110 && lum < th;
          p[i] = rgb[0]; p[i + 1] = rgb[1]; p[i + 2] = rgb[2]; p[i + 3] = on ? 255 : 0;
        }
      }
      x.putImageData(d, 0, 0);
    }
    procCache.set(k, c); return c;
  }
  function hexRgb(h) { const n = parseInt(h.replace('#', '').padEnd(6, '0'), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function qr(value) { if (!qrCache.has(value)) { try { qrCache.set(value, root.MarkQR.encode(value || ' ')); } catch { qrCache.set(value, null); } } return qrCache.get(value); }

  // colore effettivo di stampa di un elemento
  function inkOf(o, design) {
    if (design.mode === 'mono') return design.ink || '#2D2926';
    if (o.color) return o.color;
    return design.mode === 'full' ? null : (design.ink || '#2D2926');
  }
  const fontStr = (o, px) => `${o.italic ? 'italic ' : ''}${o.bold ? 'bold ' : ''}${px}px "${o.font || 'Montserrat'}", sans-serif`;

  // misura testo (mm) usando un contesto di servizio
  const mctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  function measureText(o) {
    const px = 100; mctx.font = fontStr(o, px);
    if ('letterSpacing' in mctx) mctx.letterSpacing = `${(o.letterSpacing || 0) / (o.sizePt * PT) * px}px`;
    const lines = String(o.text || ' ').split('\n');
    const wpx = Math.max(...lines.map((l) => mctx.measureText(l || ' ').width));
    const mm = (o.sizePt * PT) / px;
    const lh = (o.lineHeight || 1.15) * o.sizePt * PT;
    return { w: wpx * mm, h: lh * lines.length, lines, lh };
  }
  function boxOf(o) {
    if (o.type === 'text') { const m = measureText(o); return { w: m.w, h: m.h }; }
    return { w: o.w, h: o.h };
  }
  function corners(o) {
    const { w, h } = boxOf(o); const a = ((o.rot || 0) * Math.PI) / 180; const c = Math.cos(a); const s = Math.sin(a);
    return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [o.x + x * c - y * s, o.y + x * s + y * c]);
  }

  function drawObject(ctx, o, design, S) {
    if (o.hidden) return;
    const ink = inkOf(o, design);
    ctx.save();
    ctx.translate(o.x * S, o.y * S); ctx.rotate(((o.rot || 0) * Math.PI) / 180);
    ctx.globalAlpha = o.opacity == null ? 1 : o.opacity;
    if (o.type === 'text') {
      const m = measureText(o); const px = o.sizePt * PT * S;
      ctx.font = fontStr(o, px); ctx.fillStyle = ink || o.color || '#000'; ctx.textBaseline = 'middle';
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${(o.letterSpacing || 0) * S}px`;
      const align = o.align || 'center'; ctx.textAlign = align;
      const x0 = align === 'left' ? -m.w / 2 : align === 'right' ? m.w / 2 : 0;
      m.lines.forEach((l, i) => ctx.fillText(l, x0 * S, (-m.h / 2 + m.lh * (i + 0.5)) * S));
      if (o.underline) { ctx.fillRect(-m.w / 2 * S, (m.h / 2 - m.lh * 0.12) * S, m.w * S, Math.max(1, px * 0.06)); }
    } else if (o.type === 'image' || o.type === 'emoji') {
      let src; let key;
      if (o.type === 'emoji') { src = emojiCanvas(o.ch); key = `emoji:${o.ch}`; } else { const e = getImage(o.src); if (e.ok) { src = e.img; key = o.src; } }
      if (src) {
        const needColor = design.mode !== 'full' ? ink : null;
        const c = (o.removeBg || needColor) ? processed(src, key, o, needColor) : src;
        ctx.drawImage(c, -o.w / 2 * S, -o.h / 2 * S, o.w * S, o.h * S);
      } else { ctx.fillStyle = 'rgba(0,0,0,.06)'; ctx.fillRect(-o.w / 2 * S, -o.h / 2 * S, o.w * S, o.h * S); }
    } else if (o.type === 'icon') {
      const ic = root.MarkIcons.ICONS[o.icon]; if (ic) {
        ctx.scale((o.w * S) / 24, (o.h * S) / 24); ctx.translate(-12, -12);
        ctx.fillStyle = ink || o.color || '#000'; ctx.fill(new Path2D(ic.d), 'evenodd');
        if (ic.stroke) { ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.stroke(new Path2D(ic.stroke)); }
      }
    } else if (o.type === 'qr') {
      const M = qr(o.value); if (M) {
        const n = M.length + 4; const cell = (o.w * S) / n; ctx.fillStyle = ink || o.color || '#000';
        ctx.beginPath();
        for (let y = 0; y < M.length; y++) for (let x = 0; x < M.length; x++) if (M[y][x]) ctx.rect(-o.w / 2 * S + (x + 2) * cell, -o.h / 2 * S + (y + 2) * cell, cell + 0.4, cell + 0.4);
        ctx.fill();
      }
    } else if (o.type === 'shape') {
      ctx.strokeStyle = ctx.fillStyle = ink || o.color || '#000'; ctx.lineWidth = (o.strokeMm || 0.3) * S;
      if (o.shape === 'line') ctx.fillRect(-o.w / 2 * S, -((o.strokeMm || 0.3) / 2) * S, o.w * S, (o.strokeMm || 0.3) * S);
      else if (o.shape === 'circle') { ctx.beginPath(); ctx.ellipse(0, 0, o.w / 2 * S - ctx.lineWidth / 2, o.h / 2 * S - ctx.lineWidth / 2, 0, 0, Math.PI * 2); o.filled ? ctx.fill() : ctx.stroke(); }
      else { const lw = ctx.lineWidth; o.filled ? ctx.fillRect(-o.w / 2 * S, -o.h / 2 * S, o.w * S, o.h * S) : ctx.strokeRect(-o.w / 2 * S + lw / 2, -o.h / 2 * S + lw / 2, o.w * S - lw, o.h * S - lw); }
    }
    ctx.restore();
  }

  // disegna un lato completo; ctx già traslato all'origine del lato
  function drawSide(ctx, design, side, profile, S, opt = {}) {
    const W = profile.widthMm; const H = profile.heightMm;
    if (!opt.transparent) { ctx.fillStyle = opt.paper || profile.paper || '#fff'; ctx.fillRect(0, 0, W * S, H * S); }
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W * S, H * S); ctx.clip();
    for (const o of ((design.sides || {})[side] || {}).objects || []) drawObject(ctx, o, design, S);
    ctx.restore();
    if (opt.guides) {
      const sm = profile.safeMm || 0;
      ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(214,40,40,.75)'; ctx.lineWidth = 1;
      ctx.strokeRect(sm * S, sm * S, (W - 2 * sm) * S, (H - 2 * sm) * S); ctx.restore();
      if (profile.sealMm) { ctx.fillStyle = 'rgba(80,120,200,.07)'; const s = profile.sealMm * S; ctx.fillRect(0, 0, W * S, s); ctx.fillRect(0, H * S - s, W * S, s); ctx.fillRect(0, 0, s, H * S); ctx.fillRect(W * S - s, 0, s, H * S); }
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, W * S - 1, H * S - 1);
    }
  }

  // file di produzione: PNG ad alta risoluzione (sfondo trasparente) a dpi reali
  function exportPNG(design, side, profile, dpi = 600) {
    let S = dpi / 25.4; const maxPx = 7000;
    if (Math.max(profile.widthMm, profile.heightMm) * S > maxPx) S = maxPx / Math.max(profile.widthMm, profile.heightMm);
    const c = document.createElement('canvas'); c.width = Math.round(profile.widthMm * S); c.height = Math.round(profile.heightMm * S);
    drawSide(c.getContext('2d'), design, side, profile, S, { transparent: true });
    return c.toDataURL('image/png');
  }
  function flatPreview(design, side, profile, px = 900, paper) {
    const S = px / profile.widthMm; const c = document.createElement('canvas'); c.width = px; c.height = Math.round(profile.heightMm * S);
    drawSide(c.getContext('2d'), design, side, profile, S, { paper }); return c;
  }

  // file vettoriale SVG (millimetri reali) — testi come testo, icone/QR come tracciati, immagini incorporate
  function exportSVG(design, side, profile, fontsCss) {
    const W = profile.widthMm; const H = profile.heightMm; const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    let out = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">\n`;
    if (fontsCss) out += `<defs><style>@import url('${esc(fontsCss)}');</style></defs>\n`;
    out += `<!-- MARK · ${esc(profile.shape)} ${W}x${H} mm · lato ${side} · modalità ${design.mode}${design.ink ? ` · inchiostro ${design.ink}${design.inkName ? ` (${esc(design.inkName)})` : ''}` : ''} -->\n`;
    for (const o of ((design.sides || {})[side] || {}).objects || []) {
      if (o.hidden) continue;
      const ink = inkOf(o, design) || o.color || '#000';
      const tr = `translate(${o.x.toFixed(3)} ${o.y.toFixed(3)}) rotate(${(o.rot || 0).toFixed(2)})`;
      const op = o.opacity != null && o.opacity < 1 ? ` opacity="${o.opacity}"` : '';
      if (o.type === 'text') {
        const m = measureText(o); const anchor = { left: 'start', right: 'end' }[o.align] || 'middle';
        const x0 = o.align === 'left' ? -m.w / 2 : o.align === 'right' ? m.w / 2 : 0;
        out += `<text transform="${tr}"${op} font-family="${esc(o.font)}" font-size="${(o.sizePt * PT).toFixed(3)}" fill="${ink}" text-anchor="${anchor}" dominant-baseline="central"${o.bold ? ' font-weight="bold"' : ''}${o.italic ? ' font-style="italic"' : ''}${o.letterSpacing ? ` letter-spacing="${o.letterSpacing}"` : ''}>`;
        m.lines.forEach((l, i) => { out += `<tspan x="${x0.toFixed(3)}" y="${(-m.h / 2 + m.lh * (i + 0.5)).toFixed(3)}">${esc(l)}</tspan>`; });
        out += '</text>\n';
      } else if (o.type === 'icon') {
        const ic = root.MarkIcons.ICONS[o.icon]; if (!ic) continue;
        out += `<g transform="${tr} scale(${(o.w / 24).toFixed(4)} ${(o.h / 24).toFixed(4)}) translate(-12 -12)"${op}><path d="${ic.d}" fill="${ink}" fill-rule="evenodd"/>${ic.stroke ? `<path d="${ic.stroke}" fill="none" stroke="${ink}" stroke-width="1.2" stroke-linecap="round"/>` : ''}</g>\n`;
      } else if (o.type === 'qr') {
        const M = qr(o.value); if (!M) continue; const n = M.length + 4; const cell = o.w / n; let d = '';
        for (let y = 0; y < M.length; y++) for (let x = 0; x < M.length; x++) if (M[y][x]) d += `M${(-o.w / 2 + (x + 2) * cell).toFixed(3)} ${(-o.h / 2 + (y + 2) * cell).toFixed(3)}h${cell.toFixed(3)}v${cell.toFixed(3)}h-${cell.toFixed(3)}z`;
        out += `<path transform="${tr}"${op} d="${d}" fill="${ink}"/>\n`;
      } else if (o.type === 'shape') {
        const sw = o.strokeMm || 0.3;
        if (o.shape === 'line') out += `<rect transform="${tr}" x="${-o.w / 2}" y="${-sw / 2}" width="${o.w}" height="${sw}" fill="${ink}"${op}/>\n`;
        else if (o.shape === 'circle') out += `<ellipse transform="${tr}" rx="${o.w / 2 - sw / 2}" ry="${o.h / 2 - sw / 2}" ${o.filled ? `fill="${ink}"` : `fill="none" stroke="${ink}" stroke-width="${sw}"`}${op}/>\n`;
        else out += `<rect transform="${tr}" x="${-o.w / 2 + sw / 2}" y="${-o.h / 2 + sw / 2}" width="${o.w - sw}" height="${o.h - sw}" ${o.filled ? `fill="${ink}"` : `fill="none" stroke="${ink}" stroke-width="${sw}"`}${op}/>\n`;
      } else {
        let src; let key;
        if (o.type === 'emoji') { src = emojiCanvas(o.ch); key = `emoji:${o.ch}`; } else { const e = getImage(o.src); if (!e.ok) continue; src = e.img; key = o.src; }
        const c = processed(src, key, o, design.mode !== 'full' ? ink : null);
        out += `<image transform="${tr}"${op} x="${-o.w / 2}" y="${-o.h / 2}" width="${o.w}" height="${o.h}" preserveAspectRatio="none" href="${c.toDataURL('image/png')}"/>\n`;
      }
    }
    return `${out}</svg>\n`;
  }

  // ---------- MOCKUP realistici
  function mockup(canvas, design, side, profile, opt = {}) {
    const ctx = canvas.getContext('2d'); const Wc = canvas.width; const Hc = canvas.height;
    ctx.clearRect(0, 0, Wc, Hc);
    const bg = ctx.createLinearGradient(0, 0, 0, Hc); bg.addColorStop(0, '#efebe5'); bg.addColorStop(1, '#ddd6cc'); ctx.fillStyle = bg; ctx.fillRect(0, 0, Wc, Hc);
    if (profile.shape === 'cup') return cupMockup(ctx, Wc, Hc, flatPreview(design, side, profile, 1100, 'rgba(0,0,0,0)'), profile, opt);
    const flat = flatPreview(design, side, profile, 1100, opt.paper);
    if (profile.shape === 'box') return boxMockup(ctx, Wc, Hc, design, side, profile, opt);
    // bustina: carta con saldature zigrinate su 4 lati, leggera inclinazione e ombra
    const pad = Math.min(Wc, Hc) * 0.12; const scale = Math.min((Wc - 2 * pad) / profile.widthMm, (Hc - 2 * pad) / profile.heightMm);
    const w = profile.widthMm * scale; const h = profile.heightMm * scale;
    ctx.save(); ctx.translate(Wc / 2, Hc / 2); ctx.rotate(opt.tilt == null ? -0.05 : opt.tilt);
    ctx.shadowColor = 'rgba(40,25,10,.35)'; ctx.shadowBlur = scale * 4; ctx.shadowOffsetY = scale * 2.2; ctx.shadowOffsetX = scale * 1;
    ctx.fillStyle = opt.paper || profile.paper || '#fff'; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.shadowColor = 'transparent';
    ctx.drawImage(flat, -w / 2, -h / 2, w, h);
    const seal = (profile.sealMm || 3) * scale;
    ctx.save(); ctx.globalAlpha = 0.16; ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(1, scale * 0.12);
    const step = scale * 0.55;
    ctx.beginPath();
    for (let x = -w / 2; x <= w / 2; x += step) { ctx.moveTo(x, -h / 2); ctx.lineTo(x, -h / 2 + seal); ctx.moveTo(x, h / 2 - seal); ctx.lineTo(x, h / 2); }
    for (let y = -h / 2 + seal; y <= h / 2 - seal; y += step) { ctx.moveTo(-w / 2, y); ctx.lineTo(-w / 2 + seal, y); ctx.moveTo(w / 2 - seal, y); ctx.lineTo(w / 2, y); }
    ctx.stroke(); ctx.restore();
    // volume dello zucchero: luce al centro, ombra ai bordi
    const g = ctx.createRadialGradient(-w * 0.1, -h * 0.15, h * 0.1, 0, 0, w * 0.75);
    g.addColorStop(0, 'rgba(255,255,255,.22)'); g.addColorStop(0.6, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.14)');
    ctx.fillStyle = g; ctx.fillRect(-w / 2, -h / 2, w, h);
    const lg = ctx.createLinearGradient(0, -h / 2, 0, h / 2); lg.addColorStop(0, 'rgba(0,0,0,.06)'); lg.addColorStop(0.12, 'rgba(0,0,0,0)'); lg.addColorStop(0.88, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(0,0,0,.08)');
    ctx.fillStyle = lg; ctx.fillRect(-w / 2, -h / 2, w, h);
    // tacca di strappo
    ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(-w / 2 - 1, -h * 0.12); ctx.lineTo(-w / 2 + scale * 1.2, -h * 0.1); ctx.lineTo(-w / 2 - 1, -h * 0.08); ctx.fill();
    ctx.restore();
  }
  function cupMockup(ctx, Wc, Hc, flat, profile, opt) {
    const H = Math.min(Hc * 0.74, (Wc * 0.8) / 0.92); const topW = H * 0.92; const botW = topW * 0.7; const cx = Wc / 2; const top = (Hc - H) / 2;
    const path = new Path2D(); path.moveTo(cx - topW / 2, top); path.lineTo(cx + topW / 2, top); path.lineTo(cx + botW / 2, top + H); path.lineTo(cx - botW / 2, top + H); path.closePath();
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 14; ctx.fillStyle = opt.paper || '#fbfbfa'; ctx.fill(path); ctx.restore();
    ctx.save(); ctx.clip(path);
    // la grafica avvolge il cono: mappatura a colonne (proiezione cilindrica)
    const bandH = H * 0.62; const bandTop = top + H * 0.17; const visW = (topW + botW) / 2; let artW = visW * 0.86; let artH = artW * (profile.heightMm / profile.widthMm);
    if (artH > bandH) { artH = bandH; artW = artH * (profile.widthMm / profile.heightMm); }
    const cols = 160;
    for (let i = 0; i < cols; i++) {
      const t0 = -1 + (2 * i) / cols; const t1 = -1 + (2 * (i + 1)) / cols;
      const u0 = 0.5 + Math.asin(t0) / Math.PI; const u1 = 0.5 + Math.asin(t1) / Math.PI;
      const span = artW / visW; const s0 = (u0 - 0.5) / span + 0.5; const s1 = (u1 - 0.5) / span + 0.5;
      if (s1 < 0 || s0 > 1) continue;
      const sx = Math.max(0, s0) * flat.width; const sw = (Math.min(1, s1) - Math.max(0, s0)) * flat.width; if (sw <= 0) continue;
      const dx = cx + (t0 * visW) / 2; const dw = ((t1 - t0) * visW) / 2 + 0.6;
      ctx.drawImage(flat, sx, 0, sw, flat.height, dx, bandTop + (bandH - artH) / 2, dw, artH);
    }
    const g = ctx.createLinearGradient(cx - topW / 2, 0, cx + topW / 2, 0);
    g.addColorStop(0, 'rgba(0,0,0,.28)'); g.addColorStop(0.25, 'rgba(0,0,0,0)'); g.addColorStop(0.42, 'rgba(255,255,255,.25)'); g.addColorStop(0.6, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.32)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, Wc, Hc); ctx.restore();
    ctx.fillStyle = '#e9e7e2'; ctx.beginPath(); ctx.ellipse(cx, top, topW / 2, H * 0.045, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#d2cec6'; ctx.beginPath(); ctx.ellipse(cx, top + 3, topW / 2 - 6, H * 0.035, 0, 0, Math.PI * 2); ctx.fill();
  }
  function boxMockup(ctx, Wc, Hc, design, side, profile, opt) {
    const body = opt.variantColor || '#f2f2f0'; const transparent = opt.transparent;
    const sc = Math.min((Wc * 0.62) / profile.widthMm, (Hc * 0.6) / profile.heightMm);
    const w = profile.widthMm * sc; const h = profile.heightMm * sc; const d = w * 0.38; const x = (Wc - w - d * 0.7) / 2; const y = (Hc - h) / 2 + d * 0.2;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 16;
    ctx.fillStyle = transparent ? 'rgba(235,240,245,.65)' : body; ctx.fillRect(x, y, w, h); ctx.restore();
    // lato destro in prospettiva con l'altro lato stampato
    const other = (profile.sides.find((s) => s.code !== side) || {}).code;
    ctx.save(); ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(x + w + d * 0.7, y - d * 0.35); ctx.lineTo(x + w + d * 0.7, y + h - d * 0.35); ctx.lineTo(x + w, y + h); ctx.closePath();
    ctx.fillStyle = transparent ? 'rgba(220,228,236,.7)' : body; ctx.fill(); ctx.clip();
    if (other) {
      const f = flatPreview(design, other, profile, 700, 'rgba(0,0,0,0)');
      ctx.transform((d * 0.7) / f.width, -(d * 0.35) / f.width, 0, h / f.height, x + w, y);
      ctx.drawImage(f, 0, 0);
    }
    ctx.restore();
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(x + w + d * 0.7, y - d * 0.35); ctx.lineTo(x + w + d * 0.7, y + h - d * 0.35); ctx.lineTo(x + w, y + h); ctx.fill(); ctx.restore();
    // bocca superiore
    ctx.fillStyle = transparent ? 'rgba(200,210,220,.8)' : shade(body, -40); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + d * 0.7, y - d * 0.35); ctx.lineTo(x + w + d * 0.7, y - d * 0.35); ctx.lineTo(x + w, y); ctx.fill();
    const f = flatPreview(design, side, profile, 900, 'rgba(0,0,0,0)'); ctx.drawImage(f, x, y, w, h);
    const g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, 'rgba(255,255,255,.18)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.08)');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  }
  function shade(hex, amt) { const [r, g, b] = hexRgb(hex); const c = (v) => Math.max(0, Math.min(255, v + amt)); return `rgb(${c(r)},${c(g)},${c(b)})`; }

  // ---------- CONTROLLI DI QUALITÀ (bloccanti = error, avvisi = warn)
  function checkDesign(design, profile, option, opts = {}) {
    const out = []; const W = profile.widthMm; const H = profile.heightMm; const sm = profile.safeMm || 0;
    let userCount = 0; const colors = new Set();
    for (const sd of profile.sides) {
      const objs = ((design.sides || {})[sd.code] || {}).objects || [];
      for (const o of objs) {
        if (o.hidden || o.fixed) continue; userCount++;
        const label = `${sd.label}: ${o.type === 'text' ? `testo «${String(o.text).slice(0, 24)}»` : { image: 'immagine', icon: 'decorazione', emoji: 'emoji', qr: 'QR code', shape: 'forma' }[o.type]}`;
        const cs = corners(o); const xs = cs.map((c) => c[0]); const ys = cs.map((c) => c[1]);
        const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
        if (maxX < 0 || minX > W || maxY < 0 || minY > H) out.push({ level: 'error', id: o.id, side: sd.code, msg: `${label} è completamente fuori dall'area di stampa.` });
        else if (minX < -0.01 || minY < -0.01 || maxX > W + 0.01 || maxY > H + 0.01) out.push({ level: 'error', id: o.id, side: sd.code, msg: `${label} esce dal bordo del prodotto e verrebbe tagliato.` });
        else if (minX < sm || minY < sm || maxX > W - sm || maxY > H - sm) out.push({ level: 'warn', id: o.id, side: sd.code, msg: `${label} entra nel margine di sicurezza (${sm} mm): potrebbe risultare troppo vicino al bordo o alla saldatura.` });
        if (o.type === 'text') {
          if (!String(o.text).trim()) out.push({ level: 'error', id: o.id, side: sd.code, msg: `${sd.label}: c'è un testo vuoto.` });
          if (o.sizePt < profile.minTextPt) out.push({ level: 'error', id: o.id, side: sd.code, msg: `${label}: carattere di ${o.sizePt.toFixed(1)} pt, troppo piccolo per la stampa (minimo ${profile.minTextPt} pt).` });
          else if (o.sizePt < profile.warnTextPt) out.push({ level: 'warn', id: o.id, side: sd.code, msg: `${label}: carattere di ${o.sizePt.toFixed(1)} pt, potrebbe risultare poco leggibile.` });
        }
        if (o.type === 'image' && o.natW) {
          const dpi = Math.min(o.natW / (o.w / 25.4), o.natH / (o.h / 25.4));
          if (dpi < profile.minDpi) out.push({ level: 'error', id: o.id, side: sd.code, msg: `${label}: risoluzione troppo bassa (${Math.round(dpi)} dpi, minimo ${profile.minDpi}). Carica un file più grande o riduci l'immagine.` });
          else if (dpi < profile.warnDpi) out.push({ level: 'warn', id: o.id, side: sd.code, msg: `${label}: risoluzione ${Math.round(dpi)} dpi, la stampa potrebbe essere poco nitida (consigliati ${profile.warnDpi}).` });
          if (design.mode !== 'full' && !o.ackMono) out.push({ level: 'warn', id: o.id, side: sd.code, msg: `${label}: verrà stampata in un solo colore. Controlla nell'anteprima che il logo resti leggibile.` });
        }
        if (o.type === 'qr') {
          if (!String(o.value || '').trim()) out.push({ level: 'error', id: o.id, side: sd.code, msg: `${sd.label}: QR code senza contenuto.` });
          const M = qr(o.value); if (M) { const mod = o.w / (M.length + 4); if (mod < 0.33) out.push({ level: 'error', id: o.id, side: sd.code, msg: `${label}: troppo piccolo per essere letto (ingrandiscilo o accorcia il link).` }); else if (mod < 0.45) out.push({ level: 'warn', id: o.id, side: sd.code, msg: `${label}: piccolo, potrebbe essere difficile da leggere con alcuni telefoni.` }); }
        }
        if (o.type === 'shape' && (o.strokeMm || 0.3) < 0.15 && !o.filled) out.push({ level: 'warn', id: o.id, side: sd.code, msg: `${label}: linea molto sottile, potrebbe non stamparsi uniformemente.` });
        if (design.mode === 'multi') colors.add((o.color || design.ink || '').toUpperCase());
        if (o.type === 'emoji' && design.mode === 'full') out.push({ level: 'warn', id: o.id, side: sd.code, msg: `${label}: le emoji colorate dipendono dal dispositivo; MARK userà la versione mostrata nell'anteprima.` });
      }
    }
    // elementi sovrapposti (avviso: può essere voluto, ma spesso è un errore di posizionamento)
    for (const sd of profile.sides) {
      const list = (((design.sides || {})[sd.code] || {}).objects || []).filter((o) => !o.hidden && o.type !== 'shape');
      const bb = list.map((o) => { const c = corners(o); return { o, x0: Math.min(...c.map((p) => p[0])), x1: Math.max(...c.map((p) => p[0])), y0: Math.min(...c.map((p) => p[1])), y1: Math.max(...c.map((p) => p[1])) }; });
      for (let i = 0; i < bb.length; i++) for (let j = i + 1; j < bb.length; j++) {
        const a = bb[i]; const b = bb[j]; if (a.o.fixed && b.o.fixed) continue;
        const ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0); const iy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        if (ix > 0.5 && iy > 0.5 && ix * iy > 0.15 * Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0))) {
          const u = a.o.fixed ? b.o : a.o;
          out.push({ level: a.o.fixed || b.o.fixed ? 'error' : 'warn', id: u.id, side: sd.code, msg: `${sd.label}: ${a.o.fixed || b.o.fixed ? 'un elemento copre una dicitura obbligatoria' : 'alcuni elementi si sovrappongono'}. Controlla il posizionamento.` });
        }
      }
    }
    if (!userCount) out.push({ level: 'error', msg: 'La bustina è ancora vuota: aggiungi almeno un testo, un logo o un modello.' });
    if (design.mode === 'multi' && option && option.maxColors && colors.size > option.maxColors) out.push({ level: 'error', msg: `Hai usato ${colors.size} colori: questo tipo di stampa ne consente al massimo ${option.maxColors}.` });
    if (design.mode === 'multi' && opts.inks) {
      const ok = new Set(opts.inks.map((i) => i.hex.toUpperCase()));
      for (const c of colors) if (c && !ok.has(c)) out.push({ level: 'error', msg: `Il colore ${c} non è tra i colori di stampa disponibili.` });
    }
    return out;
  }

  const api = { PT, drawSide, drawObject, measureText, boxOf, corners, exportPNG, exportSVG, flatPreview, mockup, checkDesign, getImage, setOnAsset: (f) => { onAsset = f; }, qr };
  root.MarkRender = api;
})(this);
