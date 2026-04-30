import { ImageResponse } from '@vercel/og';

export default function handler() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#FFFFFF',
          padding: '72px',
        }}
      >
        {/* Title block */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '44px' }}>
          <div
            style={{
              width: '10px',
              height: '72px',
              background: '#D4960A',
              borderRadius: '5px',
              flexShrink: 0,
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span
              style={{
                fontSize: '60px',
                fontWeight: 900,
                color: '#D4960A',
                letterSpacing: '-2px',
                lineHeight: 1,
              }}
            >
              O LIVRO AMARELO
            </span>
            <span
              style={{
                fontSize: '20px',
                color: '#999999',
                letterSpacing: '5px',
                textTransform: 'uppercase',
              }}
            >
              O Futuro é Glorioso
            </span>
          </div>
        </div>

        {/* Yellow divider */}
        <div style={{ height: '3px', background: '#D4960A', marginBottom: '44px' }} />

        {/* Description */}
        <div
          style={{
            fontSize: '30px',
            color: '#333333',
            lineHeight: 1.55,
            flex: 1,
          }}
        >
          Explore as propostas do Livro Amarelo por meio de perguntas em linguagem natural.
          Respostas baseadas no documento, com citação de página.
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: '20px', color: '#444444', letterSpacing: '1px' }}>
            livroamarelo.com
          </span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
