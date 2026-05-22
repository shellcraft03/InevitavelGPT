import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useDarkMode } from '../hooks/useDarkMode';
import Header from '../components/Header';

const WEIGHTS = { polymarket: 80, rss: 10, twitter: 10 };
const FONTE_LABEL = { polymarket: 'Polymarket', rss: 'Notícias', twitter: 'X/Twitter' };

function sourceAvgScoreDetailed(fonte, rows) {
  const adj = [], raw = [], conf = [];
  for (const r of (rows || []).slice(0, 7)) {
    if ((fonte === 'rss' || fonte === 'twitter') && r.positivo != null && r.negativo != null) {
      const rawVal = (Number(r.positivo) - Number(r.negativo) + 100) / 2;
      const confVal = Math.min((Number(r.volume) || 0) / 30, 1);
      adj.push(50 + (rawVal - 50) * confVal);
      raw.push(rawVal);
      conf.push(confVal);
    } else if (fonte === 'polymarket' && r.odds != null) {
      adj.push(Number(r.odds) * 100);
    }
  }
  if (!adj.length) return null;
  const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  return {
    score:      avg(adj),
    raw:        raw.length  ? avg(raw)  : null,
    confidence: conf.length ? avg(conf) : null,
  };
}

function calcDetailed(slug, sentimento) {
  let weightedSum = 0;
  let totalWeight = 0;
  const sources = [];
  for (const [fonte, weight] of Object.entries(WEIGHTS)) {
    const detail = sourceAvgScoreDetailed(fonte, sentimento?.[slug]?.[fonte]);
    sources.push({ fonte, weight, score: detail?.score ?? null, raw: detail?.raw ?? null, confidence: detail?.confidence ?? null });
    if (detail?.score != null) { weightedSum += detail.score * weight; totalWeight += weight; }
  }
  return {
    sources,
    weightedSum,
    totalWeight,
    final: totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null,
  };
}

