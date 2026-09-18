/**
 * Music and sound, ported from lidlness (fe/src/audio_manager.js) and cut down to what any game
 * needs. Howler does the playing; everything here is about *when*.
 *
 * Four things it is worth having written down once and not again:
 *
 * - **The first gesture.** A browser will not start audio until the player has touched the page,
 *   and a Howl that tries before then dies silently. `installUnlockListeners` waits for a click or
 *   a key, resumes the AudioContext, and only then lets music start.
 * - **A tab nobody is looking at.** A game left playing behind another tab, or in an iframe on a
 *   portal, is a game making noise at somebody who cannot see it. Blur, visibility and — inside an
 *   iframe, where those do not always fire — a poll on `document.hasFocus()` mute it.
 * - **Ads.** A portal's ad has its own sound. `setAdActive(true)` mutes the game for the length of
 *   it, which is the other half of `platform.gameplayStop()`.
 * - **What is playing and why.** Music is a state — menu, play, boss, paused — rather than a track.
 *   The game says which state it is in; this picks a track for it, crossfades, and when the track
 *   ends picks another. A pause state suspends the track underneath it rather than dropping it, so
 *   coming back out of a menu returns to the same music where it left off.
 *
 * Howler is passed in rather than imported, so `node --test` can exercise all of the above against
 * a fake (see test/audio.test.ts). The game wires the real one up in src/main.ts.
 */

import { localStore } from '../platform/storage.ts';

/** The little of a Howl this uses. Loose on purpose: a real Howl satisfies it, and so can a fake. */
export interface HowlLike {
  play(sprite?: string | number): number;
  stop(...args: unknown[]): unknown;
  pause(...args: unknown[]): unknown;
  unload(): void;
  load?(...args: unknown[]): unknown;
  state?(): string;
  playing?(...args: unknown[]): boolean;
  duration?(...args: unknown[]): number;
  volume(...args: unknown[]): unknown;
  rate?(...args: unknown[]): unknown;
  stereo?(...args: unknown[]): unknown;
  loop?(...args: unknown[]): unknown;
  fade(...args: unknown[]): unknown;
  once(event: string, fn: (...args: unknown[]) => void, id?: number): unknown;
  off?(event: string, fn?: (...args: unknown[]) => void, id?: number): unknown;
}

export interface HowlOptions {
  src: string[];
  format?: string[];
  sprite?: Record<string, [number, number] | [number, number, boolean]>;
  html5?: boolean;
  loop?: boolean;
  pool?: number;
  preload?: boolean;
  volume?: number;
  onload?: () => void;
  onloaderror?: (id: number, error: unknown) => void;
  onunlock?: () => void;
}

export type HowlConstructor = new (options: HowlOptions) => HowlLike;

/** The little of the Howler global this uses. */
export interface HowlerLike {
  mute(muted: boolean): unknown;
  ctx?: { state?: string; resume?: () => Promise<void> } | null;
  usingWebAudio?: boolean;
}

/** Where the player's chosen volumes are kept. Synchronous, since a slider cannot wait. */
export interface VolumeStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/** One music track: what it is called, which state it belongs to, and where its audio is. */
export interface MusicTrack {
  id: string;
  /** TEMPLATE: the game's own states — 'menu', 'play', 'boss', 'pause'. Any string will do. */
  state: string;
  src: string[];
  /** A track that loops never ends, so nothing else of its state is ever picked. Off by default. */
  loop?: boolean;
}

/** How a sound effect is registered. `sprite` cuts many cues out of one file, which is one request. */
export interface SfxOptions {
  sources: string[];
  sprite?: Record<string, [number, number] | [number, number, boolean]>;
  /** How many copies Howler keeps for overlapping plays. */
  pool?: number;
  /** How many of this cue may sound at once. A cap is what keeps a hundred bricks from one roar. */
  maxConcurrent?: number;
  /** The cue's own level, before the player's sfx volume. Mix here, not at every call site. */
  volume?: number;
  preload?: boolean;
}

export type SfxManifest = Record<string, SfxOptions>;

