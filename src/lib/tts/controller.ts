import { createStore, type StoreApi } from 'zustand/vanilla';
import type { SupportedLang, VoiceGender, WordBoundary } from '@shared/langs';
import { CloudTtsProvider } from './cloud';
import type { TtsEngine, TtsProviderId, TtsSynthesisRequest, TtsSynthesisResult } from './types';
import { webSpeech, webSpeechSupported } from './webspeech';

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface PlayerState {
  status: PlayerStatus;
  queueId: string | null;
  paragraph: number;
  /** Mot en cours (offsets dans le paragraphe courant). */
  word: { start: number; length: number } | null;
  provider: TtsProviderId | null;
  /** Message non bloquant (bascule de provider, autoplay bloqué…). */
  notice: string | null;
}

export interface PlayerQueue {
  id: string;
  paragraphs: string[];
  lang: SupportedLang;
  title: string;
  artist: string;
  album: string;
}

export interface VoiceSettings {
  gender: VoiceGender;
  speed: number;
  pitch: number;
  engine?: TtsEngine;
}

export interface ControllerHandlers {
  onParagraph?: (queueId: string, index: number) => void;
  onQueueEnd?: (queueId: string) => void;
  /** Appelé à chaque arrêt/pause : sert à sauvegarder la position. */
  onHalt?: (queueId: string, index: number) => void;
}

export interface ControllerOptions {
  getVoice: () => VoiceSettings;
  /** Provider serveur actif (d'après /api/health), ou null pour Web Speech seul. */
  getCloud: () => CloudTtsProvider | null;
  mediaSession?: boolean;
}

const MAX_FAILURES_BEFORE_DEGRADE = 2;

