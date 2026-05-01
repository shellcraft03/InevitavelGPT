import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="pt-BR" data-scroll-behavior="smooth">
      <Head>
        <link rel="icon" href="/cover.png" />
        <link rel="apple-touch-icon" href="/cover.png" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
