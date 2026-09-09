'use client'

/*  The mobile bar. It used to scroll to the on-site booking widget; that widget
 *  and the checkout behind it are gone, so it now goes where booking actually
 *  happens. A property with no Houfy listing gets no button at all — Royal York
 *  East is not accepting bookings and the bar must not imply otherwise. */

export default function StickyBookingCTA({ propertyName, fromPrice, houfyUrl }: {
  propertyName: string
  fromPrice?: number | null
  houfyUrl?: string
}) {
  return (
    <div className="sticky-cta">
      <div>
        <div style={{ fontSize: '12px', color: '#F5F2EC', fontWeight: 500 }}>{propertyName}</div>
        {houfyUrl && fromPrice ? (
          <div style={{ fontSize: '11px', color: '#9A9A92' }}>From ${fromPrice}/night</div>
        ) : !houfyUrl ? (
          <div style={{ fontSize: '11px', color: '#9A9A92' }}>Not currently available</div>
        ) : null}
      </div>
      {houfyUrl ? (
        <a
          href={houfyUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: '13px 22px', minHeight: 'var(--tap-target)',
            display: 'flex', alignItems: 'center',
            background: 'var(--amber)', color: '#1A1A18',
            fontFamily: 'var(--sans)', fontSize: '12px', letterSpacing: '.1em',
            textTransform: 'uppercase', fontWeight: 500,
            whiteSpace: 'nowrap',
          }}>
          Book on Houfy
        </a>
      ) : null}
    </div>
  )
}