/** 0,5 s de silence WAV (8 kHz, 8 bits) — garde la page « audible » en arrière-plan pour Web Speech. */
function silentWavUrl(): string {
  const samples = 4000;
  const buf = new ArrayBuffer(44 + samples);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + samples, true);
  w(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  w(36, 'data');
  v.setUint32(40, samples, true);
  new Uint8Array(buf, 44).fill(128);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

function findBoundary(bounds: WordBoundary[], ms: number): WordBoundary | null {
  let lo = 0;
  let hi = bounds.length - 1;
  let found: WordBoundary | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const b = bounds[mid];
    if (!b) break;
    if (b.startMs <= ms) {
      found = b;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

function sig(req: TtsSynthesisRequest): string {
  return `${req.engine ?? 'auto'}|${req.lang}|${req.gender}|${req.speed}|${req.pitch}|${req.text}`;
}

/**
 * Contrôleur de lecture TTS, indépendant de React.
 * Lit une file de paragraphes, avec provider serveur + cache IndexedDB,
 * préchargement du paragraphe suivant et repli automatique sur Web Speech.
 */
export class TtsController {
  readonly store: StoreApi<PlayerState> = createStore<PlayerState>(() => ({
    status: 'idle',
    queueId: null,
    paragraph: 0,
    word: null,
    provider: null,
    notice: null,
  }));

  private handlers: ControllerHandlers = {};
  private queue: PlayerQueue | null = null;
  private gen = 0;
  private mode: 'audio' | 'speech' | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private keepAliveEl: HTMLAudioElement | null = null;
  private keepAliveTimer: ReturnType<typeof setTimeout> | undefined;
  private currentUrl: string | null = null;
  private boundaries: WordBoundary[] = [];
  private raf = 0;
  private cancelSpeech: (() => void) | null = null;
  private speechReq: TtsSynthesisRequest | null = null;
  private lastWordStart = 0;
  private failures = 0;
  private degraded = false;
  private prefetched: { index: number; sig: string; promise: Promise<TtsSynthesisResult | null> } | null = null;

  constructor(private readonly opts: ControllerOptions) {
    if (opts.mediaSession && typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      const ms = navigator.mediaSession;
      const safe = (action: MediaSessionAction, fn: () => void) => {
        try {
          ms.setActionHandler(action, fn);
        } catch {
          /* action non supportée */
        }
      };
      safe('play', () => this.resume());
      safe('pause', () => this.pause());
      safe('stop', () => this.stop());
      safe('nexttrack', () => this.next());
      safe('previoustrack', () => this.prev());
    }
  }

  setHandlers(h: ControllerHandlers): void {
    this.handlers = h;
  }

  get state(): PlayerState {
    return this.store.getState();
  }

  /** Charge une file. Si c'est une autre file, la lecture en cours est arrêtée. */
  setQueue(q: PlayerQueue, startIndex = 0): void {
    if (this.queue?.id !== q.id) {
      // Changement de chapitre en cours de lecture : on garde le flux de maintien actif.
      this.stop(true);
      this.store.setState({ queueId: q.id, paragraph: startIndex, word: null, notice: null });
    }
    this.queue = q;
  }

  async play(index = this.state.paragraph): Promise<void> {
    const q = this.queue;
    if (!q) return;
    const gen = ++this.gen;
    this.teardown();

    if (index >= q.paragraphs.length) return this.finish();
    const text = q.paragraphs[index]?.trim() ?? '';
    // Écran éteint : un flux continu évite que le système suspende l'app entre deux paragraphes.
    this.startKeepAlive();
    this.store.setState({ status: 'loading', paragraph: index, word: null });
    this.handlers.onParagraph?.(q.id, index);
    if (!text) return void this.play(index + 1);

    const req = this.buildRequest(q, index, text);
    const cloud = this.degraded ? null : this.opts.getCloud();

    let result: TtsSynthesisResult | null = null;
    if (cloud) {
      try {
        result = await this.resolveCloud(cloud, index, req);
        this.failures = 0;
      } catch (err) {
        if ((err as Error).name !== 'AbortError') this.onCloudFailure(err);
      }
    }
    if (gen !== this.gen) {
      if (result?.audioUrl) URL.revokeObjectURL(result.audioUrl);
      return;
    }

    this.updateMediaSession(q);
    if (result?.audioUrl) {
      await this.playAudio(result, req, gen);
      if (cloud) {
        this.prefetch(cloud, index + 1);
        this.warmCache(cloud, index + 2);
      }
    } else {
      this.playSpeech(req, gen, 0);
    }
  }

  pause(): void {
    const s = this.state.status;
    if (s !== 'playing' && s !== 'loading') return;
    if (this.mode === 'audio') this.audioEl?.pause();
    if (this.mode === 'speech') {
      this.cancelSpeech?.();
      this.cancelSpeech = null;
    }
    this.stopKeepAlive();
    if (s === 'loading') this.gen++;
    this.store.setState({ status: 'paused' });
    this.setPlaybackState('paused');
    this.emitHalt();
  }

  resume(): void {
    const s = this.state.status;
    if (s === 'idle' || s === 'error') return void this.play();
    if (s !== 'paused') return;
    if (this.mode === 'audio' && this.audioEl?.src) {
      void this.audioEl.play().catch(() => this.store.setState({ status: 'paused' }));
      return;
    }
    if (this.mode === 'speech' && this.speechReq) return this.playSpeech(this.speechReq, this.gen, this.lastWordStart);
    void this.play();
  }

  toggle(): void {
    const s = this.state.status;
    if (s === 'playing' || s === 'loading') this.pause();
    else this.resume();
  }

  stop(keepAlive = false): void {
    const wasActive = this.state.status !== 'idle';
    this.gen++;
    this.teardown();
    if (!keepAlive) this.stopKeepAlive();
    this.store.setState({ status: 'idle', word: null });
    this.setPlaybackState('none');
    if (wasActive) this.emitHalt();
  }

  next(): void {
    const q = this.queue;
    if (!q) return;
    const i = this.state.paragraph + 1;
    if (i >= q.paragraphs.length) return this.finish();
    void this.play(i);
  }

  prev(): void {
    void this.play(Math.max(0, this.state.paragraph - 1));
  }

  /** Relance le paragraphe courant (ex. changement de voix/vitesse) si une lecture est active. */
  refresh(): void {
    const s = this.state.status;
    if (s === 'playing' || s === 'loading') void this.play(this.state.paragraph);
  }

  /** Réessaie le provider serveur après une dégradation (ex. retour en ligne). */
  resetDegradation(): void {
    this.degraded = false;
    this.failures = 0;
  }

  destroy(): void {
    this.stop();
    if (this.keepAliveEl?.src) URL.revokeObjectURL(this.keepAliveEl.src);
  }

  // ---------------------------------------------------------------------------

  private buildRequest(q: PlayerQueue, index: number, text: string): TtsSynthesisRequest {
    const voice = this.opts.getVoice();
    const previous = q.paragraphs[index - 1]?.trim().slice(-600);
    const next = q.paragraphs[index + 1]?.trim().slice(0, 600);
    const context = previous || next ? { ...(previous ? { previous } : {}), ...(next ? { next } : {}) } : undefined;
    return {
      text,
      lang: q.lang,
      gender: voice.gender,
      speed: voice.speed,
      pitch: voice.pitch,
      ...(context ? { context } : {}),
      ...(voice.engine && voice.engine !== 'auto' ? { engine: voice.engine } : {}),
    };
  }

  private async resolveCloud(cloud: CloudTtsProvider, index: number, req: TtsSynthesisRequest): Promise<TtsSynthesisResult | null> {
    const p = this.prefetched;
    if (p && p.index === index && p.sig === sig(req)) {
      this.prefetched = null;
      const r = await p.promise;
      if (r) return r;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) return cloud.lookup(req);
    return cloud.synthesize(req);
  }

  private prefetch(cloud: CloudTtsProvider, index: number): void {
    const q = this.queue;
    const text = q?.paragraphs[index]?.trim();
    if (!q || !text) return;
    const req = this.buildRequest(q, index, text);
    if (this.prefetched?.sig === sig(req)) return;
    this.discardPrefetch();
    const promise = (navigator.onLine ? cloud.synthesize(req) : cloud.lookup(req)).catch(() => null);
    this.prefetched = { index, sig: sig(req), promise };
  }

  /** Prépare l'audio d'un paragraphe plus lointain dans le cache (rien n'est joué). */
  private warmCache(cloud: CloudTtsProvider, index: number): void {
    const q = this.queue;
    const text = q?.paragraphs[index]?.trim();
    if (!q || !text || !navigator.onLine) return;
    const req = this.buildRequest(q, index, text);
    // ElevenLabs est facturé au caractère : on ne prépare pas d'avance au-delà du paragraphe suivant.
    if (req.engine === 'elevenlabs' || (req.engine !== 'azure' && cloud.id === 'elevenlabs')) return;
    void cloud
      .synthesize(req)
      .then((r) => r.audioUrl && URL.revokeObjectURL(r.audioUrl))
      .catch(() => {});
  }

  private discardPrefetch(): void {
    const p = this.prefetched;
    this.prefetched = null;
    void p?.promise.then((r) => r?.audioUrl && URL.revokeObjectURL(r.audioUrl));
  }

  private onCloudFailure(err: unknown): void {
    this.failures++;
    const status = (err as { status?: number }).status;
    // 503 explicite (provider désactivé/épuisé) ou échecs répétés → Web Speech pour la session.
    if (status === 503 || this.failures >= MAX_FAILURES_BEFORE_DEGRADE) this.degraded = true;
    this.store.setState({
      notice: status === 429 ? 'Limite atteinte : voix du navigateur utilisée temporairement.' : 'Voix premium indisponible : voix du navigateur utilisée.',
    });
  }

  private audio(): HTMLAudioElement {
    if (!this.audioEl) {
      const a = new Audio();
      a.preload = 'auto';
      a.addEventListener('playing', () => {
        if (this.mode === 'audio') {
          this.store.setState({ status: 'playing' });
          this.setPlaybackState('playing');
        }
      });
      a.addEventListener('pause', () => {
        if (this.mode === 'audio' && !a.ended && this.state.status === 'playing') {
          this.store.setState({ status: 'paused' });
          this.setPlaybackState('paused');
          this.emitHalt();
        }
      });
      this.audioEl = a;
    }
    return this.audioEl;
  }

  private async playAudio(result: TtsSynthesisResult, req: TtsSynthesisRequest, gen: number): Promise<void> {
    const a = this.audio();
    this.mode = 'audio';
    this.currentUrl = result.audioUrl ?? null;
    this.boundaries = result.wordBoundaries ?? [];
    this.store.setState({ provider: result.provider });

    a.src = result.audioUrl ?? '';
    // ElevenLabs plafonne la vitesse à 1.2 : on complète via playbackRate.
    a.playbackRate = result.provider === 'elevenlabs' ? req.speed / Math.min(1.2, Math.max(0.7, req.speed)) : 1;
    a.preservesPitch = true;
    a.onended = () => {
      if (gen === this.gen) this.next();
    };
    a.onerror = () => {
      if (gen === this.gen) this.playSpeech(req, gen, 0);
    };

    const tick = () => {
      if (gen !== this.gen) return;
      const b = findBoundary(this.boundaries, a.currentTime * 1000);
      const cur = this.state.word;
      if (b && (cur?.start !== b.charStart || cur.length !== b.charLength)) {
        this.store.setState({ word: { start: b.charStart, length: b.charLength } });
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);

    try {
      await a.play();
    } catch (err) {
      if (gen !== this.gen) return;
      // Autoplay bloqué (pas de geste utilisateur) : on attend une action.
      this.store.setState({ status: 'paused', notice: (err as Error).name === 'NotAllowedError' ? 'Appuyez sur lecture pour continuer.' : null });
    }
  }

  private playSpeech(req: TtsSynthesisRequest, gen: number, fromChar: number): void {
    if (!webSpeechSupported()) {
      this.store.setState({ status: 'error', notice: 'La synthèse vocale n’est pas disponible sur ce navigateur.' });
      return;
    }
    this.mode = 'speech';
    this.speechReq = req;
    this.lastWordStart = fromChar;
    this.store.setState({ status: 'playing', provider: 'webspeech' });
    this.setPlaybackState('playing');
    this.startKeepAlive();
    this.cancelSpeech = webSpeech.speak(
      req,
      {
        onWord: (start, length) => {
          if (gen !== this.gen) return;
          this.lastWordStart = start;
          this.store.setState({ word: { start, length } });
        },
        onEnd: () => {
          if (gen === this.gen) this.next();
        },
        onError: (err) => {
          if (gen !== this.gen) return;
          console.warn(err);
          this.store.setState({ status: 'error', notice: 'Lecture interrompue par le navigateur.' });
        },
      },
      fromChar,
    );
  }

  private stopKeepAlive(): void {
    clearTimeout(this.keepAliveTimer);
    this.keepAliveEl?.pause();
  }

  private startKeepAlive(): void {
    clearTimeout(this.keepAliveTimer);
    if (!this.keepAliveEl) {
      const k = new Audio(silentWavUrl());
      k.loop = true;
      k.volume = 0.01;
      this.keepAliveEl = k;
    }
    void this.keepAliveEl.play().catch(() => {});
  }

  private teardown(): void {
    cancelAnimationFrame(this.raf);
    this.cancelSpeech?.();
    this.cancelSpeech = null;
    if (this.audioEl) {
      this.audioEl.onended = null;
      this.audioEl.onerror = null;
      this.audioEl.pause();
      this.audioEl.removeAttribute('src');
    }
    if (this.currentUrl) URL.revokeObjectURL(this.currentUrl);
    this.currentUrl = null;
    this.boundaries = [];
    this.mode = null;
  }

  private finish(): void {
    const id = this.queue?.id;
    this.stop(true);
    this.discardPrefetch();
    // Le chapitre suivant va démarrer : on garde le flux quelques secondes pour ne pas être suspendu.
    this.startKeepAlive();
    this.keepAliveTimer = setTimeout(() => {
      if (this.state.status === 'idle' || this.state.status === 'paused') this.stopKeepAlive();
    }, 15_000);
    if (id) this.handlers.onQueueEnd?.(id);
  }

  private emitHalt(): void {
    const id = this.queue?.id;
    if (id) this.handlers.onHalt?.(id, this.state.paragraph);
  }

  private updateMediaSession(q: PlayerQueue): void {
    if (!this.opts.mediaSession || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: q.title,
      artist: q.artist,
      album: q.album,
      artwork: [{ src: '/pwa-512.png', sizes: '512x512', type: 'image/png' }],
    });
  }

  private setPlaybackState(s: MediaSessionPlaybackState): void {
    if (this.opts.mediaSession && typeof navigator !== 'undefined' && 'mediaSession' in navigator) navigator.mediaSession.playbackState = s;
  }
}
