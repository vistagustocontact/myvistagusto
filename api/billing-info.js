const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const { restaurant_id } = req.query;
  if (!restaurant_id) return res.status(400).json({ error: 'Missing restaurant_id' });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const { data: sub, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('restaurant_id', restaurant_id)
    .single();

  if (error || !sub) return res.json({ sub: null, invoices: [], paymentMethod: null });

  if (!sub.stripe_customer_id) return res.json({ sub, invoices: [], paymentMethod: null });

  try {
    const [invoicesRes, paymentMethodsRes] = await Promise.all([
      stripe.invoices.list({ customer: sub.stripe_customer_id, limit: 12 }),
      stripe.paymentMethods.list({ customer: sub.stripe_customer_id, type: 'card' }),
    ]);

    const paymentMethod = paymentMethodsRes.data[0]
      ? { brand: paymentMethodsRes.data[0].card.brand, last4: paymentMethodsRes.data[0].card.last4 }
      : null;

    const invoices = invoicesRes.data.map(inv => {
      const isDraft = inv.status === 'draft';
      const dateTs = isDraft ? (inv.next_payment_attempt || inv.period_end || inv.created) : inv.created;
      return {
        date: new Date(dateTs * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        number: inv.number || 'Upcoming',
        amount: '€' + ((inv.amount_paid || inv.amount_due) / 100).toFixed(0),
        status: isDraft ? 'upcoming' : inv.status,
        pdf: inv.invoice_pdf,
        url: inv.hosted_invoice_url,
      };
    });

    res.json({ sub, invoices, paymentMethod });
  } catch (err) {
    console.error('billing-info error:', err);
    res.status(500).json({ error: err.message });
  }
};
