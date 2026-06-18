const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();

  const { restaurant_id, return_url } = req.body;
  if (!restaurant_id) return res.status(400).json({ error: 'Missing restaurant_id' });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('restaurant_id', restaurant_id)
    .single();

  if (!sub?.stripe_customer_id) return res.status(404).json({ error: 'No Stripe customer found' });

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: return_url || 'https://myvistagusto.vercel.app/dashboard-restaurant.html',
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('billing-portal error:', err);
    res.status(500).json({ error: err.message });
  }
};
