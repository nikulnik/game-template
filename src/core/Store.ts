/**
 * What the game keeps between visits, and the one door it keeps it behind.
 *
 * Everything is written through the two methods every platform adapter has (see
 * src/platform/types.ts): on Yandex Games that is the player's own cloud data, on CrazyGames the
 * SDK's data module, which follows a signed-in player between their devices, and everywhere else
 * localStorage. The game itself never knows which — it asks the store and gets an answer.
 *
 * Reads and writes are asynchronous because a platform's may be a request over the network.
 * Nothing in the game waits on a write, and nothing that fails to read stops the game: a store
 * that is not there, a half-written value or a save from an older build all read as "no save",
 * which is a player who has never played, which is a game that starts at once.
 *
 * TEMPLATE: keep this file; put the game's own keys and save shape in a module beside it (see
 * src/game/Progress.ts for what that looks like).
 */

// The extension is so `node --test` can load this module as it is written (see test/store.test.ts).
import { sessionStore } from '../platform/storage.ts';

/**
 * The little of a platform a save needs: a key and a string. Everything structured is JSON. It is
 * a type of its own so a save can be tested against a plain object, and so nothing here has to
 * import a platform.
 */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

/**
 * How much a platform will hold. Yandex Games refuses a player's data past 200 KB and takes one
 * send at a time; CrazyGames allows 1 MB. Whatever the game saves has to fit the smallest of
 * them, which is what decides how a big structure is spelt out — short keys, numbers rather than
 * objects. Measure with `JSON.stringify(save).length` before shipping a new field.
 */
export const SAVE_BUDGET_BYTES = 200 * 1024;

/** A store that never throws and never makes the caller wait on a write. */
export class Store {
  private readonly kv: KeyValueStore;
  private readonly prefix: string;
  /** One write in flight per key, so a slow platform cannot queue up a burst of them out of order. */
  private readonly writing = new Map<string, Promise<void>>();

  constructor(kv: KeyValueStore, prefix = '') {
    this.kv = kv;
    this.prefix = prefix;
  }

  async read(key: string): Promise<string | null> {
    try {
      return await this.kv.getItem(this.prefix + key);
    } catch {
      return null;
    }
  }

  /** Write it, and don't wait: a save that cannot be written is not worth stopping the game for. */
  write(key: string, value: string): void {
    const previous = this.writing.get(key) ?? Promise.resolve();
    const next = previous.then(async () => {
      try {
        await this.kv.setItem(this.prefix + key, value);
      } catch (err) {
        console.warn('[store] write failed', key, err);
      }
    });
    this.writing.set(key, next);
  }

  /** Everything written so far has landed. For a test, or for a save taken just before a reload. */
  async flushed(): Promise<void> {
    await Promise.all([...this.writing.values()]);
  }

  /** A whole number at least `least`, or `fallback` for anything that is not one. */
  async readNumber(key: string, fallback = 0, least = 0): Promise<number> {
    const value = Number(await this.read(key));
    return Number.isFinite(value) && value >= least ? Math.floor(value) : fallback;
  }

  keepNumber(key: string, value: number): void {
    this.write(key, String(Math.floor(value)));
  }

  /**
   * A stored structure, passed through `accept` before the game ever sees it. Anything `accept`
   * turns down — rubbish from the store, a save from an older build — reads as null.
   */
  async readJson<T>(key: string, accept: (parsed: unknown) => T | null): Promise<T | null> {
    const stored = await this.read(key);
    if (!stored) return null;
    try {
      return accept(JSON.parse(stored));
    } catch {
      return null;
    }
  }

  keepJson(key: string, value: unknown): void {
    this.write(key, JSON.stringify(value));
  }

  /** There is no going back to it any more. */
  clear(key: string): void {
    this.write(key, '');
  }
}

/**
 * A guard for a versioned save. A save of another version is passed over rather than guessed at —
 * the shape of a save is the shape of the code that wrote it, and half-reading one would put a
 * player back into a game that is subtly not the one they left. Bump `version` whenever the shape
 * changes; plain numbers like a high score need no version and survive any such change.
 */
export function versioned<T extends { v: number }>(version: number, accept: (save: Record<string, unknown>) => boolean): (parsed: unknown) => T | null {
  return (parsed: unknown) => {
    if (typeof parsed !== 'object' || parsed === null) return null;
    const save = parsed as Record<string, unknown>;
    if (save.v !== version) return null;
    return accept(save) ? (save as T) : null;
  };
}

/** Every value listed is a finite number. The usual body of a `versioned` check. */
export function allNumbers(save: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => typeof save[key] === 'number' && Number.isFinite(save[key] as number));
}

/**
 * What a reload has to carry across, and the only thing kept for the length of a visit rather than
 * for good. `Play again` is a reload — the one sure way to have every last thing back as it was,
 * from the physics world to the sky — and without this the page would come back to the start
 * screen asking what to do, which is not what was just asked for.
 */
const AGAIN_KEY = 'again';

/** Start another game from the beginning, by way of a reload. */
export function playAgain(): void {
  sessionStore.set(AGAIN_KEY, '1');
  location.reload();
}

/** Whether this load is the other half of `playAgain`. Asking clears it, so it answers true once. */
export function askedAgain(): boolean {
  return sessionStore.take(AGAIN_KEY) === '1';
}
