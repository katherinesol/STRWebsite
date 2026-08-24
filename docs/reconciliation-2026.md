# 2026 reconciliation

Running ledger for the 2026 books. One item at a time: identified, verified
against the source, written through the proper path, shown before→after. The
source document is the truth — where stored figures disagree with a screenshot,
the screenshot wins and the difference is recorded here rather than smoothed
over.

---

## ⚠ THE TAX-COLLECTION GAP — the largest thing on this page

**No booking of any kind exists in the system before 2026-05-16.** Not one
platform booking, not one direct booking. The earliest row is Аня Землюк,
checking in 16 May. Everything from 1 January to 15 May 2026 — four and a half
months across three properties — is absent.

Two separate problems sit inside that gap, and they compound.

**1. Airbnb was not collecting accommodation tax on many bookings.** The specimen
is Brendan O'Hanlon, `HMW2S4PD4Q`, Nickel Beach, 23–25 January, 2 nights. His
guest receipt lists four lines: room $1,760.00, cleaning $340.00, guest service
fee $296.47, **occupancy taxes $38.54**, total $2,435.01. The host tab has no
tax line at all. By the rules the stay owes **MAT $70.40 + HST $282.15 =
$352.55**, and nothing was passed through, so that amount is out of pocket.

**It is not a date switch, and the first reading of this was wrong.** Sorted by
stay: Brendan (23 Jan) none, Аня (16 May) taxed, Molhem (28 May) taxed, Marc
(4 Jun) none, Mark (12 Jun) none, Heremela (15 Jun) none, Myriam (27 Jun) taxed.
On, then off for three weeks of June, then on again. No switch-on date explains
that.

**The mechanism is the booking date, and four booking dates now confirm it.**
Mary Weir stays 11–18 July — two months after Аня's taxed May stay — and is
untaxed, because she booked on **4 November 2025**. Diana booked 18 June 2026,
Stephanie 6 August, Niki 15 August; all three are taxed. Everything reserved in
2025 is untaxed, everything reserved from June 2026 is taxed, which rules out
the stay date entirely. **The switch sits between 4 Nov 2025 and 18 Jun 2026**
and would be narrowed by a booking date on Marc, Mark or Heremela.

**So the sweep is every Airbnb booking for the year, ordered by booking date —
not a pre-May window.** The exposure has no upper bound in stay date: a stay
months out, reserved early, is exposed in exactly the same way. Untaxed so far —
Brendan $352.55, Marc $486.40, Mark $352.55, Heremela $985.51 — **$2,177.01 owed
against $234.49 collected, $1,942.52 out of pocket**, from seven bookings
examined.

**2. The exposure cannot be measured from this database, because the bookings
are not in it.** The sweep has to come off Airbnb's side — the transaction
history and tax documents for the period — and then the missing months have to
be entered. Until that happens the 2026 income and MAT figures are incomplete by
an unknown amount, not merely inaccurate.

**Resolved on the document, not the arithmetic.** Airbnb's Taxes table for the
period shows Nickel Beach with withheld $0.00, pass-through $0.00, host-remitted
$0.00 and **Airbnb remitted $38.54** — the jurisdiction-remittance column,
described by Airbnb as "automatically collected and paid on the host's behalf in
certain jurisdictions. Includes VAT/GST and occupancy tax on supply." The
pass-through column being zero also dates the table to before 16 May, since Аня
and Molhem passed through $323.68 and $719.44. So the $38.54 is occupancy tax
Airbnb remitted, and the exact coincidence with 13% of the guest service fee
($296.47 × 13% = $38.54) is set aside — the remittance table is the source, the
decomposition was only a match.

### MAT credit to confirm at filing

**The one thing this leaves open, and it is a filing decision, not a data one.**
Brendan's booking record is correct either way — nothing in it changes on this
question. What changes is the Port Colborne MAT return:

- If Port Colborne already received the **$38.54**, the remaining MAT owed on
  the stay is **$31.86**.
- If it did not, the full **$70.40** is owed.

To be settled from Airbnb's by-jurisdiction tax document at filing time. The HST
is owed in full regardless, since nothing was passed through.

