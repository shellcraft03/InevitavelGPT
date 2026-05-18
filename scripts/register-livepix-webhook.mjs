import 'dotenv/config';

const clientId = process.env.LIVEPIX_CLIENT_ID;
const clientSecret = process.env.LIVEPIX_CLIENT_SECRET;
const webhookSecret = process.env.LIVEPIX_WEBHOOK_SECRET;

if (!clientId || !clientSecret || !webhookSecret) {
  console.error('Defina LIVEPIX_CLIENT_ID, LIVEPIX_CLIENT_SECRET e LIVEPIX_WEBHOOK_SECRET no .env.local');
  process.exit(1);
}

const webhookUrl = `https://www.inevitavelgpt.com/api/livepix/webhook?secret=${webhookSecret}`;

const tokenRes = await fetch('https://oauth.livepix.gg/oauth2/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'webhooks',
  }),
});

const tokenData = await tokenRes.json();
if (!tokenRes.ok) {
  console.error('Falha ao obter token:', tokenData);
  process.exit(1);
}

const token = tokenData.access_token;
console.log('Token obtido.');

const webhookRes = await fetch('https://api.livepix.gg/v2/webhooks', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ url: webhookUrl }),
});

const webhookData = await webhookRes.json();
if (!webhookRes.ok) {
  console.error('Falha ao registrar webhook:', webhookData);
  process.exit(1);
}

console.log('Webhook registrado com sucesso:');
console.log(JSON.stringify(webhookData, null, 2));
