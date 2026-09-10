import type { Platform, PlatformName } from './types';
import { WebPlatform } from './web';

/**
 * Electron build. Behaves like web for now.
 * Put desktop-specific features here (file-based saves via IPC, window controls, Steam, ...).
 */
class ElectronPlatform extends WebPlatform {
  override readonly name: PlatformName = 'electron';
}

export const platform: Platform = new ElectronPlatform();