**This now applies to four bookings, not one.** Every untaxed stay shows the same
line, and in each case it equals 13% of Airbnb's guest service fee to the cent:
Brendan $38.54, Marc $52.56, Mark $38.54, Heremela $104.85 — **$234.49** of
potential MAT credit riding on the same question.

---

## ⚠ THE HOST-FEE PATTERN — wrong payouts, therefore misstated income

Airbnb runs **two host-fee structures**, and storing the wrong one corrupts the
payout, which is the income figure itself rather than a tax detail.

- **3.0%**, charged on room + cleaning, with the guest paying a separate service
  fee on top.
- **15.5%**, with the **guest service fee at $0.00** — the host absorbs it.

Josh Klein was stored at 3%. Airbnb charged 15.5%. His payout read **$4,850.60**
where the real figure is **$4,316.85** — the arithmetic is exact, `3840 + 430 +
708.70 − 128.10 = 4850.60`, using a $128.10 fee in place of the actual $661.85.
**The system overstated money received by $533.75 on one booking.** His
`guest_total` was also short by exactly $473.54, the "Airbnb extended
cancellation" line the guest paid and Airbnb kept. Both corrected.

**Treat this as a pattern, not an incident.** Any booking whose stored
`host_service_fee_pct` does not match what Airbnb actually charged has a wrong
payout and therefore misstates income. Every remaining booking needs its fee
percentage checked against its receipt — the default of 3 sits in the schema, so
a 15.5% booking that nobody corrected will look normal.

---

## How Airbnb's tax lines decompose

Established from three receipts and confirmed to the cent on each.

**Nickel Beach (Port Colborne, MAT 4%).** Airbnb passes the accommodation tax
through to the host:

    you-earn "Taxes"  =  4% × (room + cleaning)  +  13% × (room + cleaning)

    Аня     1904 × 4% = 76.16  +  1904 × 13% = 247.52  =  323.68  ✓
    Molhem  4232 × 4% = 169.28 +  4232 × 13% = 550.16  =  719.44  ✓

**The guest pays that plus HST on Airbnb's own service fee**, which Airbnb keeps
and remits itself:

    guest-paid "Taxes"  =  you-earn "Taxes"  +  13% × guest service fee

    Аня     323.68 + (268.80 × 13% = 34.94)  =  358.62  ✓
    Molhem  719.44 + (597.46 × 13% = 77.67)  =  797.11  ✓

Two consequences worth holding on to. Airbnb bills **MAT on room + cleaning**
and **excludes MAT from the HST base** — neither matches the rules, which put
MAT on room only and inside the HST base. That is why collected and owed differ
on every booking, and why `hst`/`mat` are always computed here rather than
copied. And on Toronto listings the split differs again: Airbnb remits the MAT
itself, so only the HST is passed through. Nickel Beach passes both.

**The two-tab trap.** Both tabs of the earnings modal are labelled "Taxes".
`taxes_collected` is always the **Guest paid** figure. Taking the host figure
understates the collection — four rows have been found with that misread so far.

### Three ways stored hst/mat have been wrong

Every remaining booking should be checked against all three, because they look
nothing alike and only one of them looks obviously wrong.

1. **Airbnb's formula stored as owed** — Myriam, Diana, Josh. The platform's own
   arithmetic on room + cleaning (+ pet fee) copied into `hst`/`mat` as though it
   were the liability.
2. **Backed out as tax-inclusive** — Mary, Erica. Room + cleaning divided by 1.17
   and the tax extracted from the result, as if the guest price already included
   it. Mary: `8124 ÷ 1.17 = 6943.59`, ×13% = 902.67 and ×4% = 277.74, matching
   her stored values exactly. Erica: `3120 ÷ 1.17 = 2666.67` → 346.67 and 106.67.
   This understates both taxes and is the least visible of the three.
3. **Null** — no figures at all, which at least cannot mislead a return.

The rule they all miss is the same: MAT falls on the room alone, and then sits
*inside* the HST base.

### Airbnb corrected its own MAT base mid-year

