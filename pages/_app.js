import NextApp from 'next/app';
import Script from 'next/script';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { SpeedInsights } from '@vercel/speed-insights/next';
import '../styles/globals.css';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { useDarkMode } from '../hooks/useDarkMode';

const GA_ID = 'G-N3437C3V4E';

function PullIndicator({ pullY, refreshing, threshold }) {
  const progress = Math.min(pullY / threshold, 1);
  const visible  = pullY > 4 || refreshing;
  if (!visible) return null;

  return (
    <div style={{
      position:       'fixed',
      top:            refreshing ? 16 : Math.max(pullY - 40, 4),
      left:           '50%',
      transform:      'translateX(-50%)',
      zIndex:         9999,
      background:     '#FCBF22',
      borderRadius:   '999px',
      width:          36,
      height:         36,
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      boxShadow:      '0 2px 8px rgba(0,0,0,0.18)',
      opacity:        refreshing ? 1 : 0.4 + progress * 0.6,
      transition:     refreshing ? 'top 0.2s' : 'none',
      pointerEvents:  'none',
    }}>
      {refreshing ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          style={{ animation: 'ptr-spin 0.7s linear infinite' }}>
          <path d="M21 12a9 9 0 1 1-6.22-8.56" stroke="#000" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          style={{ transform: `rotate(${progress * 180}deg)`, transition: 'transform 0.05s' }}>
          <line x1="12" y1="4" x2="12" y2="18" stroke="#000" strokeWidth="2.5" strokeLinecap="round"/>
          <polyline points="6,12 12,19 18,12" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </div>
  );
}

function DonationBanner({ dark, onDismiss }) {
  const bg      = dark ? '#1e1a0e' : '#fffbef';
  const text    = dark ? '#f0de8a' : '#78350f';
  const muted   = dark ? '#a89550' : '#92400e';

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 500,
      background: bg, borderTop: '2px solid #FCBF22',
      padding: '10px 16px 10px 24px', display: 'flex', alignItems: 'center',
      justifyContent: 'center', gap: '12px', flexWrap: 'wrap',
    }}>
      <span style={{ color: text, flex: 1, minWidth: '200px', fontSize: '0.8rem', lineHeight: 1.4 }}>
        Apoie o projeto.{' '}
        <span style={{ color: muted }}>
          Doações por aqui não dão créditos para o Bot X/Twitter — para obter créditos, acesse{' '}
          <a href="/inevitavelgpt2" style={{ color: '#FCBF22', fontWeight: 700, textDecoration: 'none' }}>
            Bot X/Twitter
          </a>.
        </span>
      </span>
      <a
        href="https://livepix.gg/inevitavelbot"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          background: '#FCBF22', color: '#000', fontWeight: 700,
          fontSize: '0.8rem', padding: '6px 14px', borderRadius: '6px',
          textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
        }}
      >
        Apoiar ↗
      </a>
      <button
        onClick={onDismiss}
        aria-label="Fechar"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: muted, fontSize: '1.2rem', lineHeight: 1,
          padding: '0 4px', flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}

export default function App({ Component, pageProps, nonce }) {
  const { pullY, refreshing, threshold } = usePullToRefresh();
  const [dark] = useDarkMode();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const router = useRouter();
  const showBanner = !bannerDismissed
    && router.pathname !== '/'
    && !router.pathname.startsWith('/inevitavelgpt2');

  useEffect(() => {
    if (sessionStorage.getItem('donationBannerDismissed') === 'true') {
      setBannerDismissed(true);
    }
  }, []);

  function dismissBanner() {
    sessionStorage.setItem('donationBannerDismissed', 'true');
    setBannerDismissed(true);
  }

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
        nonce={nonce}
      />
      <Script id="google-analytics" strategy="afterInteractive" nonce={nonce}>
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}');
        `}
      </Script>
      <PullIndicator pullY={pullY} refreshing={refreshing} threshold={threshold} />
      <Component {...pageProps} />
      {showBanner && <div style={{ height: '56px' }} aria-hidden="true" />}
      {showBanner && <DonationBanner dark={dark} onDismiss={dismissBanner} />}
      <SpeedInsights />
    </>
  );
}

App.getInitialProps = async (appContext) => {
  const appProps = await NextApp.getInitialProps(appContext);
  const nonce = appContext.ctx.req?.headers['x-nonce'] ?? '';
  return { ...appProps, nonce };
};
