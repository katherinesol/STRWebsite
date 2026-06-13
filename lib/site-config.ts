// ── single source of truth for brand + operational config ──
// Fill in values as they're decided. Components handle missing
// values gracefully (hidden or "coming soon" states).

export const siteConfig = {
  brand: {
    name: process.env.NEXT_PUBLIC_BRAND_NAME || '', // TBD — empty hides brand name, falls back to property names
    tagline: 'Thoughtfully designed. Fully stocked. Well situated.',
  },
  payments: {
    etransferEmail: process.env.ETRANSFER_EMAIL || '', // TBD
  },
  contact: {
    supportEmail: process.env.SUPPORT_EMAIL || '',
    phone: process.env.SUPPORT_PHONE || '',
  },
}

// per-property operational details — server-side only where sensitive
export const propertyConfig: Record<string, {
  wifiName: string | null
  wifiPassword: string | null
}> = {
  'royal-york-east': {
    wifiName: process.env.RY_EAST_WIFI_NAME || null,
    wifiPassword: process.env.RY_EAST_WIFI_PASSWORD || null,
  },
  'royal-york-west': {
    wifiName: process.env.RY_WEST_WIFI_NAME || null,
    wifiPassword: process.env.RY_WEST_WIFI_PASSWORD || null,
  },
  'nickel-beach': {
    wifiName: process.env.NICKEL_WIFI_NAME || null,
    wifiPassword: process.env.NICKEL_WIFI_PASSWORD || null,
  },
}
