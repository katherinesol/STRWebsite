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

**The mechanism is the booking date, and seven booking dates confirm it.**

| Booked | Guest | Stay | Tax |
|---|---|---|---|
| 2025-11-04 | Mary Weir | Jul 11–18 | **none** |
| 2026-01-31 | Marc Losier | Jun 4–7 | **none** |
| 2026-02-21 | Mark Vallena | Jun 12–14 | **none** |
| 2026-03-23 | Heremela Molla | Jun 15–22 | **none** |
| 2026-06-18 | Diana Balthasar | Aug 22–24 | 564.23 |
| 2026-08-06 | Stephanie Chow | Sep 18–20 | 355.10 |
| 2026-08-15 | Niki Hathaway | Sep 11–13 | 355.10 |

Sorted by booking date the split is clean, with no interleaving at all, while
sorted by stay date it is scattered — Mary stays in July untaxed, Аня in May
taxed. The stay date is ruled out; the reservation date decides.

**The switch happened between 23 March and 16 May 2026, and that is settled.**
The lower bound is Heremela, booked 23 March and untaxed. The upper bound needs
no further evidence: Аня's stay begins **16 May** and she is taxed, so she
reserved on or before that day and after the switch.

**No more work on pinning the date down.** Narrowing eight weeks to two would
change nothing owed — every booking in hand states its own tax status on its own
receipt, which is better evidence than any inference from a date. The mechanism
is confirmed; the exact day is not needed.

**The one place it earns its keep is the missing Jan–May reconstruction.** When
those bookings come out of the platform exports there will be no receipts to
read, and anything reserved before the cutoff can be treated as untaxed by
default — flagged in bulk rather than opened one at a time.

**But the cutoff is per listing, and using one date across the account would be
wrong.** Nickel Beach switched between 23 March and 16 May 2026. Royal York West
switched between **4 and 6 July 2026** — Jensen booked the 4th with no HST,
Lashley the 6th with the full amount. The listings were fixed independently, so
each property's reconstruction needs its own cutoff. Royal York East has not
been established at all and must not inherit either.

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

### Four ways the tax figures have been wrong

Every remaining booking should be checked against all four, because they look
nothing alike and only one of them looks obviously wrong. The first three are
storage errors — the figures were mis-recorded from a correct receipt. The
fourth is different in kind: the platform itself charged the wrong rate, so the
receipt is wrong too and no amount of care in reading it will help.

1. **Airbnb's formula stored as owed** — Myriam, Diana, Josh. The platform's own
   arithmetic on room + cleaning (+ pet fee) copied into `hst`/`mat` as though it
   were the liability.
2. **Backed out as tax-inclusive** — Mary, Erica. Room + cleaning divided by 1.17
   and the tax extracted from the result, as if the guest price already included
   it. Mary: `8124 ÷ 1.17 = 6943.59`, ×13% = 902.67 and ×4% = 277.74, matching
   her stored values exactly. Erica: `3120 ÷ 1.17 = 2666.67` → 346.67 and 106.67.
   This understates both taxes and is the least visible of the three.
3. **Null** — no figures at all, which at least cannot mislead a return.
4. **The platform charged the wrong rate outright** — a fault in what was
   *collected*, not in what was stored, so it survives any amount of care with
   the receipt. Dan Kovalcik was billed HST at **11% instead of 13%** ($67.54 is
   exactly 11% of $614) and MAT at **8.5% on a 4 August stay** after the city
   rate had fallen to 6%. Two wrong rates on one reservation. Robert Ma carries
   the same 11% note and has not yet been checked against his receipt. Where the
   platform under-charges, the shortfall is owed regardless — the guest was
   simply never asked for it.

What the first three miss is the same rule: MAT falls on the room alone, and
then sits *inside* the HST base.

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

## VRBO computes the tax correctly — no interpretation needed

After four different Airbnb formulas, VRBO simply gets it right. Its **"Lodging
taxes you remit"** matches `computeTaxSplit` on every reservation checked, with
only rounding between them:

