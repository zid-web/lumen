import { SyncIdSchema, SyncItemSchema, SyncPutSchema, SYNC_MAX_BOOK_CHARS } from '../shared/contracts.js';
import { readEnv, type Env } from './_lib/env.js';
import { ApiError, clientIp, handler, json, parseBody } from './_lib/http.js';
import { enforceRateLimit } from './_lib/ratelimit.js';
import { getSyncStore, type SyncStore } from './_lib/syncStore.js';

export const config = { runtime: 'nodejs' };

/**
 * Synchronisation entre appareils, sans compte.
 * Le client dérive `X-Sync-Id` de son code de synchro et chiffre les données (AES-GCM)
 * avant l'envoi : ce serveur ne stocke que des blobs opaques.
 *   GET    /api/sync?item=state|book:<id>
 *   PUT    /api/sync  { item, data, updatedAt }
 *   DELETE /api/sync?item=book:<id>
 */
export function createSyncHandler(storeFor: (env: Env) => Promise<SyncStore | null>) {
  return handler(readEnv, async (req, { env }) => {
    const store = await storeFor(env);
    if (!store) throw new ApiError('PROVIDER_UNAVAILABLE', 'Synchronisation non configurée sur ce serveur');

    const id = SyncIdSchema.safeParse(req.headers.get('x-sync-id'));
    if (!id.success) throw new ApiError('BAD_REQUEST', 'En-tête X-Sync-Id invalide');
    const rl = await enforceRateLimit(env, 'sync', clientIp(req), 120, 60);
    const itemParam = () => {
      const p = SyncItemSchema.safeParse(new URL(req.url).searchParams.get('item'));
      if (!p.success) throw new ApiError('BAD_REQUEST', 'Paramètre item invalide');
      return p.data;
    };

    switch (req.method) {
      case 'GET': {
        const rec = await store.get(id.data, itemParam());
        if (!rec) throw new ApiError('NOT_FOUND', 'Aucune donnée', rl);
        return json(rec, { headers: rl });
      }
      case 'PUT': {
        const body = await parseBody(req, SyncPutSchema, SYNC_MAX_BOOK_CHARS + 4096);
        await store.put(id.data, body.item, { data: body.data, updatedAt: body.updatedAt });
        return json({ ok: true }, { headers: rl });
      }
      case 'DELETE': {
        await store.delete(id.data, itemParam());
        return json({ ok: true }, { headers: rl });
      }
      default:
        throw new ApiError('METHOD_NOT_ALLOWED', 'Méthode non autorisée');
    }
  });
}

const run = createSyncHandler(getSyncStore);
export const GET = run;
export const PUT = run;
export const DELETE = run;
export const OPTIONS = run;
