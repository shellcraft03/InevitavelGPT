import { config } from 'dotenv';
config({ path: '.env.local' });
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

await sql`
  CREATE TABLE IF NOT EXISTS igpt2_livepix_payments (
    reference    TEXT        PRIMARY KEY,
    user_id      UUID        NOT NULL REFERENCES igpt2_users(id),
    amount_cents INTEGER     NOT NULL,
    status       TEXT        NOT NULL DEFAULT 'pending',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ
  )
`;

console.log('Tabela igpt2_livepix_payments criada com sucesso.');