Early bookings bill MAT on **room + cleaning** (Аня, Molhem, Myriam, Diana);
later ones bill it on **room only** (Josh, Niki, Stephanie), which is what the
rules actually say. Diana booked 18 June under the old base, Stephanie 6 August
and Niki 15 August under the new one — so this tracks the booking date too, and
newer bookings agree with us more closely.

One oddity: **Stephanie's guest-paid tax equals her host tax exactly** ($355.10)
despite a $349.37 guest service fee, so no HST was charged on that fee — unlike
every other 3% booking, where the difference is precisely 13% of it. Her
`taxes_platform_remits` is therefore zero.

---

## Reconciled

| Date | Guest | Ref | Source | Result |
|---|---|---|---|---|
| 2026-01-23 | Brendan O'Hanlon | `HMW2S4PD4Q` | Airbnb receipt + Taxes table | written · payout delta 0.00 |
| 2026-05-16 | Аня Землюк | `HMEQAYQ348` | Airbnb, both tabs | written · payout delta 0.00 |
| 2026-05-28 | Molhem Taskie | `HME48C3PYR` | Airbnb, both tabs | written · payout delta 0.00 |
| 2026-06-04 | Marc Losier | `HMPRTJSBFE` | Airbnb, both tabs | written · payout delta 0.00 |
| 2026-06-12 | Mark Vallena | `HMYS5WCHCF` | Airbnb, both tabs | written · payout delta 0.00 |
| 2026-06-15 | Heremela Molla | `HMHC9JF4XE` | Airbnb, both tabs | written · payout delta 0.00 |
| 2026-06-27 | Myriam Donaldson | `HMSAD5M5JC` | Airbnb, both tabs | written · payout delta 0.00 |
| 2026-07-11 | Mary Weir | `HMZHBMRCKX` | Airbnb, both tabs | written · payout delta 0.00 |
| 2026-07-24 | Erica Yu | `HMBJNAZS4N` | Airbnb, both tabs | written · payout delta 0.00 |
| 2026-08-18 | Josh Klein | `HMYSXQHJWP` | Airbnb, both tabs | written · payout corrected |
| 2026-08-22 | Diana Balthasar | `HM9CBB93YM` | Airbnb, both tabs | written · payout delta 0.00 |
| 2026-09-11 | Niki Hathaway | `HMRYR2KMDH` | Airbnb, both tabs | written · payout delta 0.00 |
| 2026-09-18 | Stephanie Chow | `HMJ9N9SKQT` | Airbnb, both tabs | written · payout delta 0.00 |

**Brendan O'Hanlon** — Nickel Beach, 23–25 January, 2 nights. Not in the system;
shell row created through the conflict-checked block route (no conflicts), then
figures. The earliest booking now on record.

| | before | after |
|---|---|---|
| `is_booking` | false | **true** |
| room / cleaning | — | 1,760.00 / 340.00 |
| `taxes_collected` | — | 38.54 |
| `taxes_you_remit` | — | 0.00 |
| `taxes_platform_remits` | — | 38.54 |
| `hst` / `mat` | — / — | 282.15 / 70.40 |
| `guest_total` | — | 2,435.01 |

Owed 352.55, collected 38.54, **under by 314.01** — the January shortfall in a
single row. Payout 2,037.00 computed and given. Guest record created and linked;
Airbnb supplies no address, so the email is left null rather than fabricated.

**Аня Землюк** — Nickel Beach, 16–18 May, 2 nights. Row already existed with a
You-earn misread; corrected.

| | before | after |
|---|---|---|
| `taxes_collected` | 323.68 *(You-earn)* | **358.62** *(Guest paid)* |
| `taxes_you_remit` | — | 323.68 |
| `taxes_platform_remits` | — | 34.94 |
| `hst` / `mat` | — / — | 255.65 / 62.56 |
| `guest_total` | — | 2,531.42 |
| `guest_name` | Аня | Аня Землюк |

Owed 318.21, collected 358.62, **over by 40.41**. Payout 2,170.56 computed and
given. Guest already linked.

**Molhem Taskie** — Nickel Beach, 28 May – 2 June, 5 nights. The two guest
records were merged after this was written (survivor `93612632`, absorbed
`52b6e35a`, audit row `843e2cf8`); the fabricated `@platform.noemail` address
was dropped rather than carried over, and the vrbo note was kept. Not in the system;
shell row created through the conflict-checked block route (no conflicts), then
figures.

