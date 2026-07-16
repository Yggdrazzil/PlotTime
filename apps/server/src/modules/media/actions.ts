import { prisma } from '../../db/client.js';
import { toJson } from '../../utils/json.js';
import { scheduleRecompute } from '../gamification/service.js';

// Spec §32.1 — marquer épisode vu.
export async function markEpisodeWatched(
  userId: string,
  episodeId: string,
  watchedAt: Date = new Date(),
  source = 'app',
): Promise<void> {
  const episode = await prisma.episode.findUniqueOrThrow({
    where: { id: episodeId },
    include: { show: true },
  });
  await prisma.userEpisodeStatus.upsert({
    where: { userId_episodeId: { userId, episodeId } },
    create: { userId, episodeId, status: 'watched', watchedAt },
    update: { status: 'watched', watchedAt },
  });
  await prisma.watchEvent.create({
    data: {
      userId,
      mediaId: episode.show.mediaId,
      episodeId,
      eventType: 'watched',
      eventDate: watchedAt,
      source,
    },
  });
  await recalculateShowStatus(userId, episode.showId, watchedAt);
  scheduleRecompute(userId); // gamification : XP/badges/streak (débouncé)
}

// Spec §32.2 — marquer épisode non vu.
export async function markEpisodeUnwatched(userId: string, episodeId: string): Promise<void> {
  const episode = await prisma.episode.findUniqueOrThrow({
    where: { id: episodeId },
    include: { show: true },
  });
  await prisma.userEpisodeStatus.upsert({
    where: { userId_episodeId: { userId, episodeId } },
    create: { userId, episodeId, status: 'unwatched', watchedAt: null },
    update: { status: 'unwatched', watchedAt: null },
  });
  await prisma.watchEvent.create({
    data: {
      userId,
      mediaId: episode.show.mediaId,
      episodeId,
      eventType: 'marked_unwatched',
      eventDate: new Date(),
      source: 'app',
    },
  });
  await recalculateShowStatus(userId, episode.showId, null);
  scheduleRecompute(userId); // gamification : recompute idempotent après dé-coche
}

export async function recalculateShowStatus(
  userId: string,
  showId: string,
  lastWatchedAt: Date | null,
): Promise<void> {
  const show = await prisma.show.findUniqueOrThrow({
    where: { id: showId },
    include: { media: true },
  });
  const [watchedCount, totalCount] = await Promise.all([
    prisma.userEpisodeStatus.count({
      where: { userId, status: 'watched', episode: { showId, seasonNumber: { gt: 0 } } },
    }),
    prisma.episode.count({ where: { showId, seasonNumber: { gt: 0 } } }),
  ]);

  const existing = await prisma.userMediaStatus.findUnique({
    where: { userId_mediaId: { userId, mediaId: show.mediaId } },
  });
  const showEnded = show.media.status ? /ended|canceled|cancelled|terminée?/i.test(show.media.status) : false;

  let status = existing?.status ?? 'not_started';
  if (watchedCount === 0) {
    if (status === 'watching' || status === 'completed') status = 'not_started';
  } else if (totalCount > 0 && watchedCount >= totalCount && showEnded) {
    status = 'completed';
  } else if (status !== 'abandoned' && status !== 'paused') {
    status = 'watching';
  }

  await prisma.userMediaStatus.upsert({
    where: { userId_mediaId: { userId, mediaId: show.mediaId } },
    create: {
      userId,
      mediaId: show.mediaId,
      status,
      lastWatchedAt: lastWatchedAt ?? undefined,
      startedAt: watchedCount > 0 ? lastWatchedAt ?? new Date() : undefined,
      completedAt: status === 'completed' ? new Date() : undefined,
    },
    update: {
      status,
      ...(lastWatchedAt ? { lastWatchedAt } : {}),
      ...(watchedCount > 0 && !existing?.startedAt ? { startedAt: lastWatchedAt ?? new Date() } : {}),
      ...(status === 'completed' && !existing?.completedAt ? { completedAt: new Date() } : {}),
    },
  });
}

export async function createWatchEvent(
  userId: string,
  mediaId: string,
  eventType: string,
  metadata?: unknown,
): Promise<void> {
  await prisma.watchEvent.create({
    data: {
      userId,
      mediaId,
      eventType,
      eventDate: new Date(),
      source: 'app',
      metadataJson: metadata === undefined ? null : toJson(metadata),
    },
  });
}
