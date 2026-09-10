import { platform as impl } from '@platform';
import type { Platform } from './types';

export type { Platform, PlatformName } from './types';

/** The adapter for the platform this bundle was built for (see vite.config.ts). */
export const platform: Platform = impl;
