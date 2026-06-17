const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const obj = event.data.object;

  try {
    switch (event.type) {
      case 'invoice.paid':
        await supabase.from('subscriptions')
          .update({
            status: 'active',
            next_invoice_date: new Date(obj.period_end * 1000).toISOString().split('T')[0],
            updated_at: new Date().toISOString()
          })
          .eq('stripe_subscription_id', obj.subscription);
        break;

      case 'invoice.payment_failed':
        await supabase.from('subscriptions')
          .update({ status: 'overdue', updated_at: new Date().toISOString() })
          .eq('stripe_subscription_id', obj.subscription);
        break;

      case 'customer.subscription.deleted':
        await supabase.from('subscriptions')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('stripe_subscription_id', obj.id);
        break;

      case 'customer.subscription.updated':
        await supabase.from('subscriptions')
          .update({
            status: obj.status === 'active' ? 'active' : obj.status,
            next_invoice_date: new Date(obj.current_period_end * 1000).toISOString().split('T')[0],
            updated_at: new Date().toISOString()
          })
          .eq('stripe_subscription_id', obj.id);
        break;
    }
  } catch (err) {
    console.error('Supabase update error:', err);
  }

  res.json({ received: true });
};
