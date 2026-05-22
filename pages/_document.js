import Document, { Html, Head, Main, NextScript } from 'next/document';

export default class MyDocument extends Document {
  static async getInitialProps(ctx) {
    const initialProps = await Document.getInitialProps(ctx);
    const nonce = ctx.req?.headers['x-nonce'] ?? '';
    return { ...initialProps, nonce };
  }

  render() {
    const { nonce } = this.props;
    return (
      <Html lang="pt-BR" data-scroll-behavior="smooth">
        <Head nonce={nonce}>
          <link rel="icon" href="/Imagem3.png" />
          <link rel="apple-touch-icon" href="/Imagem3.png" />
        </Head>
        <body>
          <Main />
          <NextScript nonce={nonce} />
        </body>
      </Html>
    );
  }
}
