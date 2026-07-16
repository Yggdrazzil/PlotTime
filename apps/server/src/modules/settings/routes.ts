import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/client.js';
import { requireAuth } from '../auth/routes.js';
import { fromJson, toJson } from '../../utils/json.js';
import { getUserLang, invalidateUserLang } from '../media/userLang.js';
import { backfillUserTranslations } from '../../services/tmdb/index.js';

// Langues de contenu proposées (titres/résumés des séries et films).
const CONTENT_LANGUAGES = ['fr', 'en', 'es', 'de', 'it', 'pt'] as const;

const DEFAULT_SETTINGS = {
  titlesInUserLanguage: true,
  commentLanguages: ['fr', 'en'],
  notifications: { newEpisode: true, newMovie: true, importDone: true },
  theme: 'light' as 'system' | 'light' | 'dark' | 'sunset',
  autoplayTrailers: false,
  upcoming: { hideWatched: false, channels: [] as string[] },
  subscriptions: [] as string[],
  appLock: false,
};

export type AppSettings = typeof DEFAULT_SETTINGS;

export async function getSettings(): Promise<AppSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: 'app' } });
  return { ...DEFAULT_SETTINGS, ...fromJson<Partial<AppSettings>>(row?.valueJson, {}) };
}

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get('/api/settings', async (request) => {
    // `language` est PAR UTILISATEUR (User.language), contrairement au reste
    // des réglages (globaux) : on l'ajoute à la réponse pour l'UI.
    const language = await getUserLang(request.userId);
    return { settings: { ...(await getSettings()), language } };
  });

  app.post('/api/settings', async (request) => {
    const patch = z.record(z.unknown()).parse(request.body);

    // Langue de contenu : mise à jour de User.language + backfill EN FOND des
    // traductions de la bibliothèque (réponse immédiate, `started: true`).
    let translationsStarted = false;
    let language: string | undefined;
    if (patch.language !== undefined) {
      language = z.enum(CONTENT_LANGUAGES).parse(patch.language);
      delete patch.language; // par utilisateur — ne va pas dans AppSetting
      await prisma.user.update({ where: { id: request.userId }, data: { language } });
      invalidateUserLang(request.userId);
      if (language !== 'fr') {
        translationsStarted = true;
        void backfillUserTranslations(request.userId, language).catch(() => undefined);
      }
    }

    const current = await getSettings();
    const next = { ...current, ...patch };
    if (Object.keys(patch).length > 0) {
      await prisma.appSetting.upsert({
        where: { key: 'app' },
        create: { key: 'app', valueJson: toJson(next) },
        update: { valueJson: toJson(next) },
      });
    }
    return {
      settings: { ...next, language: language ?? (await getUserLang(request.userId)) },
      ...(translationsStarted ? { started: true } : {}),
    };
  });

  app.post('/api/cache/clear', async () => {
    const { count } = await prisma.apiCache.deleteMany({});
    return { ok: true, cleared: count };
  });

  app.get('/api/notifications', async (request) => {
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: request.userId },
        orderBy: { date: 'desc' },
        take: 100,
      }),
      prisma.notification.count({ where: { userId: request.userId, isRead: false } }),
    ]);
    return {
      unreadCount,
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        imageUrl: n.imageUrl,
        date: n.date.toISOString(),
        isRead: n.isRead,
        meta: n.metadataJson ? (JSON.parse(n.metadataJson) as Record<string, string>) : {},
      })),
    };
  });

  app.get('/api/notifications/unread-count', async (request) => {
    const unreadCount = await prisma.notification.count({
      where: { userId: request.userId, isRead: false },
    });
    return { unreadCount };
  });

  app.post('/api/notifications/:id/read', async (request) => {
    const { id } = request.params as { id: string };
    await prisma.notification.updateMany({
      where: { id, userId: request.userId },
      data: { isRead: true },
    });
    return { ok: true };
  });

  // Marque toutes les notifications comme lues.
  app.post('/api/notifications/read', async (request) => {
    await prisma.notification.updateMany({
      where: { userId: request.userId, isRead: false },
      data: { isRead: true },
    });
    return { ok: true };
  });
}
