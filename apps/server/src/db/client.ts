import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

// SQLite : WAL + busy_timeout, indispensables dès qu'on a des écritures de fond
// (sync des épisodes, resync, imports) pendant que l'app lit. En mode `delete`
// (défaut), UNE écriture bloque TOUTES les lectures → « database is locked »,
// files « À voir » vides et actions optimistes qui rollback côté app.
// - WAL : les lecteurs ne sont jamais bloqués par l'écrivain (et inversement) ;
// - busy_timeout : au lieu d'échouer immédiatement, on attend jusqu'à 5 s ;
// - synchronous=NORMAL : durabilité suffisante en WAL, écritures plus rapides.
//
// Réglages mémoire (ajout 2026-07 — le conteneur prod est passé de 512 Mo à
// 2 Go de RAM, cf. docker-compose.prod.yml `mem_limit: 2g`) : la DB prod fait
// ~425 Mo, le cache SQLite par défaut (~2 Mo) forçait des relectures disque
// permanentes sur les gros scans (stats, classements, imports).
// - cache_size=-64000 : 64 Mo de cache de pages (valeur négative = en Kio) ;
// - mmap_size=256 Mo : lectures via mmap — les pages chaudes restent dans le
//   page cache de l'OS, moins de syscalls read() (parfait pour une DB lue
//   massivement et écrite modérément).
// Best-effort : si un PRAGMA échoue (vieux SQLite, FS sans mmap), on garde le
// comportement par défaut sans bloquer le boot.
void (async () => {
  try {
    await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
    await prisma.$queryRawUnsafe('PRAGMA busy_timeout=5000;');
    await prisma.$queryRawUnsafe('PRAGMA synchronous=NORMAL;');
    await prisma.$queryRawUnsafe('PRAGMA cache_size=-64000;');
    await prisma.$queryRawUnsafe('PRAGMA mmap_size=268435456;');
  } catch {
    /* best-effort : si un PRAGMA échoue, on garde le comportement par défaut */
  }
})();