| | before | after |
|---|---|---|
| `is_booking` | false | **true** |
| room / cleaning | — | 3,892.00 / 340.00 |
| `taxes_collected` | — | 797.11 |
| `taxes_you_remit` | — | 719.44 |
| `taxes_platform_remits` | — | 77.67 |
| `hst` / `mat` | — / — | 570.40 / 155.68 |
| `guest_total` | — | 5,626.57 |

Owed 726.08, collected 797.11, **over by 71.03**. Payout 4,824.48 computed and
given. Linked to `93612632` (Molhem Taskie).


**Marc Losier** — 4–7 June, 3 nights. Untaxed. Room 2,524.00, cleaning 340.00,
collected 52.56 against 486.40 owed, **under by 433.84**.

**Mark Vallena** — 12–14 June, 2 nights. Untaxed. Collected 38.54 against 352.55
owed, **under by 314.01**. Two notes on this row. Its figures are *identical* to
Brendan's — same 2 nights at $880, same $340 cleaning, so the same $2,037.00
payout, $2,435.01 guest total and $38.54 tax. Different people, and an obvious
cross-filing risk. And the `guests` record is still named just "Mark" while the
booking now reads Mark Vallena, because there is no path to edit a guest's name;
see the backlog.

**A stored `extras` of $100.00 was removed from Mark's booking.** It is not on
the Airbnb receipt and the host fee proves it: $63.00 is exactly 3% of $2,100,
room plus cleaning and nothing more. The money is real, though — the Resolution
Centre shows *"Mark paid you $100 CAD · Extra services · Additional guests fee ·
Completed"*. It is income, it is not part of this booking's payout, and it is
recorded under *Resolution Centre* below rather than being deleted.

**Heremela Molla** — 15–22 June, 7 nights. Untaxed, and the largest single
shortfall: collected 104.85 against **985.51** owed, **under by 880.66**. Room
6,716.00 less a 1,343.20 nightly-rate adjustment, so MAT and HST are computed on
the net 5,372.80.

**Myriam Donaldson** — 27–29 June, 2 nights, with a $199.00 pet fee as taxable
extras. Taxed. Collected 625.14 against 557.13 owed, over by 68.01.

**Myriam is a new failure mode, and worse than the tab misread.** Three separate
errors sat on that one row. `taxes_collected` held 564.23, the You-earn figure —
the fifth instance of the tab misread. `guest_total` held 3,883.23 against a
receipt of 4,412.71. And `hst` 431.47 with `mat` 132.76 were **Airbnb's own
formula stored as though it were what is owed** — 13% and 4% of room + cleaning
+ pet fee. The rules give 445.93 and 111.20, because MAT falls on the room alone
and then sits inside the HST base. That is not a misread tab; it is the
platform's arithmetic substituted for the legislation, and it would have flowed
straight into a MAT return. Worth scanning for elsewhere.

---

## Held — not written, waiting on a document or a decision

**Mary Weir** and **Jensen Yang** both store `taxes_collected` = 0.00. To be
confirmed as genuinely zero rather than a missing figure when reached.

**Per and Mikaela** stay at $0.00 by instruction. The flag is doing its job and
no amount is to be invented to clear it.

---

## Resolution Centre — money outside the booking receipts

Payments that never appear on an earnings modal, so nothing in the reconciliation
above sees them. All Nickel Beach.

| Ref | Who | Amount | Reason | Status |
|---|---|---|---|---|
| `HMW2S4PD4Q` | Brendan | requested **$175.00** | Extra services | Closed |
| `HMYS5WCHCF` | Mark | **$100.00 paid** | Extra services — additional guests fee | Completed |
| `HMHC9JF4XE` | Heremela | requested **$2,028.95** | Damage, missing items, unexpected cleaning | Closed |
| `HMHC9JF4XE` | Airbnb | **$352.30 sent** | Payment from Airbnb | — |

Brendan's $175 still needs its outcome confirmed — "Closed" does not say whether
he paid. Mark's $100 is confirmed received. Heremela's is settled and much
larger than it first appeared; see below.

