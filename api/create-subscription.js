const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const { restaurant_id, email, name, setup_fee, monthly_price, plan } = req.body;

  try {
    // Create Stripe customer
    const customer = await stripe.customers.create({ email, name });

    // Build subscription
    const subParams = {
      customer: customer.id,
      items: [{
        price_data: {
          currency: 'eur',
          product_data: { name: `VistaGusto ${plan}` },
          unit_amount: Math.round(monthly_price * 100),
          recurring: { interval: 'month' }
        }
      }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
    };

    // Add one-time setup fee if provided
    if (setup_fee > 0) {
      subParams.add_invoice_items = [{
        price_data: {
          currency: 'eur',
          product_data: { name: 'VistaGusto Setup Fee' },
          unit_amount: Math.round(setup_fee * 100)
        }
      }];
    }

    const subscription = await stripe.subscriptions.create(subParams);

    // Save to Supabase
    await supabase.from('subscriptions').upsert({
      restaurant_id,
      plan,
      status: 'trial',
      price_monthly: monthly_price,
      stripe_customer_id: customer.id,
      stripe_subscription_id: subscription.id,
      next_invoice_date: new Date(subscription.current_period_end * 1000).toISOString().split('T')[0],
    });

    res.json({
      clientSecret: subscription.latest_invoice.payment_intent.client_secret,
      subscriptionId: subscription.id
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