export interface PlaySfxOptions {
  sprite?: string;
  volume?: number;
  rate?: number;
  /** -1 hard left to 1 hard right. */
  stereo?: number;
  loop?: boolean;
  /** Where the sound is and where the player is, in whatever units the game uses. */
  sourcePosition?: { x: number; y: number };
  listenerPosition?: { x: number; y: number };
  maxDistance?: number;
}

const MUSIC_VOLUME_KEY = 'musicVolume';
const SFX_VOLUME_KEY = 'sfxVolume';
const DEFAULT_MUSIC_VOLUME = 0.45;
const DEFAULT_SFX_VOLUME = 0.7;
/** A crossfade long enough not to be heard as a cut, and the shorter one the first track gets. */
const DEFAULT_FADE_MS = 2500;
const DEFAULT_INITIAL_FADE_MS = 250;
const DEFAULT_MAX_CONCURRENT_SFX = 5;
/** How often an embedded page asks whether it still has focus, where blur does not always fire. */
const FOCUS_POLL_MS = 500;

const clampVolume = (value: number): number => Math.max(0, Math.min(1, Number(value)));

/**
 * How loud a sound at `sourcePosition` is to a listener at `listenerPosition`: full at no distance,
 * silent at `maxDistance` and straight down in between. Linear rather than inverse-square because a
 * game wants a cue audible right up to the edge of where it matters and gone past it, which an
 * inverse-square roll-off gives neither of.
 *
 * Anything missing means "not positional", which is full volume; anything nonsensical is silent.
 */
export function sfxDistanceAttenuation(sourcePosition?: { x: number; y: number }, listenerPosition?: { x: number; y: number }, maxDistance?: number): number {
  if (!sourcePosition || !listenerPosition) return 1;
  const limit = Number(maxDistance);
  const values = [sourcePosition.x, sourcePosition.y, listenerPosition.x, listenerPosition.y, limit];
  if (!values.every((value) => Number.isFinite(value)) || limit <= 0) return 0;
  const distance = Math.hypot(sourcePosition.x - listenerPosition.x, sourcePosition.y - listenerPosition.y);
  return distance >= limit ? 0 : 1 - distance / limit;
}

interface Playing {
  track: MusicTrack;
  howl: HowlLike;
  id: number;
}

interface Effect {
  howl: HowlLike;
  baseVolume: number;
  maxConcurrent: number;
  playing: Set<number>;
  loaded: boolean;
  ready: Promise<{ loaded: boolean; error: unknown }>;
}

export interface AudioOptions {
  Howl: HowlConstructor;
  Howler: HowlerLike;
  /** Prefixes the volume keys, so two games on one domain do not share a slider. */
  keyPrefix?: string;
  storage?: VolumeStorage | null;
  fadeMs?: number;
  initialFadeMs?: number;
  random?: () => number;
  window?: (Window & typeof globalThis) | null;
  document?: Document | null;
}

export class Audio {
  private readonly Howl: HowlConstructor;
  private readonly Howler: HowlerLike;
  private readonly fadeMs: number;
  private readonly initialFadeMs: number;
  private readonly random: () => number;
  private readonly page: Pick<Window, 'addEventListener' | 'removeEventListener' | 'setInterval' | 'clearInterval'> | null;
  private readonly doc: Document | null;
  private storage: VolumeStorage | null;
  private readonly musicKey: string;
  private readonly sfxKey: string;

  private musicVolume: number;
  private sfxVolume: number;

  private readonly music = new Map<string, MusicTrack[]>();
  private readonly lastPlayed = new Map<string, string>();
  private wanted: string | null = null;
  private active: Playing | null = null;
  private pending: { track: MusicTrack; howl: HowlLike } | null = null;
  /** What a pause state is holding down, to be let back up when the pause lifts. */
  private suspended: Playing | null = null;
  private hasPlayed = false;
  /** The state a pause suspends *into*: while this is the wanted state, the one under it is kept. */
  private pauseState: string | null = null;

  private readonly sfx = new Map<string, Effect>();
  private sfxPreload: Promise<{ loaded: number; failures: { name: string; error: unknown }[] }> | null = null;

