import { loadScript } from './loadScript';
import { localStore } from './storage';
import type { Platform, PlatformName } from './types';

// https://docs.crazygames.com/sdk/intro/
const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

interface AdCallbacks {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (error: unknown) => void;
}

interface CrazyGamesSDK {
  environment: 'local' | 'crazygames' | 'disabled';
  init(): Promise<void>;
  ad: {
    requestAd(type: 'midgame' | 'rewarded', callbacks: AdCallbacks): void;
  };
  game: {
    loadingStart(): void;
    loadingStop(): void;
    gameplayStart(): void;
    gameplayStop(): void;
    happytime(): void;
  };
  data: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
    clear(): void;
  };
  user: {
    /** Where and on what the player is. CrazyGames says to set the game's language from `locale`. */
    systemInfo: { countryCode?: string; locale?: string };
  };
}

declare global {
  interface Window {
    CrazyGames?: { SDK: CrazyGamesSDK };
  }
}

/**
 * CrazyGames HTML5 SDK v3. On localhost the SDK runs in "local" mode with fake ads.
 * On any other non-CrazyGames domain the SDK is disabled and this adapter degrades to web behaviour.
 */
class CrazyGamesPlatform implements Platform {
  readonly name: PlatformName = 'crazygames';
  private sdk: CrazyGamesSDK | null = null;

  async init(): Promise<void> {
    try {
      await loadScript(SDK_URL);
      const sdk = window.CrazyGames?.SDK;
      if (!sdk) throw new Error('window.CrazyGames.SDK is missing');
      await sdk.init();
      if (sdk.environment === 'disabled') {
        console.warn('[crazygames] SDK disabled on this domain; running without it');
        return;
      }
      this.sdk = sdk;
      sdk.game.loadingStart();
    } catch (err) {
      console.warn('[crazygames] SDK unavailable; running without it', err);
    }
  }

  loadingFinished(): void {
    this.sdk?.game.loadingStop();
  }

  gameplayStart(): void {
    this.sdk?.game.gameplayStart();
  }

  gameplayStop(): void {
    this.sdk?.game.gameplayStop();
  }

  showInterstitial(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.sdk) return resolve();
      this.sdk.ad.requestAd('midgame', {
        adFinished: () => resolve(),
        adError: () => resolve(),
      });
    });
  }

  showRewarded(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.sdk) return resolve(false);
      this.sdk.ad.requestAd('rewarded', {
        adFinished: () => resolve(true),
        adError: () => resolve(false),
      });
    });
  }

  /*
   * The data module and nothing else, when it is there. CrazyGames asks games not to keep a copy
   * of their saves in localStorage as well: the module is the one that follows a signed-in player
   * between their devices, and it hands a guest's saves over to their account when they sign in,
   * which a second copy would only contradict. It is synchronous, and the SDK gathers up writes
   * itself, so nothing has to be batched here. What it can refuse is a save over its 1 MB.
   */
  async getItem(key: string): Promise<string | null> {
    if (!this.sdk) return localStore.get(key);
    try {
      return this.sdk.data.getItem(key);
    } catch (err) {
      console.warn('[crazygames] getItem failed', err);
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    if (!this.sdk) {
      localStore.set(key, value);
      return;
    }
    try {
      this.sdk.data.setItem(key, value);
    } catch (err) {
      console.warn('[crazygames] setItem failed', err);
    }
  }

  /** The player's locale as CrazyGames sees it, e.g. "en-US". https://docs.crazygames.com/sdk/user/ */
  language(): string | null {
    return this.sdk?.user.systemInfo.locale ?? null;
  }
}

export const platform: Platform = new CrazyGamesPlatform();
