// Full logical backup of every table to JSON, one file per table.
//   node --env-file=.env.local backup-supabase.mjs
// Writes to ~/Desktop/str-backup-YYYY-MM-DD/ plus a manifest.json with row counts.
// Safety net before the property_id migration — read-only, touches nothing in Supabase.
import fs from 'fs';
import path from 'path';
import os from 'os';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const PAGE = 1000;
const today = new Date().toISOString().split('T')[0];
const OUT = path.join(os.homedir(), 'Desktop', `str-backup-${today}`);

// Every table PostgREST exposes, straight from the OpenAPI spec — so nothing is
// missed because it wasn't on a hand-written list.
async function listTables() {
  const r = await fetch(`${URL}/rest/v1/`, { headers: H });
  if (!r.ok) throw new Error(`Could not read schema: ${r.status}`);
  const spec = await r.json();
  return Object.keys(spec.definitions || spec.components?.schemas || {}).sort();
}

// Page through the whole table. PostgREST caps responses (default 1000), so a
// plain select would silently truncate large tables.
async function fetchAll(table) {
  let offset = 0, rows = [], reported = null;
  for (;;) {
    const r = await fetch(`${URL}/rest/v1/${table}?select=*`, {
      headers: { ...H, Range: `${offset}-${offset + PAGE - 1}`, Prefer: 'count=exact' },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`);
    const cr = r.headers.get('content-range');           // e.g. "0-999/12345"
    if (reported === null && cr) {
      const t = cr.split('/')[1];
      reported = t === '*' ? null : parseInt(t, 10);
    }
    const batch = await r.json();
    rows.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return { rows, reported };
}

const results = [];
fs.mkdirSync(OUT, { recursive: true });

const tables = await listTables();
console.log(`Backing up ${tables.length} tables → ${OUT}\n`);

for (const t of tables) {
  const file = path.join(OUT, `${t}.json`);
  try {
    const { rows, reported } = await fetchAll(t);
    fs.writeFileSync(file, JSON.stringify(rows, null, 2));

    // Read back from disk and re-parse, so a count is only reported if the file
    // on disk actually holds that many rows.
    const verified = JSON.parse(fs.readFileSync(file, 'utf8')).length;
    const truncated = reported !== null && reported !== verified;
    results.push({
      table: t, rows: verified, reported, ok: !truncated,
      bytes: fs.statSync(file).size,
      note: truncated ? `MISMATCH: server reported ${reported}` : null,
    });
    console.log(
      `  ${truncated ? '✗' : '✓'} ${t.padEnd(24)} ${String(verified).padStart(6)} rows` +
      (truncated ? `  ← server reported ${reported}` : '')
    );
  } catch (err) {
    results.push({ table: t, rows: null, ok: false, error: String(err.message) });
    console.log(`  ✗ ${t.padEnd(24)} ${'FAILED'.padStart(6)}  ${err.message}`);
  }
}

const okRows = results.filter(r => r.ok).reduce((a, r) => a + r.rows, 0);
const failed = results.filter(r => !r.ok);

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({
  taken_at: new Date().toISOString(),
  supabase_url: URL,
  tables_total: tables.length,
  tables_ok: results.length - failed.length,
  tables_failed: failed.length,
  total_rows: okRows,
  tables: results,
}, null, 2));

console.log(`\n${'='.repeat(60)}`);
console.log(`Tables exported : ${results.length - failed.length}/${tables.length}`);
console.log(`Total rows      : ${okRows}`);
console.log(`Location        : ${OUT}`);
if (failed.length) {
  console.log(`\nFAILED (${failed.length}) — NOT backed up:`);
  for (const f of failed) console.log(`  - ${f.table}: ${f.error || f.note}`);
  process.exitCode = 1;
}
