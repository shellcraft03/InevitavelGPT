import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useDarkMode } from '../hooks/useDarkMode';
import { useSessionGate } from '../hooks/useSessionGate';
import Header from '../components/Header';

const FONTES = [
  { key: 'polymarket', label: 'Polymarket' },
  { key: 'twitter',    label: 'X/Twitter'  },
  { key: 'rss',        label: 'Notícias'   },
];

const PARTIDO_CORES = { PT: '#CC0000', PL: '#003F8C' };
function partidoCor(partido, dark) {
  if (partido === 'Missão') return dark ? '#FFD700' : '#B8860B';
  return PARTIDO_CORES[partido] || '#888888';
}

function SentimentBar({ positivo, neutro, negativo, dark }) {
  if (positivo == null) {
    return <span style={{ color: dark ? '#555' : '#BBB', fontSize: '0.82rem' }}>Sem dados ainda</span>;
  }
  return (
    <div>
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden' }}>
        <div style={{ width: `${positivo}%`, background: '#22c55e' }} />
        <div style={{ width: `${neutro}%`, background: dark ? '#444' : '#CBD5E1' }} />
        <div style={{ width: `${negativo}%`, background: '#ef4444' }} />
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: '0.78rem', fontVariantNumeric: 'tabular-nums' }}>
        <span style={{ color: '#22c55e' }}>▲ {positivo.toFixed(0)}%</span>
        <span style={{ color: dark ? '#777' : '#6b7280' }}>● {neutro.toFixed(0)}%</span>
        <span style={{ color: '#ef4444' }}>▼ {negativo.toFixed(0)}%</span>
      </div>
    </div>
  );
}

