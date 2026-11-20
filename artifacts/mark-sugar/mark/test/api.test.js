// Test di integrazione: avvia il server su un database temporaneo e verifica listini, ordini e provvigioni.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const os = require('node:os'); const fs = require('node:fs'); const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mark-test-'));
process.env.PORT = '0'; process.env.ADMIN_PASSWORD = 'test-password';
let server; let base; let adminCookie;
const call = async (url, { method, body, cookie } = {}) => {
  const r = await fetch(base + url, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null), cookie: r.headers.get('set-cookie') };
};
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const CONFIRM = 'Ho controllato attentamente la grafica e confermo che testi, nomi, immagini, colori e posizionamento sono corretti.';

before(async () => {
  server = require('../src/server.js');
  await new Promise((r) => (server.listening ? r() : server.on('listening', r)));
  base = `http://127.0.0.1:${server.address().port}`;
  adminCookie = (await call('/api/admin/login', { body: { password: 'test-password' } })).cookie.split(';')[0];
});
after(() => server.close());

test('listino bustine extrafine come da catalogo', async () => {
  const q = async (qty, option = '1C') => (await call('/api/quote', { body: { items: [{ productSlug: 'bustine-extrafine', option, qty }] } })).json;
  assert.equal((await q(5)).lines[0].unitPrice, 22);
  assert.equal((await q(10)).lines[0].unitPrice, 20);
  assert.equal((await q(50)).lines[0].unitPrice, 18);
  assert.equal((await q(60, '4C')).lines[0].unitPrice, 18.5);
  assert.match((await q(4)).errors[0], /minima 5/);
  assert.equal((await q(5)).lines[0].setup, 50);
});

test('portatovaglioli: multipli di 12 e terzo lato +10%', async () => {
  const r = (await call('/api/quote', { body: { items: [{ productSlug: 'portatovaglioli-cube', option: 'DIG', qty: 24, side3: true }] } })).json;
  assert.equal(r.lines[0].unitPrice, 8.03); // 7,30 + 10%
  const bad = (await call('/api/quote', { body: { items: [{ productSlug: 'portatovaglioli-cube', option: 'DIG', qty: 13 }] } })).json;
  assert.match(bad.errors[0], /multipla di 12/);
});

test('ordine bloccato finché le spedizioni non sono configurate, poi ordine + provvigione', async () => {
  const design = { mode: 'mono', ink: '#2D2926', sides: { front: { objects: [{ id: 'a', type: 'text', text: 'BAR', font: 'Montserrat', sizePt: 12, x: 35, y: 22 }] }, back: { objects: [] } } };
  const d = await call('/api/designs', { body: { productSlug: 'bustine-extrafine', option: '1C', design, files: { preview_front: PNG }, checks: [], confirmText: CONFIRM } });
  assert.equal(d.status, 200);
  const order = { items: [{ productSlug: 'bustine-extrafine', option: '1C', qty: 10, designId: d.json.designId }], paymentMethod: 'bonifico', termsAccepted: true,
    customer: { name: 'Test', email: 'cliente@test.it' }, shipping: { address: 'Via Roma 1', zip: '00100', city: 'Roma' } };
  assert.equal((await call('/api/orders', { body: order })).status, 400);
  await call('/api/admin/settings', { method: 'PUT', cookie: adminCookie, body: { shipping: { configured: true, bands: [{ maxKg: 200, cost: 20 }] } } });
  await call('/api/admin/partners/1', { method: 'PUT', cookie: adminCookie, body: { rate_first: 10, rate_reorder: 5 } });
  const o = await call('/api/orders', { body: order });
  assert.equal(o.status, 200, JSON.stringify(o.json));
  assert.equal(o.json.total, Math.round((200 + 50 + 20) * 1.22 * 100) / 100);
  let comm = (await call('/api/admin/commissions', { cookie: adminCookie })).json;
  assert.equal(comm[0].amount, 20); assert.equal(comm[0].status, 'in_attesa_pagamento');
  const id = (await call('/api/admin/orders', { cookie: adminCookie })).json[0].id;
  await call(`/api/admin/orders/${id}`, { method: 'PATCH', cookie: adminCookie, body: { payment_status: 'pagato' } });
  comm = (await call('/api/admin/commissions', { cookie: adminCookie })).json;
  assert.equal(comm[0].status, 'maturata');
  // riordino della stessa grafica: niente impianto, provvigione riordino 5%
  const o2 = await call('/api/orders', { body: order });
  assert.equal(o2.json.total, Math.round((200 + 20) * 1.22 * 100) / 100);
  comm = (await call('/api/admin/commissions', { cookie: adminCookie })).json;
  assert.equal(comm[0].kind, 'riordino'); assert.equal(comm[0].amount, 10);
});

test('grafica vuota o non confermata rifiutata', async () => {
  const empty = { mode: 'mono', sides: { front: { objects: [] } } };
  assert.equal((await call('/api/designs', { body: { productSlug: 'bustine-extrafine', option: '1C', design: empty, confirmText: CONFIRM } })).status, 400);
  const d = { mode: 'mono', sides: { front: { objects: [{ type: 'text', text: 'x' }] } } };
  assert.equal((await call('/api/designs', { body: { productSlug: 'bustine-extrafine', option: '1C', design: d, confirmText: 'ok' } })).status, 400);
});
