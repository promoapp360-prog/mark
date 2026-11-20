// Libreria decorazioni: icone vettoriali (24×24, riempimento evenodd) + emoji ricercabili.
// Le icone sono vettoriali e quindi stampabili a qualsiasi dimensione e in qualsiasi colore consentito.
(function (root) {
  const flower = (() => { let d = ''; for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; const cx = 12 + Math.cos(a) * 5.2; const cy = 12 + Math.sin(a) * 5.2; d += `M${cx + 3.6} ${cy}a3.6 3.6 0 1 0 -7.2 0a3.6 3.6 0 1 0 7.2 0z`; } return `${d}M14.2 12a2.2 2.2 0 1 0-4.4 0a2.2 2.2 0 1 0 4.4 0z`; })();
  const sun = (() => { let d = 'M17 12a5 5 0 1 0-10 0a5 5 0 1 0 10 0z'; for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; const c = Math.cos(a); const s = Math.sin(a); const p = (r, o) => `${(12 + c * r - s * o).toFixed(2)} ${(12 + s * r + c * o).toFixed(2)}`; d += `M${p(7, -1)}L${p(11, -1)}L${p(11, 1)}L${p(7, 1)}z`; } return d; })();
  const laurel = (() => { let d = ''; for (let side of [-1, 1]) for (let i = 0; i < 6; i++) { const a = (-150 + i * 22) * Math.PI / 180; const r = 8.5; const cx = 12 + side * Math.cos(a) * r; const cy = 13 + Math.sin(-a) * r * -1; d += `M${cx.toFixed(2)} ${cy.toFixed(2)}m-1.6 0a1.6 2.6 ${side * (i * 20 - 40)} 1 0 3.2 0a1.6 2.6 ${side * (i * 20 - 40)} 1 0 -3.2 0z`; } return d; })();
  const ICONS = {
    cup: { label: 'Tazzina', tags: 'caffè tazza espresso bar', d: 'M3 8h13v4.5A6.5 6.5 0 0 1 9.5 19h0A6.5 6.5 0 0 1 3 12.5zM16 9.2h1.6a3 3 0 0 1 0 6H15.6l.5-1.8h1.5a1.2 1.2 0 0 0 0-2.4H16zM2 20.2h16v1.5H2z', stroke: 'M7 2.5c1.2 1 1.2 2.2 0 3.2M10.2 2.5c1.2 1 1.2 2.2 0 3.2' },
    bean: { label: 'Chicco di caffè', tags: 'caffè chicco torrefazione', d: 'M12 2.5c4.6 0 7.5 4.4 7.5 9.5S16.6 21.5 12 21.5 4.5 17.1 4.5 12 7.4 2.5 12 2.5zm.9 2.2c-2.4 2.9-2.9 5.3-1.4 7.6 1.5 2.4 1.1 4.8-1.2 7.3 4.5-.5 6.8-4 6.8-7.6 0-3.4-1.6-6.3-4.2-7.3z' },
    heart: { label: 'Cuore', tags: 'amore matrimonio san valentino', d: 'M12 21s-7.6-4.6-9.7-9.3C.8 8.3 3 4.5 6.7 4.5c2.1 0 3.6 1.1 5.3 3 1.7-1.9 3.2-3 5.3-3 3.7 0 5.9 3.8 4.4 7.2C19.6 16.4 12 21 12 21z' },
    star: { label: 'Stella', tags: 'stella hotel festa', d: 'M12 2l3 6.9 7.5.7-5.7 5 1.7 7.4L12 18.1 5.5 22l1.7-7.4-5.7-5 7.5-.7z' },
    crown: { label: 'Corona', tags: 'corona re regina premium lusso', d: 'M3 7.5l4.6 4L12 4l4.4 7.5L21 7.5 19.2 18H4.8zM4.8 19.5h14.4V21H4.8z' },
    flower: { label: 'Fiore', tags: 'fiore primavera matrimonio', d: flower },
    leaf: { label: 'Foglia', tags: 'foglia bio natura vegano', d: 'M20.5 3.5C10.5 3.5 4 8.8 4 15.6c0 1.6.3 3 .9 4.4 1.1-4.2 4.3-8.3 9.6-10.6-4.2 3.1-6.9 6.8-7.9 11.1 9.5-.1 13.9-6.7 13.9-17z' },
    rings: { label: 'Fedi', tags: 'anelli fedi matrimonio sposi', d: 'M9 6.5a6 6 0 1 1 0 12a6 6 0 1 1 0-12zm0 1.8a4.2 4.2 0 1 0 0 8.4a4.2 4.2 0 1 0 0-8.4zM15 6.5a6 6 0 1 1 0 12a6 6 0 1 1 0-12zm0 1.8a4.2 4.2 0 1 0 0 8.4a4.2 4.2 0 1 0 0-8.4z' },
    cake: { label: 'Torta', tags: 'torta compleanno pasticceria dolce', d: 'M11.2 2.5h1.6v4h-1.6zM4 10h16v4H4zM3 15.5h18V21H3zM6.5 7.5h11V10h-11z' },
    cocktail: { label: 'Cocktail', tags: 'cocktail drink aperitivo pub', d: 'M3 3h18l-8 9v7h4v2H7v-2h4v-7zm3.6 2l2.3 2.6h6.2L17.4 5z' },
    wine: { label: 'Calice', tags: 'vino calice brindisi', d: 'M7 2h10l.6 6.2A5.6 5.6 0 0 1 12.9 14v5H16v2H8v-2h3.1v-5A5.6 5.6 0 0 1 6.4 8.2z' },
    pizza: { label: 'Pizza', tags: 'pizza pizzeria trancio', d: 'M12 22L2.6 6.5C8.6 2.8 15.4 2.8 21.4 6.5zM9 9a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3zm5 1.5a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3zm-2 4.5a1.3 1.3 0 1 0 0 2.6a1.3 1.3 0 1 0 0-2.6z' },
    icecream: { label: 'Gelato', tags: 'gelato cono gelateria', d: 'M12 2.5a5 5 0 0 1 5 5 3 3 0 0 1 .8 2H6.2a3 3 0 0 1 .8-2 5 5 0 0 1 5-5zM6.6 11h10.8L12 22z' },
    dove: { label: 'Colomba', tags: 'colomba battesimo pace', d: 'M2 13c3-.3 5.6-1.6 7.5-4.2L12 5c.8-1.2 2.6-1.5 3.6-.4l1.4 1.4 3-.5-1.8 2.2c.2 4.6-2.8 9.3-8.2 10.3L7 21l.6-3.2C5 17.6 3 15.8 2 13z' },
    cross: { label: 'Croce', tags: 'croce comunione battesimo cresima', d: 'M10.5 2h3v6h5v3h-5v11h-3V11h-5V8h5z' },
    laurel: { label: 'Alloro', tags: 'alloro laurea corona premio', d: laurel },
    sun: { label: 'Sole', tags: 'sole estate', d: sun },
    diamond: { label: 'Diamante', tags: 'diamante lusso gioiello', d: 'M6 3h12l4 6-10 12L2 9zm1 2l-2.3 3.4h4.2L10 5zm5 0l-1.2 3.4h2.4zm2 0l1.1 3.4h4.2L17 5z' },
    chef: { label: 'Cappello chef', tags: 'chef cuoco ristorante cucina', d: 'M7 17h10v4H7zM12 3a4.5 4.5 0 0 1 4.2 2.9A4 4 0 0 1 17.5 13.8V15.5h-11v-1.7A4 4 0 0 1 7.8 5.9 4.5 4.5 0 0 1 12 3z' },
    croissant: { label: 'Cornetto', tags: 'cornetto croissant colazione brioche', d: 'M2 15c1.2-4 4-6.8 7.4-7.6L12 14l2.6-6.6C18 8.2 20.8 11 22 15c-2.4.6-4.4 0-5.6-1.2L15 17.6c-1.9.6-4.1.6-6 0l-1.4-3.8C6.4 15 4.4 15.6 2 15z' },
    music: { label: 'Nota musicale', tags: 'musica festa pub', d: 'M9 3l12-2v14a3 3 0 1 1-2-2.8V5.4L11 6.7V18a3 3 0 1 1-2-2.8z' },
    balloon: { label: 'Palloncino', tags: 'palloncino festa compleanno', d: 'M12 2c3.9 0 6.5 3 6.5 6.8 0 4-3 7.6-5.6 8.1l.9 1.6h-3.6l.9-1.6C8.5 16.4 5.5 12.8 5.5 8.8 5.5 5 8.1 2 12 2zM11.4 19.5h1.2c-.2 1 .5 1.8.3 2.5h-1.2c.2-.7-.5-1.5-.3-2.5z' },
  };
  const EMOJI = [
    ['☕', 'caffè tazza'], ['🍵', 'tè tazza'], ['🥐', 'cornetto colazione'], ['🍰', 'torta fetta dolce'], ['🎂', 'torta compleanno'], ['🧁', 'cupcake dolce'],
    ['🍩', 'ciambella'], ['🍪', 'biscotto'], ['🍫', 'cioccolato'], ['🍦', 'gelato'], ['🍨', 'gelato coppa'], ['🍕', 'pizza'], ['🍝', 'pasta'],
    ['🍷', 'vino calice'], ['🥂', 'brindisi champagne'], ['🍸', 'cocktail'], ['🍹', 'drink tropicale'], ['🍺', 'birra'], ['🍻', 'birre brindisi'],
    ['🥃', 'whisky'], ['🍾', 'bottiglia festa'], ['🍋', 'limone'], ['🍓', 'fragola'], ['🍒', 'ciliegie'], ['🌿', 'foglie erbe'], ['🌸', 'fiore ciliegio'],
    ['🌹', 'rosa'], ['🌻', 'girasole'], ['🌷', 'tulipano'], ['💐', 'mazzo fiori'], ['❤️', 'cuore rosso amore'], ['🤍', 'cuore bianco'], ['💕', 'cuori'],
    ['💍', 'anello fidanzamento'], ['👰', 'sposa'], ['🤵', 'sposo'], ['💒', 'matrimonio chiesa'], ['🎉', 'festa coriandoli'], ['🎊', 'festa'],
    ['🎈', 'palloncino'], ['🎁', 'regalo'], ['🎓', 'laurea tocco'], ['📚', 'libri studio'], ['👶', 'bimbo battesimo'], ['🍼', 'biberon'],
    ['🕊️', 'colomba pace'], ['✝️', 'croce'], ['⭐', 'stella'], ['✨', 'scintille'], ['🌟', 'stella brillante'], ['👑', 'corona'], ['💎', 'diamante'],
    ['☀️', 'sole'], ['🌙', 'luna'], ['❄️', 'neve inverno natale'], ['🎄', 'albero natale'], ['🎃', 'halloween zucca'], ['🐣', 'pasqua pulcino'],
    ['⚽', 'calcio pallone'], ['🏆', 'coppa trofeo'], ['🎵', 'musica nota'], ['🎶', 'musica'], ['📍', 'posizione indirizzo'], ['📞', 'telefono'],
    ['✉️', 'email'], ['🌐', 'sito web'], ['✔️', 'spunta'], ['➡️', 'freccia'], ['♥', 'cuore simbolo'], ['★', 'stella simbolo'], ['☆', 'stella vuota'],
    ['♦', 'rombo'], ['♣', 'fiori carte'], ['♠', 'picche'], ['❦', 'fleuron decorazione'], ['❧', 'fleuron'], ['✿', 'fiore simbolo'], ['❀', 'fiore'],
    ['❁', 'fiore'], ['✦', 'stella quattro punte'], ['✧', 'stella'], ['❖', 'decorazione'], ['§', 'paragrafo'], ['&', 'e commerciale'], ['№', 'numero'],
    ['①', 'uno cerchio'], ['②', 'due'], ['③', 'tre'], ['Ⅰ', 'romano uno'], ['Ⅱ', 'romano due'], ['Ⅹ', 'romano dieci'], ['∞', 'infinito'],
    ['™', 'marchio'], ['®', 'registrato'], ['©', 'copyright'], ['℮', 'stimato peso'], ['°', 'grado'], ['€', 'euro'],
  ].map(([ch, tags]) => ({ ch, tags }));
  const api = { ICONS, EMOJI };
  if (typeof module !== 'undefined') module.exports = api; else Object.assign(root, { MarkIcons: api });
})(this);
