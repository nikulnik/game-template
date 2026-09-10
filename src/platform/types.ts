export type PlatformName = 'web' | 'crazygames' | 'yandex' | 'electron' | 'mobile';

/**
 * Everything the game needs from the host platform.
 *
 * Adapters must never throw from these methods: if the SDK is missing or fails,
 * they degrade to no-ops so the game still runs (e.g. on localhost).
 *
 * Ad flow: `platform.gameplayStop(); await platform.showInterstitial(); platform.gameplayStart();`
 * Pause audio and input around the await yourself.
 */
export interface Platform {
  readonly name: PlatformName;

  /** Load the SDK. Call once, before anything else. */
  init(): Promise<void>;

  /** All assets are loaded and the first interactive screen is visible. */
  loadingFinished(): void;

  /** Player starts or resumes active play (level start, unpause, menu closed, ad closed). */
  gameplayStart(): void;

  /** Player stops active play (level end, pause, menu opened, ad opened). */
  gameplayStop(): void;

  /** Resolves when the ad closes, whether or not one was shown. */
  showInterstitial(): Promise<void>;

  /** Resolves `true` if the player earned the reward. */
  showRewarded(): Promise<boolean>;

  /** Persistent key/value storage. JSON-encode structured data. */
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;

  /**
   * The language the platform is showing the game in, as an ISO 639-1 code such as "en" or
   * "ru-RU", or null when it leaves that to the game. Yandex Games hands over its interface
   * language and expects the game to follow it, CrazyGames offers the player's locale, and the
   * rest have no say, so the game asks the browser (see src/i18n.ts). Only meaningful after `init`.
   */
  language(): string | null;
}
