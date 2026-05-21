import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useDarkMode } from '../hooks/useDarkMode';
import { useSessionGate } from '../hooks/useSessionGate';
import Header from '../components/Header';

const SENT_LABEL = { positivo: 'Positivo', neutro: 'Neutro', negativo: 'Negativo' };
const SENT_COLOR = { positivo: '#22c55e', neutro: '#6b7280', negativo: '#ef4444' };

export default function NoticiasSentimento() {
  const [dark, toggleDark] = useDarkMode();
  useSessionGate();

  const [candidatos, setCandidatos] = useState([]);
  const [datas, setDatas]           = useState([]);
  const [noticias, setNoticias]     = useState([]);
  const [dataSel, setDataSel]       = useState('');
  const [slugSel, setSlugSel]       = useState('');
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  useEffect(() => {
    fetch('/api/noticias-sentimento')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => {
        setCandidatos(d.candidatos);
        setDatas(d.datas);
        if (d.datas.length > 0) setDataSel(d.datas[0]);
        if (d.candidatos.length > 0) setSlugSel(d.candidatos[0].slug);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!dataSel || !slugSel) return;
    fetch(`/api/noticias-sentimento?data=${dataSel}&slug=${slugSel}`)
      .then(r => r.json())
      .then(d => setNoticias(d.noticias || []))
      .catch(() => setNoticias([]));
  }, [dataSel, slugSel]);

  const s = getStyles(dark);

  const fmtData = iso => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };

  return (
    <>
      <Head>
        <title>Notícias Analisadas — Sentimento Eleitoral 2026</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div style={s.page}>
        <Header currentPage="sentimento" dark={dark} toggleDark={toggleDark} />

        <main style={s.main}>

          <div style={s.card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <h1 style={s.title}>Notícias Analisadas</h1>
              <Link href="/metodologia-sentimento" style={s.backLink}>← Metodologia</Link>
            </div>
          </div>

          {loading && <div style={s.statusMsg}>Carregando...</div>}
          {error   && <div style={s.errorMsg}>Erro: {error}</div>}

          {!loading && !error && (
            <>
              <div style={s.filters}>
                <div style={s.filterGroup}>
                  <label style={s.filterLabel}>Data</label>
                  <select
                    value={dataSel}
                    onChange={e => setDataSel(e.target.value)}
                    style={s.select}
                  >
                    {datas.map(d => (
                      <option key={d} value={d}>{fmtData(d)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={s.tabBar}>
                {candidatos.map(c => (
                  <button key={c.slug} onClick={() => setSlugSel(c.slug)}
                    style={slugSel === c.slug ? s.tabActive : s.tab}>
                    {c.nome}
                  </button>
                ))}
              </div>

              <div style={s.tableCard}>
                <div style={s.tableWrapper}>
                  {noticias.length === 0 ? (
                    <div style={s.noData}>Sem notícias para esta data e candidato.</div>
                  ) : (
                    <table style={s.table}>
                      <thead>
                        <tr>
                          <th style={{ ...s.th, width: 100 }}>Sentimento</th>
                          <th style={{ ...s.th, width: 140 }}>Jornal</th>
                          <th style={s.th}>Título</th>
                        </tr>
                      </thead>
                      <tbody>
                        {noticias.map((n, i) => (
                          <tr key={n.id} style={i % 2 === 0 ? s.trEven : s.trOdd}>
                            <td style={s.td}>
                              <span style={{
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                color: SENT_COLOR[n.sentimento] || '#888',
                                border: `1.5px solid ${SENT_COLOR[n.sentimento] || '#888'}`,
                                borderRadius: 4,
                                padding: '2px 7px',
                                whiteSpace: 'nowrap',
                              }}>
                                {SENT_LABEL[n.sentimento] || n.sentimento}
                              </span>
                            </td>
                            <td style={{ ...s.td, fontSize: '0.78rem', color: dark ? '#888' : '#666' }}>
                              {n.jornal || '—'}
                            </td>
                            <td style={s.td}>
                              {n.url ? (
                                <a href={n.url} target="_blank" rel="noopener noreferrer"
                                  style={s.link}>
                                  {n.titulo}
                                </a>
                              ) : (
                                <span style={{ color: dark ? '#CCC' : '#333' }}>{n.titulo}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </>
          )}

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
      maxWidth: '900px',
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
      padding: '28px 32px',
      border: `2px solid ${cardBdr}`,
    },
    title: {
      fontSize: '1.15rem',
      fontWeight: 900,
      color: text1,
      margin: 0,
      letterSpacing: '-0.02em',
    },
    backLink: {
      fontSize: '0.82rem',
      fontWeight: 600,
      color: textDim,
      textDecoration: 'none',
      flexShrink: 0,
    },
    filters: {
      display: 'flex',
      gap: 16,
      alignItems: 'flex-end',
    },
    filterGroup: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    },
    filterLabel: {
      fontSize: '0.68rem',
      fontWeight: 700,
      color: textDim,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
    },
    select: {
      background: cardBg,
      border: `2px solid ${cardBdr}`,
      borderRadius: 8,
      color: text1,
      fontSize: '0.88rem',
      fontWeight: 600,
      padding: '7px 12px',
      cursor: 'pointer',
    },
    tabBar: {
      display: 'flex',
      gap: 8,
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
    tableCard: {
      background: cardBg,
      borderRadius: '12px',
      border: `2px solid ${cardBdr}`,
      overflow: 'hidden',
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
      verticalAlign: 'middle',
    },
    link: {
      color: dark ? '#93C5FD' : '#1D4ED8',
      textDecoration: 'none',
      lineHeight: 1.5,
    },
    noData: {
      padding: '40px 16px',
      textAlign: 'center',
      color: textDim,
      fontSize: '0.85rem',
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
  };
}
