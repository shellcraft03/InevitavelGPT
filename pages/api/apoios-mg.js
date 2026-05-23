import { hasValidHumanSession } from '../../lib/session.js';

const API_URL = process.env.QUEROAPOIAR_API_URL;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!hasValidHumanSession(req)) return res.status(401).json({ error: 'Unauthorized' });

  const { _skip = '0', _limit = '12', localidade = 'Minas Gerais' } = req.query;

  const params = new URLSearchParams({
    year: '2026',
    _skip,
    _limit,
    partido: 'Missão',
    localidade,
    sort: 'arrecadado',
  });

  if (!API_URL) return res.status(500).json({ error: 'API não configurada' });

  try {
    const upstream = await fetch(`${API_URL}?${params}`);
    if (!upstream.ok) return res.status(upstream.status).json({ error: `Upstream ${upstream.status}` });
    const data = await upstream.json();
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
