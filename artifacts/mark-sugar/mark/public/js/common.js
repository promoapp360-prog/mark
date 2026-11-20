// Funzioni comuni a tutte le pagine pubbliche.
const Mark = (() => {
  // Dati pubblici verificati sulle pagine azienda/contatti del sito ufficiale MARK.
  const company = Object.freeze({
    name: 'MARK', legal: 'MARK & Co Srl', email: 'info@marksugar.it',
    phone: '+39 081 528 53 14', site: 'www.marksugar.it',
    address: 'Via Tortorelle, 200 – 80040 Poggiomarino (NA)',
    legalAddress: 'Via Publio Rutilio Rufo, 22 – 20161 Milano',
    instagram: 'https://www.instagram.com/marksugar1987/',
    facebook: 'https://www.facebook.com/MarkZuccherieDolcificanti/',
    directions: 'https://www.google.com/maps/dir/?api=1&destination=Via%20Tortorelle%20200%2C%2080040%20Poggiomarino%20NA%2C%20Italia',
  });
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
    if (!document.querySelector('link[href="/css/site-pages.css"]')) {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/css/site-pages.css'; document.head.append(css);
    }
    const h = document.createElement('header'); h.className = 'site-header';
    h.innerHTML = `<a class="brand" href="/"><span class="logo">mark</span><span class="tag">Zuccheri e dolcificanti dal 1987</span></a>
      <button type="button" class="nav-toggle" aria-controls="siteNav" aria-expanded="false" aria-label="Apri menu di navigazione">Menu <svg width="20" height="16" viewBox="0 0 20 16" fill="none" aria-hidden="true"><path d="M1 2h18M1 8h18M1 14h18" stroke="currentColor" stroke-width="1.5"/></svg></button>
      <nav id="siteNav" aria-label="Navigazione principale"><a href="/chi-siamo.html" ${active === 'azienda' ? 'class="on" aria-current="page"' : ''}>Chi siamo</a>
      <a href="/cosa-facciamo.html" ${active === 'servizi' ? 'class="on" aria-current="page"' : ''}>Cosa facciamo</a>
      <a href="/#catalogo" ${active === 'catalogo' ? 'class="on"' : ''}>Prodotti</a>
      <a href="/contatti.html#dove-siamo">Dove siamo</a>
      <a href="/contatti.html" ${active === 'contatti' ? 'class="on" aria-current="page"' : ''}>Contatti</a>
      <a href="/editor.html?p=bustine-extrafine" class="cta-sm">Personalizza</a>
      <a href="/account.html" ${active === 'account' ? 'class="on"' : ''}>Area clienti</a><a href="/carrello.html" class="cart-link">Carrello <b id="cartCount" hidden>0</b></a></nav>`;
    document.body.prepend(h); updateBadge();
    const toggle = h.querySelector('.nav-toggle');
    const close = () => { h.classList.remove('menu-open'); toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Apri menu di navigazione'); };
    toggle.onclick = () => {
      const open = h.classList.toggle('menu-open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Chiudi menu di navigazione' : 'Apri menu di navigazione');
    };
    h.querySelectorAll('nav a').forEach((a) => a.addEventListener('click', close));
    h.addEventListener('keydown', (e) => { if (e.key === 'Escape' && h.classList.contains('menu-open')) { close(); toggle.focus(); } });
  }
  function footer(shop = {}) {
    const details = { ...company, ...shop };
    const email = details.email || company.email, phone = details.phone || company.phone;
    const f = document.createElement('footer'); f.className = 'site-footer';
    f.innerHTML = `<div class="footer-brand"><a class="brand" href="/" aria-label="MARK — homepage"><span class="logo">mark</span><span class="tag">Zuccheri e dolcificanti dal 1987</span></a>
      <p>Il tuo marchio, anche nel momento più dolce della giornata.</p><p>${esc(details.legal || company.legal)}</p></div>
      <div><h2>Il mondo MARK</h2><a href="/chi-siamo.html">Chi siamo</a><a href="/cosa-facciamo.html">Cosa facciamo</a><a href="/#catalogo">Il catalogo</a><a href="/contatti.html">Contatti e informazioni</a><a href="/account.html">Area clienti</a></div>
      <div><h2>Parliamone</h2><a href="tel:${esc(phone.replace(/[^+0-9]/g, ''))}">${esc(phone)}</a><a href="mailto:${esc(email)}">${esc(email)}</a>
      <a href="${company.instagram}" target="_blank" rel="noopener noreferrer">Instagram · @marksugar1987 ↗</a><a href="${company.facebook}" target="_blank" rel="noopener noreferrer">Facebook · MARK ↗</a></div>
      <div><h2>Dove siamo</h2><p><strong>Sede operativa</strong><br>${esc(company.address)}</p><p><strong>Sede legale</strong><br>${esc(company.legalAddress)}</p><a href="${company.directions}" target="_blank" rel="noopener noreferrer">Indicazioni stradali ↗</a></div>
      <div class="footer-bottom"><span>© ${new Date().getFullYear()} ${esc(details.legal || company.legal)}</span><span>Prezzi IVA esclusa nel catalogo. IVA calcolata nel riepilogo.</span><a href="/contatti.html">Hai un progetto? Scrivici →</a></div>`;
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
  return { api, money, esc, qs, qsa, cart, header, footer, loadFonts, fontsCssUrl, toast, company };
})();