  private unlocked = false;
  private unlockHowl: HowlLike | null = null;
  private resolveUnlock: (() => void) | null = null;
  private readonly unlockWait: Promise<void>;
  private unlockTarget: Pick<Window, 'addEventListener' | 'removeEventListener'> | null = null;
  private onGesture: (() => void) | null = null;

  private pageMuted = false;
  private platformMuted = false;
  private adActive = false;
  private embedded = false;
  private poller: number | null = null;
  private listeners: (() => void)[] = [];

  constructor({ Howl, Howler, keyPrefix = 'game', storage = localStore, fadeMs = DEFAULT_FADE_MS, initialFadeMs = DEFAULT_INITIAL_FADE_MS, random = Math.random, window: page = typeof window === 'undefined' ? null : window, document: doc = typeof document === 'undefined' ? null : document }: AudioOptions) {
    this.Howl = Howl;
    this.Howler = Howler;
    this.fadeMs = fadeMs;
    this.initialFadeMs = initialFadeMs;
    this.random = random;
    this.page = page;
    this.doc = doc;
    this.storage = storage;
    this.musicKey = `${keyPrefix}.${MUSIC_VOLUME_KEY}`;
    this.sfxKey = `${keyPrefix}.${SFX_VOLUME_KEY}`;
    this.musicVolume = stored(this.storage, this.musicKey, DEFAULT_MUSIC_VOLUME);
    this.sfxVolume = stored(this.storage, this.sfxKey, DEFAULT_SFX_VOLUME);
    this.unlockWait = new Promise((resolve) => {
      this.resolveUnlock = resolve;
    });
    this.embedded = isEmbedded(page);
    this.watchPage();
  }

  // ── the page ────────────────────────────────────────────────────────────────────────────────

  private watchPage(): void {
    if (!this.page && !this.doc) return;
    const blur = (): void => this.setPageMuted(true);
    const focus = (): void => this.syncPageMute();
    const visibility = (): void => (this.doc?.hidden ? this.setPageMuted(true) : this.syncPageMute());

    this.page?.addEventListener('blur', blur);
    this.page?.addEventListener('focus', focus);
    this.doc?.addEventListener('visibilitychange', visibility);
    this.listeners.push(() => {
      this.page?.removeEventListener('blur', blur);
      this.page?.removeEventListener('focus', focus);
      this.doc?.removeEventListener('visibilitychange', visibility);
    });

    // In an iframe on a portal, focus can go to the page around the game without the game hearing
    // of it, so an embedded page asks instead of waiting to be told.
    if (this.embedded && typeof this.page?.setInterval === 'function') {
      this.poller = this.page.setInterval(() => this.syncPageMute(), FOCUS_POLL_MS) as unknown as number;
    }
    this.syncPageMute();
  }

  private syncPageMute(): void {
    const hidden = Boolean(this.doc?.hidden);
    const focused = typeof this.doc?.hasFocus === 'function' ? this.doc.hasFocus() : true;
    this.setPageMuted(hidden || !focused);
  }

  private setPageMuted(muted: boolean): void {
    if (this.pageMuted === muted) return;
    this.pageMuted = muted;
    this.syncMute();
  }

  private syncMute(): void {
    this.Howler.mute(Boolean(this.pageMuted || this.platformMuted || this.adActive));
  }

  /** An ad is on screen, with sound of its own. The other half of `platform.gameplayStop()`. */
  setAdActive(active: boolean): void {
    this.adActive = Boolean(active);
    this.syncMute();
  }

  /** The platform asked for silence (Yandex Games does, when its own interface is over the game). */
  setPlatformMuted(muted: boolean): void {
    this.platformMuted = Boolean(muted);
    this.syncMute();
  }

  // ── the first gesture ───────────────────────────────────────────────────────────────────────

