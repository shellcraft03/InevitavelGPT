import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: 'Banco de dados não configurado.' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);

    const rows = await sql`
      SELECT partido, nome_partido, uf, ano, mes, quantidade
      FROM filiados_partidarios
      ORDER BY ano DESC, mes DESC, quantidade DESC
    `;

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ data: rows });
  } catch (err) {
    console.error('[api/filiados]', err);
    return res.status(500).json({ error: 'Erro ao consultar o banco de dados.' });
  }
}
