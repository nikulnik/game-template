import assert from 'node:assert/strict';
import test from 'node:test';
import { Audio, sfxDistanceAttenuation, type HowlConstructor, type HowlerLike, type HowlOptions, type VolumeStorage } from '../src/audio/Audio.ts';

/**
 * A Howl that does nothing but remember what it was asked to do. Howler's real one answers
 * asynchronously — a load, a play and a fade all report back later — so this queues its callbacks
 * and `flush` runs them, which is what lets a test step through a crossfade one beat at a time.
 */
class FakeHowl {
  static made: FakeHowl[] = [];
  static queue: (() => void)[] = [];
  static flush(): void {
    for (let guard = 0; FakeHowl.queue.length > 0 && guard < 100; guard++) {
      const run = FakeHowl.queue.shift()!;
      run();
    }
  }
  static reset(): void {
    FakeHowl.made = [];
    FakeHowl.queue = [];
  }

  readonly options: HowlOptions;
  readonly volumes = new Map<number, number>();
  readonly playingIds = new Set<number>();
  readonly fades: { from: number; to: number; ms: number; id?: number }[] = [];
  unloaded = false;
  paused = false;
  private loadedState: boolean;
  private next = 1;
  private handlers: { event: string; fn: (...args: unknown[]) => void; id?: number }[] = [];

  constructor(options: HowlOptions) {
    this.options = options;
    this.loadedState = options.preload !== false;
    FakeHowl.made.push(this);
    if (this.loadedState) FakeHowl.queue.push(() => options.onload?.());
  }

  state(): string {
    return this.loadedState ? 'loaded' : 'unloaded';
  }
  load(): void {
    this.loadedState = true;
    FakeHowl.queue.push(() => this.emit('load'));
  }
  play(spriteOrId?: string | number): number {
    const id = typeof spriteOrId === 'number' ? spriteOrId : this.next++;
    this.playingIds.add(id);
    this.paused = false;
    FakeHowl.queue.push(() => this.emit('play', id));
    return id;
  }
  stop(id?: number): void {
    if (id === undefined) this.playingIds.clear();
    else this.playingIds.delete(id);
  }
  pause(id?: number): void {
    this.paused = true;
    if (id !== undefined) this.playingIds.delete(id);
  }
  playing(id?: number): boolean {
    return id === undefined ? this.playingIds.size > 0 : this.playingIds.has(id);
  }
  unload(): void {
    this.unloaded = true;
    this.playingIds.clear();
  }
  volume(...args: unknown[]): number | void {
    if (args.length === 1) return this.volumes.get(args[0] as number) ?? 0;
    this.volumes.set(args[1] as number, args[0] as number);
  }
  rate(): void {}
  stereo(): void {}
  loop(): void {}
  duration(): number {
    return 1.5;
  }
  fade(from: number, to: number, ms: number, id?: number): void {
    this.fades.push({ from, to, ms, id });
    if (id !== undefined) this.volumes.set(id, to);
    FakeHowl.queue.push(() => this.emit('fade', id));
  }
  once(event: string, fn: (...args: unknown[]) => void, id?: number): void {
    this.handlers.push({ event, fn, id });
  }
  off(event: string, fn?: (...args: unknown[]) => void, id?: number): void {
    this.handlers = this.handlers.filter((handler) => !(handler.event === event && (!fn || handler.fn === fn) && handler.id === id));
  }
  /** Fires the handlers waiting on an event, as Howler's `once` does: each one only ever once. */
  emit(event: string, id?: number): void {
    const matched = this.handlers.filter((handler) => handler.event === event && (handler.id === undefined || handler.id === id));
    this.handlers = this.handlers.filter((handler) => !matched.includes(handler));
    for (const handler of matched) handler.fn(id);
  }
  /** The track ran out, which is what makes the next one start. */
  end(id: number): void {
    this.playingIds.delete(id);
    this.emit('end', id);
  }
}

const Howler: HowlerLike = { mute: () => {}, usingWebAudio: false, ctx: null };

function make(overrides: Partial<{ storage: VolumeStorage | null; random: () => number }> = {}): Audio {
  FakeHowl.reset();
  return new Audio({
    Howl: FakeHowl as unknown as HowlConstructor,
    Howler,
    keyPrefix: 'test',
    storage: overrides.storage ?? null,
    random: overrides.random ?? ((): number => 0),
    // No page: a test has no window to lose focus.
    window: null,
    document: null,
  });
}

/** Music only starts once the player has touched the page. */
function unlock(audio: Audio): void {
  audio.installUnlockListeners({ addEventListener: () => {}, removeEventListener: () => {} } as unknown as Window & typeof globalThis);
  FakeHowl.made.find((howl) => howl.options.format?.[0] === 'wav')?.options.onunlock?.();
}

test('distance decides how loud a cue is, and out of range it does not play at all', () => {
  const here = { x: 0, y: 0 };
  assert.equal(sfxDistanceAttenuation(here, here, 10), 1);
  assert.equal(sfxDistanceAttenuation({ x: 5, y: 0 }, here, 10), 0.5);
  assert.equal(sfxDistanceAttenuation({ x: 10, y: 0 }, here, 10), 0);
  assert.equal(sfxDistanceAttenuation({ x: 99, y: 0 }, here, 10), 0);
  // Not positional at all: full volume.
  assert.equal(sfxDistanceAttenuation(undefined, undefined, 10), 1);
  // Nonsense is silence, not a full-volume surprise.
  assert.equal(sfxDistanceAttenuation(here, here, 0), 0);
  assert.equal(sfxDistanceAttenuation(here, here, Number.NaN), 0);
});

