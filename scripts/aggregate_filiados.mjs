import pkg from 'pg';
import { createReadStream, readdirSync } from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

const { Pool } = pkg;

const DATA_DIR = process.argv[2] ?? './tse_data';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function setup(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS filiados_partidarios (
      partido       VARCHAR(30)   NOT NULL,
      nome_partido  VARCHAR(100),
      uf            CHAR(2)       NOT NULL,
      ano           SMALLINT      NOT NULL,
      mes           SMALLINT      NOT NULL,
      quantidade    INTEGER       NOT NULL,
      atualizado_em TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      PRIMARY KEY (partido, uf, ano, mes)
    )
  `);
}

function findCol(headers, candidates) {
  const upper = headers.map(h => h.trim().toUpperCase());
  for (const c of candidates) {
    const idx = upper.indexOf(c);
    if (idx !== -1) return headers[idx];
  }
  return null;
}

function parseDateBR(str) {
  if (!str) return null;
  str = str.trim();
  // YYYYMM (ex: 202501)
  if (/^\d{6}$/.test(str)) {
    return { ano: parseInt(str.slice(0, 4), 10), mes: parseInt(str.slice(4, 6), 10) };
  }
  // DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [, m, y] = str.split('/');
    return { ano: parseInt(y, 10), mes: parseInt(m, 10) };
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const [y, m] = str.split('-');
    return { ano: parseInt(y, 10), mes: parseInt(m, 10) };
  }
  return null;
}

async function processFile(filePath) {
  console.log(`Lendo (stream): ${filePath}`);

  const agg = new Map();
  const fallbackDate = { ano: new Date().getFullYear(), mes: new Date().getMonth() + 1 };

  let colPartido, colNome, colUF, colQtd, colData;
  let headersResolved = false;
  let rowCount = 0;

  const parser = createReadStream(filePath, { encoding: 'latin1' }).pipe(
    parse({
      delimiter: ';',
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      bom: true,
    })
  );

  for await (const row of parser) {
    if (!headersResolved) {
      const headers = Object.keys(row);
      colPartido = findCol(headers, ['SG_PARTIDO', 'SIGLA_PARTIDO', 'PARTIDO']);
      colNome    = findCol(headers, ['NM_PARTIDO', 'NOME_PARTIDO', 'DS_PARTIDO']);
      colUF      = findCol(headers, ['SG_UF', 'SIGLA_UF', 'UF', 'CD_UF']);
      colQtd     = findCol(headers, ['QT_FILIADO', 'QT_FILIADOS', 'NR_FILIADOS', 'QTD_FILIADOS', 'QUANTIDADE']);
      colData    = findCol(headers, ['NR_ANO_MES', 'DT_GERACAO', 'DT_REFERENCIA', 'DATA_REFERENCIA', 'DT_PUBLICACAO', 'DT_EXTRACAO']);

      if (!colPartido || !colUF || !colQtd) {
        console.error('Colunas obrigatórias não encontradas. Headers:', headers.join(', '));
        process.exit(1);
      }
      console.log(`  Colunas: partido=${colPartido} uf=${colUF} qtd=${colQtd} data=${colData ?? 'n/a'}`);
      headersResolved = true;
    }

    const partido     = (row[colPartido] ?? '').trim().toUpperCase();
    const nomePartido = colNome ? (row[colNome] ?? '').trim() : '';
    const uf          = (row[colUF]      ?? '').trim().toUpperCase();
    const qtd         = parseInt((row[colQtd] ?? '0').replace(/\./g, '').replace(',', '.'), 10);
    const rawDate     = colData ? row[colData] : null;

    if (!partido || !uf || isNaN(qtd) || qtd < 0) continue;

    const date = parseDateBR(rawDate) ?? fallbackDate;
    const key  = `${partido}|${uf}|${date.ano}|${date.mes}`;

    const existing = agg.get(key);
    if (existing) {
      existing.quantidade += qtd;
    } else {
      agg.set(key, { partido, nomePartido, uf, ano: date.ano, mes: date.mes, quantidade: qtd });
    }

    rowCount++;
    if (rowCount % 500_000 === 0) console.log(`  ${(rowCount / 1_000_000).toFixed(1)}M linhas processadas...`);
  }

  console.log(`  Total: ${rowCount.toLocaleString('pt-BR')} linhas → ${agg.size} combinações únicas`);
  return [...agg.values()];
}

async function dropAndInsert(client, entries) {
  if (!entries.length) return;

  // Collect all distinct (ano, mes) pairs present in the new data
  const periods = [...new Set(entries.map(e => `${e.ano}-${e.mes}`))];

  for (const period of periods) {
    const [ano, mes] = period.split('-').map(Number);
    const { rowCount } = await client.query(
      'DELETE FROM filiados_partidarios WHERE ano = $1 AND mes = $2',
      [ano, mes]
    );
    console.log(`  Removidos ${rowCount} registros existentes de ${mes}/${ano}`);
  }

  const CHUNK = 500;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    const placeholders = chunk.map((_, j) => {
      const b = j * 6;
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6})`;
    }).join(', ');

    const values = chunk.flatMap(({ partido, nomePartido, uf, ano, mes, quantidade }) =>
      [partido, nomePartido || null, uf, ano, mes, quantidade]
    );

    await client.query(
      `INSERT INTO filiados_partidarios (partido, nome_partido, uf, ano, mes, quantidade)
       VALUES ${placeholders}`,
      values
    );
  }
}

async function main() {
  const client = await pool.connect();
  try {
    await setup(client);

    const files = readdirSync(DATA_DIR)
      .filter(f => f.toLowerCase().endsWith('.csv'))
      .map(f => join(DATA_DIR, f));

    if (!files.length) {
      console.error(`Nenhum CSV encontrado em ${DATA_DIR}`);
      process.exit(1);
    }

    const merged = new Map();
    for (const file of files) {
      const entries = await processFile(file);
      for (const entry of entries) {
        const key = `${entry.partido}|${entry.uf}|${entry.ano}|${entry.mes}`;
        const existing = merged.get(key);
        if (existing) {
          existing.quantidade += entry.quantidade;
        } else {
          merged.set(key, { ...entry });
        }
      }
    }

    const final = [...merged.values()];
    console.log(`\nInserindo ${final.length} registros no banco...`);
    await dropAndInsert(client, final);
    console.log(`Concluído: ${final.length} registros (partido × UF × mês) inseridos.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
