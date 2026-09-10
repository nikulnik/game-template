import { localStore } from './storage';
import type { Platform, PlatformName } from './types';

/** Plain browser build: no SDK, no ads, localStorage saves. Also the base for Electron and mobile. */
export class WebPlatform implements Platform {
  readonly name: PlatformName = 'web';

  async init(): Promise<void> {}

  loadingFinished(): void {}

  gameplayStart(): void {}

  gameplayStop(): void {}

  async showInterstitial(): Promise<void> {}

  /** No ad network here, so the reward is granted immediately to keep rewarded flows testable. */
  async showRewarded(): Promise<boolean> {
    return true;
  }

  async getItem(key: string): Promise<string | null> {
    return localStore.get(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    localStore.set(key, value);
  }

  language(): string | null {
    return null;
  }
}

export const platform: Platform = new WebPlatform();