  /**
   * Wait for the click or key that lets audio start. A dormant, silent Howl is created alongside,
   * which is what installs Howler's own capture-phase unlock without allocating an audio node.
   */
  installUnlockListeners(target = this.page): void {
    if (!target || this.unlockTarget) return;
    this.unlockTarget = target;
    const finish = (): void => {
      if (this.unlocked) return;
      this.unlocked = true;
      this.resolveUnlock?.();
      this.resolveUnlock = null;
      this.unlockHowl?.unload();
      this.unlockHowl = null;
      target.removeEventListener('click', gesture);
      target.removeEventListener('keydown', gesture);
      this.syncMusic();
    };
    this.unlockHowl = new this.Howl({
      src: ['data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'],
      format: ['wav'],
      preload: false,
      volume: 0,
      onunlock: finish,
    });
    const gesture = (): void => {
      if (this.unlocked) return;
      const ctx = this.Howler.ctx;
      if (!this.Howler.usingWebAudio || !ctx) return finish();
      if (ctx.state === 'running') return finish();
      if (typeof ctx.resume !== 'function') return;
      Promise.resolve(ctx.resume())
        .then(() => {
          if (ctx.state === 'running') finish();
        })
        .catch((err: unknown) => console.warn('[audio] resume failed; waiting for another gesture', err));
    };
    this.onGesture = gesture;
    // Bubble phase, so Howler's own capture-phase attempt has already run.
    target.addEventListener('click', gesture, { passive: true });
    target.addEventListener('keydown', gesture);
  }

  /** Resolves once audio may actually play. */
  waitForUnlock(): Promise<void> {
    return this.unlocked ? Promise.resolve() : this.unlockWait;
  }

  // ── music ───────────────────────────────────────────────────────────────────────────────────

  /** Every track the game has. Call once, at startup. */
  registerMusic(tracks: readonly MusicTrack[]): void {
    this.music.clear();
    for (const track of tracks) {
      const list = this.music.get(track.state) ?? [];
      list.push(track);
      this.music.set(track.state, list);
    }
  }

  hasMusic(state?: string): boolean {
    if (state === undefined) return this.music.size > 0;
    return (this.music.get(state)?.length ?? 0) > 0;
  }

  /**
   * Which state's music should be playing, or null for silence. Name the state a pause uses in
   * `pauseState` and the music underneath it is held rather than dropped, so leaving the pause
   * picks the same track up where it was.
   */
  setMusicState(state: string | null, { pauseState }: { pauseState?: string | null } = {}): void {
    if (pauseState !== undefined) this.pauseState = pauseState;
    this.wanted = state;
    this.syncMusic();
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = clampVolume(volume);
    this.storage?.set(this.musicKey, String(this.musicVolume));
    if (this.active) this.active.howl.volume(this.musicVolume, this.active.id);
  }

  getMusicVolume(): number {
    return this.musicVolume;
  }

  private syncMusic(): void {
    if (!this.unlocked || this.wanted === null) return;
    if (this.pending?.track.state === this.wanted) return;
    if (this.pending) {
      this.pending.howl.unload();
      this.pending = null;
    }
    if (this.suspended && this.wanted !== this.pauseState) {
      if (this.suspended.track.state === this.wanted) return void this.resumeSuspended(this.wanted);
      this.suspended.howl.unload();
      this.suspended = null;
    }
    if (this.active?.track.state === this.wanted && this.active.howl.playing?.(this.active.id) !== false) return;
    this.playNext(this.wanted);
  }

  /** A track of that state, preferring one other than the last it played there. */
  private chooseTrack(state: string): MusicTrack | null {
    const all = this.music.get(state) ?? [];
    if (all.length === 0) return null;
    const previous = this.lastPlayed.get(state);
    const fresh = all.length > 1 ? all.filter((track) => track.id !== previous) : all;
    const index = Math.min(fresh.length - 1, Math.floor(this.random() * fresh.length));
    return fresh[Math.max(0, index)] ?? null;
  }

