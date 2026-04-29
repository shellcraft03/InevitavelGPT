export async function verifyTurnstile(token) {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return { ok: false, reason: 'missing_secret' };
  if (!token) return { ok: false, reason: 'missing_token' };
  try {
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}`
    });
    const j = await resp.json();
    return { ok: Boolean(j.success), detail: j };
  } catch (err) {
    return { ok: false, reason: 'network_error', error: String(err) };
  }
}
