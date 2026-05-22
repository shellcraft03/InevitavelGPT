import { getInevitavelGpt2Db } from '../../../lib/inevitavelgpt2/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const secret = process.env.LIVEPIX_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[livepix/webhook] LIVEPIX_WEBHOOK_SECRET not set — rejecting all requests');
    return res.status(500).end();
  }
  if (req.query.secret !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { event, resource } = req.body || {};
  if (event !== 'new' || !resource?.reference) {
    return res.status(200).json({ ok: true });
  }

  try {
    const sql = getInevitavelGpt2Db();

    const updated = await sql`
      UPDATE igpt2_livepix_payments
      SET status = 'processed', processed_at = now()
      WHERE reference = ${resource.reference} AND status = 'pending'
      RETURNING user_id, amount_cents
    `;

    if (updated.length === 0) {
      return res.status(200).json({ ok: true, reason: 'unknown_or_already_processed' });
    }

    const { user_id, amount_cents } = updated[0];

    await sql`
      UPDATE igpt2_access_grants
      SET credit_balance_cents = credit_balance_cents + ${amount_cents},
          access_status = 'approved',
          updated_at = now()
      WHERE user_id = ${user_id}
    `;

    await sql`
      INSERT INTO igpt2_balance_events (user_id, delta_cents, source, note, created_at)
      VALUES (${user_id}, ${amount_cents}, 'livepix', 'Livepix', now())
    `;

    console.log('[livepix/webhook] Credited %d cents to user_id=%s ref=%s', amount_cents, user_id, resource.reference);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[livepix/webhook]', err?.message || err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
