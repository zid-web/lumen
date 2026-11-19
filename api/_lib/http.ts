import type { ZodType, ZodTypeDef } from 'zod';
import type { ApiErrorCode } from '../../shared/contracts.js';
import type { Env } from './env.js';

const STATUS: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  FORBIDDEN: 403,
  METHOD_NOT_ALLOWED: 405,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  PROVIDER_ERROR: 502,
  PROVIDER_UNAVAILABLE: 503,
};

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

/** Corps max accepté (le texte est limité à 5000 caractères, marge pour l'UTF-8 et le JSON). */
const MAX_BODY_BYTES = 64 * 1024;

const DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function resolveCors(req: Request, env: Env): { allowed: boolean; headers: Record<string, string> } {
  const origin = req.headers.get('origin');
  const headers: Record<string, string> = { Vary: 'Origin' };
  // Requêtes same-origin sans en-tête Origin (GET navigateur, healthchecks).
  if (!origin) return { allowed: true, headers };

  const allowList = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  const sameOrigin = host !== null && new URL(origin).host === host;
  const isDev = env.VERCEL_ENV !== 'production' && DEV_ORIGIN.test(origin);
  const allowed = sameOrigin || allowList.includes(origin) || isDev;

  if (allowed) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Max-Age'] = '86400';
  }
  return { allowed, headers };
}

export function json(data: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...init.headers },
  });
}

export function errorResponse(err: unknown, headers: Record<string, string> = {}): Response {
  if (err instanceof ApiError) {
    return json({ error: { code: err.code, message: err.message } }, { status: STATUS[err.code], headers: { ...headers, ...err.headers } });
  }
  console.error('[api] unexpected error', err);
  return json({ error: { code: 'PROVIDER_ERROR', message: 'Erreur interne' } }, { status: 500, headers });
}

export async function parseBody<T>(req: Request, schema: ZodType<T, ZodTypeDef, unknown>): Promise<T> {
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > MAX_BODY_BYTES) throw new ApiError('PAYLOAD_TOO_LARGE', 'Requête trop volumineuse');
  if (!(req.headers.get('content-type') ?? '').includes('application/json')) {
    throw new ApiError('BAD_REQUEST', 'Content-Type application/json requis');
  }
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) throw new ApiError('PAYLOAD_TOO_LARGE', 'Requête trop volumineuse');
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new ApiError('BAD_REQUEST', 'JSON invalide');
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ApiError('BAD_REQUEST', first ? `${first.path.join('.') || 'body'}: ${first.message}` : 'Payload invalide');
  }
  return parsed.data;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return fwd?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'anonymous';
}

/**
 * Enveloppe commune : CORS, preflight, rate limit, gestion d'erreurs.
 */
export function handler(
  env: () => Env,
  fn: (req: Request, ctx: { env: Env; cors: Record<string, string> }) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req) => {
    let cors: Record<string, string> = {};
    try {
      const e = env();
      const c = resolveCors(req, e);
      cors = c.headers;
      if (!c.allowed) throw new ApiError('FORBIDDEN', 'Origine non autorisée');
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      const res = await fn(req, { env: e, cors });
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (err) {
      return errorResponse(err, cors);
    }
  };
}
