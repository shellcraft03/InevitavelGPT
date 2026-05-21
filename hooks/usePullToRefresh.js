import { useEffect, useRef, useState } from 'react';

const THRESHOLD = 72;

export function usePullToRefresh() {
  const [pullY, setPullY]         = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef(null);
  const pulling     = useRef(false);

  useEffect(() => {
    function onTouchStart(e) {
      if (window.scrollY === 0) {
        touchStartY.current = e.touches[0].clientY;
        pulling.current = true;
      }
    }

    function onTouchMove(e) {
      if (!pulling.current) return;
      const dy = e.touches[0].clientY - touchStartY.current;
      if (dy > 0) setPullY(Math.min(dy, THRESHOLD + 24));
      else { pulling.current = false; setPullY(0); }
    }

    function onTouchEnd() {
      if (!pulling.current) return;
      pulling.current = false;
      setPullY(prev => {
        if (prev >= THRESHOLD) {
          setRefreshing(true);
          setTimeout(() => window.location.reload(), 300);
        }
        return 0;
      });
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove',  onTouchMove,  { passive: true });
    window.addEventListener('touchend',   onTouchEnd);
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove',  onTouchMove);
      window.removeEventListener('touchend',   onTouchEnd);
    };
  }, []);

  return { pullY, refreshing, threshold: THRESHOLD };
}
