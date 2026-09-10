/**
 * TEMPLATE: what this game keeps between visits. Replace the shape; keep the pattern.
 *
 * Two kinds of thing are saved, and they are saved differently. A record is a plain number: it
 * outlives every version of the game, so it is read back with no version check at all. A game to
 * go back to is a structure, and the shape of a structure is the shape of the code that reads it,
 * so it carries a version and a save from another one is passed over rather than half-read.
 */

import { allNumbers, Store, versioned } from '../core/Store.ts';

export const RECORD_KEY = 'best';
export const GAME_KEY = 'game';

/** Bump whenever `SavedGame` changes shape. */
export const SAVE_VERSION = 1;

export interface SavedGame {
  v: number;
  score: number;
  time: number;
}

/** What was found in store when the game started. */
export interface Progress {
  /** The best score ever reached, or 0 for a player who has never played. */
  best: number;
  /** The game to go back to, or null when there is none. */
  game: SavedGame | null;
}

const acceptGame = versioned<SavedGame>(SAVE_VERSION, (save) => allNumbers(save, ['score', 'time']));

export class Saves {
  private readonly store: Store;

  constructor(store: Store) {
    this.store = store;
  }

  /** Everything in store, read once at startup. */
  async load(): Promise<Progress> {
    const [best, game] = await Promise.all([this.store.readNumber(RECORD_KEY), this.store.readJson(GAME_KEY, acceptGame)]);
    return { best, game };
  }

  /**
   * Remember the best score, if this is better. It is written the moment it is reached rather than
   * when the game ends: a player who closes the tab on their best run has still had it.
   */
  record(best: number, reached: number): number {
    if (!Number.isFinite(reached) || reached <= best) return best;
    this.store.keepNumber(RECORD_KEY, reached);
    return Math.floor(reached);
  }

  keep(game: SavedGame): void {
    this.store.keepJson(GAME_KEY, game);
  }

  /** There is no going back to it any more: the run ended. The record stays. */
  clear(): void {
    this.store.clear(GAME_KEY);
  }
}