| | VRBO says | the rules say | difference |
|---|---|---|---|
| Lyle Parkinson | 333.28 | 333.28 | 0.00 |
| Elizabeth Huckabone | 506.91 | 506.90 | 0.01 |
| Hala Kaeid | 531.26 | 531.26 | 0.00 |
| V. Litvinovitch | 738.27 | 738.25 | 0.02 |
| shawn robins | 419.13 | 419.13 | 0.00 |

MAT on the room alone, the discount applied before tax, MAT inside the HST base
— all of it, unprompted. **"Lodging taxes we remit"** is 13% of VRBO's own guest
service fee every time, which is the same component Airbnb buries inside a
single "Taxes" line but labelled honestly.

So a VRBO receipt needs no decoding: the two lines map straight onto
`taxes_you_remit` and `taxes_platform_remits`, and their sum is
`taxes_collected`. VRBO also charges a payment-processing fee, which Airbnb does
not; it belongs in the payout arithmetic and all five reconciled to 0.00 with it
included.

**The same tab misread exists here in VRBO clothing.** Four rows had
`taxes_collected` holding the *you remit* figure rather than the guest-paid
total — Hala 531.26 against a real 588.98, and the same shape on Elizabeth,
Viatcheslav and shawn. Hala's `guest_total` also read 3,651.26 against a receipt
of 4,152.98. All corrected.

**Lyle Parkinson straddles the tax year** — 30 Dec 2025 to 2 Jan 2026 — and is
recorded in **2026**, on the owner's instruction that the payout was received in
2026, with no split across years.

**shawn robins arrived with real contact details** — `shawnrobins19@hotmail.com`
and `+1 905-805-7083` — the first genuine ones in this reconciliation, so his
guest record needed no placeholder.

---

## Houfy — the third structure, and the simplest

Neither Airbnb's two-tab modal nor VRBO's itemised remittance. Houfy charges a
**single flat combined rate on room + cleaning**, takes no commission, adds no
guest service fee, and remits nothing: the host collects the whole amount and
owes the whole amount. So `taxes_collected` and `taxes_you_remit` are the same
number and `taxes_platform_remits` is always zero.

The rate is the two statutory rates added together, and it differs by city:

- **Nickel Beach — 17%** (Port Colborne MAT 4% + HST 13%)
- **Royal York West — 19%** (Toronto MAT 6% + HST 13%)

**It is consistently a little short, and always for the same reason.** A flat
combined rate applies both taxes to the same base, whereas the rules put MAT on
the room and then *inside* the HST base, so the HST is owed on a slightly larger
figure. The gap is small but systematic:

| | Houfy charged | rules say | short by |
|---|---|---|---|
| Samuel Séguin | 1,052.30 | 1,069.12 | 16.82 |
| Amanda Stanek | 151.13 | 155.75 | 4.62 |
| Laura Escobar | 89.11 | 88.09 | *over by 1.02* |

Laura's runs the other way because her stay falls after the Toronto MAT drop to
6% while Houfy still billed 19% — the same lateness Airbnb showed, in a
different form.

**Two Houfy rows had the owed figure stored in a facts column.** Amanda's
`taxes_you_remit` read 155.75 and Samuel's 1,069.12 — those are what the *rules*
say, written where what was *collected* belongs. Both corrected to the amounts
actually charged, with the owed figures now in `hst`/`mat` where they belong.

**houfyProtect is not host income.** It sits outside the guest's payment total —
Amanda's $7.00 was never paid at all, and Laura's $13.90 is Houfy's own charge
alongside her $558.11. Excluded from all figures.

**Houfy carries real guest contact details**, unlike Airbnb: Samuel, Amanda and
Laura all arrived with a genuine email and phone, so no placeholder addresses
were needed. Laura in fact matched an existing guest record *on email*.

### Samuel Séguin was paid in two deposits, and there is nowhere to record that

