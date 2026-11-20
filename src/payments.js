// Integrazioni di pagamento senza SDK (chiamate REST dirette).
// Si attivano solo se le chiavi sono presenti nei Secrets di Replit:
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
//   PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV=sandbox|live
const crypto = require('node:crypto');

async function stripeCheckout(order, baseUrl) {
  const f = new URLSearchParams();
  f.set('mode', 'payment');
  f.set('success_url', `${baseUrl}/api/pay/stripe/return?order=${order.token}&session_id={CHECKOUT_SESSION_ID}`);
  f.set('cancel_url', `${baseUrl}/ordine.html?t=${order.token}&annullato=1`);
  f.set('client_reference_id', order.number);
  f.set('customer_email', order.email);
  f.set('line_items[0][quantity]', '1');
  f.set('line_items[0][price_data][currency]', 'eur');
  f.set('line_items[0][price_data][unit_amount]', String(Math.round(order.total * 100)));
  f.set('line_items[0][price_data][product_data][name]', `Ordine MARK n. ${order.number}`);
  f.set('metadata[order_token]', order.token);
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST', body: f,
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Stripe: ${j.error && j.error.message}`);
  return { url: j.url, ref: j.id };
}

async function stripeSessionPaid(sessionId) {
  const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
  });
  const j = await r.json();
  return { paid: r.ok && j.payment_status === 'paid', token: j.metadata && j.metadata.order_token, ref: j.payment_intent || j.id };
}

function stripeVerifyWebhook(raw, header) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !header) return null;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${raw}`).digest('hex');
  const ok = parts.v1 && parts.v1.length === expected.length && crypto.timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected));
  if (!ok || Math.abs(Date.now() / 1000 - Number(parts.t)) > 600) return null;
  return JSON.parse(raw);
}

const paypalBase = () => (process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com');
async function paypalToken() {
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const r = await fetch(`${paypalBase()}/v1/oauth2/token`, { method: 'POST', body: 'grant_type=client_credentials',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' } });
  const j = await r.json();
  if (!r.ok) throw new Error('PayPal: autenticazione non riuscita');
  return j.access_token;
}
async function paypalCreate(order, baseUrl) {
  const tk = await paypalToken();
  const r = await fetch(`${paypalBase()}/v2/checkout/orders`, {
    method: 'POST', headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{ reference_id: order.number, description: `Ordine MARK n. ${order.number}`, amount: { currency_code: 'EUR', value: order.total.toFixed(2) } }],
      application_context: { brand_name: 'MARK', user_action: 'PAY_NOW', shipping_preference: 'NO_SHIPPING',
        return_url: `${baseUrl}/api/pay/paypal/return?order=${order.token}`, cancel_url: `${baseUrl}/ordine.html?t=${order.token}&annullato=1` },
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('PayPal: impossibile creare il pagamento');
  const link = (j.links || []).find((l) => l.rel === 'approve' || l.rel === 'payer-action');
  return { url: link.href, ref: j.id };
}
async function paypalCapture(paypalOrderId) {
  const tk = await paypalToken();
  const r = await fetch(`${paypalBase()}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
    method: 'POST', headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' } });
  const j = await r.json();
  return { paid: r.ok && j.status === 'COMPLETED', ref: j.id };
}

module.exports = { stripeCheckout, stripeSessionPaid, stripeVerifyWebhook, paypalCreate, paypalCapture };
