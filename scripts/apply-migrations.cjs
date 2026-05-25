const { Client } = require('pg');
const fs = require('fs');

const env = Object.fromEntries(
  fs.readFileSync('.env.local','utf8').split('\n')
    .filter(l=>l.includes('=')&&!l.startsWith('#'))
    .map(l=>{const i=l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()]})
);

const pw = env.SUPABASE_DB_PASSWORD;
const ref = (env.SUPABASE_URL||'').match(/https:\/\/([^.]+)/)?.[1];
const connStr = 'postgresql://postgres.' + ref + ':' + encodeURIComponent(pw) + '@aws-0-us-east-1.pooler.supabase.com:5432/postgres';

(async () => {
  const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected to Supabase');
  
  // 0017: inventory operational fields
  await client.query(`
    ALTER TABLE public.inventory_items
      ADD COLUMN IF NOT EXISTS avg_views        INTEGER       DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS content_hours    NUMERIC(6,2)  DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS team_required    TEXT          DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS production_cost  NUMERIC(12,2) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS setup_hours      NUMERIC(6,2)  DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS line_items       JSONB         DEFAULT '[]'
  `);
  console.log('0017 OK: inventory columns added');
  
  // 0018: active_contract enum value
  try {
    await client.query(`ALTER TYPE public.proposal_status ADD VALUE IF NOT EXISTS 'active_contract' AFTER 'sent'`);
    console.log('0018 OK: active_contract added to enum');
  } catch(e) {
    console.log('0018 note:', e.message);
  }

  // Verify
  const cols = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name='inventory_items' AND column_name IN ('avg_views','content_hours','team_required','production_cost','setup_hours','line_items')`);
  console.log('Verified inventory cols:', cols.rows.map(r=>r.column_name));
  
  const enums = await client.query(`SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'proposal_status' ORDER BY e.enumsortorder`);
  console.log('proposal_status enum:', enums.rows.map(r=>r.enumlabel).join(', '));
  
  // Notify PostgREST schema cache reload
  await client.query(`NOTIFY pgrst, 'reload schema'`);
  console.log('PostgREST schema reloaded');
  
  await client.end();
})().catch(e => { console.error('DB ERROR:', e.message); process.exit(1); });
