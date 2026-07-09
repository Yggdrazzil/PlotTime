import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// Respecte le réglage système « Réduire les animations » (accessibilité) :
// quand il est actif, on désactive/raccourcit nos animations. Bonne pratique
// standard — certaines personnes ont la nausée avec les mouvements.
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => mounted && setReduce(v)).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduce(v));
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}