His stay was paid as **C$5,817.65 on 2026-02-16** and **C$1,424.65 on
2026-05-19**, both completed Stripe payments through Houfy, together the full
7,242.30. An earlier reading here treated the second as a refund — it was not,
the booking was never reduced, and the tax stands on the full 6,190 base as
billed.

The two deposits are recorded in the booking's `notes` with their Stripe payment
intent ids, because **`calendar_blocks` has no payment history**: one
`amount_paid` column and nothing that can hold two dated deposits. Direct
bookings have a three-instalment schedule; platform bookings have nothing. This
is the same gap as the missing account and reference fields on invoice payments
— a note is a stopgap, not a record that will reconcile against a bank
statement.

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
| 2025-12-30 | Lyle Parkinson | `HA-JDDR2B` | VRBO payment details | written · booked in 2026 |
| 2026-06-25 | Elizabeth Huckabone | `HA-Z9QCYD` | VRBO payment details | written · payout delta 0.00 |
| 2026-08-01 | Hala Kaeid | `HA-M9TW2S` | VRBO payment details | written · payout delta 0.00 |
| 2026-08-03 | V. Litvinovitch | `HA-FRD8WC` | VRBO payment details | written · payout delta 0.00 |
| 2026-10-10 | shawn robins | `HA-2Q1FHZ` | VRBO payment details | written · payout delta 0.00 |
| 2026-08-29 | Jerry Wei | `HMJH8F9TJA` | Airbnb, both tabs | written · payout delta 0.00 |
| 2026-09-01 | Aelita Sun | `HMY5M84238` | Airbnb, both tabs | written · payout delta 0.00 |
| 2026-09-04 | Ziyue Jia | `HM9SZYNXTQ` | Airbnb, both tabs | written · payout delta 0.00 |
| 2026-09-12 | Kevin Ronda | `HMQARQJSRT` | Airbnb, both tabs | written · payout delta 0.00 |
| 2026-09-25 | Amber Simmons | `HMB9XQTNSQ` | Airbnb, both tabs | written · payout delta 0.00 |
| 2026-10-02 | Claudine Krol | `HMWDW2C3P4` | Airbnb, both tabs | written · payout delta 0.00 |
| 2026-07-16 | Jensen Yang | `HMEB5JRC9H` | Airbnb, both tabs | written · payout delta 0.00 |
| 2026-07-30 | Lashley Winter | `HM2FM9ARZD` | Airbnb, both tabs | written · payout delta 0.00 |
| 2026-08-04 | Dan Kovalcik | `HMCKNS99E5` | Airbnb, both tabs | written · payout delta 0.00 |
| 2026-08-07 | Daniel Maximus | `HMSAHEMJ5F` | Airbnb, both tabs | written · payout delta 0.00 |
| 2026-08-08 | Jasmine Denham | `HMF4FTBNCD` | Airbnb, both tabs | written · payout delta 0.00 |
| 2026-08-10 | Brandon Lin | `HMT85MY93N` | Airbnb, both tabs | written · payout delta 0.00 |
| 2026-08-12 | Stéphane Gosselin | `HM4M5A4D2D` | Airbnb, both tabs | written · payout delta 0.00 |
| 2026-08-17 | Quentin Guerin | `HMH4PEXZZD` | Airbnb, both tabs | written · payout delta 0.00 |
| 2026-07-26 | Samuel Séguin | `TGYCYMY998` | Houfy reservation | written · two deposits |
| 2026-08-14 | Laura Escobar | `LSQUHDC829` | Houfy reservation | written · payout delta 0.00 |
| 2026-08-16 | Amanda Stanek | `IVMUYQF047` | Houfy reservation | written · payout delta 0.00 |

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

## Royal York West has its own switch date, two days wide