### Heremela — $2,464.57 received, none of it recorded

The earlier reading that $352.30 was a partial settlement was wrong. There were
**three separate payouts**, all to Katherine Sollbach, Checking 0377 (CAD):

| Sent | Amount | Resolution | Payout ID |
|---|---|---|---|
| 2026-08-05 | $586.77 | CLSF-06099978 | `G-O7IFKBHGEBBH4` |
| 2026-08-06 | $352.30 | 17852536118667 | `G-IE5XF66NLZJW2` |
| 2026-08-19 | $1,525.50 | CLSF-06099978 | `G-NIWJBBSNU6IIT` |
| | **$2,464.57** | | |

`17852536118667` is a wholly separate resolution, not part of the damage claim.
`CLSF-06099978` was paid in two instalments totalling **$2,112.27** against a
request of **$2,028.95** — **$83.32 more than was asked for**, which is worth
querying with Airbnb rather than assuming in your favour.

**All three are unrecorded income sitting in a bank account.** They need
entering against Checking 0377 so they reconcile to the statement, and the
repair and replacement costs Heremela's stay caused need entering on the other
side so the net is visible.

**Damage recovery — confirm bookkeeping treatment with the accountant.** There
are two defensible treatments and this ledger does not choose between them:
recovery recorded as income with the repairs as ordinary expenses, or the
recovery applied as an offset that reduces the repair expense, with only the net
hitting the books. The tax consequences differ. What is recorded here are the
facts — money in, dated, with payout references; costs out; and the net — and
the classification is the accountant's call.

Then the classification question, which is genuinely open: an additional-guests
fee is accommodation revenue and would ordinarily attract HST and MAT, whereas a
damage recovery is not revenue at all — it restores a loss and is normally
outside the tax base. Airbnb collected no tax on any of them. None of these are
recorded in the system yet.

---

## Open

- **Booking dates for Marc Losier, Mark Vallena and Heremela Molla** — the three
  untaxed June stays. These would narrow the tax switch from the current window
  of 4 Nov 2025 – 18 Jun 2026. They are only on Airbnb, so they have to be read
  off the reservation pages.
- **Host-fee percentage on every booking**, checked against its receipt. See the
  host-fee pattern above; a wrong percentage means a wrong payout.
- **Repair and replacement costs from Heremela's stay**, to sit against the
  $2,464.57 recovered.
- **Enter 1 Jan – 15 May 2026.** The whole period, all three properties, from
  Airbnb/VRBO/Houfy records. Prerequisite for any 2026 total being trustworthy.
- **Full-year tax sweep by booking date.** Total exposure across every Airbnb
  reservation, not a date window.
- **You-earn misreads.** Lashley Winter $141.57, Jasmine Denham $22.75, Ziyue
  Jia $77.22 — Guest-paid tabs to come. Аня was a fourth and Myriam a fifth, both
  corrected. Re-scan every Airbnb booking for both signatures now: the tab
  misread, and Airbnb's formula stored as owed.
- **Stephanie Chow's row was already in the system**, synced from Airbnb on
  2026-08-07 with `is_booking=false` and no name — the conflict check caught it
  before a duplicate was created. A live specimen of the sweep-blindness gap in
  the lock backlog.
- **Elizabeth Huckabone** `2026-06-25`, `HA-Z9QCYD` — `taxes_collected` 506.91
  and `taxes_platform_remits` 54.34 with `hst`/`mat` null. Needs its receipt.
- **Erica Yu** `2026-07-24` — queued for her receipt. Stores 453.34 where
  Airbnb's formula gives 530.40 on those figures, and 405.60 would be plain 13%
  on room + cleaning. It is neither a clean You-earn nor a clean Guest-paid
  number, which makes it a third kind of wrong from the two already catalogued,
  and worth understanding rather than just correcting.
- **Molhem's VRBO trace.** The survivor's note reads "Added from vrbo — no email
  on file", yet the owner confirms the Airbnb stay is his only one. So the note
  is either a mislabelled import or a pointer to a VRBO booking in the missing
  months. It is kept deliberately rather than tidied away, to be checked when
  Jan–May is entered.
