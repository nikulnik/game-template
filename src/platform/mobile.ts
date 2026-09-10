import type { Platform, PlatformName } from './types';
import { WebPlatform } from './web';

/**
 * Capacitor (Android / iOS) build. Behaves like web for now.
 * Plug in AdMob (@capacitor-community/admob), haptics, or native storage here.
 */
class MobilePlatform extends WebPlatform {
  override readonly name: PlatformName = 'mobile';
}

export const platform: Platform = new MobilePlatform();
