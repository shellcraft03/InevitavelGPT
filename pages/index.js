import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';

export default function Entry() {
  const widgetIdRef = useRef(null);
  const turnstileResolve = useRef(null);
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.turnstile) {
      if (!widgetIdRef.current) {
        widgetIdRef.current = window.turnstile.render('#turnstile-container', {
          sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
          callback: (token) => {
            sessionStorage.setItem('turnstileToken', token);
            if (turnstileResolve.current) {
              turnstileResolve.current(token);
              turnstileResolve.current = null;
            }
            router.push('/qa');
          }
        });
        setReady(true);
      }
      return;
    }

    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    s.async = true;
    s.defer = true;
    s.onload = () => {
      if (window.turnstile && !widgetIdRef.current) {
        widgetIdRef.current = window.turnstile.render('#turnstile-container', {
          sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
          callback: (token) => {
            sessionStorage.setItem('turnstileToken', token);
            if (turnstileResolve.current) {
              turnstileResolve.current(token);
              turnstileResolve.current = null;
            }
            router.push('/qa');
          }
        });
        setReady(true);
      }
    };
    document.body.appendChild(s);
  }, [router]);

  async function execute() {
    if (window.turnstile && widgetIdRef.current != null) {
      await new Promise((resolve) => { turnstileResolve.current = resolve; window.turnstile.execute(widgetIdRef.current); });
    } else {
      alert('Turnstile not ready');
    }
  }

  return (
    <main style={{ padding: 20, fontFamily: 'Arial, sans-serif' }}>
      <h1>Bem-vindo — Verificação necessária</h1>
      <p>Por favor, prove que você não é um robô para acessar a página de perguntas e respostas.</p>

      <div id="turnstile-container" style={{ marginTop: 12 }} />

      <div style={{ marginTop: 12 }}>
        <button onClick={execute} disabled={!ready}>Verificar e Entrar</button>
      </div>
    </main>
  );
}
