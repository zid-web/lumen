/**
 * Chiffrement de bout en bout de la synchro.
 * Du code de synchro (≈100 bits d'entropie) on dérive via HKDF :
 *  - un identifiant public (envoyé au serveur dans X-Sync-Id),
 *  - une clé AES-GCM 256 qui ne quitte jamais l'appareil.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // base32 de Crockford (sans I, L, O, U)
const enc = new TextEncoder();
const dec = new TextDecoder();

export function generateSyncCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return formatSyncCode(Array.from(bytes, (b) => ALPHABET[b % 32]).join(''));
}

/** Normalise une saisie : majuscules, sans séparateurs, O→0, I/L→1. */
export function normalizeSyncCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/U/g, 'V');
}

export function isValidSyncCode(input: string): boolean {
  const n = normalizeSyncCode(input);
  return n.length === 20 && [...n].every((c) => ALPHABET.includes(c));
}

export function formatSyncCode(input: string): string {
  return (normalizeSyncCode(input).match(/.{1,5}/g) ?? []).join('-');
}

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

export interface SyncKeys {
  id: string;
  key: CryptoKey;
}

export async function deriveSyncKeys(code: string): Promise<SyncKeys> {
  const base = await crypto.subtle.importKey('raw', enc.encode(normalizeSyncCode(code)), 'HKDF', false, ['deriveBits', 'deriveKey']);
  const salt = enc.encode('lumen-sync-v1');
  const idBits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('id') }, base, 256);
  const key = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('aes-gcm') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return { id: hex(idBits), key };
}

async function pipe(data: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const out = new Blob([data]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** JSON → gzip (si disponible) → AES-GCM → base64. Format : [flag][iv 12][chiffré]. */
export async function encryptJson(key: CryptoKey, value: unknown): Promise<string> {
  let payload: Uint8Array<ArrayBuffer> = new Uint8Array(enc.encode(JSON.stringify(value)));
  let flag = 0;
  if (typeof CompressionStream !== 'undefined') {
    payload = await pipe(payload, new CompressionStream('gzip'));
    flag = 1;
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, payload));
  const out = new Uint8Array(1 + iv.length + ct.length);
  out[0] = flag;
  out.set(iv, 1);
  out.set(ct, 13);
  return toBase64(out);
}

export async function decryptJson<T>(key: CryptoKey, b64: string): Promise<T> {
  const raw = fromBase64(b64);
  const flag = raw[0];
  const iv = raw.subarray(1, 13);
  let plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, raw.subarray(13)));
  if (flag === 1) plain = await pipe(plain, new DecompressionStream('gzip'));
  return JSON.parse(dec.decode(plain)) as T;
}