  private playNext(state: string): void {
    const track = this.chooseTrack(state);
    if (!track) return;
    // html5: streams rather than decoding the whole file, which is what keeps a three-minute track
    // from stalling the first frame. Sound effects stay on Web Audio, where latency matters.
    const howl = new this.Howl({ src: track.src, html5: true, preload: false, volume: 0, loop: track.loop === true });
    const pending = { track, howl };
    this.pending = pending;
    howl.once('load', () => this.start(pending, state));
    howl.once('loaderror', (_id: unknown, error: unknown) => {
      if (this.pending !== pending) return;
      console.warn(`[audio] track ${track.id} failed to load`, error);
      this.pending = null;
      this.music.set(state, (this.music.get(state) ?? []).filter((other) => other.id !== track.id));
      howl.unload();
      if (this.wanted === state) this.playNext(state);
    });
    howl.load?.();
  }

  private start(pending: { track: MusicTrack; howl: HowlLike }, state: string): void {
    if (this.pending !== pending || this.wanted !== state) return void pending.howl.unload();
    const outgoing = this.active;
    const { track, howl } = pending;
    const id = howl.play();
    const incoming: Playing = { track, howl, id };

    // Wait for playback to be confirmed before fading: Howler's load/play queue is asynchronous,
    // and a fade started too early leaves the track sitting at its initial zero.
    howl.once(
      'play',
      () => {
        if (this.pending !== pending || this.wanted !== state) return void howl.unload();
        this.pending = null;
        this.active = incoming;
        this.lastPlayed.set(state, track.id);
        const fadeIn = this.hasPlayed ? this.fadeMs : this.initialFadeMs;
        this.hasPlayed = true;

        howl.once(
          'end',
          () => {
            if (this.active !== incoming) return;
            howl.unload();
            this.active = null;
            if (this.wanted === state) this.playNext(state);
            else this.syncMusic();
          },
          id,
        );
        howl.fade(0, this.musicVolume, fadeIn, id);

        if (!outgoing || outgoing === incoming) return;
        // A pause holds the music under it down rather than throwing it away.
        const hold = state === this.pauseState && outgoing.track.state !== this.pauseState;
        if (hold) {
          this.suspended?.howl.unload();
          this.suspended = outgoing;
        }
        this.fadeOut(outgoing, hold);
      },
      id,
    );
    howl.once(
      'playerror',
      () => {
        if (this.pending !== pending) return;
        howl.unload();
        this.pending = null;
        // The browser took the gesture back: wait for another before trying again.
        this.unlocked = false;
      },
      id,
    );
  }

  private fadeOut(outgoing: Playing, hold: boolean): void {
    const from = Number(outgoing.howl.volume(outgoing.id));
    outgoing.howl.once(
      'fade',
      () => {
        if (hold && this.suspended === outgoing) outgoing.howl.pause(outgoing.id);
        else if (this.active !== outgoing) outgoing.howl.unload();
      },
      outgoing.id,
    );
    outgoing.howl.fade(Number.isFinite(from) ? from : this.musicVolume, 0, this.fadeMs, outgoing.id);
  }

  private resumeSuspended(state: string): void {
    const incoming = this.suspended;
    if (!incoming || incoming.track.state !== state) return;
    const outgoing = this.active;
    this.suspended = null;
    this.active = incoming;
    const fadeIn = (): void => {
      if (this.active !== incoming || this.wanted !== state) return;
      const from = Number(incoming.howl.volume(incoming.id));
      incoming.howl.fade(Number.isFinite(from) ? from : 0, this.musicVolume, this.fadeMs, incoming.id);
    };
    if (incoming.howl.playing?.(incoming.id)) fadeIn();
    else {
      incoming.howl.once('play', fadeIn, incoming.id);
      // A browser can refuse to resume audio just after focus comes back. Don't leave a stopped
      // player registered as the active one; go round through a fresh track instead.
      incoming.howl.once(
        'playerror',
        () => {
          incoming.howl.off?.('play', fadeIn, incoming.id);
          if (this.active !== incoming || this.wanted !== state) return;
          incoming.howl.unload();
          this.active = null;
          this.playNext(state);
        },
        incoming.id,
      );
      incoming.howl.play(incoming.id);
    }
    if (outgoing && outgoing !== incoming) this.fadeOut(outgoing, false);
  }

  // ── sound effects ───────────────────────────────────────────────────────────────────────────

