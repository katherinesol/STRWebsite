# 2026 reconciliation

Running ledger for the 2026 books. One item at a time: identified, verified
against the source, written through the proper path, shown before→after. The
source document is the truth — where stored figures disagree with a screenshot,
the screenshot wins and the difference is recorded here rather than smoothed
over.

---

## ⚠ THE JANUARY FINDING — the largest thing on this page

**No booking of any kind exists in the system before 2026-05-16.** Not one
platform booking, not one direct booking. The earliest row is Аня Землюк,
checking in 16 May. Everything from 1 January to 15 May 2026 — four and a half
months across three properties — is absent.

Two separate problems sit inside that gap, and they compound.

**1. Airbnb was not collecting accommodation tax before mid-May.** The specimen
is Brendan O'Hanlon, `HMW2S4PD4Q`, Nickel Beach, 23–25 January, 2 nights. His
guest receipt lists four lines: room $1,760.00, cleaning $340.00, guest service
fee $296.47, **occupancy taxes $38.54**, total $2,435.01. The host tab has no
tax line at all. By the rules the stay owes **MAT $70.40 + HST $282.15 =
$352.55**, and nothing was passed through, so that amount is out of pocket.

By contrast, every booking from 16 May onward carries Airbnb's full tax
computation. Something was switched on between 23 January and 16 May — most
likely the HST number being added to the listing.

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
of $282.15 is owed in full regardless, since nothing was passed through.

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

---

## Reconciled

| Date | Guest | Ref | Source | Result |
|---|---|---|---|---|
| 2026-01-23 | Brendan O'Hanlon | `HMW2S4PD4Q` | Airbnb receipt + Taxes table | written · payout delta 0.00 |
| 2026-05-16 | Аня Землюк | `HMEQAYQ348` | Airbnb, both tabs | written · payout delta 0.00 |
| 2026-05-28 | Molhem Taskie | `HME48C3PYR` | Airbnb, both tabs | written · payout delta 0.00 |

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

---

## Held — not written, waiting on a document or a decision

**Mary Weir** and **Jensen Yang** both store `taxes_collected` = 0.00. To be
confirmed as genuinely zero rather than a missing figure when reached.

**Per and Mikaela** stay at $0.00 by instruction. The flag is doing its job and
no amount is to be invented to clear it.

---

## Open

- **Enter 1 Jan – 15 May 2026.** The whole period, all three properties, from
  Airbnb/VRBO/Houfy records. Prerequisite for any 2026 total being trustworthy.
- **January tax sweep.** Total exposure for the pre-collection period, once
  those bookings exist.
- **You-earn misreads.** Lashley Winter $141.57, Jasmine Denham $22.75, Ziyue
  Jia $77.22 — Guest-paid tabs to come. Аня was a fourth, now corrected. After
  that, re-scan every Airbnb booking for the signature.
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