export default function Sentimento() {
  const [dark, toggleDark] = useDarkMode();
  useSessionGate();

  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);
  const [fonte, setFonte]   = useState('polymarket');

  useEffect(() => {
    fetch('/api/sentimento')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => {
        const num = v => (v == null ? null : Number(v));
        const sent = {};
        for (const [slug, fontes] of Object.entries(d.sentimento || {})) {
          sent[slug] = {};
          for (const [f, rows] of Object.entries(fontes)) {
            sent[slug][f] = rows.map(r => ({
              ...r,
              positivo:        num(r.positivo),
              neutro:          num(r.neutro),
              negativo:        num(r.negativo),
              score_tendencia: num(r.score_tendencia),
              odds:            num(r.odds),
            }));
          }
        }
        setData({ ...d, sentimento: sent });
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const s = getStyles(dark);
  const candidatos = data?.candidatos || [];
  const isPolymarket = fonte === 'polymarket';

  function calcScore(slug) {
    const WEIGHTS = { rss: 10, twitter: 10, polymarket: 80 };
    let weightedSum = 0;
    let totalWeight = 0;
    for (const [fonte, weight] of Object.entries(WEIGHTS)) {
      const rows = (data?.sentimento?.[slug]?.[fonte] || []).slice(0, 7);
      const values = [];
      for (const r of rows) {
        if ((fonte === 'rss' || fonte === 'twitter') && r.positivo != null && r.negativo != null) {
          const raw = (r.positivo - r.negativo + 100) / 2;
          const vol = Number(r.volume) || 0;
          const confidence = Math.min(vol / 30, 1);
          values.push(50 + (raw - 50) * confidence);
        } else if (fonte === 'polymarket' && r.odds != null) {
          values.push(r.odds * 100);
        }
      }
      if (values.length === 0) continue;
      weightedSum += (values.reduce((a, b) => a + b, 0) / values.length) * weight;
      totalWeight += weight;
    }
    return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;
  }

  function latestRow(slug) {
    return data?.sentimento?.[slug]?.[fonte]?.[0] ?? null;
  }

  function recentRows(slug, n = 7) {
    return (data?.sentimento?.[slug]?.[fonte] || []).slice(0, n);
  }

  function allDatesFromCandidates(n = 7) {
    const set = new Set();
    candidatos.forEach(c => recentRows(c.slug, n).forEach(r => set.add(r.data)));
    return [...set].sort((a, b) => b.localeCompare(a));
  }

  return (
    <>
      <Head>
        <title>Sentimento Eleitoral 2026 — Inevitável GPT</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div style={s.page}>
        <Header currentPage="sentimento" dark={dark} toggleDark={toggleDark} />

        <main style={s.main}>

          <div style={s.card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <h1 style={s.title}>Sentimento Eleitoral 2026</h1>
              <Link href="/metodologia-sentimento" style={s.metaLink}>Metodologia</Link>
            </div>
          </div>

          {!loading && !error && candidatos.length > 0 && (() => {
            const scored = candidatos
              .map(c => ({ ...c, score: calcScore(c.slug) }))
              .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
            return (
              <div style={s.card}>
                <div style={s.tableTitle}>Pontuação Geral — média 7 dias</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
                  {scored.map(c => {
                    const cor = partidoCor(c.partido, dark);
                    return (
                      <div key={c.slug}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: dark ? '#EEE' : '#000' }}>
                            {c.nome}
                          </span>
                          <span style={{ fontWeight: 900, fontSize: '0.9rem', fontVariantNumeric: 'tabular-nums',
                            color: c.score != null ? cor : (dark ? '#555' : '#BBB') }}>
                            {c.score != null ? c.score : '—'}
                          </span>
                        </div>
                        <div style={{ height: 8, borderRadius: 4, overflow: 'hidden',
                          background: dark ? '#333' : '#E5E7EB' }}>
                          <div style={{ width: `${c.score ?? 0}%`, height: '100%',
                            background: cor, borderRadius: 4, transition: 'width 0.4s' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: '0.68rem', color: dark ? '#CCCCCC' : '#333333', marginTop: 14 }}>
                  Pesos: Polymarket 80% · Notícias 10% · Twitter 10%. Fontes sem dados têm peso redistribuído.
                </div>
              </div>
            );
          })()}

          <div style={s.tabBar}>
            {FONTES.map(f => (
              <button key={f.key} onClick={() => setFonte(f.key)}
                style={fonte === f.key ? s.tabActive : s.tab}>
                {f.label}
              </button>
            ))}
          </div>

          {loading && <div style={s.statusMsg}>Carregando dados...</div>}
          {error   && <div style={s.errorMsg}>Erro: {error}</div>}

          {!loading && !error && (
            <>
              <div style={s.grid}>
                {candidatos.map(c => {
                  const row = latestRow(c.slug);
                  const cor = partidoCor(c.partido, dark);

                  return (
                    <div key={c.slug} style={s.candidateCard}>
                      <div style={s.candidateHeader}>
                        <span style={s.candidateNome}>{c.nome}</span>
                        <span style={{ ...s.badge, borderColor: cor, color: cor }}>{c.partido}</span>
                      </div>

                      {isPolymarket ? (() => {
                        const pct = row?.odds != null ? row.odds * 100 : null;
                        return (
                          <>
                            <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden',
                              background: dark ? '#333' : '#E5E7EB' }}>
                              <div style={{ width: `${pct ?? 0}%`, background: '#FCBF22' }} />
                            </div>
                            <span style={{ fontSize: '1.4rem', fontWeight: 900,
                              color: pct != null ? (dark ? '#FCBF22' : '#000000') : (dark ? '#555' : '#BBB'),
                              fontVariantNumeric: 'tabular-nums' }}>
                              {pct != null ? `${pct.toFixed(1)}%` : '—'}
                            </span>
                          </>
                        );
                      })() : (
                        <>
                          <SentimentBar positivo={row?.positivo ?? null}
                            neutro={row?.neutro ?? null}
                            negativo={row?.negativo ?? null} dark={dark} />
                        </>
                      )}

                      {row?.data && (
                        <div style={s.dateLabel}>
                          {new Date(row.data).toLocaleDateString('pt-BR',
                            { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {candidatos.length > 0 && (() => {
                const dates = allDatesFromCandidates(7);
                return (
                  <div style={s.tableCard}>
                    <div style={s.tableTitle}>
                      Últimos 7 dias — {FONTES.find(f => f.key === fonte)?.label}
                    </div>
                    <div style={s.tableWrapper}>
                      <table style={s.table}>
                        <thead>
                          <tr>
                            <th style={s.th}>Data</th>
                            {candidatos.map(c => <th key={c.slug} style={s.th}>{c.nome}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {dates.length === 0 ? (
                            <tr>
                              <td colSpan={candidatos.length + 1} style={s.noData}>
                                Sem dados ainda. A primeira coleta ocorre ao rodar o workflow.
                              </td>
                            </tr>
                          ) : dates.map((date, i) => (
                            <tr key={date} style={i % 2 === 0 ? s.trEven : s.trOdd}>
                              <td style={s.td}>
                                {new Date(date).toLocaleDateString('pt-BR',
                                  { timeZone: 'UTC', day: '2-digit', month: '2-digit' })}
                              </td>
                              {candidatos.map(c => {
                                const row = recentRows(c.slug).find(r => r.data === date);
                                return (
                                  <td key={c.slug} style={s.td}>
                                    {isPolymarket ? (
                                      row?.odds != null
                                        ? <span style={{ fontVariantNumeric: 'tabular-nums', color: dark ? '#FCBF22' : '#000000', fontWeight: 700 }}>
                                            {(row.odds * 100).toFixed(1)}%
                                          </span>
                                        : '—'
                                    ) : (
                                      row?.positivo != null
                                        ? <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.82rem' }}>
                                            <span style={{ color: '#22c55e' }}>▲{row.positivo.toFixed(0)}%</span>
                                            {' '}
                                            <span style={{ color: '#ef4444' }}>▼{row.negativo.toFixed(0)}%</span>
                                          </span>
                                        : '—'
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </>
          )}

          <p style={s.footer}>
            As probabilidades do Polymarket são utilizadas exclusivamente como termômetro de
            percepção pública — um reflexo do que o mercado acredita, não uma recomendação
            ou incentivo a apostas. Este projeto tem fins estritamente analíticos e
            não compactua com nenhuma forma de jogo ou especulação financeira.
          </p>

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
  const textDim = dark ? '#555555' : '#999999';
  const textSub = dark ? '#CCCCCC' : '#333333';
  const rowEven = dark ? '#1A1A1A' : '#FFFFFF';
  const rowOdd  = dark ? '#1F1F1F' : '#F8F8F8';

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
      gap: '12px',
    },
    title: {
      fontSize: '1.25rem',
      fontWeight: 900,
      color: text1,
      margin: 0,
      letterSpacing: '-0.02em',
    },
    desc: {
      fontSize: '0.95rem',
      color: textSub,
      lineHeight: 1.8,
      margin: 0,
    },
    tabBar: {
      display: 'flex',
      gap: '8px',
      flexWrap: 'wrap',
    },
    tab: {
      padding: '7px 14px',
      borderRadius: '8px',
      border: `2px solid ${dark ? '#333' : '#DDD'}`,
      background: 'transparent',
      color: textDim,
      cursor: 'pointer',
      fontSize: '0.85rem',
      fontWeight: 600,
    },
    tabActive: {
      padding: '7px 14px',
      borderRadius: '8px',
      border: '2px solid #FCBF22',
      background: '#FCBF22',
      color: '#000000',
      cursor: 'pointer',
      fontSize: '0.85rem',
      fontWeight: 700,
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '16px',
    },
    candidateCard: {
      background: cardBg,
      borderRadius: '12px',
      padding: '20px',
      border: `2px solid ${cardBdr}`,
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    },
    candidateHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '8px',
    },
    candidateNome: {
      fontSize: '0.95rem',
      fontWeight: 800,
      color: text1,
      letterSpacing: '-0.01em',
    },
    badge: {
      fontSize: '0.63rem',
      fontWeight: 700,
      border: '1.5px solid',
      borderRadius: '4px',
      padding: '2px 6px',
      letterSpacing: '0.04em',
      flexShrink: 0,
    },
    subLabel: {
      fontSize: '0.72rem',
      color: textDim,
    },
    dateLabel: {
      fontSize: '0.7rem',
      color: textDim,
      marginTop: 'auto',
    },
    statusMsg: {
      padding: '40px 0',
      textAlign: 'center',
      color: textDim,
      fontSize: '0.9rem',
    },
    errorMsg: {
      padding: '40px 0',
      textAlign: 'center',
      color: '#CC4444',
      fontSize: '0.9rem',
    },
    tableCard: {
      background: cardBg,
      borderRadius: '12px',
      border: `2px solid ${cardBdr}`,
      overflow: 'hidden',
    },
    tableTitle: {
      padding: '14px 20px 12px',
      fontSize: '0.68rem',
      fontWeight: 700,
      color: text1,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      borderBottom: `2px solid ${cardBdr}`,
    },
    tableWrapper: { overflowX: 'auto' },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '0.88rem',
    },
    th: {
      padding: '10px 16px',
      textAlign: 'left',
      fontSize: '0.68rem',
      fontWeight: 700,
      color: text1,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      borderBottom: `1px solid ${dark ? '#2A2A2A' : '#E5E7EB'}`,
      background: cardBg,
      whiteSpace: 'nowrap',
    },
    trEven: { background: rowEven },
    trOdd:  { background: rowOdd  },
    td: {
      padding: '10px 16px',
      color: textSub,
      borderBottom: `1px solid ${dark ? '#2A2A2A' : '#F0F0F0'}`,
      whiteSpace: 'nowrap',
    },
    noData: {
      padding: '32px 16px',
      textAlign: 'center',
      color: textDim,
      fontSize: '0.85rem',
    },
    metaLink: {
      fontSize: '0.78rem',
      fontWeight: 600,
      color: textDim,
      textDecoration: 'none',
      border: `1.5px solid ${dark ? '#333' : '#DDD'}`,
      borderRadius: '6px',
      padding: '4px 10px',
      flexShrink: 0,
    },
    footer: {
      fontSize: '0.75rem',
      color: textSub,
      textAlign: 'center',
      lineHeight: 1.6,
    },
  };
}
