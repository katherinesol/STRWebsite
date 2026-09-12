/*  The eight kinds of place, in one file, so the editor and the guest map agree.
 *
 *  The colours already existed twice — once in NeighbourhoodMap and once in its
 *  hover card — and a ninth category would have had to be added in both. Worse,
 *  an editor that drew its own pins would have quietly diverged from what the
 *  guest sees, so Katherine would be dragging a green dot that renders blue on
 *  the listing. One table, both readers.
 *
 *  ICONS, NOT JUST COLOUR. A row of coloured dots needs a legend to decode, and
 *  a legend is a thing to read rather than a thing to recognise. A cup, a train
 *  and a wave are recognisable at pin size without one — and colour alone fails
 *  anyone who cannot distinguish these hues, of which there are more than the
 *  eight-colour palette assumes.
 *
 *  The paths are inline SVG on a 24×24 box. No icon package: the map already
 *  carries mapbox-gl, and a dependency for eight glyphs is a poor trade. */

export const CATEGORIES = ['restaurant', 'cafe', 'transit', 'grocery', 'beach', 'park', 'attraction', 'pharmacy'] as const
export type Category = typeof CATEGORIES[number]

export const isCategory = (v: unknown): v is Category =>
  typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v)

type Meta = { label: string; colour: string; path: string }

export const CATEGORY: Record<Category, Meta> = {
  restaurant: { label: 'Restaurant', colour: '#B8956B',
    path: 'M7 2v7a2 2 0 0 0 2 2v11M7 2v7M5 2v7M9 2v7M17 2c-1.5 0-2 1.5-2 4s.5 5 2 5 2-2.5 2-5-.5-4-2-4Zm0 9v11' },
  cafe: { label: 'Café', colour: '#8B6B4A',
    path: 'M4 8h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Zm12 1h2a3 3 0 0 1 0 6h-2M6 2v3M10 2v3M14 2v3' },
  transit: { label: 'Transit', colour: '#3D6ECC',
    path: 'M6 3h12a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2Zm-2 6h16M8 13h.01M16 13h.01M8 17l-2 4M16 17l2 4' },
  grocery: { label: 'Grocery', colour: '#2ECC71',
    path: 'M2 3h3l2.6 11.6A2 2 0 0 0 9.5 16h8a2 2 0 0 0 1.9-1.4L21 7H6M10 20a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm9 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z' },
  beach: { label: 'Beach', colour: '#06AED5',
    path: 'M2 13c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2M2 18c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2M12 9a5 5 0 0 0-9 1h18a5 5 0 0 0-9-1Zm0 0V3' },
  park: { label: 'Park', colour: '#4CAF50',
    path: 'M12 2 7 10h3l-4 6h5v6h2v-6h5l-4-6h3L12 2Z' },
  attraction: { label: 'Attraction', colour: '#9B59B6',
    path: 'm12 2 3 6.5 7 .9-5.1 4.8 1.3 6.9L12 17.8 5.8 21.1l1.3-6.9L2 9.4l7-.9L12 2Z' },
  pharmacy: { label: 'Pharmacy', colour: '#E74C3C',
    path: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3Z' },
}

export const categoryColour = (c: string) => CATEGORY[c as Category]?.colour ?? '#888880'
export const categoryLabel = (c: string) => CATEGORY[c as Category]?.label ?? c
export const categoryPath = (c: string) => CATEGORY[c as Category]?.path ?? CATEGORY.attraction.path