export default function MetodologiaSentimento() {
  const [dark, toggleDark] = useDarkMode();
  const s = getStyles(dark);

  const [demoData, setDemoData]       = useState(null);
  const [loadingDemo, setLoadingDemo] = useState(true);

  useEffect(() => {
    fetch('/api/sentimento')
      .then(r => r.json())
      .then(d => {
        const num = v => (v == null ? null : Number(v));
        const sent = {};
        for (const [slug, fontes] of Object.entries(d.sentimento || {})) {
          sent[slug] = {};
          for (const [f, rows] of Object.entries(fontes)) {
            sent[slug][f] = rows.map(r => ({
              ...r,
              positivo: num(r.positivo),
              neutro:   num(r.neutro),
              negativo: num(r.negativo),
              odds:     num(r.odds),
              volume:   num(r.volume),
            }));
          }
        }
        setDemoData({ candidatos: d.candidatos || [], sentimento: sent });
        setLoadingDemo(false);
      })
      .catch(() => setLoadingDemo(false));
  }, []);

  return (
    <>
      <Head>
        <title>Metodologia — Sentimento Eleitoral 2026</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div style={s.page}>
        <Header currentPage="sentimento" dark={dark} toggleDark={toggleDark} />

        <main style={s.main}>

          <div style={s.card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <h1 style={s.title}>Metodologia</h1>
              <Link href="/sentimento" style={s.backLink}>← Voltar</Link>
            </div>
            <Link href="/noticias-sentimento" style={s.btnNoticias}>
              Ver notícias analisadas →
            </Link>
            <p style={s.desc}>
              Como os dados de sentimento eleitoral são coletados, processados e combinados
              para gerar a pontuação geral dos candidatos.
            </p>
          </div>

          <div style={s.card}>
            <h2 style={s.sectionTitle}>Fontes de dados</h2>

            <div style={s.sourceBlock}>
              <div style={s.sourceHeader}>
                <span style={s.sourceName}>Polymarket</span>
                <span style={{ ...s.badge, borderColor: '#FCBF22', color: '#FCBF22' }}>Peso 80%</span>
              </div>
              <p style={s.sourceDesc}>
                Mercado de predição descentralizado. Os preços refletem a probabilidade
                implícita de vitória de cada candidato, estimada por apostadores reais com
                dinheiro em jogo. É a fonte considerada mais confiável por capturar
                expectativas agregadas do mercado.
              </p>
              <p style={s.sourceDesc}>
                Dados coletados via API pública do Polymarket (Gamma API), atualizados a cada hora.
              </p>
            </div>

            <div style={s.sourceBlock}>
              <div style={s.sourceHeader}>
                <span style={s.sourceName}>X/Twitter</span>
                <span style={{ ...s.badge, borderColor: '#1D9BF0', color: '#1D9BF0' }}>Peso 10%</span>
              </div>
              <p style={s.sourceDesc}>
                Análise de sentimento de tweets recentes por candidato, coletados via API
                oficial do X (Twitter API v2, busca recente). Os tweets são filtrados por
                idioma português e excluem retweets.
              </p>
              <p style={s.sourceDesc}>
                Coletado 3 vezes ao dia (9h, 12h e 15h, horário de Brasília), buscando apenas
                tweets novos desde a coleta anterior. Os resultados acumulam ao longo do dia —
                até 30 tweets por candidato. Antes do primeiro run do dia, a métrica do dia
                anterior é utilizada automaticamente.
              </p>
            </div>

            <div style={s.sourceBlock}>
              <div style={s.sourceHeader}>
                <span style={s.sourceName}>Notícias (RSS)</span>
                <span style={{ ...s.badge, borderColor: '#888', color: '#888' }}>Peso 10%</span>
              </div>
              <p style={s.sourceDesc}>
                Análise de sentimento de manchetes e resumos dos principais portais de notícias
                brasileiros: G1, Folha de S.Paulo, Estadão, CNN Brasil, Agência Brasil,
                R7, Metrópoles, O Globo, Correio Braziliense, Poder360, Jovem Pan e Gazeta do Povo.
              </p>
              <p style={s.sourceDesc}>
                As últimas 50 publicações de cada portal são filtradas por termos relacionados
                a cada candidato. Coletado a cada hora.
              </p>
            </div>
          </div>

          <div style={s.card}>
            <h2 style={s.sectionTitle}>Análise de sentimento</h2>
            <p style={s.desc}>
              Cada texto (tweet ou notícia) é classificado individualmente como
              <strong style={{ color: '#22c55e' }}> positivo</strong>,
              <strong style={{ color: dark ? '#777' : '#6b7280' }}> neutro</strong> ou
              <strong style={{ color: '#ef4444' }}> negativo</strong> em relação ao candidato,
              usando o modelo <strong>GPT-4.1-mini</strong> da OpenAI.
            </p>
            <p style={s.desc}>
              Notícias são classificadas apenas para os candidatos cujos termos de busca
              geraram aquele resultado — um artigo encontrado na busca de Lula é classificado
              somente para Lula. Os textos são enviados em lotes de até 20 por chamada.
            </p>
          </div>

          <div style={s.card}>
            <h2 style={s.sectionTitle}>Pontuação geral</h2>
            <p style={s.desc}>
              A pontuação (0 a 100) combina as três fontes com pesos fixos, calculada como
              média dos últimos 7 dias com dados disponíveis:
            </p>
            <div style={s.formulaBlock}>
              <span>Polymarket</span>
              <span>probabilidade × 100</span>
              <span style={s.formulaWeight}>80%</span>
              <span>Notícias</span>
              <span>50 + (score bruto − 50) × confiança</span>
              <span style={s.formulaWeight}>10%</span>
              <span>Twitter</span>
              <span>50 + (score bruto − 50) × confiança</span>
              <span style={s.formulaWeight}>10%</span>
            </div>
            <p style={s.desc}>
              O <strong>score bruto</strong> de notícias e Twitter é{' '}
              <em>(% positivo − % negativo + 100) ÷ 2</em>. O fator de{' '}
              <strong>confiança</strong> é <em>min(volume ÷ 30, 1)</em>: com menos de 30
              artigos ou tweets, o score é puxado em direção ao neutro (50) proporcionalmente
              ao volume faltante. Com 30 ou mais textos analisados, a confiança é 100% e o
              score é aplicado integralmente.
            </p>
            <p style={s.desc}>
              Quando uma fonte não tem dados disponíveis, seu peso é redistribuído
              proporcionalmente entre as demais fontes presentes.
            </p>
          </div>

          <div style={s.card}>
            <h2 style={s.sectionTitle}>Demonstração — pontuação atual</h2>
            <p style={s.desc}>
              Cálculo em tempo real usando a média dos últimos 7 dias disponíveis por fonte.
              Quando uma fonte não tem dados, seu peso é redistribuído entre as demais.
            </p>

            {loadingDemo && <p style={s.desc}>Carregando dados...</p>}

            {!loadingDemo && !demoData && (
              <p style={s.desc}>Não foi possível carregar os dados.</p>
            )}


            {!loadingDemo && demoData && demoData.candidatos.map((c, idx) => {
              const { sources, totalWeight, final } = calcDetailed(c.slug, demoData.sentimento);
              const pm  = sources.find(s => s.fonte === 'polymarket');
              const rss = sources.find(s => s.fonte === 'rss');
              const tw  = sources.find(s => s.fonte === 'twitter');
              const tpl = [], val = [];
              if (pm?.score != null) {
                tpl.push('pol × 80');
                val.push(`${pm.score.toFixed(1)} × 80`);
              }
              if (rss?.score != null) {
                tpl.push('(50 + (bno − 50) × cno) × 10');
                val.push(`(50 + (${rss.raw.toFixed(1)} − 50) × ${(rss.confidence * 100).toFixed(0)}%) × 10`);
              }
              if (tw?.score != null) {
                tpl.push('(50 + (btw − 50) × ctw) × 10');
                val.push(`(50 + (${tw.raw.toFixed(1)} − 50) × ${(tw.confidence * 100).toFixed(0)}%) × 10`);
              }
              const pad = '          ';
              const equation = [
                `pontuação = (${tpl.join(' + ')}) ÷ ${totalWeight}`,
                `${pad}= (${val.join(' + ')}) ÷ ${totalWeight}`,
                `${pad}= ${final ?? '—'}`,
              ].join('\n').replace(/\./g, ',');
              return (
                <div key={c.slug} style={{
                  ...s.demoBlock,
                  borderTop: idx > 0 ? s.demoBlock.borderTop : 'none',
                  paddingTop: idx > 0 ? s.demoBlock.paddingTop : 0,
                }}>
                  <div style={s.demoHeader}>
                    <span style={s.demoName}>{c.nome}</span>
                    <span style={s.demoScore}>{final != null ? final : '—'}</span>
                  </div>
                  <pre style={s.demoCalcSteps}>{equation}</pre>
                </div>
              );
            })}

            {!loadingDemo && demoData && (
              <div style={s.demoLegend}>
                <div>pol = probabilidade Polymarket × 100</div>
                <div>bno = score bruto das notícias</div>
                <div>cno = confiança das notícias</div>
                <div>btw = score bruto do X/Twitter</div>
                <div>ctw = confiança do X/Twitter</div>
              </div>
            )}
          </div>

          <div style={s.card}>
            <h2 style={s.sectionTitle}>Limitações</h2>
            <ul style={s.list}>
              <li>O sentimento de IA pode errar em ironia, sarcasmo e contextos ambíguos.</li>
              <li>Tweets e notícias capturam volume de menções, não necessariamente intenção de voto.</li>
              <li>O Polymarket pode ter liquidez baixa para candidatos menos conhecidos,
                tornando as probabilidades menos precisas.</li>
              <li>Os dados refletem o momento da coleta e podem mudar rapidamente após eventos políticos.</li>
            </ul>
          </div>

        </main>
      </div>
    </>
  );
}

function getStyles(dark) {
  const pageBg  = dark ? '#111111' : '#F2F2F2';
  const cardBg  = dark ? '#1A1A1A' : '#FFFFFF';
  const cardBdr = dark ? '#333333' : '#000000';
  const text1   = dark ? '#EEEEEE' : '#000000';
  const textSub = dark ? '#CCCCCC' : '#333333';
  const textDim = dark ? '#555555' : '#999999';
  const sepClr  = dark ? '#2A2A2A' : '#F0F0F0';

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
      padding: '32px',
      border: `2px solid ${cardBdr}`,
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
    },
    title: {
      fontSize: '1.25rem',
      fontWeight: 900,
      color: text1,
      margin: 0,
      letterSpacing: '-0.02em',
    },
    sectionTitle: {
      fontSize: '1rem',
      fontWeight: 800,
      color: text1,
      margin: 0,
      letterSpacing: '-0.01em',
    },
    desc: {
      fontSize: '0.9rem',
      color: textSub,
      lineHeight: 1.8,
      margin: 0,
    },
    backLink: {
      fontSize: '0.82rem',
      fontWeight: 600,
      color: textDim,
      textDecoration: 'none',
      flexShrink: 0,
    },
    btnNoticias: {
      display: 'inline-block',
      fontSize: '0.85rem',
      fontWeight: 700,
      color: dark ? '#EEE' : '#000',
      textDecoration: 'none',
      border: `2px solid ${cardBdr}`,
      borderRadius: '8px',
      padding: '8px 16px',
      alignSelf: 'flex-start',
    },
    sourceBlock: {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      paddingTop: '16px',
      borderTop: `1px solid ${sepClr}`,
    },
    sourceHeader: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
    },
    sourceName: {
      fontWeight: 800,
      fontSize: '0.95rem',
      color: text1,
    },
    sourceDesc: {
      fontSize: '0.88rem',
      color: textSub,
      lineHeight: 1.7,
      margin: 0,
    },
    badge: {
      fontSize: '0.63rem',
      fontWeight: 700,
      border: '1.5px solid',
      borderRadius: '4px',
      padding: '2px 6px',
      letterSpacing: '0.04em',
    },
    formulaBlock: {
      display: 'grid',
      gridTemplateColumns: '120px 1fr 48px',
      columnGap: '12px',
      rowGap: '10px',
      background: dark ? '#111' : '#F8F8F8',
      borderRadius: '8px',
      padding: '16px',
      overflowX: 'auto',
      fontSize: '0.85rem',
      color: textSub,
      alignItems: 'center',
      whiteSpace: 'nowrap',
    },
    formulaWeight: {
      fontWeight: 800,
      color: text1,
      textAlign: 'right',
    },
    list: {
      fontSize: '0.88rem',
      color: textSub,
      lineHeight: 1.8,
      margin: 0,
      paddingLeft: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
    },
    demoBlock: {
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      borderTop: `1px solid ${sepClr}`,
      paddingTop: '16px',
    },
    demoHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    demoName: {
      fontWeight: 800,
      fontSize: '0.95rem',
      color: text1,
    },
    demoScore: {
      fontWeight: 900,
      fontSize: '1.3rem',
      color: text1,
      fontVariantNumeric: 'tabular-nums',
    },
    demoRow: {
      display: 'grid',
      gridTemplateColumns: '110px 1fr 46px 68px',
      gap: '8px',
      fontSize: '0.85rem',
      color: textSub,
      alignItems: 'center',
    },
    demoCalcSteps: {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '0.72rem',
      color: textSub,
      margin: '0 0 6px 0',
      whiteSpace: 'pre',
      overflowX: 'auto',
      lineHeight: 1.8,
      background: dark ? '#0D0D0D' : '#F4F4F4',
      borderRadius: '6px',
      padding: '8px 12px',
    },
    demoColHeader: {
      fontSize: '0.7rem',
      fontWeight: 700,
      color: textDim,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    },
    demoFooter: {
      borderTop: `1px solid ${sepClr}`,
      paddingTop: '8px',
      fontSize: '0.85rem',
      color: textSub,
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      fontVariantNumeric: 'tabular-nums',
    },
    demoFinalNum: {
      fontWeight: 900,
      fontSize: '1rem',
      color: text1,
    },
    demoRedist: {
      fontSize: '0.78rem',
      color: textDim,
    },
    demoLegend: {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '0.7rem',
      color: textSub,
      lineHeight: 1.8,
    },
    demoSubLabel: {
      fontSize: '0.72rem',
      color: textDim,
      fontVariantNumeric: 'tabular-nums',
      paddingLeft: '0px',
      marginTop: '-6px',
      marginBottom: '4px',
    },
  };
}
