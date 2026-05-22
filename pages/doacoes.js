import Head from 'next/head';
import { useDarkMode } from '../hooks/useDarkMode';
import Header from '../components/Header';
import ShareBar from '../components/ShareBar';

export default function Doacoes() {
  const [dark, toggleDark] = useDarkMode();
  const s = getStyles(dark);

  return (
    <>
      <Head>
        <title>Apoie o Projeto — o Livro Amarelo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div style={s.page}>
        <Header currentPage="doacoes" dark={dark} toggleDark={toggleDark} />

        <main style={s.main}>
          <div style={s.card}>
            <h1 style={s.title}>Apoie o Projeto</h1>

            <Section title="Por que apoiar?" s={s}>
              O acesso a esta plataforma é gratuito para todos e continuará sendo. Nenhum conteúdo
              está bloqueado por paywall — qualquer pessoa pode explorar o Livro Amarelo, acompanhar
              o Renan Responde e consultar o rastreador de sentimento eleitoral sem pagar nada.
              <p style={{ marginTop: '12px' }}>
                As doações cobrem os custos reais de manter o projeto no ar: servidores, APIs de
                inteligência artificial, banco de dados e o trabalho contínuo de desenvolvimento.
                Sem apoio financeiro, a manutenção e a evolução do site ficam comprometidas.
              </p>
            </Section>

            <Section title="Duas formas de apoiar" s={s}>
              Existem dois caminhos para fazer uma doação — cada um com características diferentes.
              Escolha o que faz mais sentido para você.
            </Section>
          </div>

          <div style={s.optionsRow}>
            <div style={{ ...s.optionCard, ...s.optionCardDirect }}>
              <div style={s.optionTag}>Sem cadastro</div>
              <h2 style={s.optionTitle}>Doação Direta via Livepix</h2>
              <p style={s.optionBody}>
                Doação pontual via Pix, sem necessidade de criar conta ou conectar qualquer perfil.
                Ideal para quem quer contribuir de forma simples, sem compromisso de uso do bot.
              </p>
              <ul style={s.optionList}>
                <li>Sem cadastro ou login</li>
                <li>Processado pelo Livepix via Pix</li>
                <li>Não gera créditos para o Bot X/Twitter</li>
              </ul>
              <a
                href="https://livepix.gg/inevitavelbot"
                target="_blank"
                rel="noopener noreferrer"
                style={s.btnPrimary}
              >
                Apoiar via Livepix ↗
              </a>
            </div>

            <div style={{ ...s.optionCard, ...s.optionCardBot }}>
              <div style={s.optionTag}>Com créditos bônus</div>
              <h2 style={s.optionTitle}>Doação pelo Bot X/Twitter</h2>
              <p style={s.optionBody}>
                Conecte sua conta X/Twitter, faça uma doação via Pix e receba créditos
                automaticamente. Os créditos permitem que o{' '}
                <strong>@Inevitavel_Bot</strong> responda às suas menções na X/Twitter com
                análises baseadas no Livro Amarelo e nas entrevistas do Renan Santos.
              </p>
              <ul style={s.optionList}>
                <li>Requer conexão da conta X/Twitter</li>
                <li>Cada real doado é convertido em créditos para fazer uma pergunta</li>
                <li>Créditos liberados automaticamente após o Pix</li>
                <li>Créditos são um bônus — não uma compra de serviço</li>
                <li>Saldo acima de R$&nbsp;10,00 em céditos remove o banner de apoio do site</li>
              </ul>
              <a href="/inevitavelgpt2" style={s.btnPrimary}>
                Acessar página do Bot X/Twitter
              </a>
            </div>
          </div>

          <div style={s.card}>
            <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Diferenças</th>
                    <th style={{ ...s.th, textAlign: 'center' }}>Doação Direta</th>
                    <th style={{ ...s.th, textAlign: 'center' }}>Bot X/Twitter</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={s.td}>Cadastro necessário</td>
                    <td style={{ ...s.td, ...s.tdCenter }}>Não</td>
                    <td style={{ ...s.td, ...s.tdCenter }}>Sim (conta X)</td>
                  </tr>
                  <tr>
                    <td style={s.td}>Processa via Pix</td>
                    <td style={{ ...s.td, ...s.tdCenter }}>Sim</td>
                    <td style={{ ...s.td, ...s.tdCenter }}>Sim</td>
                  </tr>
                  <tr>
                    <td style={s.td}>Créditos para o bot</td>
                    <td style={{ ...s.td, ...s.tdCenter }}>Não</td>
                    <td style={{ ...s.td, ...s.tdCenter }}>Sim</td>
                  </tr>
                  <tr>
                    <td style={s.td}>Dados pessoais coletados</td>
                    <td style={{ ...s.td, ...s.tdCenter }}>Nenhum</td>
                    <td style={{ ...s.td, ...s.tdCenter }}>Perfil público X</td>
                  </tr>
                </tbody>
              </table>

            <Section title="Privacidade e dados pessoais" s={s}>
              Em nenhuma das duas formas de doação o Livepix repassa dados pessoais do doador a este
              projeto. O processamento do Pix é feito integralmente pelo Livepix, e este site não
              tem acesso ao seu nome, CPF, e-mail ou qualquer dado bancário.
              <p style={{ marginTop: '12px' }}>
                Ao usar a opção do Bot X/Twitter, armazenamos apenas informações já públicas no
                seu perfil: ID da conta, @usuário, nome exibido e imagem de perfil — exatamente o
                que qualquer pessoa veria ao visitar sua página na plataforma.
              </p>
              <p style={{ marginTop: '12px' }}>
                O conteúdo das perguntas feitas ao bot e as respostas geradas{' '}
                <strong>não são armazenados</strong> por este site. A autorização da conta X pode
                ser revogada a qualquer momento em{' '}
                <a
                  href="https://x.com/settings/connected_apps"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={s.link}
                >
                  Aplicativos conectados da X/Twitter
                </a>.
              </p>
              <p style={{ marginTop: '12px' }}>
                Para mais detalhes, consulte a{' '}
                <a href="/privacidade" style={s.link}>Política de Privacidade</a>.
              </p>
            </Section>
          </div>

          <ShareBar />
        </main>
      </div>
    </>
  );
}