  registerSfx(name: string, { sources, sprite, pool = 5, maxConcurrent = DEFAULT_MAX_CONCURRENT_SFX, volume = 1, preload = true }: SfxOptions): HowlLike {
    if (!name || sources.length === 0) throw new Error('A sound effect needs a name and at least one source.');
    this.sfx.get(name)?.howl.unload();
    let settle: (result: { loaded: boolean; error: unknown }) => void = () => {};
    let settled = false;
    const done = (loaded: boolean, error: unknown = null): void => {
      if (settled) return;
      settled = true;
      effect.loaded = loaded;
      settle({ loaded, error });
    };
    const howl = new this.Howl({
      src: sources,
      sprite,
      pool,
      volume: 1,
      preload,
      onload: () => done(true),
      onloaderror: (_id: number, error: unknown) => done(false, error),
    });
    const effect: Effect = {
      howl,
      baseVolume: clampVolume(volume),
      maxConcurrent: Number.isFinite(maxConcurrent) ? Math.max(1, Math.floor(maxConcurrent)) : DEFAULT_MAX_CONCURRENT_SFX,
      playing: new Set<number>(),
      loaded: false,
      ready: new Promise((resolve) => {
        settle = resolve;
      }),
    };
    this.sfx.set(name, effect);
    this.sfxPreload = null;
    // A fake with no loading state is taken as ready, because there is nothing to wait for.
    if (typeof howl.state !== 'function' || howl.state() === 'loaded') done(true);
    return howl;
  }

  registerSfxManifest(manifest: SfxManifest): void {
    for (const [name, options] of Object.entries(manifest)) this.registerSfx(name, options);
  }

  /** Every registered cue loaded, reporting progress from 0 to 1. For a loading bar. */
  preloadSfx({ onProgress = (): void => {} }: { onProgress?: (fraction: number) => void } = {}): Promise<{ loaded: number; failures: { name: string; error: unknown }[] }> {
    if (this.sfxPreload) return this.sfxPreload;
    const effects = [...this.sfx.entries()];
    onProgress(effects.length === 0 ? 1 : 0);
    let completed = 0;
    this.sfxPreload = Promise.all(
      effects.map(async ([name, effect]) => {
        if (!effect.loaded && effect.howl.state?.() === 'unloaded') effect.howl.load?.();
        const result = await effect.ready;
        onProgress(++completed / effects.length);
        return { name, ...result };
      }),
    ).then((results) => ({
      loaded: results.filter((result) => result.loaded).length,
      failures: results.filter((result) => !result.loaded).map(({ name, error }) => ({ name, error })),
    }));
    return this.sfxPreload;
  }

  /**
   * Play a cue, and hand back the id it is playing under, or null when it did not play: not
   * loaded, too far away, or already sounding as many times at once as it is allowed.
   */
  playSfx(name: string, { sprite, volume = 1, rate = 1, stereo = 0, loop = false, sourcePosition, listenerPosition, maxDistance }: PlaySfxOptions = {}): number | null {
    const effect = this.sfx.get(name);
    if (!effect?.loaded) return null;
    const attenuation = sfxDistanceAttenuation(sourcePosition, listenerPosition, maxDistance);
    if (attenuation <= 0) return null;

    if (typeof effect.howl.playing === 'function') {
      for (const id of effect.playing) if (!effect.howl.playing(id)) effect.playing.delete(id);
    }
    if (effect.playing.size >= effect.maxConcurrent) return null;

    const id = sprite ? effect.howl.play(sprite) : effect.howl.play();
    if (id === null || id === undefined) return null;
    effect.playing.add(id);
    effect.howl.once('end', () => effect.playing.delete(id), id);
    effect.howl.volume(effect.baseVolume * this.sfxVolume * clampVolume(volume) * attenuation, id);
    // Only what this cue actually asks for. A pooled sound comes back reset to its group's rate, pan and
    // loop, so setting any of them to its default is not a no-op that costs nothing — it is Howler doing
    // work on a sound that has already started. `stereo` is the one that bites: it hangs a StereoPannerNode
    // off the sound and then stops and starts it again to put the node in the chain (`setupPanner` in
    // howler.js), for every cue the game plays, and it is the one call in here with no guard on a context
    // that is not up yet — with `Howler.ctx` still null it throws out of `playSfx` and into whatever asked
    // for the sound. A game that places a cue on the map places it by volume (`sfxDistanceAttenuation`),
    // and never asks for a pan at all.
    if (rate !== 1) effect.howl.rate?.(rate, id);
    if (stereo !== 0) effect.howl.stereo?.(stereo, id);
    if (loop === true) effect.howl.loop?.(true, id);
    return id;
  }

