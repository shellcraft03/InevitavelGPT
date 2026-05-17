import { getInevitavelGpt2Db } from '../../../../lib/inevitavelgpt2/db.js';
import { consumeOAuthState, setUserSessionCookie } from '../../../../lib/inevitavelgpt2/session.js';
import { exchangeCodeForTokens, fetchXMe } from '../../../../lib/inevitavelgpt2/xOAuth.js';

function publicErrorCode(err) {
  const message = String(err?.message || '');

  if (message.includes('X token exchange failed')) return 'token_exchange_failed';
  if (message.includes('X user lookup failed')) return 'x_user_lookup_failed';
  if (message.includes('DATABASE_URL')) return 'database_not_configured';
  if (err?.code === '42P01' || message.includes('does not exist')) return 'database_schema_missing';
  if (message.toLowerCase().includes('database') || message.toLowerCase().includes('neon')) return 'database_failed';

  return 'callback_failed';
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { code, state, error } = req.query || {};
  if (error) return res.redirect(302, `/inevitavelgpt2?oauth_error=${encodeURIComponent(String(error))}`);
  if (!code || !state) return res.redirect(302, '/inevitavelgpt2?oauth_error=missing_code');

  const oauthState = consumeOAuthState(req, res);
  if (!oauthState || oauthState.state !== state) {
    return res.redirect(302, '/inevitavelgpt2?oauth_error=invalid_state');
  }

  try {
    const tokens = await exchangeCodeForTokens(req, String(code), oauthState.codeVerifier);
    const xUser = await fetchXMe(tokens.access_token);
    const sql = getInevitavelGpt2Db();

    const users = await sql`
      INSERT INTO igpt2_users (x_user_id, x_username, x_name, x_profile_image_url)
      VALUES (${xUser.id}, ${xUser.username}, ${xUser.name || null}, ${xUser.profile_image_url || null})
      ON CONFLICT (x_user_id) DO UPDATE SET
        x_username = EXCLUDED.x_username,
        x_name = EXCLUDED.x_name,
        x_profile_image_url = EXCLUDED.x_profile_image_url,
        updated_at = now()
      RETURNING id
    `;

    const userId = users[0].id;
    await sql`
      INSERT INTO igpt2_access_grants (user_id, access_status)
      VALUES (${userId}, 'pending')
      ON CONFLICT (user_id) DO NOTHING
    `;

    await sql`
      INSERT INTO igpt2_automation_settings (user_id)
      VALUES (${userId})
      ON CONFLICT (user_id) DO NOTHING
    `;

    await sql`
      INSERT INTO igpt2_automation_state (user_id, last_tweet_created_at)
      VALUES (${userId}, now())
      ON CONFLICT (user_id) DO UPDATE SET
        last_tweet_created_at = now(),
        next_run_at = now(),
        locked_until = NULL,
        locked_by = NULL,
        updated_at = now()
    `;

    setUserSessionCookie(req, res, userId);
    return res.redirect(302, '/inevitavelgpt2/conta');
  } catch (err) {
    console.error('[igpt2/oauth/callback]', err?.message || err);
    return res.redirect(302, `/inevitavelgpt2?oauth_error=${publicErrorCode(err)}`);
  }
}
