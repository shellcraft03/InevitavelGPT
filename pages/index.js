import { useState, useEffect, useRef } from 'react';

export default function Home() {
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState(null);
  const widgetIdRef = useRef(null);
  const turnstileResolve = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.turnstile) {
      if (!widgetIdRef.current) {
        widgetIdRef.current = window.turnstile.render('#turnstile-container', {
          sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
          callback: (token) => {
            setTurnstileToken(token);
            if (turnstileResolve.current) {
              turnstileResolve.current(token);
              turnstileResolve.current = null;
            }
          }
        });
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
            setTurnstileToken(token);
            if (turnstileResolve.current) {
              turnstileResolve.current(token);
              turnstileResolve.current = null;
            }
          }
        });
      }
    };
    document.body.appendChild(s);
  }, []);

  async function ask() {
    if (!q.trim()) return;
    setLoading(true);
    if (!turnstileToken) {
      if (window.turnstile && widgetIdRef.current != null) {
        await new Promise((resolve) => { turnstileResolve.current = resolve; window.turnstile.execute(widgetIdRef.current); });
      } else {
        setLoading(false);
        return alert('Turnstile not ready');
      }
    }

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, turnstileToken })
    });
    const data = await res.json();
    setAnswer(data);
    setLoading(false);
  }

  return (
    <main style={{ padding: 20, fontFamily: 'Arial, sans-serif' }}>
      <h1>Livro Amarelo — Q&A</h1>

      <section style={{ marginTop: 20 }}>
        <h2>Question</h2>
        <input value={q} onChange={e => setQ(e.target.value)} style={{ width: 600 }} />
        <div style={{ marginTop: 8 }}>
          <button onClick={ask} disabled={loading}>Ask</button>
        </div>
        <div id="turnstile-container" style={{ marginTop: 12 }} />
      </section>

      {answer && (
        <section style={{ marginTop: 20 }}>
          <h2>Answer</h2>
          <div style={{ whiteSpace: 'pre-wrap', border: '1px solid #ddd', padding: 12 }}>
            {answer.text}
          </div>
        </section>
      )}
    </main>
  );
}
