const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let size, quantity;
  try {
    ({ size, quantity } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid body' }) };
  }

  if (!size || !quantity) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing size or quantity' }) };
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: `PostureFix Pro — Size ${size.toUpperCase()}`,
            description: 'Premium Back Posture Corrector | Free tracked delivery to Ireland 🇮🇪',
          },
          unit_amount: 3499,
        },
        quantity: parseInt(quantity),
      }],
      mode: 'payment',
      shipping_address_collection: { allowed_countries: ['IE'] },
      phone_number_collection: { enabled: true },
      custom_text: {
        submit: { message: 'Free tracked delivery · Ships within 24h · 30-day money-back guarantee' }
      },
      success_url: `${process.env.SITE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.SITE_URL}/#offer`,
      metadata: { size: size.toUpperCase(), quantity: String(quantity) },
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error('Stripe error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not create checkout session' }) };
  }
};
