// Light admin palette — extracted from the Keyholder design doc (turns 2–6).
//
// The existing admin has ~360 hardcoded dark backgrounds with no palette layer,
// which is why converting it screen-by-screen was expensive. Everything light
// goes through these tokens so the next screen costs almost nothing.
//
// Values are the doc's oklch, kept verbatim rather than converted to hex so the
// low-chroma warm neutrals stay exactly as designed.

export const L = {
  // surfaces
  page: 'oklch(0.977 0.005 85)',      // outer canvas, warm off-white
  card: '#fff',
  cardAlt: 'oklch(0.985 0.004 85)',   // table headers, zebra
  inkCard: 'oklch(0.25 0.01 60)',     // inverted card (the headline number)

  // lines
  line: 'oklch(0.91 0.005 80)',       // card borders
  lineSoft: 'oklch(0.945 0.004 80)',  // section dividers
  lineFaint: 'oklch(0.955 0.004 80)', // row separators

  // ink
  ink: 'oklch(0.25 0.01 60)',
  inkBody: 'oklch(0.48 0.01 60)',
  inkMuted: 'oklch(0.52 0.01 60)',
  inkFaint: 'oklch(0.58 0.02 60)',
  onInk: 'oklch(0.97 0.004 85)',      // text on the dark card
  onInkFaint: 'oklch(0.78 0.01 80)',

  // meaning
  gold: 'oklch(0.80 0.11 78)',
  red: 'oklch(0.48 0.16 28)',
  redLine: 'oklch(0.72 0.10 28 / 0.35)',
  redWash: 'oklch(0.988 0.008 30)',
  green: 'oklch(0.45 0.11 155)',
  amber: 'oklch(0.45 0.09 60)',
  amberWash: 'oklch(0.985 0.012 85)',
  amberLine: 'oklch(0.82 0.06 78)',
  link: 'oklch(0.45 0.09 250)',
} as const

// Keyholder rebrand faces, loaded in app/layout.tsx. The legacy /admin tree
// keeps Cormorant Garamond + DM Sans; nothing there changes.
export const F = {
  serif: 'var(--k-serif)',
  sans: 'var(--k-sans)',
  mono: 'var(--k-mono)',
} as const

/** Uppercase micro-label used above every figure in the doc. */
export const microLabel: React.CSSProperties = {
  fontFamily: F.mono,
  fontSize: '10px',
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: L.inkFaint,
}

export const cardStyle: React.CSSProperties = {
  background: L.card,
  border: `1px solid ${L.line}`,
  borderRadius: '16px',
}

export const money = (v: number | null | undefined): string =>
  v == null ? '—' : `$${Number(v).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Platform identity colours, lifted from the design doc (turn 4a).
 *  Direct is the Solhaus gold and takes DARK text; the other three take white. */
export const PLATFORM: Record<string, { bg: string; fg: string }> = {
  airbnb: { bg: 'oklch(0.58 0.19 22)',  fg: '#fff' },
  vrbo:   { bg: 'oklch(0.50 0.14 250)', fg: '#fff' },
  houfy:  { bg: 'oklch(0.52 0.06 200)', fg: '#fff' },
  direct: { bg: 'oklch(0.82 0.11 78)',  fg: 'oklch(0.28 0.05 70)' },
  manual: { bg: 'oklch(0.72 0.02 60)',  fg: '#fff' },
}
export const platformColour = (p?: string | null) =>
  PLATFORM[String(p || '').toLowerCase()] || PLATFORM.manual

/** The shell's page container. Lives here, not in each page, because for a
 *  while every keyholder screen invented its own gutter — 44px, 24px, or none
 *  at all — and Haussy, Tax and Invoices all ended up flush against the left
 *  edge. The nav bar spans full width but its CONTENTS use this same box, so
 *  the logo and the page title stay on one vertical line at any width. */
export const container: React.CSSProperties = {
  maxWidth: '1440px',
  margin: '0 auto',
  padding: '0 40px',
  width: '100%',
  boxSizing: 'border-box',
}
