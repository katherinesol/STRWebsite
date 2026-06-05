export type POI = {
  id: string
  name: string
  category: 'restaurant' | 'cafe' | 'transit' | 'grocery' | 'beach' | 'park' | 'attraction' | 'pharmacy'
  lat: number
  lng: number
  walkMins?: number
  driveMins?: number
  transitMins?: number
  note?: string
}

export type Property = {
  id: string
  name: string
  neighbourhood: string
  city: string
  tagline: string
  description: string
  areaDescription: string
  beds: number
  baths: number
  guests: number
  sqft?: number
  checkIn: string
  checkOut: string
  minStay: number
  nightly: number
  cleaningFee: number
  depositPercent: number
  amenities: string[]
  highlights: string[]
  houseRules: string[]
  faq: { q: string; a: string }[]
  icalUrls: { airbnb?: string; vrbo?: string; houfy?: string }
  airbnbUrl?: string
  vrboUrl?: string
  houfyUrl?: string
  parkingSpots: number
  earlyCheckinAvailable: boolean
  earliestCheckinTime: string
  latestCheckoutTime: string
  bagDropAvailable: boolean
  instacartAvailable: boolean
  instacartCutoffHours: number
  securityDeposit: number
  strRegistration?: string
  hst: number
  mat: number
  cancellationPolicy: 'moderate' | 'strict'
  paymentSchedule: { depositPercent: number; secondPercent: number; secondDaysBefore: number; finalDaysBefore: number }
  mapOffset?: { lat: number; lng: number }
  pois?: POI[]
}

