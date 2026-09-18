#!/usr/bin/env npx tsx
/*  Eufy C32 capability probe — Unit 3.
 *
 *  THERE IS A LONG-TERM TENANT LIVING BEHIND THIS LOCK. Their code is the one
 *  thing this script must never touch, and every safety measure below exists for
 *  that single sentence. An incomplete probe is a bad afternoon. A deleted
 *  tenant code is a person standing outside their home.
 *
 *  WHAT IT ANSWERS, in order, and it stops at the first thing that fails:
 *    Q1  what lock is this, and what does the library think it can do
 *    Q2  the capability flags, verbatim, unabridged
 *    Q3  the codes already on it — read, recorded, and PROTECTED
 *    Q4  can a new code be added                     [write]
 *    Q5  can a code be added WITH A SCHEDULE         [write]
 *    Q6  DOES THE SCHEDULE ACTUALLY BITE             [write]
 *    Q7  can the test code be deleted                [write]
 *    Q8  how slow and how flaky is it, over ten runs [write]
 *
 *  Q1-Q3 ARE READ-ONLY and run by default. Q4-Q8 need --write, and refuse to
 *  start unless Q3 succeeded — see the gate in main().
 *
 *  LANGUAGE NOTE: this is TypeScript, not Python like the Schlage tools,
 *  because eufy-security-client is a Node library and there is no maintained
 *  Python equivalent. Same machine, same Keychain, same discipline.
 *
 *  Run:  cd ~/Desktop/rental-direct && npx tsx tools/eufy/capability-probe.ts
 *        …and then, only after reading the Q3 output:
 *        npx tsx tools/eufy/capability-probe.ts --write
 */

import { execFileSync } from 'child_process'
import { assertSafeTarget as guardTarget, chooseTestCode, Refused, type GuardState } from './guard'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const WRITE = process.argv.includes('--write')
const OUT = join(process.env.HOME || '.', 'eufy-probe')
const PROTECTED_FILE = join(OUT, 'protected-codes.json')
const AUDIT = join(OUT, 'audit.log')

/*  THE TEST CODE.
 *
 *  Deliberately unlike anything a person would choose for a home, so that a
 *  human reading the lock's code list can tell at a glance which entry is this
 *  script's. It is confirmed ABSENT in Q3 before any write; if it is somehow
 *  already on the lock the probe stops rather than adopt a code it cannot prove
 *  it created. */
const TEST_CODE_CANDIDATES = ['909142', '909143', '909144']
let TEST_CODE = ''
const TEST_NAME = 'ZZ-PROBE-DELETE-ME'
/*  Eufy identifies a keypad user by a short id as well as a name. A fixed,
 *  obviously-synthetic value keeps the probe's user distinct from every real
 *  one on the lock. */
const SHORT_USER_ID = '9999'
/*  Loaded in Q2. Writes are impossible without it. */
let STATION: any = null

/*  Every code found in Q3. Nothing in this set is ever an argument to a write.
 *  It is written to disk before the first write so that a crashed run leaves
 *  evidence of what was on the lock beforehand. */
let PROTECTED = new Set<string>()
let PROTECTED_DETAIL: any[] = []

