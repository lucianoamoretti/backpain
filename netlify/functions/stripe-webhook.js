const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Get CJ access token
async function getCJToken() {
  const res = await fetch('https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.CJ_EMAIL,
      password: process.env.CJ_API_KEY,
    }),
  });
  const data = await res.json();
  if (!data.data?.accessToken) throw new Error('CJ auth failed: ' + JSON.stringify(data));
  return data.data.accessToken;
}

// Create order on CJ Dropshipping
async function createCJOrder(session) {
  const token = await getCJToken();
  const { size, quantity } = session.metadata;
  const addr = session.customer_details.address;

  // Map size to CJ variant ID (set these in Netlify env vars after finding on CJ catalog)
  const variantMap = {
    S:  process.env.CJ_VID_S  || process.env.CJ_VID_DEFAULT,
    M:  process.env.CJ_VID_M  || process.env.CJ_VID_DEFAULT,
    L:  process.env.CJ_VID_L  || process.env.CJ_VID_DEFAULT,
    XL: process.env.CJ_VID_XL || process.env.CJ_VID_DEFAULT,
  };

  const vid = variantMap[size];
  if (!vid) throw new Error(`No CJ variant ID configured for size ${size}`);

  const payload = {
    orderNumber:          session.id,
    shippingCountry:      'Ireland',
    shippingCountryCode:  addr.country,
    shippingProvince:     addr.state || '',
    shippingCity:         addr.city,
    shippingAddress:      [addr.line1, addr.line2].filter(Boolean).join(', '),
    shippingZip:          addr.postal_code,
    shippingCustomerName: session.customer_details.name,
    shippingPhone:        session.customer_details.phone || '',
    remark:               `PostureFix Pro - Size: ${size} - Stripe: ${session.id}`,
    products: [{ vid, quantity: parseInt(quantity) }],
  };

  const res = await fetch('https://developers.cjdropshipping.com/api2.0/v1/shopping/order/createOrder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CJ-Access-Token': token },
    body: JSON.stringify(payload),
  });

  const result = await res.json();
  console.log('CJ response:', JSON.stringify(result));
  return result;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Verify Stripe signature
  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      event.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  // Only act on completed payments
  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;

    if (session.payment_status === 'paid') {
      try {
        const cjOrder = await createCJOrder(session);
        console.log('Order created on CJ for session', session.id, '| CJ order:', cjOrder?.data?.orderId);
      } catch (err) {
        // Payment already captured — log for manual retry, don't return 500
        console.error('CJ order creation failed for session', session.id, ':', err.message);
      }
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
