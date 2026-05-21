import Script from 'next/script';
import { SpeedInsights } from '@vercel/speed-insights/next';
import '../styles/globals.css';
import { usePullToRefresh } from '../hooks/usePullToRefresh';

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
      <style>{`@keyframes ptr-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function App({ Component, pageProps }) {
  const { pullY, refreshing, threshold } = usePullToRefresh();

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}');
        `}
      </Script>
      <PullIndicator pullY={pullY} refreshing={refreshing} threshold={threshold} />
      <Component {...pageProps} />
      <SpeedInsights />
    </>
  );
}
