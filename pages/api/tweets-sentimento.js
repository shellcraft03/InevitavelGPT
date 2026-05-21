import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'Banco não configurado.' });

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

  try {
    const url = process.env.DATABASE_URL.replace(/^postgres:\/\//, 'postgresql://');
    const sql = neon(url);

    const { data, slug } = req.query;

    const [candidatos, datas, tweets] = await Promise.all([
      sql`SELECT slug, nome, partido FROM eleicoes_candidatos WHERE ativo = TRUE ORDER BY slug`,
      sql`
        SELECT DISTINCT data::text
        FROM eleicoes_tweets
        WHERE data >= CURRENT_DATE - INTERVAL '30 days'
        ORDER BY data DESC
      `,
      data && slug
        ? sql`
            SELECT tweet_id, texto, sentimento
            FROM eleicoes_tweets
            WHERE data = ${data} AND candidato_slug = ${slug}
            ORDER BY sentimento, coletado_em
          `
        : [],
    ]);

    return res.status(200).json({
      candidatos,
      datas: datas.map(r => r.data),
      tweets,
    });
  } catch (err) {
    console.error('[api/tweets-sentimento]', err);
    return res.status(500).json({ error: 'Erro ao consultar o banco de dados.' });
  }
}
