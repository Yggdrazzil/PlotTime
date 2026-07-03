import { prisma } from '../../db/client.js';

type NotifPayload = {
  type: string;
  title: string;
  body?: string | null;
  imageUrl?: string | null;
  mediaId?: string;
  commentId?: string;
};

function meta(actorId: string, p: NotifPayload): string {
  return JSON.stringify({ actorId, mediaId: p.mediaId, commentId: p.commentId });
}

// Notifie un utilisateur précis (jamais soi-même).
export async function notifyUser(recipientId: string, actorId: string, p: NotifPayload): Promise<void> {
  if (recipientId === actorId) return;
  await prisma.notification.create({
    data: {
      userId: recipientId,
      type: p.type,
      title: p.title,
      body: p.body ?? undefined,
      imageUrl: p.imageUrl ?? undefined,
      date: new Date(),
      metadataJson: meta(actorId, p),
    },
  });
}

// Notifie tous les abonnés d'un utilisateur (activité).
export async function notifyFollowers(actorId: string, p: NotifPayload): Promise<void> {
  const followers = await prisma.follow.findMany({
    where: { followingId: actorId },
    select: { followerId: true },
  });
  if (followers.length === 0) return;
  const now = new Date();
  await prisma.notification.createMany({
    data: followers.map((f) => ({
      userId: f.followerId,
      type: p.type,
      title: p.title,
      body: p.body ?? undefined,
      imageUrl: p.imageUrl ?? undefined,
      date: now,
      metadataJson: meta(actorId, p),
    })),
  });
}
