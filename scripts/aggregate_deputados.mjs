import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

const { Pool } = pkg;

const API_BASE = 'https://dadosabertos.camara.leg.br/api/v2';
const ITENS_POR_PAGINA = 100;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function setup(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS deputados_partidarios (
      partido       VARCHAR(30)  NOT NULL,
      uf            CHAR(2)      NOT NULL,
      ano           SMALLINT     NOT NULL,
      mes           SMALLINT     NOT NULL,
      quantidade    INTEGER      NOT NULL,
      atualizado_em TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      PRIMARY KEY (partido, uf, ano, mes)
    )
  `);
}

async function fetchAllDeputados() {
  const all = [];
  let url = `${API_BASE}/deputados?ordem=ASC&ordenarPor=nome&itens=${ITENS_POR_PAGINA}`;

  while (url) {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`Câmara API respondeu ${res.status}: ${url}`);
    const json = await res.json();

    all.push(...json.dados);
    console.log(`  ${all.length} deputados carregados...`);

    const next = json.links?.find(l => l.rel === 'next');
    url = next?.href ?? null;
  }

  return all;
}

async function dropAndInsert(client, entries) {
  if (!entries.length) return;

  const periods = [...new Set(entries.map(e => `${e.ano}-${e.mes}`))];
  for (const period of periods) {
    const [ano, mes] = period.split('-').map(Number);
    const { rowCount } = await client.query(
      'DELETE FROM deputados_partidarios WHERE ano = $1 AND mes = $2',
      [ano, mes]
    );
    console.log(`  Removidos ${rowCount} registros existentes de ${mes}/${ano}`);
  }

  const CHUNK = 500;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    const placeholders = chunk.map((_, j) => {
      const b = j * 5;
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5})`;
    }).join(', ');

    const values = chunk.flatMap(({ partido, uf, ano, mes, quantidade }) =>
      [partido, uf, ano, mes, quantidade]
    );

    await client.query(
      `INSERT INTO deputados_partidarios (partido, uf, ano, mes, quantidade)
       VALUES ${placeholders}`,
      values
    );
  }
}

async function main() {
  const now = new Date();
  const ano = now.getFullYear();
  const mes = now.getMonth() + 1;

  console.log(`Buscando deputados federais da API da Câmara...`);
  const deputados = await fetchAllDeputados();
  console.log(`Total: ${deputados.length} deputados`);

  // Aggregate by partido × uf
  const agg = new Map();
  for (const d of deputados) {
    const partido = (d.siglaPartido ?? '').trim().toUpperCase();
    const uf      = (d.siglaUf      ?? '').trim().toUpperCase();
    if (!partido || !uf) continue;
    const key = `${partido}|${uf}`;
    agg.set(key, (agg.get(key) ?? 0) + 1);
  }

  const entries = [...agg.entries()].map(([key, quantidade]) => {
    const [partido, uf] = key.split('|');
    return { partido, uf, ano, mes, quantidade };
  });

  console.log(`\nInserindo ${entries.length} registros no banco...`);
  const client = await pool.connect();
  try {
    await setup(client);
    await dropAndInsert(client, entries);
    console.log(`Concluído: ${entries.length} registros (partido × UF × mês) inseridos.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
