import { useState, useEffect, useLayoutEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

const useClientLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// Adicionar novas páginas aqui — o nav atualiza automaticamente
const PAGES = [
  { href: '/inicio',                  label: 'O Plano'        },
  { href: '/renan-santos-responde',   label: 'Renan Responde' },
  { href: '/sentimento',              label: 'Eleições 2026'  },
  { href: '/inevitavelgpt2',          label: 'Bot X/Twitter'  },
  { href: '/doacoes',                 label: 'Apoie'          },
  { href: '/sobre',                   label: 'Sobre'          },
  { href: '/privacidade',             label: 'Privacidade'    },
];

function SunIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <line x1="12" y1="2"    x2="12"    y2="6"/>
      <line x1="12" y1="18"   x2="12"    y2="22"/>
      <line x1="4.22" y1="4.22"  x2="7.05"  y2="7.05"/>
      <line x1="16.95" y1="16.95" x2="19.78" y2="19.78"/>
      <line x1="2"  y1="12"   x2="6"     y2="12"/>
      <line x1="18" y1="12"   x2="22"    y2="12"/>
      <line x1="4.22" y1="19.78" x2="7.05"  y2="16.95"/>
      <line x1="16.95" y1="7.05"  x2="19.78" y2="4.22"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="3" y1="6"  x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

export default function Header({ currentPage, dark, toggleDark, onCurrentPageClick }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const router = useRouter();

  useClientLayoutEffect(() => {
    const mql = window.matchMedia('(max-width: 639px)');
    setIsMobile(mql.matches);
    const handler = e => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (!isMobile && menuOpen) {
      setMenuOpen(false);
      document.body.style.overflow = '';
    }
  }, [isMobile, menuOpen]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  useEffect(() => {
    const reset = () => {
      setMenuOpen(false);
      document.body.style.overflow = '';
    };
    router.events.on('routeChangeStart', reset);
    return () => router.events.off('routeChangeStart', reset);
  }, [router.events]);
  const currentLabel = PAGES.find(p => p.href === `/${currentPage}`)?.label ?? currentPage;
  const s = getStyles(dark, isMobile);

  return (
    <header style={s.header}>
      <div style={s.headerInner}>
        {isMobile && (
          <div style={s.mobilePageLabel}>{currentLabel}</div>
        )}
        <a href="/" style={s.headerLogo}>
          <img src="/Imagem3.png" alt="" style={s.headerThumb} />
          {!isMobile && (
            <div style={s.headerTextWrap}>
              <div style={s.headerTitle}>Inevitável GPT</div>
              <div style={s.headerSub}>O Futuro é Glorioso</div>
            </div>
          )}
        </a>
        <nav style={s.nav}>
          <button onClick={toggleDark} style={s.darkToggle} title={dark ? 'Modo claro' : 'Modo escuro'}>
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
          {isMobile ? (
            <>
              <button
                onClick={() => setMenuOpen(o => !o)}
                style={s.hamburgerBtn}
                aria-label="Menu de navegação"
                aria-expanded={menuOpen}
              >
                <HamburgerIcon />
              </button>
              {menuOpen && (
                <>
                  <div style={s.backdrop} onClick={() => setMenuOpen(false)} />
                  <div style={s.offcanvas}>
                    <div style={s.offcanvasHeader}>
                      <a href="/" style={s.offcanvasLogo}>
                        <img src="/Imagem3.png" alt="" style={s.headerThumb} />
                        <div>
                          <div style={s.offcanvasTitle}>Inevitável GPT</div>
                          <div style={s.offcanvasSub}>O Futuro é Glorioso</div>
                        </div>
                      </a>
                      <button onClick={() => setMenuOpen(false)} style={s.closeBtn} aria-label="Fechar menu">
                        <CloseIcon />
                      </button>
                    </div>
                    <nav>
                      {PAGES.map(page => {
                        const isActive = page.href === `/${currentPage}`;
                        return (
                          <Link
                            key={page.href}
                            href={page.href}
                            style={isActive ? s.offcanvasLinkActive : s.offcanvasLink}
                            onClick={isActive && router.pathname === page.href
                              ? e => { e.preventDefault(); setMenuOpen(false); onCurrentPageClick?.(); }
                              : () => setMenuOpen(false)
                            }
                          >
                            {page.label}
                          </Link>
                        );
                      })}
                    </nav>
                  </div>
                </>
              )}
            </>
          ) : (
            <div style={s.desktopLinks}>
              {PAGES.map(page => {
                const isActive = page.href === `/${currentPage}`;
                return (
                  <Link
                    key={page.href}
                    href={page.href}
                    style={isActive ? s.desktopLinkActive : s.desktopLink}
                    onClick={isActive && router.pathname === page.href ? e => { e.preventDefault(); onCurrentPageClick?.(); } : undefined}
                  >
                    {page.label}
                  </Link>
                );
              })}
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}

function getStyles(dark, isMobile = false) {
  const headerBg  = dark ? '#1A1A1A' : '#FFFFFF';
  const text1     = dark ? '#EEEEEE' : '#000000';
  const textMuted = dark ? '#777777' : '#777777';

  return {
    header: {
      background: headerBg,
      borderBottom: '3px solid #FCBF22',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    },
    headerInner: {
      maxWidth: '800px',
      margin: '0 auto',
      padding: isMobile ? '10px 14px' : '10px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      position: 'relative',
    },
    mobilePageLabel: {
      position: 'absolute',
      left: '50%',
      transform: 'translateX(-50%)',
      color: text1,
      fontSize: '0.9rem',
      fontWeight: 700,
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
    },
    headerLogo: {
      display: 'flex',
      alignItems: 'center',
      gap: isMobile ? '8px' : '10px',
      textDecoration: 'none',
      flexShrink: 0,
    },
    headerTextWrap: {
      minWidth: 0,
    },
    headerThumb: {
      width: '34px',
      height: '34px',
      objectFit: 'cover',
      borderRadius: '4px',
      background: '#FCBF22',
      flexShrink: 0,
    },
    headerTitle: {
      color: text1,
      fontSize: isMobile ? '0.875rem' : '0.95rem',
      fontWeight: 900,
      letterSpacing: '-0.03em',
      whiteSpace: 'nowrap',
    },
    headerSub: {
      color: textMuted,
      fontSize: '0.62rem',
      fontWeight: 500,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      marginTop: '1px',
    },
    nav: {
      display: 'flex',
      gap: '8px',
      alignItems: 'center',
      flexShrink: 0,
    },
    darkToggle: {
      background: dark ? '#2A2A2A' : '#F0F0F0',
      border: 'none',
      cursor: 'pointer',
      color: dark ? '#FCBF22' : '#888888',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '36px',
      height: '36px',
      borderRadius: '8px',
      padding: 0,
      flexShrink: 0,
    },
    hamburgerBtn: {
      background: dark ? '#2A2A2A' : '#F0F0F0',
      border: 'none',
      cursor: 'pointer',
      color: text1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '36px',
      height: '36px',
      borderRadius: '8px',
      padding: 0,
    },
    desktopLinks: {
      display: 'flex',
      alignItems: 'center',
      gap: '2px',
      flexWrap: 'wrap',
      justifyContent: 'flex-end',
    },
    desktopLink: {
      color: textMuted,
      textDecoration: 'none',
      fontSize: '0.78rem',
      fontWeight: 500,
      padding: '5px 7px',
      borderRadius: '6px',
      whiteSpace: 'nowrap',
      borderBottom: '2px solid transparent',
    },
    desktopLinkActive: {
      color: text1,
      textDecoration: 'none',
      fontSize: '0.78rem',
      fontWeight: 700,
      padding: '5px 7px',
      borderRadius: '6px',
      whiteSpace: 'nowrap',
      borderBottom: '2px solid #FCBF22',
    },
    backdrop: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      zIndex: 150,
    },
    offcanvas: {
      position: 'fixed',
      top: 0,
      right: 0,
      bottom: 0,
      width: '280px',
      background: headerBg,
      borderLeft: `3px solid #FCBF22`,
      zIndex: 200,
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
    },
    offcanvasHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 16px',
      borderBottom: `1px solid ${dark ? '#2A2A2A' : '#EEEEEE'}`,
    },
    offcanvasLogo: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      textDecoration: 'none',
    },
    offcanvasTitle: {
      color: text1,
      fontSize: '0.95rem',
      fontWeight: 900,
      letterSpacing: '-0.03em',
    },
    offcanvasSub: {
      color: textMuted,
      fontSize: '0.62rem',
      fontWeight: 500,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      marginTop: '1px',
    },
    closeBtn: {
      background: dark ? '#2A2A2A' : '#F0F0F0',
      border: 'none',
      cursor: 'pointer',
      color: text1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '36px',
      height: '36px',
      borderRadius: '8px',
      padding: 0,
      flexShrink: 0,
    },
    offcanvasLink: {
      display: 'block',
      padding: '16px 20px',
      color: textMuted,
      textDecoration: 'none',
      fontSize: '1rem',
      fontWeight: 500,
      borderBottom: `1px solid ${dark ? '#2A2A2A' : '#F0F0F0'}`,
    },
    offcanvasLinkActive: {
      display: 'block',
      padding: '16px 20px 16px 17px',
      color: text1,
      textDecoration: 'none',
      fontSize: '1rem',
      fontWeight: 700,
      borderBottom: `1px solid ${dark ? '#2A2A2A' : '#F0F0F0'}`,
      borderLeft: '3px solid #FCBF22',
      background: dark ? '#252525' : '#F8F8F8',
    },
  };
}
