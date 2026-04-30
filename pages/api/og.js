import { ImageResponse } from '@vercel/og';

const h = (type, props, ...children) => ({
  type,
  props: { ...props, children: children.length === 1 ? children[0] : children },
  key: null,
});

export default async function handler(req, res) {
  const element = h('div', {
    style: {
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: '#FFFFFF', padding: '72px',
    },
  },
    // Title block
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '44px' } },
      h('div', {
        style: {
          width: '10px', height: '72px', background: '#D4960A',
          borderRadius: '5px', flexShrink: 0,
        },
      }),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
        h('span', {
          style: { fontSize: '60px', fontWeight: 900, color: '#D4960A', letterSpacing: '-2px', lineHeight: 1 },
        }, 'O LIVRO AMARELO'),
        h('span', {
          style: { fontSize: '20px', color: '#999999', letterSpacing: '5px', textTransform: 'uppercase' },
        }, 'O Futuro é Glorioso'),
      ),
    ),
    // Divider
    h('div', { style: { height: '3px', background: '#D4960A', marginBottom: '44px' } }),
    // Description
    h('div', {
      style: { fontSize: '30px', color: '#333333', lineHeight: 1.55, flex: 1 },
    }, 'Explore as propostas do Livro Amarelo por meio de perguntas em linguagem natural. Respostas baseadas no documento, com citação de página.'),
    // Footer
    h('div', { style: { display: 'flex', justifyContent: 'flex-end' } },
      h('span', { style: { fontSize: '20px', color: '#444444', letterSpacing: '1px' } }, 'livroamarelo.com'),
    ),
  );

  const imageResponse = new ImageResponse(element, { width: 1200, height: 630 });
  const buffer = await imageResponse.arrayBuffer();
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
  res.send(Buffer.from(buffer));
}
