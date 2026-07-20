import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

// Respecte le réglage système « Réduire les animations » (accessibilité) :
// quand il est actif, on désactive/raccourcit nos animations. Bonne pratique
// standard — certaines personnes ont la nausée avec les mouvements.
//
// L'abonnement natif est partagé : une longue liste de cartes animées ne crée
// plus un listener AccessibilityInfo par composant.
type StoreListener = () => void;

const listeners = new Set<StoreListener>();
let reduceMotionEnabled = false;
let nativeSubscription: { remove?: () => void } | null = null;
let subscriptionEpoch = 0;

function emitIfChanged(next: boolean) {
  if (next === reduceMotionEnabled) return;
  reduceMotionEnabled = next;
  listeners.forEach((listener) => listener());
}

function startNativeSubscription() {
  if (nativeSubscription) return;

  const epoch = ++subscriptionEpoch;
  AccessibilityInfo.isReduceMotionEnabled()
    .then((enabled) => {
      if (epoch === subscriptionEpoch) emitIfChanged(enabled);
    })
    .catch(() => undefined);

  nativeSubscription = AccessibilityInfo.addEventListener('reduceMotionChanged', emitIfChanged);
}

function subscribe(listener: StoreListener) {
  listeners.add(listener);
  startNativeSubscription();

  return () => {
    listeners.delete(listener);
    if (listeners.size !== 0) return;

    subscriptionEpoch += 1;
    nativeSubscription?.remove?.();
    nativeSubscription = null;
  };
}

function getSnapshot() {
  return reduceMotionEnabled;
}

export function useReduceMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
