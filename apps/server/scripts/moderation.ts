// Modération : traiter les signalements (model Report). À lancer sur le
// serveur de prod. Répond à l'exigence Apple 1.2(iv) : pouvoir AGIR sur le
// contenu signalé (les signalements étaient stockés mais rien ne permettait
// de les consulter/traiter).
//
//   pnpm --filter @serietime/server moderation                       # liste les signalements EN ATTENTE
//   pnpm --filter @serietime/server moderation -- delete-comment <commentId>  # supprime le commentaire signalé
//   pnpm --filter @serietime/server moderation -- dismiss <reportId>          # rejette un signalement (rien à faire)
//   pnpm --filter @serietime/server moderation -- resolve <reportId>          # marque traité (œuvre signalée)
//
// `delete-comment` supprime le commentaire ET, en cascade, ses réponses et les
// signalements associés (schema onDelete: Cascade). Aucun texte de commentaire
// n'est journalisé ailleurs.
import { prisma } from '../src/db/client.js';

const [, , command, arg] = process.argv;

function excerpt(body: string): string {
  const s = body.replace(/\s+/g, ' ').trim();
  return s.length > 140 ? s.slice(0, 140) + '…' : s;
}

async function list(): Promise<void> {
  const reports = await prisma.report.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' }, // le plus ancien d'abord (SLA 24 h)
    include: {
      reporter: { select: { displayName: true } },
      comment: { select: { id: true, body: true, user: { select: { displayName: true } } } },
    },
  });
  if (reports.length === 0) {
    console.log('✅ Aucun signalement en attente.');
    return;
  }
  console.log(`${reports.length} signalement(s) en attente (du plus ancien au plus récent) :\n`);
  for (const r of reports) {
    const when = r.createdAt.toISOString().slice(0, 16).replace('T', ' ');
    console.log(`— report ${r.id}  [${when}]  type=${r.mediaType}  raison=${r.reason}`);
    console.log(`  signalé par : ${r.reporter.displayName}`);
    if (r.mediaType === 'comment' && r.comment) {
      console.log(`  commentaire ${r.comment.id} de « ${r.comment.user.displayName} » : ${excerpt(r.comment.body)}`);
      console.log(`  → supprimer :  moderation -- delete-comment ${r.comment.id}`);
      console.log(`  → ignorer   :  moderation -- dismiss ${r.id}`);
    } else {
      console.log(`  œuvre : ${r.title}`);
      console.log(`  → traité :  moderation -- resolve ${r.id}   |   ignorer :  moderation -- dismiss ${r.id}`);
    }
    console.log('');
  }
}

async function setStatus(id: string, status: 'resolved' | 'dismissed'): Promise<void> {
  const updated = await prisma.report.update({ where: { id }, data: { status } }).catch(() => null);
  if (!updated) {
    console.error(`❌ Signalement introuvable : ${id}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✅ Signalement ${id} → ${status}.`);
}

async function deleteComment(commentId: string): Promise<void> {
  const c = await prisma.comment.findUnique({ where: { id: commentId }, select: { id: true } });
  if (!c) {
    console.error(`❌ Commentaire introuvable : ${commentId}`);
    process.exitCode = 1;
    return;
  }
  // Cascade : supprime aussi les réponses et les signalements liés.
  await prisma.comment.delete({ where: { id: commentId } });
  console.log(`🗑️  Commentaire ${commentId} supprimé (réponses et signalements associés inclus).`);
}

async function main(): Promise<void> {
  switch (command) {
    case undefined:
    case 'list':
      await list();
      break;
    case 'resolve':
    case 'dismiss':
      if (!arg) throw new Error(`usage : moderation -- ${command} <reportId>`);
      await setStatus(arg, command === 'resolve' ? 'resolved' : 'dismissed');
      break;
    case 'delete-comment':
      if (!arg) throw new Error('usage : moderation -- delete-comment <commentId>');
      await deleteComment(arg);
      break;
    default:
      throw new Error(`commande inconnue « ${command} ». Utilise : list | delete-comment <id> | dismiss <id> | resolve <id>`);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
