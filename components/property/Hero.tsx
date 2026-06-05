export default function Hero() {
  return (
    <>
      <div style={{
        marginTop: '56px',
        minHeight: 'calc(100vh - 56px)',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        background: 'var(--linen)',
      }}>
        {/* left */}
        <div style={{
          display: 'flex', flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: 'clamp(32px, 6vw, 64px) clamp(20px, 5vw, 48px)',
        }}>
          <div style={{
            fontSize: '10px', fontWeight: 500, letterSpacing: '.16em',
            textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '18px',
            animation: 'fadeUp .6s ease both', animationDelay: '.1s',
          }}>
            Mimico & Niagara
          </div>
          <h1 style={{
            fontFamily: 'var(--serif)',
            fontSize: 'clamp(40px, 8vw, 80px)',
            fontWeight: 300, lineHeight: 1.05, letterSpacing: '-.02em',
            color: 'var(--noir)', marginBottom: '24px',
            animation: 'fadeUp .6s ease both', animationDelay: '.25s',
          }}>
            Stay with<br /><em>us.</em>
          </h1>
          <p style={{
            fontSize: 'clamp(13px, 2vw, 14px)', color: 'var(--muted)',
            lineHeight: 1.75, maxWidth: '360px', marginBottom: '40px',
            animation: 'fadeUp .6s ease both', animationDelay: '.4s',
          }}>
            <strong style={{ color: 'var(--noir)', fontWeight: 400 }}>
              Thoughtfully designed. Fully stocked. Well situated.
            </strong><br />
            A true home away from home.
          </p>
          <div style={{
            display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap',
            animation: 'fadeUp .6s ease both', animationDelay: '.55s',
          }}>
            <a href="#properties" style={{
              padding: '13px 28px', background: 'var(--noir)', color: 'var(--chalk)',
              fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase',
              borderRadius: '2px', border: 'none', display: 'inline-block',
              textDecoration: 'none',
            }}>
              Browse properties
            </a>
            <a href="#how" style={{
              fontSize: '11px', letterSpacing: '.08em', textTransform: 'uppercase',
              color: 'var(--noir)', borderBottom: '0.5px solid var(--noir)',
              paddingBottom: '2px', textDecoration: 'none',
            }}>
              How it works
            </a>
          </div>
        </div>

        {/* right — photo placeholder */}
        <div style={{
          position: 'relative', overflow: 'hidden', background: 'var(--sand)',
          minHeight: '300px',
        }}>
          <div style={{
            width: '100%', height: '100%', minHeight: '300px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{
              fontSize: '11px', letterSpacing: '.1em',
              textTransform: 'uppercase', color: 'var(--sand-mid)',
            }}>
              Hero property photo
            </span>
          </div>
          <div style={{
            position: 'absolute', bottom: '24px', left: '20px',
            background: 'rgba(250,250,248,.92)',
            border: '0.5px solid var(--sand)', padding: '12px 16px',
            backdropFilter: 'blur(8px)',
          }}>
            <div style={{
              fontFamily: 'var(--serif)', fontSize: '16px',
              fontWeight: 300, color: 'var(--noir)', marginBottom: '2px',
            }}>
              Royal York East Suite
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', letterSpacing: '.04em' }}>
              Mimico · Toronto · From $180/night
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
