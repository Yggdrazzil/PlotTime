import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

// SQLite : WAL + busy_timeout, indispensables dès qu'on a des écritures de fond
// (sync des épisodes, resync, imports) pendant que l'app lit. En mode `delete`
// (défaut), UNE écriture bloque TOUTES les lectures → « database is locked »,
// files « À voir » vides et actions optimistes qui rollback côté app.
// - WAL : les lecteurs ne sont jamais bloqués par l'écrivain (et inversement) ;
// - busy_timeout : au lieu d'échouer immédiatement, on attend jusqu'à 5 s ;
// - synchronous=NORMAL : durabilité suffisante en WAL, écritures plus rapides.
void (async () => {
  try {
    await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
    await prisma.$queryRawUnsafe('PRAGMA busy_timeout=5000;');
    await prisma.$queryRawUnsafe('PRAGMA synchronous=NORMAL;');
  } catch {
    /* best-effort : si un PRAGMA échoue, on garde le comportement par défaut */
  }
})();
