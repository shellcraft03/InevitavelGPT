import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useDarkMode } from '../hooks/useDarkMode';
import { useSessionGate } from '../hooks/useSessionGate';
import Header from '../components/Header';
import ShareBar from '../components/ShareBar';

const LIMIT = 12;
const DONATE_BASE = 'https://queroapoiar.com.br/';

function formatBRL(value) {
  return (value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function MGFlag() {
  return (
    <img
      src="/bandeira-mg.png"
      alt="Bandeira de Minas Gerais"
      style={{ height: '48px', width: 'auto', flexShrink: 0 }}
    />
  );
}

function imgUrl(image) {
  if (!image) return null;
  const path = image.thumb || image.full;
  if (!path) return null;
  return `${image.host}${path}`;
}

export default function MissaoMG() {
  const [dark, toggleDark] = useDarkMode();
  useSessionGate();

  const [presidente, setPresidente]  = useState(null);
  const [items, setItems]           = useState([]);
  const [stats, setStats]           = useState(null);
  const [loading, setLoading]       = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]       = useState(false);
  const [error, setError]           = useState(null);

  const fetchPage = useCallback(async (skip) => {
    const res = await fetch(`/api/apoios-mg?_skip=${skip}&_limit=${LIMIT}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const raw = Array.isArray(data) ? data : (data.vaquinha ?? data.data ?? data.items ?? []);
    const newItems = raw.filter(item => (item.totalCollected ?? 0) > 0);
    return { items: newItems, hasMore: data.hasMore ?? raw.length === LIMIT };
  }, []);

  useEffect(() => {
    Promise.all([
      fetch('/api/apoios-mg?localidade=Brasil&_limit=1')
        .then(r => r.json())
        .then(d => (Array.isArray(d) ? d : (d.vaquinha ?? []))[0] ?? null),
      fetchPage(0),
      fetch('/api/apoios-mg?_limit=100')
        .then(r => r.json())
        .then(d => {
          const all = (Array.isArray(d) ? d : (d.vaquinha ?? [])).filter(i => (i.totalCollected ?? 0) > 0);
          return {
            total: all.reduce((s, i) => s + (i.totalCollected ?? 0), 0),
            candidatos: all.length,
            doadores: all.reduce((s, i) => s + (i.doadoresCount ?? 0), 0),
          };
        }),
    ])
      .then(([pres, { items: newItems, hasMore: more }, mgStats]) => {
        setPresidente(pres);
        setItems(newItems);
        setHasMore(more);
        setStats(mgStats);
        setLoading(false);
      })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [fetchPage]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const { items: newItems, hasMore: more } = await fetchPage(items.length);
      setItems(prev => [...prev, ...newItems]);
      setHasMore(more);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  };

  const s = getStyles(dark);

  return (
    <>
      <Head>
        <title>Apoios Missão MG</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div style={s.page}>
        <Header currentPage="missao-mg" dark={dark} toggleDark={toggleDark} />

        <main style={s.main}>
          <div style={s.headerCard}>
            <div style={s.titleRow}>
              <MGFlag />
              <h1 style={s.title}>Missão MG</h1>
            </div>
            <p style={s.desc}>
              Pré-candidato à Presidência e pré-candidatos da Missão em Minas Gerais nas eleições de 2026.
              Clique em "Apoiar" para contribuir diretamente pelo QueroApoiar.{' '}
              <a href="https://caminhodamissao.com/?uf=mg" target="_blank" rel="noopener noreferrer" style={s.link}>
                Saiba mais sobre os pré-candidatos ↗
              </a>
            </p>
          </div>

          {stats && (
            <div style={s.statsCard}>
              <div style={s.statItem}>
                <span style={s.statValue}>{formatBRL(stats.total)}</span>
                <span style={s.statLabel}>arrecadado em MG</span>
              </div>
              <div style={s.statDivider} />
              <div style={s.statItem}>
                <span style={s.statValue}>{stats.candidatos}</span>
                <span style={s.statLabel}>{stats.candidatos === 1 ? 'candidato ativo' : 'candidatos ativos'}</span>
              </div>
              <div style={s.statDivider} />
              <div style={s.statItem}>
                <span style={s.statValue}>{stats.doadores.toLocaleString('pt-BR')}</span>
                <span style={s.statLabel}>{stats.doadores === 1 ? 'doador' : 'doadores'}</span>
              </div>
            </div>
          )}

          {loading && <p style={s.status}>Carregando candidatos...</p>}
          {error && <p style={s.errorMsg}>Erro ao carregar: {error}</p>}

          {!loading && !error && presidente && (
            <>
              <p style={s.sectionLabel}>Presidente</p>
              <div style={s.grid}>
                <CandidateCard key={presidente._id} item={presidente} dark={dark} s={s} />
              </div>
            </>
          )}

          {!loading && !error && (() => {
            const normalizeCargo = c => (c || 'Outros').replace(/^Deputada\b/, 'Deputado');
            const byCargo = items.reduce((acc, item) => {
              const key = normalizeCargo(item.cargo);
              if (!acc[key]) acc[key] = [];
              acc[key].push(item);
              return acc;
            }, {});
            return Object.entries(byCargo).map(([cargo, group]) => (
              <div key={cargo} style={s.section}>
                <p style={s.sectionLabel}>{cargo} — Minas Gerais</p>
                <div style={s.grid}>
                  {group.map(item => (
                    <CandidateCard key={item._id} item={item} dark={dark} s={s} />
                  ))}
                </div>
              </div>
            ));
          })()}

          {!loading && hasMore && (
            <div style={s.loadMoreWrap}>
              <button
                onClick={loadMore}
                disabled={loadingMore}
                style={loadingMore ? { ...s.loadMoreBtn, opacity: 0.5, cursor: 'default' } : s.loadMoreBtn}
              >
                {loadingMore ? 'Carregando...' : 'Carregar mais'}
              </button>
            </div>
          )}

          <p style={s.fonte}>
            Fonte:{' '}
            <a
              href="https://queroapoiar.com.br"
              target="_blank"
              rel="noopener noreferrer"
              style={s.fonteLink}
            >
              QueroApoiar
            </a>
          </p>

          <div style={s.disclaimer}>
            Este projeto foi desenvolvido por um apoiador independente do Livro Amarelo.
            Não possui qualquer ligação formal com o Partido Missão.
          </div>

          <ShareBar />
        </main>
      </div>
    </>
  );
}

function CandidateCard({ item, dark, s }) {
  const meta = item.meta ?? 0;
  const collected = item.totalCollected ?? 0;
  const pct = meta > 0 ? Math.min(100, (collected / meta) * 100) : 0;
  const photo = imgUrl(item.image);
  const donateUrl = `${DONATE_BASE}${item.url}`;
  const accent = item.corPrimaria || '#FCBF22';

  return (
    <div style={s.card}>
      <div style={s.cardTop}>
        {photo ? (
          <img src={photo} alt={item.title} style={s.avatar} />
        ) : (
          <div style={{ ...s.avatar, background: accent }} />
        )}
        <div style={s.cardInfo}>
          <div style={s.candidateName}>{item.title}</div>
          <div style={s.candidateRole}>{item.candidateTitle}</div>
        </div>
      </div>

      <div style={s.progressWrap}>
        {meta > 0 && (
          <div style={s.progressTrack}>
            <div style={{ ...s.progressBar, width: `${pct}%`, background: accent }} />
          </div>
        )}
        <div style={s.progressRow}>
          {!item.hideRaisedAmount && (
            <span style={s.collectedAmount}>{formatBRL(collected)}</span>
          )}
          {meta > 0 && <span style={s.pctLabel}>{pct.toFixed(1)}%</span>}
        </div>
        {meta > 0 && <div style={s.metaLabel}>Meta: {formatBRL(meta)}</div>}
      </div>

      <div style={s.stats}>
        <strong>{(item.doadoresCount ?? 0).toLocaleString('pt-BR')}</strong>
        {' '}{item.doadoresCount === 1 ? 'doador' : 'doadores'}
        <span style={s.statDot}>·</span>
        <strong>{(item.viewsCount ?? 0).toLocaleString('pt-BR')}</strong>
        {' '}views
      </div>

      <a href={donateUrl} target="_blank" rel="noopener noreferrer" style={s.btnApoiar}>
        Apoiar ↗
      </a>
    </div>
  );
}

function getStyles(dark) {
  const pageBg  = dark ? '#111111' : '#F2F2F2';
  const cardBg  = dark ? '#1A1A1A' : '#FFFFFF';
  const cardBdr = dark ? '#333333' : '#000000';
  const text1   = dark ? '#EEEEEE' : '#000000';
  const textSub = dark ? '#CCCCCC' : '#333333';
  const textDim = dark ? '#888888' : '#666666';

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
    headerCard: {
      background: cardBg,
      borderRadius: '12px',
      padding: '32px',
      border: `2px solid ${cardBdr}`,
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    },
    titleRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
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
    statsCard: {
      background: cardBg,
      borderRadius: '12px',
      padding: '20px 24px',
      border: `2px solid ${cardBdr}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-around',
      gap: '16px',
      flexWrap: 'wrap',
    },
    statItem: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '4px',
    },
    statValue: {
      fontSize: '1.25rem',
      fontWeight: 900,
      color: text1,
      fontVariantNumeric: 'tabular-nums',
      letterSpacing: '-0.02em',
    },
    statLabel: {
      fontSize: '0.68rem',
      fontWeight: 700,
      color: textDim,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
    },
    statDivider: {
      width: '1px',
      height: '32px',
      background: dark ? '#2A2A2A' : '#E8E8E8',
      flexShrink: 0,
    },
    section: {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
    },
    sectionLabel: {
      fontSize: '0.68rem',
      fontWeight: 700,
      color: textDim,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      margin: 0,
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
      gap: '16px',
    },
    card: {
      background: cardBg,
      borderRadius: '12px',
      padding: '24px',
      border: `2px solid ${cardBdr}`,
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
    },
    cardTop: {
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
    },
    avatar: {
      width: '60px',
      height: '60px',
      borderRadius: '50%',
      objectFit: 'cover',
      flexShrink: 0,
      border: `2px solid ${cardBdr}`,
    },
    cardInfo: {
      flex: 1,
      minWidth: 0,
    },
    candidateName: {
      fontSize: '1rem',
      fontWeight: 900,
      color: text1,
      lineHeight: 1.2,
    },
    candidateRole: {
      fontSize: '0.78rem',
      color: textSub,
      marginTop: '3px',
    },
    progressWrap: {
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
    },
    progressTrack: {
      height: '6px',
      background: dark ? '#2A2A2A' : '#E8E8E8',
      borderRadius: '3px',
      overflow: 'hidden',
    },
    progressBar: {
      height: '100%',
      borderRadius: '3px',
    },
    progressRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
    },
    collectedAmount: {
      fontSize: '1rem',
      fontWeight: 900,
      color: text1,
      fontVariantNumeric: 'tabular-nums',
    },
    pctLabel: {
      fontSize: '0.78rem',
      color: textDim,
      fontVariantNumeric: 'tabular-nums',
    },
    metaLabel: {
      fontSize: '0.75rem',
      color: textDim,
    },
    stats: {
      fontSize: '0.82rem',
      color: textSub,
      display: 'flex',
      alignItems: 'center',
      gap: '5px',
      flexWrap: 'wrap',
    },
    statDot: {
      color: textDim,
    },
    btnApoiar: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#FCBF22',
      color: '#000000',
      border: '2px solid #000000',
      borderRadius: '8px',
      padding: '9px 16px',
      fontSize: '0.88rem',
      fontWeight: 900,
      textDecoration: 'none',
      marginTop: 'auto',
    },
    loadMoreWrap: {
      display: 'flex',
      justifyContent: 'center',
    },
    loadMoreBtn: {
      background: cardBg,
      color: text1,
      border: `2px solid ${cardBdr}`,
      borderRadius: '8px',
      padding: '10px 28px',
      fontSize: '0.9rem',
      fontWeight: 700,
      cursor: 'pointer',
    },
    status: {
      textAlign: 'center',
      color: textDim,
      fontSize: '0.9rem',
      padding: '40px 0',
    },
    errorMsg: {
      textAlign: 'center',
      color: '#CC4444',
      fontSize: '0.9rem',
      padding: '40px 0',
    },
    disclaimer: {
      fontSize: '0.8rem',
      color: textDim,
      textAlign: 'center',
      lineHeight: 1.6,
      padding: '0 8px',
    },
    fonte: {
      fontSize: '0.78rem',
      color: textDim,
      textAlign: 'center',
    },
    link: {
      color: dark ? '#FCBF22' : '#000000',
      textDecoration: 'underline',
    },
    fonteLink: {
      color: dark ? '#FCBF22' : '#000000',
      textDecoration: 'underline',
    },
  };
}
