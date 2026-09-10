import { loadScript } from './loadScript';
import { localStore } from './storage';
import type { Platform, PlatformName } from './types';

// https://yandex.com/dev/games/doc/en/sdk/sdk-about
// Yandex recommends the relative path when the game is uploaded to their hosting.
// It 404s on localhost, so the absolute URL is the fallback for local development.
const SDK_URLS = ['/sdk.js', 'https://sdk.games.s3.yandex.net/sdk.js'];

interface AdvCallbacks {
  onOpen?: () => void;
  onClose?: (wasShown: boolean) => void;
  onError?: (error: unknown) => void;
}

interface RewardedCallbacks extends AdvCallbacks {
  onRewarded?: () => void;
}

interface YandexPlayer {
  getData(keys?: string[]): Promise<Record<string, unknown>>;
  /** At most 200 KB per player, and at most a hundred calls in five minutes. https://yandex.com/dev/games/doc/en/sdk/sdk-player */
  setData(data: Record<string, unknown>, flush?: boolean): Promise<void>;
}

interface YandexSDK {
  environment: { i18n: { lang: string } };
  features: {
    LoadingAPI?: { ready(): void };
    GameplayAPI?: { start(): void; stop(): void };
  };
  adv: {
    showFullscreenAdv(options: { callbacks: AdvCallbacks }): void;
    showRewardedVideo(options: { callbacks: RewardedCallbacks }): void;
  };
  getPlayer(options?: { scopes?: boolean; signed?: boolean }): Promise<YandexPlayer>;
}

declare global {
  interface Window {
    YaGames?: { init(options?: { signed?: boolean }): Promise<YandexSDK> };
  }
}

const SAVE_KEY = 'save';

async function loadFirstAvailable(urls: string[]): Promise<void> {
  let lastError: unknown;
  for (const url of urls) {
    try {
      await loadScript(url);
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/**
 * Yandex Games SDK v2. Player data is stored as one object under `SAVE_KEY`
 * and mirrored in memory; falls back to localStorage when the player API is unavailable.
 */
class YandexPlatform implements Platform {
  readonly name: PlatformName = 'yandex';
  private sdk: YandexSDK | null = null;
  private player: YandexPlayer | null = null;
  private data: Record<string, string> = {};
  /** The send in flight, if there is one, and whether anything has changed since it went out (see `flush`). */
  private sending: Promise<void> | null = null;
  private dirty = false;

  async init(): Promise<void> {
    try {
      await loadFirstAvailable(SDK_URLS);
      if (!window.YaGames) throw new Error('window.YaGames is missing');
      this.sdk = await window.YaGames.init();
    } catch (err) {
      console.warn('[yandex] SDK unavailable; running without it', err);
      return;
    }

    try {
      this.player = await this.sdk.getPlayer({ scopes: false });
      const stored = await this.player.getData([SAVE_KEY]);
      const save = stored[SAVE_KEY];
      if (save && typeof save === 'object') this.data = save as Record<string, string>;
    } catch (err) {
      console.warn('[yandex] player data unavailable; using localStorage', err);
      this.player = null;
    }
  }

  loadingFinished(): void {
    this.sdk?.features.LoadingAPI?.ready();
  }

  gameplayStart(): void {
    this.sdk?.features.GameplayAPI?.start();
  }

  gameplayStop(): void {
    this.sdk?.features.GameplayAPI?.stop();
  }

  showInterstitial(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.sdk) return resolve();
      this.sdk.adv.showFullscreenAdv({
        callbacks: {
          onClose: () => resolve(),
          onError: () => resolve(),
        },
      });
    });
  }

  showRewarded(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.sdk) return resolve(false);
      let rewarded = false;
      this.sdk.adv.showRewardedVideo({
        callbacks: {
          onRewarded: () => {
            rewarded = true;
          },
          onClose: () => resolve(rewarded),
          onError: () => resolve(rewarded),
        },
      });
    });
  }

  async getItem(key: string): Promise<string | null> {
    if (!this.player) return localStore.get(key);
    return this.data[key] ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    if (!this.player) {
      localStore.set(key, value);
      return;
    }
    this.data[key] = value;
    await this.flush();
  }

  /**
   * Send everything at once, and one send at a time. `setData` writes the whole of the player's
   * data whatever changed, and it is rate limited — a hundred calls in five minutes — so two keys
   * written in the same breath are one send, and anything written while a send is in flight goes
   * out in the next one rather than in a call of its own.
   *
   * `flush: true` because these are saves: without it the SDK is free to sit on the request, and
   * the write that matters most is the one made as the tab is closing.
   */
  private flush(): Promise<void> {
    this.dirty = true;
    this.sending ??= (async () => {
      try {
        while (this.dirty) {
          this.dirty = false;
          // Caught per send rather than round the loop: a send that fails is one save lost, and
          // the save that was made while it was out has still to go.
          try {
            await this.player?.setData({ [SAVE_KEY]: { ...this.data } }, true);
          } catch (err) {
            console.warn('[yandex] setData failed', err);
          }
        }
      } finally {
        this.sending = null;
      }
    })();
    return this.sending;
  }

  /** The Yandex Games interface language, which the game is required to follow. https://yandex.com/dev/games/doc/en/sdk/sdk-environment */
  language(): string | null {
    return this.sdk?.environment.i18n.lang ?? null;
  }
}

export const platform: Platform = new YandexPlatform();
