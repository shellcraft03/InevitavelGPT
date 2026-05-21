import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'Banco não configurado.' });

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  try {
    const url = process.env.DATABASE_URL.replace(/^postgres:\/\//, 'postgresql://');
    const sql = neon(url);

    const { data, slug } = req.query;

    const [candidatos, datas, noticias] = await Promise.all([
      sql`SELECT slug, nome, partido FROM eleicoes_candidatos WHERE ativo = TRUE ORDER BY slug`,
      sql`
        SELECT DISTINCT data::text
        FROM eleicoes_noticias
        WHERE data >= CURRENT_DATE - INTERVAL '30 days'
        ORDER BY data DESC
      `,
      data && slug
        ? sql`
            SELECT n.id, nc.candidato_slug, n.data::text, n.titulo, n.url, n.jornal, nc.sentimento
            FROM eleicoes_noticias n
            JOIN eleicoes_noticias_classificacoes nc ON nc.noticia_id = n.id
            WHERE n.data = ${data}
              AND nc.candidato_slug = ${slug}
              AND nc.relevante = TRUE
            ORDER BY nc.sentimento, n.titulo
          `
        : data
        ? sql`
            SELECT n.id, nc.candidato_slug, n.data::text, n.titulo, n.url, n.jornal, nc.sentimento
            FROM eleicoes_noticias n
            JOIN eleicoes_noticias_classificacoes nc ON nc.noticia_id = n.id
            WHERE n.data = ${data}
              AND nc.relevante = TRUE
            ORDER BY nc.candidato_slug, nc.sentimento, n.titulo
          `
        : [],
    ]);

    return res.status(200).json({
      candidatos,
      datas: datas.map(r => r.data),
      noticias,
    });
  } catch (err) {
    console.error('[api/noticias-sentimento]', err);
    return res.status(500).json({ error: 'Erro ao consultar o banco de dados.' });
  }
}
