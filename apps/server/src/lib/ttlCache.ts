// Cache mémoire TTL générique pour les agrégations coûteuses (classements,
// recommandations, défi hebdo) — même philosophie que le cache de getUserLang
// (media/userLang.ts) : Map + timestamps, pas de dépendance, invalidation
// simple. Ces agrégations relisent tout l'historique de moi + mes abonnements
// (plusieurs GROUP BY sur 20k+ lignes par compte) et sont appelées par CHAQUE
// client qui ouvre l'onglet Communauté : quelques secondes de cache suffisent
// à absorber les rafales sans jamais montrer de données vraiment périmées.
//
// IMPORTANT : désactivé quand NODE_ENV === 'test' (les tests vitest posent des
// données puis relisent immédiatement le même endpoint — un hit de cache
// renverrait l'état d'avant). Même règle que le rate-limit global (app.ts).
// Lu au moment de l'appel (et pas à l'import) : les tests posent
// process.env.NODE_ENV avant d'importer app, on reste correct quel que soit
// l'ordre d'import des modules.

type Entry<V> = { value: V; ts: number };

export type TtlCache<V> = {
  get: (key: string) => V | undefined;
  set: (key: string, value: V) => void;
  invalidate: (key: string) => void;
  clear: () => void;
};

export function createTtlCache<V>(ttlMs: number, maxEntries = 500): TtlCache<V> {
  const store = new Map<string, Entry<V>>();
  const disabled = () => process.env.NODE_ENV === 'test' || ttlMs <= 0;
  return {
    get(key: string): V | undefined {
      if (disabled()) return undefined;
      const hit = store.get(key);
      if (!hit) return undefined;
      if (Date.now() - hit.ts >= ttlMs) {
        store.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key: string, value: V): void {
      if (disabled()) return;
      // Taille bornée : on évince les entrées les plus anciennes (ordre
      // d'insertion de la Map — re-set déplace la clé en fin, donc les
      // premières clés sont bien les plus vieilles).
      store.delete(key);
      store.set(key, { value, ts: Date.now() });
      while (store.size > maxEntries) {
        const oldest = store.keys().next().value;
        if (oldest === undefined) break;
        store.delete(oldest);
      }
    },
    invalidate(key: string): void {
      store.delete(key);
    },
    clear(): void {
      store.clear();
    },
  };
}
