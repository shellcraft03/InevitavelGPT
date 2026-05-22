import { getCurrentUser } from '../../../lib/inevitavelgpt2/user.js';
import { getInevitavelGpt2Db } from '../../../lib/inevitavelgpt2/db.js';
import { createLivepixPayment } from '../../../lib/livepix.js';

const MIN_CENTS = 100;
const MAX_CENTS = 100000;

function getRedirectUrl(req) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.IGPT2_BASE_URL;
  if (configured) return `${configured.replace(/\/$/, '')}/inevitavelgpt2/conta?donation=pending`;
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  return `${proto}://${req.headers.host}/inevitavelgpt2/conta?donation=pending`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const amountCents = Number(req.body?.amountCents);
  if (!Number.isInteger(amountCents) || amountCents < MIN_CENTS || amountCents > MAX_CENTS) {
    return res.status(400).json({ error: 'Valor inválido. Mínimo R$ 1,00, máximo R$ 1.000,00.' });
  }

  try {
    const { reference, checkoutUrl } = await createLivepixPayment(amountCents, getRedirectUrl(req));

    const sql = getInevitavelGpt2Db();
    await sql`
      INSERT INTO igpt2_livepix_payments (reference, user_id, amount_cents, status)
      VALUES (${reference}, ${user.id}, ${amountCents}, 'pending')
    `;

    return res.status(200).json({ checkoutUrl });
  } catch (err) {
    console.error('[livepix/create-payment]', err?.message || err);
    return res.status(500).json({ error: 'Não foi possível criar o pagamento. Tente novamente.' });
  }
}