The tax switch is **per listing, not per account**. Nickel Beach turned on
somewhere between 23 March and 16 May 2026. Royal York West is pinned far
tighter: **Jensen Yang booked 4 July and no HST was passed through; Lashley
Winter booked 6 July and the full HST was.** Two days apart, same property. The
listings were fixed independently, so the missing Jan–May reconstruction has to
apply each property's own date, not one date across the account.

### Jensen Yang — a partial collection, not an absent one

His "$0.00" was never zero; it is **$125.56**, and it decomposes as MAT of
$103.27 (8.5% of room + cleaning) plus $22.30 of HST on Airbnb's guest service
fee. **Airbnb collected the MAT but no HST at all on the stay.** Owed is
$266.08, so the shortfall is **$140.52**. Every previous untaxed booking had
nothing but service-fee HST; this is a third state between fully taxed and
untaxed, and it means "untaxed" cannot be assumed to mean "no tax line at all"
when the Jan–May bookings are reconstructed. Both Mary Weir and Jensen Yang, the
two rows flagged as collecting $0.00, turned out to be recording errors rather
than genuinely zero.

### Dan Kovalcik was billed wrong twice on one reservation

His HST is **11%, not 13%** — $67.54 is exactly 11% of $614 — which confirms
from the source receipt the "charged 11%" note already sitting on his row. And
his MAT was charged at **8.5% for a stay on 4 August**, after the city rate fell
to 6%. Two independent Airbnb errors on one booking. Robert Ma carries the same
11% note and has not yet been checked against his receipt.

**Airbnb was late on the Toronto MAT drop, and inconsistently so.** The city
rate fell on 31 July 2026, yet the platform went on billing 8.5% well past it.
An earlier reading here — that it switched to 6% somewhere between bookings made
on 14 and 19 August — **is wrong**: Quentin Guerin booked on **10 August and was
charged 6%**, while Jerry (11 Aug), Kevin (13 Aug) and Amber (14 Aug) were all
charged 8.5%. So the two rates were being applied side by side and no clean rule
fits; it is not the booking date, the stay date, or the fee structure. Recorded
as an observed inconsistency rather than a mechanism.

Because Airbnb remits Toronto MAT itself, the over-collection sits between
Airbnb and the city rather than being money held here. What matters for these
books is only what is owed, which the endpoint computes from the correct rate
regardless of what was billed.

**"Did the platform collect tax" is not a yes-or-no question.** Three distinct
states have now been seen. Brendan and the other early Nickel Beach stays had
**nothing** — the only tax line was HST on Airbnb's own service fee. Jensen Yang
had a **partial collection**: MAT charged at 8.5% but **no HST at all** on the
stay, leaving $140.52 of the $266.08 owed uncollected. And the later bookings
were **fully taxed**. When the missing months are rebuilt, a booking showing
*some* tax cannot be assumed to have been taxed correctly — the uncollected
piece is still owed.

**All three You-earn misreads from the original list are now cleared** — Lashley
141.57 → 234.14, Jasmine 22.75 → 37.63, Ziyue 77.22 → 127.70 — along with Аня
and Myriam, found later. Five in total.

**Two receipt shapes worth remembering.** Daniel Maximus's bills as a flat
"Total Stay Price" of $64.45 with no cleaning line at all. And Brandon Lin and
Stéphane Gosselin have *identical* host-side figures — same room, cleaning,
adjustment and $389.18 payout — differing only in the guest service fee, so only
their guest totals separate them. That is the second such pair after Brendan
O'Hanlon and Mark Vallena, and both are easy to cross-file.

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

- **Host-fee percentage on every booking**, checked against its receipt. See the
  host-fee pattern above; a wrong percentage means a wrong payout.
- **Repair and replacement costs from Heremela's stay**, to sit against the
  $2,464.57 recovered.
- **Payment history for platform bookings.** There is no structure for it —
  Samuel's two Stripe deposits live in a free-text note. Belongs with the missing
  account and reference fields on invoice payments; all three are the same
  problem, which is that payments cannot be reconciled to a bank statement.
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
