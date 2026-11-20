// Anteprime commerciali: basi fotografiche MARK + forme specifiche del catalogo.
// Non modifica disegni, misure tecniche o file destinati alla produzione.
(function () {
  const R = window.MarkRender;
  const images = {};
  const ready = Promise.all(['cup-240', 'cup-90', 'sachet'].map((name) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { images[name] = image; resolve(); };
    image.onerror = () => reject(new Error('Impossibile caricare le immagini originali MARK. Ricarica la pagina.'));
    image.src = `/images/products/${name}.webp`;
  })));

  function stage(canvas, { background = '#fff' } = {}) {
    const c = canvas.getContext('2d');
    c.clearRect(0, 0, canvas.width, canvas.height);
    if (background !== 'transparent') {
      c.fillStyle = background; c.fillRect(0, 0, canvas.width, canvas.height);
    }
    const scale = Math.min(canvas.width / 640, canvas.height / 480);
    c.save(); c.translate((canvas.width - 640 * scale) / 2, (canvas.height - 480 * scale) / 2); c.scale(scale, scale);
    return c;
  }
  function gradient(c, x, y, w, h, stops) {
    const g = c.createLinearGradient(x, y, x + w, y + h);
    stops.forEach(([p, color]) => g.addColorStop(p, color)); return g;
  }
  function shadow(c, x, y, w, h, opacity = 0.15) {
    c.save(); c.translate(x, y); c.scale(w, h);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgba(35,32,29,${opacity})`); g.addColorStop(1, 'rgba(35,32,29,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 1, 0, Math.PI * 2); c.fill(); c.restore();
  }
  function polygon(c, pts, fill, stroke) {
    c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.3; c.stroke(); }
  }
  function rounded(c, x, y, w, h, r, fill, stroke) {
    c.beginPath(); c.roundRect(x, y, w, h, r);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.3; c.stroke(); }
  }
  function art(c, design, side, profile, x, y, w, h) {
    const flat = R.flatPreview(design, side, profile, 900, 'rgba(0,0,0,0)');
    c.save(); c.globalCompositeOperation = 'multiply'; c.drawImage(flat, x, y, w, h); c.restore();
  }
  function sachet(c, design, side, profile, opt) {
    shadow(c, 326, 351, 219, 32, 0.14);
    const w = 458, h = w * profile.heightMm / profile.widthMm;
    c.save(); c.translate(320, 237); c.rotate(opt.tilt == null ? -0.07 : opt.tilt);
    const paper = opt.paper || profile.paper || '#fff';
    const source = images.sachet;
    const texture = document.createElement('canvas'); texture.width = source.width; texture.height = source.height;
    const t = texture.getContext('2d'); t.drawImage(source, 0, 0);
    if (paper.toLowerCase() !== '#ffffff' && paper.toLowerCase() !== '#fff') {
      t.globalCompositeOperation = 'source-atop'; t.globalAlpha = 0.32; t.fillStyle = paper;
      t.fillRect(0, 0, texture.width, texture.height); t.globalAlpha = 1;
    }
    c.drawImage(texture, -w / 2, -h / 2, w, h);
    // La grafica continua a usare le coordinate reali 70 × 45 mm.
    c.save(); c.beginPath(); c.roundRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 2); c.clip();
    art(c, design, side, profile, -w / 2, -h / 2, w, h); c.restore(); c.restore();
  }
  function cup(c, design, side, profile, opt) {
    const tall = /240/.test(opt.productSlug || '') || profile.widthMm >= 120;
    const small = /75cc/.test(opt.productSlug || '');
    const image = images[tall ? 'cup-240' : 'cup-90'];
    const h = tall ? 375 : small ? 291 : 330;
    const w = h * image.width / image.height;
    const x = 320 - w * (tall ? 0.405 : 0.5), y = (480 - h) / 2;
    c.drawImage(image, x, y, w, h);
    const cx = x + w * (tall ? 0.40 : 0.5);
    const aw = w * (tall ? 0.55 : 0.67), ah = h * 0.57;
    const flat = R.flatPreview(design, side, profile, 900, 'rgba(0,0,0,0)');
    // Proiezione della stampa sulla superficie curva, senza alterare l'export.
    c.save(); c.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 160; i++) {
      const t0 = -1 + i / 80, t1 = -1 + (i + 1) / 80;
      const u0 = (Math.asin(t0) / Math.PI + 0.5) * flat.width;
      const u1 = (Math.asin(t1) / Math.PI + 0.5) * flat.width;
      const curve = (1 - Math.sqrt(1 - t0 * t0)) * h * 0.018;
      c.drawImage(flat, u0, 0, u1 - u0, flat.height, cx + t0 * aw / 2, y + h * 0.23 + curve, aw / 160 + 0.4, ah);
    }
    c.restore();
  }
  function material(c, x, y, w, h, color, silver, glass) {
    if (glass) return gradient(c, x, y, w, 0, [[0, 'rgba(201,214,218,.55)'], [.13, 'rgba(247,251,252,.20)'], [.65, 'rgba(227,237,239,.32)'], [1, 'rgba(151,173,179,.48)']]);
    if (silver) return gradient(c, x, y, w, 0, [[0, '#a1a3a0'], [.13, '#ecece7'], [.36, '#c8c9c5'], [.62, '#f5f4ef'], [.86, '#b9bbb7'], [1, '#959893']]);
    return gradient(c, x, y, w, h, [[0, color], [.42, color], [1, tint(color, -27)]]);
  }
  function tint(hex, delta) {
    const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#eeeeeb';
    return '#' + [1, 3, 5].map((i) => Math.max(0, Math.min(255, parseInt(value.slice(i, i + 2), 16) + delta)).toString(16).padStart(2, '0')).join('');
  }
  function holder(c, design, side, profile, opt) {
    const slug = opt.productSlug || '';
    const napkin = /portatovaglioli/.test(slug) || (profile.sides || []).length === 3;
    const tower = /incasso/.test(slug), tin = /latta|silver/.test(slug);
    const silver = /silver/.test(slug), glass = !!opt.transparent;
    const color = opt.variantColor || (silver ? '#c5c6c1' : '#f4f3ee');
    const w = tower ? 133 : napkin ? 212 : 300;
    const h = tower ? 256 : napkin ? 237 : 111;
    const d = tower ? 80 : napkin ? 100 : 73;
    const x = (640 - w - d) / 2, y = (480 - h) / 2 + 30, rise = d * 0.4;
    shadow(c, 323, y + h + 9, w * 0.66 + 38, 25);
    const edge = glass ? 'rgba(128,153,160,.7)' : tin ? '#92958e' : tint(color, -32);
    // Interno e parete posteriore: i contenitori non sono blocchi pieni.
    polygon(c, [[x, y], [x + d, y - rise], [x + w + d, y - rise], [x + w, y]],
      glass ? 'rgba(205,220,224,.22)' : tint(color, -43), edge);
    polygon(c, [[x + d, y - rise], [x + w + d, y - rise], [x + w + d, y + h - rise], [x + d, y + h - rise]],
      material(c, x, y, w, h, color, silver, glass), edge);
    // Tovaglioli e bustine neutri, senza loghi di altri clienti.
    if (napkin || !tower) {
      for (let i = 0; i < (napkin ? 12 : 6); i++) {
        const sx = napkin ? x + 22 + i * 1.9 : x + 27 + i * (w - 70) / 6;
        const sy = napkin ? y - 19 + i * 1.2 : y - 28 + (i % 2) * 7;
        const sw = napkin ? w - 43 : 42;
        const sh = napkin ? h * 0.65 : 75;
        rounded(c, sx + 10, sy, sw, sh, 2, '#fafaf7', '#dedfd9');
        if (!napkin) { c.strokeStyle = '#dedfd9'; c.beginPath(); c.moveTo(sx + 14, sy + 6); c.lineTo(sx + sw + 5, sy + 6); c.stroke(); }
      }
    }
    polygon(c, [[x + w, y], [x + w + d, y - rise], [x + w + d, y + h - rise - 5], [x + w, y + h]],
      material(c, x + w, y, d, h, tint(color, -19), silver, glass), edge);
    // La faccia laterale usa il secondo lato della personalizzazione.
    const other = (profile.sides || []).find((s) => s.code !== side && !s.optional);
    if (other) {
      c.save(); c.transform(d / w, -rise / w, 0, 1, x + w, y);
      art(c, design, other.code, profile, 0, 0, w, h); c.restore();
    }
    c.save();
    c.beginPath();
    if (tin && !napkin && !tower) {
      // Apertura incurvata dei portabustine bassi in latta.
      c.moveTo(x + 8, y); c.bezierCurveTo(x + w * .3, y + 33, x + w * .7, y + 33, x + w - 8, y);
      c.quadraticCurveTo(x + w, y, x + w, y + 9);
      c.lineTo(x + w, y + h - 9); c.quadraticCurveTo(x + w, y + h, x + w - 9, y + h);
      c.lineTo(x + 9, y + h); c.quadraticCurveTo(x, y + h, x, y + h - 9);
      c.lineTo(x, y + 9); c.quadraticCurveTo(x, y, x + 8, y);
    } else c.roundRect(x, y, w, h, tin ? 6 : 12);
    c.closePath();
    c.fillStyle = material(c, x, y, w, h, color, silver, glass); c.fill();
    c.strokeStyle = edge; c.lineWidth = glass ? 2.5 : 1; c.stroke(); c.clip();
    art(c, design, side, profile, x + 8, y + 5, w - 16, h - 10);
    c.fillStyle = gradient(c, x, y, w, 0, [[0, 'rgba(255,255,255,.25)'], [.2, 'rgba(255,255,255,0)'], [.95, 'rgba(0,0,0,.045)'], [1, 'rgba(0,0,0,.10)']]);
    c.fillRect(x, y, w, h);
    if (silver) {
      c.strokeStyle = 'rgba(255,255,255,.09)'; c.lineWidth = .6;
      for (let yy = y + 4; yy < y + h; yy += 2.5) { c.beginPath(); c.moveTo(x, yy); c.lineTo(x + w, yy); c.stroke(); }
    }
    c.restore();
    // Bordo metallico e spessore visibile dell'acrilico.
    if (tin || glass) {
      c.strokeStyle = glass ? 'rgba(255,255,255,.85)' : '#d5d6d0'; c.lineWidth = glass ? 3 : 4;
      c.beginPath(); c.moveTo(x + 5, y + h - 5); c.lineTo(x + w - 4, y + h - 5);
      c.lineTo(x + w + d - 5, y + h - rise - 5); c.stroke();
      if (napkin || tower) {
        c.strokeStyle = silver ? '#d7d8d2' : tint(color, 12); c.lineWidth = tin ? 9 : 4;
        c.beginPath(); c.moveTo(x + 3, y + 2); c.lineTo(x + w, y + 2); c.lineTo(x + w + d, y - rise + 2); c.stroke();
      }
    }
  }
  function lid(c, slug) {
    const size = /240/.test(slug) ? 1 : /90/.test(slug) ? .86 : .75;
    c.save(); c.translate(320, 260); c.scale(size, size); shadow(c, 0, 65, 200, 33);
    for (let i = 3; i >= 0; i--) {
      const y = i * 11;
      c.fillStyle = gradient(c, -195, y, 390, 30, [[0, '#d4d6d1'], [.4, '#fff'], [1, '#b5b9b2']]);
      c.beginPath(); c.ellipse(0, y, 195, 73, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#c9cbc5'; c.lineWidth = 2; c.stroke();
    }
    c.fillStyle = '#f6f7f3'; c.beginPath(); c.ellipse(0, -5, 178, 61, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#dfe1db'; c.lineWidth = 5; c.stroke();
    rounded(c, -22, 20, 44, 13, 6, '#555953');
    c.restore();
  }
  function sugar(c, product) {
    const brown = /muscovado/.test(product.slug), x = 210, y = 85, w = 220, h = 300;
    shadow(c, 325, 396, 147, 25);
    polygon(c, [[x, y + 22], [x + 17, y], [x + w - 15, y + 3], [x + w, y + 22], [x + w + 8, y + h - 13], [x + w - 11, y + h + 5], [x + 10, y + h], [x - 7, y + h - 20]],
      gradient(c, x, y, w, 0, [[0, '#aa7a46'], [.15, '#d5ad76'], [.5, '#dfbb87'], [.9, '#b78c58'], [1, '#91643a']]), '#aa8152');
    polygon(c, [[x, y + 22], [x + 17, y], [x + w - 15, y + 3], [x + w, y + 22], [x + w / 2, y + 13]], '#b88d59');
    c.fillStyle = '#2b231d'; c.textAlign = 'center'; c.font = '300 48px Poppins, sans-serif'; c.fillText('mark', 320, 175);
    c.font = '500 13px Poppins, sans-serif'; c.fillText('ZUCCHERO', 320, 225);
    c.font = '600 21px Poppins, sans-serif'; c.fillText(brown ? 'MUSCOVADO' : 'EXTRAFINE', 320, 256);
    c.font = '400 20px Poppins, sans-serif'; c.fillText(brown ? '1 kg' : '2,5 kg', 320, 340);
  }
  R.mockup = function (canvas, design, side, profile, opt = {}) {
    const c = stage(canvas, opt);
    if (profile.shape === 'cup') cup(c, design, side, profile, opt);
    else if (profile.shape === 'box') holder(c, design, side, profile, opt);
    else sachet(c, design, side, profile, opt);
    c.restore();
  };
  window.MarkProductVisuals = {
    ready,
    catalog(canvas, product, variant) {
      if (product.customizable) {
        R.mockup(canvas, { mode: 'mono', ink: '#2d2926', sides: {} }, 'front', product.profile,
          { productSlug: product.slug, variantColor: variant && variant.color, transparent: /trasparente/.test(product.slug) });
      } else {
        const c = stage(canvas);
        if (/coperchi/.test(product.slug)) lid(c, product.slug); else sugar(c, product);
        c.restore();
      }
    },
  };
})();