function Section({ title, children, s }) {
  return (
    <div style={s.section}>
      <h2 style={s.sectionTitle}>{title}</h2>
      <div style={s.sectionBody}>{children}</div>
    </div>
  );
}

function getStyles(dark) {
  const pageBg  = dark ? '#111111' : '#F2F2F2';
  const cardBg  = dark ? '#1A1A1A' : '#FFFFFF';
  const cardBdr = dark ? '#333333' : '#000000';
  const text1   = dark ? '#EEEEEE' : '#000000';
  const textBody = dark ? '#CCCCCC' : '#333333';
  const textDim = dark ? '#888888' : '#666666';
  const divider = dark ? '#2A2A2A' : '#EEEEEE';
  const tagBg   = dark ? '#2A2200' : '#FFF9E6';
  const tagText = dark ? '#FCBF22' : '#78350F';

  return {
    page: {
      minHeight: '100vh',
      background: pageBg,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    main: {
      maxWidth: '800px',
      width: '100%',
      margin: '0 auto',
      padding: '40px 24px 80px',
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
    },
    card: {
      background: cardBg,
      borderRadius: '12px',
      padding: '40px',
      border: `2px solid ${cardBdr}`,
      display: 'flex',
      flexDirection: 'column',
      gap: '32px',
    },
    optionsRow: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: '20px',
    },
    optionCard: {
      background: cardBg,
      borderRadius: '12px',
      padding: '28px',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
    },
    optionCardDirect: {
      border: `2px solid ${cardBdr}`,
    },
    optionCardBot: {
      border: '2px solid #FCBF22',
    },
    optionTag: {
      display: 'inline-block',
      alignSelf: 'flex-start',
      background: tagBg,
      color: tagText,
      fontSize: '0.72rem',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      padding: '3px 8px',
      borderRadius: '4px',
    },
    optionTitle: {
      fontSize: '1.2rem',
      fontWeight: 900,
      color: text1,
      lineHeight: 1.2,
    },
    optionBody: {
      fontSize: '0.9rem',
      color: textBody,
      lineHeight: 1.7,
    },
    optionList: {
      paddingLeft: '18px',
      margin: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      fontSize: '0.88rem',
      color: textBody,
      lineHeight: 1.5,
    },
    btnPrimary: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: '6px',
      background: '#FCBF22',
      color: '#000000',
      border: '2px solid #000000',
      borderRadius: '8px',
      padding: '10px 18px',
      fontSize: '0.9rem',
      fontWeight: 900,
      textDecoration: 'none',
      whiteSpace: 'nowrap',
    },
    title: {
      fontSize: 'clamp(1.6rem, 4vw, 2.2rem)',
      fontWeight: 900,
      color: text1,
      letterSpacing: 0,
      lineHeight: 1.1,
    },
    section: {
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
    },
    sectionTitle: {
      fontSize: '0.68rem',
      fontWeight: 700,
      color: text1,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
    },
    sectionBody: {
      fontSize: '0.95rem',
      color: textBody,
      lineHeight: 1.8,
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '0.88rem',
    },
    th: {
      textAlign: 'left',
      fontWeight: 700,
      color: text1,
      fontSize: '0.75rem',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      paddingBottom: '8px',
      borderBottom: `2px solid ${divider}`,
    },
    td: {
      color: textBody,
      padding: '8px 0',
      borderBottom: `1px solid ${divider}`,
      verticalAlign: 'middle',
    },
    tdCenter: {
      textAlign: 'center',
    },
    link: {
      color: dark ? '#FCBF22' : '#000000',
      textDecoration: 'underline',
      fontWeight: 600,
    },
    textDim: {
      color: textDim,
    },
  };
}
