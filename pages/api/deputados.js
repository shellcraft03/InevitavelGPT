import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: 'Banco de dados não configurado.' });
  }

  try {
    const url = process.env.DATABASE_URL.replace(/^postgres:\/\//, 'postgresql://');
    const sql = neon(url);

    const rows = await sql`
      SELECT d.partido, f.nome_partido, d.uf, d.ano, d.mes, d.quantidade
      FROM deputados_partidarios d
      LEFT JOIN (
        SELECT DISTINCT ON (partido) partido, nome_partido
        FROM filiados_partidarios
        WHERE nome_partido IS NOT NULL
        ORDER BY partido, ano DESC, mes DESC
      ) f ON f.partido = d.partido
      ORDER BY d.ano DESC, d.mes DESC, d.quantidade DESC
    `;

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ data: rows });
  } catch (err) {
    console.error('[api/deputados]', err);
    return res.status(500).json({ error: 'Erro ao consultar o banco de dados.' });
  }
}
