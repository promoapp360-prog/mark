// Funzioni comuni a tutte le pagine pubbliche.
const Mark = (() => {
  async function api(url, opt = {}) {
    const r = await fetch(url, { method: opt.method || (opt.body ? 'POST' : 'GET'), headers: opt.body ? { 'Content-Type': 'application/json' } : {}, body: opt.body ? JSON.stringify(opt.body) : undefined, credentials: 'same-origin' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Errore ${r.status}`);
    return j;
  }
  const money = (n) => (n == null ? '—' : `€ ${Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const qs = (s, el = document) => el.querySelector(s); const qsa = (s, el = document) => [...el.querySelectorAll(s)];

  const cart = {
    get() { try { return JSON.parse(localStorage.getItem('mark_cart') || '[]'); } catch { return []; } },
    set(items) { try { localStorage.setItem('mark_cart', JSON.stringify(items)); } catch {} updateBadge(); },
    add(item) { const c = cart.get(); c.push({ key: Math.random().toString(36).slice(2), ...item }); cart.set(c); },
    remove(key) { cart.set(cart.get().filter((i) => i.key !== key)); },
    update(key, patch) { cart.set(cart.get().map((i) => (i.key === key ? { ...i, ...patch } : i))); },
    clear() { cart.set([]); },
  };
  function updateBadge() { const b = qs('#cartCount'); if (b) { const n = cart.get().length; b.textContent = n; b.hidden = !n; } }

  function header(active) {
    const h = document.createElement('header'); h.className = 'site-header';
    h.innerHTML = `<a class="brand" href="/"><span class="logo">mark</span><span class="tag">Zuccheri e dolcificanti dal 1987</span></a>
      <nav><a href="/#catalogo" ${active === 'catalogo' ? 'class="on"' : ''}>Prodotti</a><a href="/editor.html?p=bustine-extrafine" class="cta-sm">Crea la tua bustina</a>
      <a href="/account.html" ${active === 'account' ? 'class="on"' : ''}>Area clienti</a><a href="/carrello.html" class="cart-link">Carrello <b id="cartCount" hidden>0</b></a></nav>`;
    document.body.prepend(h); updateBadge();
  }
  function footer(shop = {}) {
    const f = document.createElement('footer'); f.className = 'site-footer';
    f.innerHTML = `<div><span class="logo">mark</span><p>${esc(shop.legal || 'MARK & Co Srl')}</p></div>
      <div><p>${esc(shop.site || '')}</p><p><a href="mailto:${esc(shop.email || '')}">${esc(shop.email || '')}</a></p><p>Tel. ${esc(shop.phone || '')}</p></div>
      <div><p>Prezzi IVA esclusa nel catalogo, IVA calcolata nel riepilogo.</p></div>`;
    document.body.append(f);
  }

  const loadedFonts = new Set();
  function loadFonts(families) {
    const need = families.filter((f) => f && !loadedFonts.has(f));
    if (!need.length) return Promise.resolve();
    need.forEach((f) => loadedFonts.add(f));
    // un foglio per famiglia: se la variante completa (grassetto/corsivo) non esiste, ripiega sulla versione base
    const one = (f) => new Promise((res) => {
      const add = (href, fallback) => {
        const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href;
        l.onload = () => Promise.all([document.fonts.load(`20px "${f}"`), document.fonts.load(`bold 20px "${f}"`), document.fonts.load(`italic 20px "${f}"`)]).then(res, res);
        l.onerror = () => { l.remove(); if (fallback) add(fallback); else res(); };
        document.head.append(l);
      };
      add(fontsCssUrl([f], true), fontsCssUrl([f], false));
    });
    return Promise.all(need.map(one));
  }
  // Google Fonts: tutti con licenza SIL Open Font License (uso commerciale e stampa consentiti)
  const fam = (f) => encodeURIComponent(f).replace(/%20/g, '+');
  const fontsCssUrl = (fams, full = false) => `https://fonts.googleapis.com/css2?${fams.map((f) => `family=${fam(f)}${full ? ':ital,wght@0,400;0,700;1,400;1,700' : ''}`).join('&')}&display=swap`;

  function toast(msg, kind = '') {
    let t = qs('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.append(t); }
    t.className = `show ${kind}`; t.textContent = msg; clearTimeout(t._h); t._h = setTimeout(() => { t.className = ''; }, 3600);
  }
  return { api, money, esc, qs, qsa, cart, header, footer, loadFonts, fontsCssUrl, toast };
})();
