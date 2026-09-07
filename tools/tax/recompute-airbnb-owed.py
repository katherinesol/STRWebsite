"""INDEPENDENT RE-DERIVATION. Written from the method, not from the earlier script.
Structure deliberately different: build explicit reservation records, compute each
in isolation, self-check every backed-out row reconstitutes the amount received."""
import csv, math
from datetime import date

def money(x):                      # half-up to the cent, no banker's rounding
    return math.floor(abs(x)*100 + 0.5)/100 * (1 if x >= 0 else -1)

def mdy(s):
    if not s: return None
    m,d,y = s.split('/'); return date(int(y), int(m), int(d))

HST = 0.13
def mat_rate(listing, stay):
    if listing.startswith('Nickel'): return 0.04          # Port Colborne, flat
    return 0.085 if stay < date(2026,7,31) else 0.06      # Toronto, dropped 31 Jul

# ── 1. collapse the CSV into one record per reservation ──────────────────────
book = {}
for r in csv.DictReader(open('ab.csv')):
    code = r['Confirmation Code']
    rec = book.setdefault(code, {'room':0.0,'clean':0.0,'through':0.0,
                                 'guest':r['Guest'],'listing':r['Listing'],
                                 'start':mdy(r['Start date']),'end':mdy(r['End date'])})
    amt = lambda k: float(r[k] or 0)
    if r['Type'] == 'Reservation':
        rec['room']  += amt('Gross earnings') - amt('Cleaning fee') - amt('Pet fee')
        rec['clean'] += amt('Cleaning fee') + amt('Pet fee')
    elif r['Type'] == 'Pass Through Tot':
        rec['through'] += amt('Amount')
        # NOTE: 'Airbnb remitted tax' is read nowhere. It is HST on Airbnb's own
        # guest service fee — Airbnb's liability, never a credit against ours.

# ── 2. compute each reservation on its own ───────────────────────────────────
cra = pc = tor = unsplit = 0.0
rows_backed, rows_short, checks = [], [], []
for code, b in sorted(book.items(), key=lambda kv: kv[1]['start']):
    room, clean = money(b['room']), money(b['clean'])
    received    = money(room + clean)
    collected   = money(b['through'])
    nights      = (b['end'] - b['start']).days
    rate        = 0.0 if nights > 29 else mat_rate(b['listing'], b['start'])
    toronto     = not b['listing'].startswith('Nickel')

    if collected == 0:
        # NEVER CHARGED → the amount received is the whole consideration and is
        # tax-inclusive. Solve: received = pre + MAT + HST, MAT on the room only
        # and inside the HST base.  received = pre x (1 + share x rate) x 1.13
        share = room/received if received else 0.0
        pre   = received / ((1 + share*rate) * (1 + HST))
        mat   = money(pre * share * rate)
        hst   = money((pre + mat) * HST)
        cra  += hst
        if toronto: tor += mat
        else:       pc  += mat
        rows_backed.append((code, b['guest'], received, hst, mat))
        checks.append((code, money(money(pre) + mat + hst), received))
    else:
        # CHARGED → tax sat on top. Owed by the rules; shortfall stays unsplit
        # because Airbnb's pass-through sometimes carries the MAT and sometimes
        # does not, and no rule fits.
        mat  = money(room * rate)
        hst  = money(money(room + clean + mat) * HST)
        gap  = money(mat + hst - collected)
        if gap > 0:
            unsplit += gap
            rows_short.append((code, b['guest'], money(mat+hst), collected, gap))

cra, pc, tor, unsplit = money(cra), money(pc), money(tor), money(unsplit)
total = money(cra + pc + tor + unsplit)

print("SELF-CHECK — every backed-out row must reconstitute the amount received")
bad = [c for c,a,b_ in checks if abs(a-b_) > 0.02]
for c,a,b_ in checks: print(f"   {c:<12}pre+MAT+HST {a:>9,.2f}   received {b_:>9,.2f}   {'ok' if abs(a-b_)<=0.02 else 'MISMATCH'}")
print(f"   {'all reconstitute:':<28}{not bad}\n")

print(f"{'reservation':<12}{'guest':<19}{'received':>10}{'HST':>10}{'MAT':>10}")
for c,g,rv,h,m in rows_backed: print(f"{c:<12}{g[:18]:<19}{rv:>10,.2f}{h:>10,.2f}{m:>10,.2f}")
print(f"\n{'reservation':<12}{'guest':<19}{'owed':>10}{'collected':>11}{'short':>9}")
for c,g,o,cl_,gp in rows_short: print(f"{c:<12}{g[:18]:<19}{o:>10,.2f}{cl_:>11,.2f}{gp:>9,.2f}")

print(f"\n   HST to CRA               {cra:>10,.2f}")
print(f"   MAT to Port Colborne     {pc:>10,.2f}")
print(f"   MAT to Toronto           {tor:>10,.2f}")
print(f"   unsplit                  {unsplit:>10,.2f}   ({len(rows_short)} rows)")
print(f"   {'TOTAL':<24}{total:>10,.2f}")
print(f"\n   against the recorded 4,121.83:  {'MATCH TO THE CENT' if abs(total-4121.83)<0.005 else f'DIFFERS by {money(total-4121.83):+,.2f}'}")
