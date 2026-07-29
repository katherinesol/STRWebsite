import { Seam } from 'seam';
import { createClient } from '@supabase/supabase-js';
const seam = new Seam({ apiKey: process.env.SEAM_API_KEY });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const today = new Date().toISOString().split('T')[0];
const DRY_RUN = false;

const { data: allLocks } = await s.from('property_locks').select('*').eq('active', true);
const locksFor = (pid) => allLocks.filter(l => l.property_id === pid);
async function codesOn(id) { try { const c = await seam.accessCodes.list({ device_id: id }); return new Set(c.map(x => x.code).filter(Boolean)); } catch { return new Set(); } }

const { data: plat } = await s.from('calendar_blocks')
  .select('id, property_id, platform, start_date, end_date, door_code, guest_name, guest_phone')
  .eq('is_booking', true).gte('end_date', today).order('start_date');

const needsCode = [];

for (const b of plat || []) {
  const isAirbnb = b.platform === 'airbnb';

  // RULE: Airbnb + Nickel → skip entirely, Airbnb owns the only lock
  if (isAirbnb && b.property_id === 'nickel-beach') { console.log(`SKIP airbnb Nickel ${b.start_date} — Airbnb owns it`); continue; }

  const locks = locksFor(b.property_id);
  const targets = isAirbnb ? locks.filter(l => !l.airbnb_managed) : locks;
  if (!targets.length) { console.log(`SKIP ${b.property_id} ${b.platform} ${b.start_date} — no locks for us`); continue; }

  // code source: stored door_code (last4) OR phone last4. NO random.
  const stored = String(b.door_code || '').replace(/\D/g, '').slice(-4);
  const phone4 = (b.guest_phone || '').replace(/\D/g, '').slice(-4);
  const code = (stored.length === 4 ? stored : '') || (phone4.length === 4 ? phone4 : '');

  if (!code) {
    needsCode.push(`${b.property_id} · ${b.platform} · ${b.start_date} · ${b.guest_name || 'guest'} (no phone last-4, no stored code)`);
    continue;
  }

  const starts = new Date(b.start_date + 'T16:00:00').toISOString();
  const ends = new Date(b.end_date + 'T11:00:00').toISOString();
  for (const lock of targets) {
    const used = await codesOn(lock.seam_device_id);
    if (used.has(code)) { console.log(`  = ${lock.lock_name}: ${code} already there, skip`); continue; }
    if (DRY_RUN) { console.log(`  [dry] ${b.platform} ${b.start_date} → ${lock.lock_name}: set ${code}`); continue; }
    try {
      await seam.accessCodes.create({ device_id: lock.seam_device_id, name: `${b.guest_name || 'Guest'} · ${b.platform} · ${b.start_date}`, code, starts_at: starts, ends_at: ends });
      await s.from('calendar_blocks').update({ door_code: code }).eq('id', b.id);
      console.log(`  ✓ ${lock.lock_name}: set ${code}`);
    } catch (e) { console.log(`  ✗ ${lock.lock_name}: ${e.message}`); }
  }
}

if (needsCode.length) {
  console.log('\n=== NEEDS A CODE FROM YOU (no phone last-4, not set by platform) ===');
  for (const n of needsCode) console.log('  ⚠ ' + n);
}
console.log(DRY_RUN ? '\n(DRY RUN — nothing programmed.)' : '\nDone.');
