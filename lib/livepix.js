const LIVEPIX_OAUTH_URL = 'https://oauth.livepix.gg/oauth2/token';
const LIVEPIX_API_BASE = 'https://api.livepix.gg';
const LIVEPIX_CHECKOUT_BASE = 'https://checkout.livepix.gg';

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const clientId = process.env.LIVEPIX_CLIENT_ID;
  const clientSecret = process.env.LIVEPIX_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Missing env var: LIVEPIX_CLIENT_ID or LIVEPIX_CLIENT_SECRET');

  const res = await fetch(LIVEPIX_OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'account:read wallet:read payments:write webhooks',
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Livepix OAuth failed: ${res.status} ${JSON.stringify(data)}`);

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + ((Number(data.expires_in) || 3600) - 60) * 1000;
  return cachedToken;
}

export async function createLivepixPayment(amountCents, redirectUrl) {
  const token = await getAccessToken();

  const res = await fetch(`${LIVEPIX_API_BASE}/v2/payments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: amountCents,
      currency: 'BRL',
      redirectUrl,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Livepix payment failed: ${res.status} ${JSON.stringify(data)}`);

  const reference = data.data?.reference || data.reference;
  if (!reference) throw new Error('Livepix response missing reference field');

  return {
    reference,
    checkoutUrl: `${LIVEPIX_CHECKOUT_BASE}/${reference}`,
  };
}
