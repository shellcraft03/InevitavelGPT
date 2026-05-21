import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: 'Banco de dados não configurado.' });
  }

  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');

  try {
    const url = process.env.DATABASE_URL.replace(/^postgres:\/\//, 'postgresql://');
    const sql = neon(url);

    const [candidatos, rows] = await Promise.all([
      sql`
        SELECT slug, nome, partido
        FROM eleicoes_candidatos
        WHERE ativo = TRUE
        ORDER BY CASE slug
          WHEN 'renan-santos'     THEN 1
          WHEN 'flavio-bolsonaro' THEN 2
          WHEN 'lula'             THEN 3
          ELSE 4
        END
      `,
      sql`
        SELECT candidato_slug, fonte, data::text, positivo, neutro, negativo,
               volume, score_tendencia, odds
        FROM eleicoes_sentimento
        WHERE data >= CURRENT_DATE - INTERVAL '30 days'
        ORDER BY data DESC
      `,
    ]);

    const sentimento = {};
    for (const c of candidatos) {
      sentimento[c.slug] = { rss: [], twitter: [], google_trends: [], polymarket: [] };
    }
    for (const row of rows) {
      const bucket = sentimento[row.candidato_slug]?.[row.fonte];
      if (bucket) bucket.push(row);
    }

    return res.status(200).json({ candidatos, sentimento });
  } catch (err) {
    console.error('[api/sentimento]', err);
    return res.status(500).json({ error: 'Erro ao consultar o banco de dados.' });
  }
}
