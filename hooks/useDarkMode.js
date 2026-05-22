import { useState, useEffect } from 'react';

export function useDarkMode() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) setDark(saved === 'true');
  }, []);

  function toggleDark() {
    setDark(d => {
      const next = !d;
      localStorage.setItem('darkMode', String(next));
      return next;
    });
  }

  return [dark, toggleDark];
}
