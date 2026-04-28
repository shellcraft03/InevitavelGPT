import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

export default function QA() {
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState(null);
  const router = useRouter();

  useEffect(() => {
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('turnstileToken') : null;
    if (!token) {
      router.replace('/');
    } else {
      setTurnstileToken(token);
    }
  }, [router]);

  async function ask() {
    if (!q.trim()) return;
    setLoading(true);
    if (!turnstileToken) {
      setLoading(false);
      return alert('Verificação necessária. Volte para a página inicial.');
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