  /**
   * Move a playing cue — a loop following something across the screen. A loop takes its volume once,
   * when it starts, so one that has gone out of range falls silent here rather than playing on at
   * whatever the distance happened to be when it began.
   */
  setSfxPlaybackVolume(name: string, id: number | null, { volume = 1, sourcePosition, listenerPosition, maxDistance }: Omit<PlaySfxOptions, 'sprite' | 'rate' | 'stereo' | 'loop'> = {}): boolean {
    const effect = this.sfx.get(name);
    if (!effect || id === null || id === undefined) return false;
    const attenuation = sfxDistanceAttenuation(sourcePosition, listenerPosition, maxDistance);
    if (attenuation <= 0) {
      effect.howl.volume(0, id);
      return false;
    }
    effect.howl.volume(effect.baseVolume * this.sfxVolume * clampVolume(volume) * attenuation, id);
    return true;
  }

  stopSfx(name: string, id: number | null): boolean {
    const effect = this.sfx.get(name);
    if (!effect || id === null || id === undefined) return false;
    effect.howl.stop(id);
    effect.playing.delete(id);
    return true;
  }

  stopAllSfx(): void {
    for (const effect of this.sfx.values()) {
      effect.howl.stop();
      effect.playing.clear();
    }
  }

  /** How long a cue lasts, in milliseconds, for lining an animation up with it. */
  getSfxDurationMs(name: string, id?: number): number {
    const effect = this.sfx.get(name);
    if (!effect?.loaded || typeof effect.howl.duration !== 'function') return 0;
    const seconds = effect.howl.duration(id);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
  }

  setSfxVolume(volume: number): void {
    this.sfxVolume = clampVolume(volume);
    this.storage?.set(this.sfxKey, String(this.sfxVolume));
  }

  getSfxVolume(): number {
    return this.sfxVolume;
  }

  /**
   * Keep the volumes somewhere else from now on. The CrazyGames build swaps in the SDK's data
   * module once it has initialized, so a signed-in player's sliders follow them between devices;
   * whatever the browser already held is the fallback, which makes the swap a no-op for a player
   * the cloud has never seen.
   */
  useStorage(storage: VolumeStorage | null): void {
    this.storage = storage;
    if (!storage) return;
    this.musicVolume = stored(storage, this.musicKey, this.musicVolume);
    this.sfxVolume = stored(storage, this.sfxKey, this.sfxVolume);
  }

  destroy(): void {
    for (const stop of this.listeners) stop();
    this.listeners = [];
    if (this.poller !== null) this.page?.clearInterval(this.poller);
    this.poller = null;
    if (this.onGesture && this.unlockTarget) {
      this.unlockTarget.removeEventListener('click', this.onGesture);
      this.unlockTarget.removeEventListener('keydown', this.onGesture);
    }
    this.unlockHowl?.unload();
    this.active?.howl.unload();
    this.pending?.howl.unload();
    this.suspended?.howl.unload();
    this.active = this.pending = this.suspended = null;
    for (const effect of this.sfx.values()) effect.howl.unload();
    this.sfx.clear();
  }
}

function stored(storage: VolumeStorage | null, key: string, fallback: number): number {
  const raw = storage?.get(key);
  if (raw === null || raw === undefined) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? clampVolume(value) : fallback;
}

function isEmbedded(page: Window | null): boolean {
  if (!page) return false;
  try {
    return Boolean(page.self && page.top && page.self !== page.top);
  } catch {
    // A portal can refuse to say. Refusing means embedded.
    return true;
  }
}