const log = (s: string) => {
  console.log(s)
  try { mkdirSync(OUT, { recursive: true }); writeFileSync(AUDIT, new Date().toISOString() + '  ' + s.replace(/\x1b\[[0-9;]*m/g, '') + '\n', { flag: 'a' }) } catch {}
}
const head = (s: string) => log('\n════ ' + s + ' ════')

class Stop extends Error {}

/** Every step announces itself, so a silent exit is impossible to mistake. */
const step = (s: string) => log('  · ' + s)

/** Nothing in this script is allowed to hang forever with no explanation. */
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${what} did not finish within ${ms / 1000}s`)), ms)),
  ])
}
function stop(why: string): never { throw new Stop(why) }

/*  ──────────────────────────────────────────────────────────────────────────
 *  THE GUARD. Nothing writes or deletes without going through this.
 *
 *  Three independent conditions, each sufficient on its own to refuse. They
 *  overlap on purpose: the tenant's code has to get past all three to be
 *  touched, and any one of them being right is enough to save it.
 *  ────────────────────────────────────────────────────────────────────────── */
function assertSafeTarget(code: string, what: string) {
  const state: GuardState = {
    testCode: TEST_CODE,
    protectedCodes: PROTECTED,
    readSucceeded: PROTECTED_DETAIL.length > 0,
    protectedOnDisk: existsSync(PROTECTED_FILE)
      ? (JSON.parse(readFileSync(PROTECTED_FILE, 'utf8')).protected || []) : undefined,
  }
  guardTarget(state, code, what)
  log(`      guard ok — target is the test code ${mask(String(code))}, not one of the ${PROTECTED.size} protected`)
}

/*  Codes are masked in everything printed. The audit file is on Katherine's
 *  machine, but a terminal gets screenshotted and pasted. */
const mask = (c: string) => !c ? '(empty)' : c.length <= 2 ? '**' : c[0] + '*'.repeat(c.length - 2) + c[c.length - 1]

/*  Credentials from the Keychain, exactly as the Schlage tools take them.
 *  The password is read into memory here and never written, printed or sent. */
function creds(): { username: string; password: string; country: string } {
  const kc = (args: string[]) => {
    try { return execFileSync('security', args, { encoding: 'utf8' }).trim() } catch { return '' }
  }
  const username = kc(['find-generic-password', '-s', 'eufy', '-w', '-a', 'account']) || process.env.EUFY_USERNAME || ''
  const password = kc(['find-generic-password', '-s', 'eufy', '-w']) || process.env.EUFY_PASSWORD || ''
  if (!username || !password) {
    stop('No Eufy credentials. Add them to the Keychain:\n'
      + '      security add-generic-password -s eufy -a account -w        # the email\n'
      + '      security add-generic-password -s eufy -w                   # the password\n'
      + '    …or export EUFY_USERNAME / EUFY_PASSWORD in this shell only.')
  }
  return { username, password, country: process.env.EUFY_COUNTRY || 'CA' }
}

/*  ──────────────────────────────────────────────────────────────────────────
 *  The library. Loaded lazily so Q1's failure message can explain itself
 *  rather than crashing on an import.
 *  ────────────────────────────────────────────────────────────────────────── */
async function connect() {
  /*  WHY THIS IS SO CHATTY.
   *
   *  The first run printed the Q1 header and returned to the prompt with
   *  nothing after it — a black box. The cause is almost certainly below:
   *  eufy-security-client reports a two-factor or captcha challenge as an EVENT,
   *  not as a rejected promise. With nobody listening, connect() resolves
   *  having logged in to nothing, no devices ever arrive, and the script walks
   *  off the end in silence. Every step now announces itself, every failure
   *  mode has a listener, and nothing waits forever. */
  step('loading eufy-security-client')
  let mod: any
  try {
    mod = await import('eufy-security-client')
  } catch (e: any) {
    stop('eufy-security-client is not installed. Run:  npm i eufy-security-client\n    ' + e.message)
  }

  const { username, password, country } = creds()
  step(`credentials found for ${username.replace(/^(.).*(@.*)$/, '$1***$2')} (country ${country})`)

  step('initialising')
  const api = await mod.EufySecurity.initialize({
    username, password, country, language: 'en',
    persistentDir: OUT, eventDurationSeconds: 10, p2pConnectionSetup: 2, pollingIntervalMinutes: 10,
  })

  /*  THE LISTENERS THAT WERE MISSING. Each of these is a way the login can end
   *  without an exception, and each printed nothing before. */
  let challenge: string | null = null
  api.on('tfa request', () => {
    challenge = 'TWO-FACTOR'
    log('\n  ⚠  EUFY IS ASKING FOR A TWO-FACTOR CODE — see the instructions below.')
  })
  api.on('captcha request', (id: string) => {
    challenge = 'CAPTCHA'
    log('\n  ⚠  EUFY IS ASKING FOR A CAPTCHA (id ' + id + ').')
    log('     This is what Eufy does to unfamiliar machines. Log in to the Eufy')
    log('     app from this machine\'s network, then run again.')
  })
  api.on('connection error', (e: Error) => log('  ⚠  connection error: ' + e.message))
  api.on('close', () => log('  · connection closed'))
  api.on('station added', (st: any) => step(`station added: ${st.getName?.()} (${st.getModel?.()})`))
  api.on('device added', (d: any) => step(`device added: ${d.getName?.()} (${d.getModel?.()})`))

  /*  TWO-FACTOR, AND HOW THIS STOPS BEING A PROBLEM FOREVER.
   *
   *  eufy-security-client takes the emailed code as connect({ verifyCode }).
   *  That alone would mean re-reading an email on every run, because the code
   *  expires in minutes — so the moment a 2FA login succeeds, this calls
   *  addTrustDevice() with the same code, which marks THIS MACHINE trusted on
   *  the Eufy account. Every later run logs in with no code at all.
   *
   *  So: one awkward run, then never again. The tokens live in persistentDir
   *  alongside it, which is ~/eufy-probe and not the repository. */
  const verifyCode = (process.env.EUFY_2FA_CODE || '').trim()
  const captchaCode = (process.env.EUFY_CAPTCHA_CODE || '').trim()
  let captchaId: string | null = null
  api.on('captcha request', (id: string) => { captchaId = id })

  const opts: any = { force: false }
  if (verifyCode) {
    if (!/^\d{4,8}$/.test(verifyCode)) stop(`EUFY_2FA_CODE is "${verifyCode.replace(/./g, '*')}" — expected the 4-8 digit code from the email.`)
    opts.verifyCode = verifyCode
    opts.force = true
    step(`using the ${verifyCode.length}-digit verification code from EUFY_2FA_CODE`)
  }
  if (captchaCode && process.env.EUFY_CAPTCHA_ID) {
    opts.captcha = { captchaCode, captchaId: process.env.EUFY_CAPTCHA_ID }
    opts.force = true
    step('using the captcha answer from EUFY_CAPTCHA_CODE')
  }

  step('connecting — this can take 10-30 seconds')
  const t0 = Date.now()
  try {
    await withTimeout(api.connect(opts), 45_000, 'connect()')
  } catch (e: any) {
    stop(`login failed after ${((Date.now() - t0) / 1000).toFixed(1)}s: ${e.message}`
      + (challenge ? `\n    A ${challenge} challenge was raised — see above.` : ''))
  }
  step(`connect() returned after ${((Date.now() - t0) / 1000).toFixed(1)}s`)

  /*  A challenge raised on THIS run, with no answer supplied, is the end of the
   *  road for this run — but it is a short road now. */
  if (challenge && !verifyCode && !captchaCode) {
    if (challenge === 'TWO-FACTOR') {
      log('\n  ─────────────────────────────────────────────────────────────')
      log('  Eufy has just emailed a 6-digit code to the account.')
      log('  It expires in a few minutes, so do this next, promptly:')
      log('')
      log('      EUFY_2FA_CODE=123456 npx tsx tools/eufy/capability-probe.ts')
      log('')
      log('  (with the real code, and the same EUFY_USERNAME / EUFY_PASSWORD')
      log('   already exported in that shell)')
      log('')
      log('  You only have to do this ONCE. On success this machine is')
      log('  registered as a trusted device and later runs need no code.')
      log('  ─────────────────────────────────────────────────────────────')
    }
    if (challenge === 'CAPTCHA' && captchaId) {
      log(`\n  Re-run with:  EUFY_CAPTCHA_ID=${captchaId} EUFY_CAPTCHA_CODE=<what the image says> ...`)
    }
    stop(`Eufy raised a ${challenge} challenge and no answer was supplied.`)
  }

  /*  Make it the last time. */
  if (verifyCode && api.isConnected?.()) {
    step('registering this machine as a trusted device')
    try {
      const http = api.getApi?.()
      const ok = await withTimeout(http.addTrustDevice(verifyCode), 20_000, 'addTrustDevice()')
      log(ok ? '  ✓ trusted — future runs will not ask for a code' : '  ⚠  Eufy declined to trust this machine; the next run may ask again')
    } catch (e: any) {
      log('  ⚠  could not register trust: ' + e.message)
      log('     Not fatal — this run continues, but the next may ask for a code again.')
    }
  }

  /*  Devices arrive from the cloud after login. Asking immediately can return
   *  an empty list that means "not yet", not "none". */
  step('refreshing cloud data')
  try { await withTimeout(api.refreshCloudData(), 30_000, 'refreshCloudData()') }
  catch (e: any) { log('  ⚠  refreshCloudData failed: ' + e.message + ' — continuing, the device list may be stale') }

  return { api, mod }
}

/*  Reading the codes is the hinge of the whole probe. If this cannot be done,
 *  the tenant's code cannot be identified, and if it cannot be identified it
 *  cannot be protected — so the probe stops here rather than writing blind. */
async function readCodes(device: any): Promise<any[] | null> {
  for (const fn of ['getPropertyValue', 'getProperties']) {
    try {
      const props = typeof device[fn] === 'function' ? await device[fn]() : null
      if (props && typeof props === 'object') {
        const found = Object.entries(props).filter(([k]) => /passcode|pin|code|user/i.test(k))
        if (found.length) return found.map(([k, v]) => ({ source: fn, key: k, value: v }))
      }
    } catch {}
  }
  return null
}

/*  ══════════════════════════════════════════════════════════════════════════
 *  Q1-Q3 — READ ONLY. Nothing below this line writes to the lock.
 *  ══════════════════════════════════════════════════════════════════════════ */
async function q1_q3(api: any) {
  head('Q1 · WHAT LOCK IS THIS')
  step('asking for the device list')
  let devices: any[] = []
  try {
    const got = await withTimeout(api.getDevices(), 30_000, 'getDevices()')
    devices = Array.isArray(got) ? got : Object.values(got ?? {})
  } catch (e: any) {
    /*  DISTINCT FROM ZERO DEVICES, and Katherine needs the difference: this is
     *  "the call failed", not "the account is empty". */
    stop('the device list call FAILED: ' + e.message
      + '\n    That is different from finding no devices — the request itself did not complete.')
  }
  step(`getDevices() returned ${devices.length} device(s)`)

  if (devices.length === 0) {
    /*  Authenticated, asked, told nothing. Also a real answer. */
    let stations: any[] = []
    try { stations = await withTimeout(api.getStations(), 20_000, 'getStations()') } catch {}
    log('\n  ⚠  AUTHENTICATED, BUT THE ACCOUNT REPORTS ZERO DEVICES.')
    log(`     stations visible: ${stations.length}`)
    log('     This is not an error — the call worked and came back empty. Usually one of:')
    log('       · the locks are on a DIFFERENT Eufy account than these credentials')
    log('       · the account region is wrong (currently ' + (process.env.EUFY_COUNTRY || 'CA') + ' — set EUFY_COUNTRY)')
    log('       · the lock is paired to a HomeBase/station this account cannot see')
    stop('No devices on this account.')
  }

  for (const d of devices) {
    let isLock = false
    try { isLock = typeof d.isLock === 'function' ? d.isLock() : false } catch {}
    log(`    ${String(d.getName?.() ?? '?').padEnd(28)} model ${String(d.getModel?.() ?? '?').padEnd(10)} `
      + `type ${String(d.getDeviceType?.() ?? '?').padEnd(5)} serial ${mask(String(d.getSerial?.() ?? ''))}`
      + (isLock ? '  ← LOCK' : ''))
  }

  const locks = devices.filter((d: any) => { try { return typeof d.isLock === 'function' && d.isLock() } catch { return false } })
  log(`\n  of those, ${locks.length} report themselves as locks`)
  if (!locks.length) {
    log('\n  ⚠  DEVICES EXIST BUT NONE IS A LOCK, by the library\'s own reckoning.')
    log('     If the C32 is in the list above, the library does not recognise its')
    log('     device type as a lock — which by itself means it cannot manage its codes.')
    stop('No lock among the devices on this account.')
  }

  const lock: any = locks.length === 1 ? locks[0]
    : locks.find((d: any) => /unit ?3|c32/i.test(String(d.getName?.() ?? ''))) ?? locks[0]
  log(`\n  probing: ${lock.getName?.()}  (${lock.getModel?.()})  station ${mask(String(lock.getStationSerial?.() ?? ''))}`)
  let battery: any = 'unknown'
  try { battery = lock.getPropertyValue?.('battery') ?? 'unknown' } catch {}
  log(`  battery: ${battery}%   ← a low battery predicts a failed write`)

  head('Q2 · CAN IT MANAGE PASSCODES AT ALL')
  /*  THE THREE COMMANDS THAT DECIDE IT. eufy-security-client names passcode
   *  operations deviceAddUser / deviceDeleteUser / deviceUpdateUserPasscode,
   *  and they are executed on the STATION, not the device. If the lock does not
   *  report them, Eufy cannot hold guest codes on this model and the project
   *  stops here. */
  const WANT = ['deviceAddUser', 'deviceDeleteUser', 'deviceUpdateUserPasscode']
  let commands: string[] = []
  try {
    commands = (lock.getCommands?.() ?? []).map((c: any) => String(c))
  } catch (e: any) { log('  ⚠  getCommands() failed: ' + e.message) }
  log(`  the lock reports ${commands.length} command(s)`)
  if (commands.length) log('    ' + commands.join(', '))

  const have = WANT.filter(w => commands.includes(w))
  log('')
  for (const w of WANT) log(`    ${have.includes(w) ? '✓' : '✗'}  ${w}`)

  //  the station is where the write actually happens, so check it too
  let station: any = null
  try {
    const stations = await withTimeout(api.getStations(), 20_000, 'getStations()')
    station = (Array.isArray(stations) ? stations : Object.values(stations ?? {}))
      .find((s: any) => s.getSerial?.() === lock.getStationSerial?.())
  } catch (e: any) { log('  ⚠  could not load the station: ' + e.message) }
  STATION = station
  const stationFns = ['addUser', 'deleteUser', 'updateUserPasscode'].filter(f => typeof station?.[f] === 'function')
  log(`\n  station methods available: ${stationFns.length ? stationFns.join(', ') : 'NONE — the station object could not be loaded'}`)

  if (!have.length) {
    log('\n  ⚠  THE C32 REPORTS NO PASSCODE COMMANDS.')
    log('     This is a real and expected possible answer. eufy-security-client')
    log('     documents lock/unlock for locks; the C32 is not on its published')
    log('     device list. If nothing above manages passcodes, Eufy cannot hold')
    log('     guest codes on this model, and no adapter design changes that.')
    log('     STOP HERE — the question is answered.')
    stop('The C32 does not support passcode management.')
  }
  log(`\n  ✓ passcode management IS supported (${have.length}/3 commands). Continuing to Q3.`)

  head('Q3 · THE CODES ALREADY ON THE LOCK — READ AND PROTECT')
  const codes = await readCodes(lock)
  if (!codes) {
    log('  could not read any passcode property from this lock.')
    log('\n  ⚠  STOPPING. The tenant lives behind this lock. If their code cannot be')
    log('     READ, it cannot be told apart from the probe\'s test code, and a')
    log('     delete could take theirs. An incomplete probe is the correct')
    log('     outcome here — not a careful write.')
    stop('Q3 could not read the lock\'s codes.')
  }
  for (const c of codes) log(`    ${c.key} = ${typeof c.value === 'object' ? JSON.stringify(c.value) : mask(String(c.value))}`)

  const values = codes.flatMap(c => {
    const v = c.value
    if (typeof v === 'string' || typeof v === 'number') return [String(v)]
    if (Array.isArray(v)) return v.map((x: any) => String(x?.passcode ?? x?.code ?? x))
    if (v && typeof v === 'object') return Object.values(v).map((x: any) => String(x?.passcode ?? x?.code ?? x))
    return []
  }).filter(x => /^\d{4,8}$/.test(x))

  PROTECTED = new Set(values)
  PROTECTED_DETAIL = codes
  mkdirSync(OUT, { recursive: true })
  writeFileSync(PROTECTED_FILE, JSON.stringify({ at: new Date().toISOString(), lock: lock.getName?.(), codes, protected: Array.from(PROTECTED) }, null, 2))
  log(`\n  ${PROTECTED.size} code(s) recorded as PROTECTED and written to ${PROTECTED_FILE}`)
  log('  every one of these is now refused as a write or delete target, permanently.')
  log('\n  ⚠  KATHERINE: read the file above and confirm the tenant\'s code is in it')
  log('     BEFORE running with --write. If it is not listed, do not proceed.')

  TEST_CODE = chooseTestCode(TEST_CODE_CANDIDATES, PROTECTED)
  log(`\n  test code chosen: ${mask(TEST_CODE)}  — confirmed ABSENT from the lock`)
  return lock
}

/*  ══════════════════════════════════════════════════════════════════════════
 *  Q4-Q8 — WRITES. Every one goes through assertSafeTarget first.
 *
 *  These only ever name TEST_CODE. There is no code path in this file that
 *  passes a variable derived from the lock's existing codes to a write or a
 *  delete — the only value any of them can act on is the constant chosen in Q3
 *  and proved absent there.
 *  ══════════════════════════════════════════════════════════════════════════ */

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** The one place a passcode write happens. Guarded, logged, and re-read. */
async function addCode(lock: any, code: string, name: string, schedule?: { start: Date; end: Date }) {
  assertSafeTarget(code, schedule ? 'Q5/Q6 add-with-schedule' : 'Q4 add')
  /*  THE WRITE HAPPENS ON THE STATION, NOT THE DEVICE, and the first draft of
   *  this probe had it wrong: it looked for lock.addUserPasscode, which does not
   *  exist. eufy-security-client's real signature is
   *    station.addUser(device, username, shortUserId, passcode, schedule?)
   *  with Schedule carrying startDateTime / endDateTime — so a time-bound code
   *  is at least EXPRESSIBLE in the API. Whether the C32 enforces one is Q6.
   *
   *  It returns void. The result arrives as an event, which is precisely why
   *  every call here is followed by a readback rather than trusted. */
  if (!STATION) stop('the station for this lock could not be loaded — nothing can be written')
  log(`      writing ${mask(code)} "${name}"${schedule ? ` window ${schedule.start.toISOString()} → ${schedule.end.toISOString()}` : ' (no schedule)'}`)
  const sched = schedule ? { startDateTime: schedule.start, endDateTime: schedule.end } : undefined
  return await STATION.addUser(lock, name, SHORT_USER_ID, code, sched)
}

/** The one place a passcode delete happens. Guarded twice over. */
async function deleteCode(lock: any, code: string) {
  assertSafeTarget(code, 'Q7 delete')
  //  Second, independent check against the file on disk, in case PROTECTED was
  //  somehow rebuilt in memory during this run.
  if (existsSync(PROTECTED_FILE)) {
    const onDisk: string[] = JSON.parse(readFileSync(PROTECTED_FILE, 'utf8')).protected || []
    if (onDisk.includes(code)) stop(`Q7 delete: ${mask(code)} appears in ${PROTECTED_FILE}. REFUSED.`)
    log(`      cross-checked against ${onDisk.length} protected code(s) on disk — not among them`)
  }
  if (!STATION) stop('the station for this lock could not be loaded — nothing can be deleted')
  log(`      deleting the user named "${TEST_NAME}" (code ${mask(code)})`)
  /*  deleteUser takes the USERNAME, not the code — which is a second, structural
   *  reason the tenant is safe here: this probe only ever names its own
   *  unmistakable user, ZZ-PROBE-DELETE-ME. The code guard above still runs
   *  first, because two reasons are better than one. */
  return await STATION.deleteUser(lock, TEST_NAME, SHORT_USER_ID)
}

/** After every write: does the lock agree? The adapter's word is never the verdict. */
async function readback(lock: any, code: string, expect: 'present' | 'absent') {
  await sleep(4000)
  const codes = await readCodes(lock)
  const blob = JSON.stringify(codes ?? [])
  const there = blob.includes(code) || blob.includes(TEST_NAME)
  const ok = expect === 'present' ? there : !there
  log(`      readback: ${there ? 'present' : 'absent'} — expected ${expect}  ${ok ? '✓' : '✗'}`)
  return ok
}

async function q4_q8(lock: any) {
  const results: Record<string, any> = {}

  head('Q4 · CAN A CODE BE ADDED')
  try {
    await addCode(lock, TEST_CODE, TEST_NAME)
    results.q4 = await readback(lock, TEST_CODE, 'present')
  } catch (e: any) { results.q4 = false; log('      FAILED: ' + e.message) }
  if (results.q4) { try { await deleteCode(lock, TEST_CODE); await readback(lock, TEST_CODE, 'absent') } catch {} }

  head('Q5 · CAN A CODE BE ADDED WITH A SCHEDULE')
  const start = new Date(Date.now() + 60 * 60 * 1000)          // an hour from now
  const end = new Date(Date.now() + 2 * 60 * 60 * 1000)        // two hours from now
  try {
    await addCode(lock, TEST_CODE, TEST_NAME, { start, end })
    results.q5_accepted = await readback(lock, TEST_CODE, 'present')
    const codes = await readCodes(lock)
    const blob = JSON.stringify(codes ?? [])
    results.q5_schedule_visible = /startDay|endDay|schedule|validFrom|expir/i.test(blob)
    log(`      the lock reports a schedule on it: ${results.q5_schedule_visible ? 'yes' : 'NO — it accepted the window and did not store it'}`)
  } catch (e: any) { results.q5_accepted = false; log('      FAILED: ' + e.message) }

  head('Q6 · DOES THE SCHEDULE ACTUALLY BITE')
  log('  The code written in Q5 is NOT YET ACTIVE — its window opens in an hour.')
  log('  This is the question no document answers and the one that decides the')
  log('  architecture. The Schlage locks accepted a window, reported it back')
  log('  correctly, and opened four hours early; only a guest at a door found it.')
  log('')
  log('  ⏸  MANUAL, AND IT HAS TO BE. Katherine, at the lock:')
  log('')
  log(`     1. NOW — type ${TEST_CODE} on the keypad. It must NOT open.`)
  log('        If it opens, the schedule is decorative: accepted, reported, not')
  log('        enforced. That is the worst outcome and it must be recorded.')
  log(`     2. AFTER ${start.toLocaleTimeString()} — type it again. It SHOULD open.`)
  log(`     3. AFTER ${end.toLocaleTimeString()} — type it again. It must NOT open.`)
  log('')
  log('     Record all three in tools/eufy/RESULTS.md. Two "does not open" and')
  log('     one "opens", in that order, is the only passing result.')
  log('')
  log('     The tenant\'s own code is untouched throughout — try it too, at each')
  log('     step, and confirm it still works. If it ever does not, stop and call.')

  head('Q7 · CAN THE TEST CODE BE DELETED')
  try {
    await deleteCode(lock, TEST_CODE)
    results.q7 = await readback(lock, TEST_CODE, 'absent')
  } catch (e: any) { results.q7 = false; log('      FAILED: ' + e.message) }
  log(`\n  NOTE: if Q6 is still mid-flight, re-add the test code by hand before step 2.`)
  log(`  Leaving a stray test code on a tenant's lock is not acceptable — Q7 runs last for that reason.`)

  head('Q8 · HOW SLOW, HOW FLAKY')
  const times: number[] = []; let failures = 0
  for (let i = 0; i < 10; i++) {
    const t0 = Date.now()
    try { await readCodes(lock); times.push(Date.now() - t0) } catch { failures++ }
    await sleep(1500)
  }
  times.sort((a, b) => a - b)
  results.q8 = { n: times.length, failures, medianMs: times[Math.floor(times.length / 2)] ?? null, maxMs: times[times.length - 1] ?? null }
  log(`  ${times.length} reads, ${failures} failures, median ${results.q8.medianMs}ms, slowest ${results.q8.maxMs}ms`)
  log('  the retry policy for the Eufy adapter gets set from these numbers, not from Schlage\'s.')

  return results
}

async function main() {
  log('Eufy C32 capability probe — Unit 3')
  log(WRITE ? 'MODE: --write  (Q1-Q8)' : 'MODE: read-only  (Q1-Q3). Add --write for Q4-Q8.')
  log('A long-term tenant lives behind this lock. Their code is never a target.')

  const { api } = await connect()
  try {
    const lock = await q1_q3(api)
    if (!WRITE) {
      log('\n  Read-only run complete. Nothing was written.')
      log('  Confirm the tenant\'s code is in the protected file, then re-run with --write.')
      return
    }
    /*  The gate. Writes are impossible unless Q3 read the lock and produced a
     *  protected set — "we could not tell them apart" can never reach a delete. */
    if (!PROTECTED_DETAIL.length) stop('Q3 produced no protected set. Refusing to write.')
    const r = await q4_q8(lock)
    head('SUMMARY')
    log(JSON.stringify(r, null, 2))
  } finally {
    try { await api.close() } catch {}
  }
}

main().catch(e => {
  log('\n  ' + (e instanceof Stop ? 'STOPPED: ' : 'ERROR: ') + e.message)
  log('  Nothing further was attempted.')
  process.exit(1)
})