test('nothing plays before the first gesture, and the wanted state starts the moment it comes', () => {
  const audio = make();
  audio.registerMusic([{ id: 'a', state: 'play', src: ['a.mp3'] }]);
  audio.setMusicState('play');
  assert.equal(FakeHowl.made.length, 0, 'a track was made before the player touched the page');

  unlock(audio);
  FakeHowl.flush();
  const track = FakeHowl.made.find((howl) => howl.options.src[0] === 'a.mp3');
  assert.ok(track, 'the wanted state did not start once unlocked');
  assert.equal(track!.playing(), true);
});

test('a state with two tracks does not play the same one twice running, and moves on when one ends', () => {
  const audio = make({ random: () => 0 });
  audio.registerMusic([
    { id: 'one', state: 'play', src: ['one.mp3'] },
    { id: 'two', state: 'play', src: ['two.mp3'] },
  ]);
  unlock(audio);
  audio.setMusicState('play');
  FakeHowl.flush();

  const first = FakeHowl.made.find((howl) => howl.options.src[0] === 'one.mp3')!;
  assert.ok(first.playing());
  first.end([...first.playingIds][0] ?? 1);
  FakeHowl.flush();
  assert.ok(FakeHowl.made.some((howl) => howl.options.src[0] === 'two.mp3'), 'the same track was picked again');
});

test('a pause holds the music under it down, and leaving the pause picks it back up', () => {
  const audio = make();
  audio.registerMusic([
    { id: 'play', state: 'play', src: ['play.mp3'] },
    { id: 'paused', state: 'pause', src: ['pause.mp3'] },
  ]);
  unlock(audio);
  audio.setMusicState('play', { pauseState: 'pause' });
  FakeHowl.flush();
  const playing = FakeHowl.made.find((howl) => howl.options.src[0] === 'play.mp3')!;

  audio.setMusicState('pause');
  FakeHowl.flush();
  assert.equal(playing.paused, true, 'the track under the pause was not held');
  assert.equal(playing.unloaded, false, 'the track under the pause was thrown away');
  assert.ok(playing.fades.some((fade) => fade.to === 0), 'it was cut rather than faded');

  audio.setMusicState('play');
  FakeHowl.flush();
  assert.equal(playing.playing(), true, 'the held track was not picked back up');
  assert.equal(FakeHowl.made.filter((howl) => howl.options.src[0] === 'play.mp3').length, 1, 'a second copy was made instead');
});

test('a cue sounds at its own level times the player’s, and only so many at once', () => {
  const audio = make();
  audio.registerSfx('thud', { sources: ['thud.mp3'], volume: 0.5, maxConcurrent: 2 });
  FakeHowl.flush();
  audio.setSfxVolume(0.4);

  const first = audio.playSfx('thud', { volume: 0.5 });
  const howl = FakeHowl.made[0]!;
  assert.ok(first !== null);
  assert.equal(howl.volumes.get(first!), 0.5 * 0.4 * 0.5);

  assert.ok(audio.playSfx('thud') !== null);
  assert.equal(audio.playSfx('thud'), null, 'a third copy sounded past the cap');

  audio.stopSfx('thud', first);
  assert.ok(audio.playSfx('thud') !== null, 'the cap did not free up when one stopped');
  assert.equal(audio.getSfxDurationMs('thud'), 1500);
});

test('a cue too far away does not play, and one that walks out of range falls silent', () => {
  const audio = make();
  audio.registerSfx('roar', { sources: ['roar.mp3'] });
  FakeHowl.flush();
  const listener = { x: 0, y: 0 };
  assert.equal(audio.playSfx('roar', { sourcePosition: { x: 40, y: 0 }, listenerPosition: listener, maxDistance: 10 }), null);

  const id = audio.playSfx('roar', { sourcePosition: { x: 5, y: 0 }, listenerPosition: listener, maxDistance: 10, loop: true });
  assert.ok(id !== null);
  assert.equal(audio.setSfxPlaybackVolume('roar', id, { sourcePosition: { x: 40, y: 0 }, listenerPosition: listener, maxDistance: 10 }), false);
  assert.equal(FakeHowl.made[0]!.volumes.get(id!), 0);
});

test('the volumes the player chose are kept, and read back next visit', () => {
  const kept = new Map<string, string>();
  const storage: VolumeStorage = { get: (key) => kept.get(key) ?? null, set: (key, value) => void kept.set(key, value) };
  const audio = make({ storage });
  audio.setMusicVolume(0.2);
  audio.setSfxVolume(1.5); // clamped
  assert.equal(kept.get('test.musicVolume'), '0.2');
  assert.equal(kept.get('test.sfxVolume'), '1');

  const next = make({ storage });
  assert.equal(next.getMusicVolume(), 0.2);
  assert.equal(next.getSfxVolume(), 1);
});