export const PROPERTIES: Record<string, Property> = {
  'royal-york-east': {
    id: 'royal-york-east',
    name: 'Royal York East Suite',
    neighbourhood: 'Mimico',
    city: 'Toronto, ON',
    tagline: 'A beautifully appointed two-bedroom suite steps from the waterfront.',
    description: "The Royal York East Suite is a thoughtfully designed two-bedroom retreat in the heart of Mimico. Fully stocked kitchen, high-speed WiFi, in-suite laundry, and keyless entry. Everything you need — nothing you don't.",
    areaDescription: 'Mimico sits on the western waterfront of Toronto — walkable to the lake, Royal York GO Station, and a strong local dining scene. Easy access to downtown and the airport.',
    beds: 2, baths: 1, guests: 4,
    checkIn: '4:00 PM', checkOut: '11:00 AM', minStay: 2,
    nightly: 180, cleaningFee: 120, depositPercent: 10, securityDeposit: 500,
    amenities: ['High-speed WiFi', 'Fully stocked kitchen', 'In-suite washer & dryer', 'Keyless entry', 'Smart TV', 'Air conditioning', 'Heating', 'Iron & ironing board', 'Hair dryer', 'Workspace', 'Coffee maker', 'Dishwasher'],
    highlights: ['2 min walk to Royal York GO Station', '5 min walk to Lake Ontario waterfront', 'Steps from local cafés and restaurants', 'Easy airport access via GO or QEW'],
    houseRules: ['No smoking on premises', 'No parties or events', 'Pets considered on request', 'Quiet hours 10pm – 8am', 'Guests must be 25 or older to book'],
    faq: [
      { q: 'Is parking available?', a: 'One parking spot is included with this unit. Additional spots may be available on request.' },
      { q: 'Can I check in early?', a: "Early check-in from 1pm is available when the unit is ready. Request at booking and we'll confirm the day before." },
      { q: 'Is the suite suitable for infants?', a: 'Yes. A travel cot and high chair are available on request at no charge.' },
      { q: 'Can I book the East and West suite together?', a: "Absolutely — they're in the same building. Book both for groups up to 8 guests." },
    ],
    parkingSpots: 1, earlyCheckinAvailable: true, earliestCheckinTime: '10:00', latestCheckoutTime: '14:00', bagDropAvailable: true, instacartAvailable: true, instacartCutoffHours: 24,
    icalUrls: { airbnb: '', vrbo: '', houfy: '' },
    cancellationPolicy: 'moderate',
    paymentSchedule: { depositPercent: 10, secondPercent: 50, secondDaysBefore: 60, finalDaysBefore: 30 },
    hst: 0.13,
    mat: 0.06,
    mapOffset: { lat: 43.6213, lng: -79.5025 },
    pois: [
      { id: 'ry-go', name: 'Royal York GO Station', category: 'transit', lat: 43.6191, lng: -79.5027, walkMins: 3, driveMins: 1 },
      { id: 'lake', name: 'Lake Ontario Waterfront', category: 'beach', lat: 43.6143, lng: -79.5050, walkMins: 7, driveMins: 2 },
      { id: 'starbucks', name: 'Starbucks', category: 'cafe', lat: 43.6201, lng: -79.5012, walkMins: 5, driveMins: 2 },
      { id: 'farmboy', name: 'Farm Boy', category: 'grocery', lat: 43.6225, lng: -79.4988, walkMins: 8, driveMins: 3 },
      { id: 'pearson', name: 'Toronto Pearson Airport', category: 'attraction', lat: 43.6777, lng: -79.6248, driveMins: 18 },
      { id: 'downtown', name: 'Downtown Toronto', category: 'attraction', lat: 43.6532, lng: -79.3832, driveMins: 22, transitMins: 35 },
    ],
  },

  'royal-york-west': {
    id: 'royal-york-west',
    name: 'Royal York West Suite',
    neighbourhood: 'Mimico',
    city: 'Toronto, ON',
    tagline: 'Spacious, stylish, and steps from the waterfront.',
    description: "The Royal York West Suite mirrors its East counterpart in quality and design — a two-bedroom suite with everything thoughtfully stocked. In the same building as East, making it ideal for groups travelling together.",
    areaDescription: 'Mimico sits on the western waterfront of Toronto — walkable to the lake, Royal York GO Station, and a strong local dining scene. Easy access to downtown and the airport.',
    beds: 2, baths: 1, guests: 4,
    checkIn: '4:00 PM', checkOut: '11:00 AM', minStay: 2,
    nightly: 180, cleaningFee: 120, depositPercent: 10, securityDeposit: 500,
    amenities: ['High-speed WiFi', 'Fully stocked kitchen', 'In-suite washer & dryer', 'Keyless entry', 'Smart TV', 'Air conditioning', 'Heating', 'Iron & ironing board', 'Hair dryer', 'Workspace', 'Coffee maker', 'Dishwasher'],
    highlights: ['2 min walk to Royal York GO Station', '5 min walk to Lake Ontario waterfront', 'Same building as Royal York East', 'Easy airport access via GO or QEW'],
    houseRules: ['No smoking on premises', 'No parties or events', 'Pets considered on request', 'Quiet hours 10pm – 8am', 'Guests must be 25 or older to book'],
    faq: [
      { q: 'Is parking available?', a: 'One parking spot is included with this unit.' },
      { q: 'Can I check in early?', a: "Early check-in from 1pm is available when the unit is ready. Request at booking and we'll confirm the day before." },
      { q: 'Can I book East and West together?', a: "Yes — they're in the same building. Book both for groups up to 8 guests." },
    ],
    parkingSpots: 1, earlyCheckinAvailable: true, earliestCheckinTime: '10:00', latestCheckoutTime: '14:00', bagDropAvailable: true, instacartAvailable: true, instacartCutoffHours: 24,
    icalUrls: { airbnb: '', vrbo: '', houfy: '' },
    cancellationPolicy: 'moderate',
    paymentSchedule: { depositPercent: 10, secondPercent: 50, secondDaysBefore: 60, finalDaysBefore: 30 },
    hst: 0.13,
    mat: 0.06,
    mapOffset: { lat: 43.6210, lng: -79.5028 },
    pois: [
      { id: 'ry-go-w', name: 'Royal York GO Station', category: 'transit', lat: 43.6191, lng: -79.5027, walkMins: 3, driveMins: 1 },
      { id: 'lake-w', name: 'Lake Ontario Waterfront', category: 'beach', lat: 43.6143, lng: -79.5050, walkMins: 7, driveMins: 2 },
      { id: 'cafe-w', name: 'Starbucks', category: 'cafe', lat: 43.6201, lng: -79.5012, walkMins: 5, driveMins: 2 },
      { id: 'grocery-w', name: 'Farm Boy', category: 'grocery', lat: 43.6225, lng: -79.4988, walkMins: 8, driveMins: 3 },
      { id: 'pearson-w', name: 'Toronto Pearson Airport', category: 'attraction', lat: 43.6777, lng: -79.6248, driveMins: 18 },
      { id: 'downtown-w', name: 'Downtown Toronto', category: 'attraction', lat: 43.6532, lng: -79.3832, driveMins: 22, transitMins: 35 },
    ],
  },

  'nickel-beach': {
    id: 'nickel-beach',
    name: 'Nickel Beach Retreat',
    neighbourhood: 'Port Colborne',
    city: 'Niagara Region, ON',
    tagline: 'A four-bedroom beach house with private hot tub and sauna.',
    description: "Nickel Beach Retreat is a spacious four-bedroom house steps from the shore of Lake Erie. With a private hot tub, sauna, and fully equipped kitchen, it's built for groups who want to actually relax. Direct beach access, a private yard, and room for up to 10 guests.",
    areaDescription: 'Port Colborne sits at the southern end of the Welland Canal on Lake Erie. Nickel Beach is one of the finest freshwater beaches in Ontario — wide, sandy, and rarely crowded. The town has good local restaurants, a farmers market, and easy access to Niagara wine country.',
    beds: 4, baths: 2, guests: 10,
    checkIn: '4:00 PM', checkOut: '11:00 AM', minStay: 3,
    nightly: 320, cleaningFee: 250, depositPercent: 10, securityDeposit: 1000,
    amenities: ['High-speed WiFi', 'Fully stocked kitchen', 'Private hot tub', 'Private sauna', 'Direct beach access', 'BBQ grill', 'Private yard', 'In-unit washer & dryer', 'Smart TVs in all rooms', 'Keyless entry', 'Air conditioning', 'Heating', 'Parking for 4 vehicles', 'Board games & outdoor gear', 'Fire pit'],
    highlights: ['2 min walk to Nickel Beach', 'Private hot tub & sauna on property', 'Sleeps up to 10 guests comfortably', '90 min from Toronto', 'Close to Niagara wine country'],
    houseRules: ['No smoking indoors', 'No parties or amplified music after 10pm', 'Pets considered on request', 'Quiet hours 10pm – 8am', 'Guests must be 25 or older to book', 'Hot tub rules provided at check-in'],
    faq: [
      { q: 'How far is the beach?', a: 'Nickel Beach is a 2 minute walk from the property.' },
      { q: 'How many cars can park on site?', a: 'There is parking for up to 4 vehicles on the private driveway.' },
      { q: 'Is the hot tub heated year-round?', a: "Yes. The hot tub is maintained and heated year-round. The sauna is available on request — just let us know your arrival time." },
      { q: 'Is the property suitable for children?', a: 'Yes. The yard is fenced and the beach is family-friendly. A travel cot and high chair are available on request.' },
      { q: 'Can we have a bonfire?', a: 'Yes — there is a fire pit on the property. Please follow fire safety guidelines provided at check-in.' },
    ],
    parkingSpots: 4, earlyCheckinAvailable: true, earliestCheckinTime: '11:00', latestCheckoutTime: '14:00', bagDropAvailable: false, instacartAvailable: true, instacartCutoffHours: 48,
    icalUrls: { airbnb: '', vrbo: '', houfy: '' },
    cancellationPolicy: 'strict',
    paymentSchedule: { depositPercent: 10, secondPercent: 50, secondDaysBefore: 60, finalDaysBefore: 30 },
    hst: 0.13,
    mat: 0.04,
    mapOffset: { lat: 42.8712, lng: -79.2452 },
    pois: [
      { id: 'nb-beach', name: 'Nickel Beach', category: 'beach', lat: 42.8730, lng: -79.2477, walkMins: 2 },
      { id: 'nb-downtown', name: 'Port Colborne Downtown', category: 'attraction', lat: 42.8880, lng: -79.2522, driveMins: 5, walkMins: 18 },
      { id: 'nb-grocery', name: 'Metro Grocery', category: 'grocery', lat: 42.8901, lng: -79.2498, driveMins: 6 },
      { id: 'nb-niagara', name: 'Niagara-on-the-Lake', category: 'attraction', lat: 43.2553, lng: -79.0717, driveMins: 45 },
      { id: 'nb-falls', name: 'Niagara Falls', category: 'attraction', lat: 43.0896, lng: -79.0849, driveMins: 40 },
      { id: 'nb-canal', name: 'Welland Canal Parkway', category: 'park', lat: 42.8876, lng: -79.2476, walkMins: 20, driveMins: 5 },
    ],
  },
}

export function getProperty(id: string): Property | null {
  return PROPERTIES[id] || null
}

export function getAllProperties(): Property[] {
  return Object.values(PROPERTIES)
}
