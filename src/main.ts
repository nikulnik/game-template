/**
 * Where the game starts, and the order everything has to happen in.
 *
 * The order is the point of this file:
 *
 * 1. **The platform SDK first.** It may want to know that loading has begun, it knows the language
 *    on Yandex Games and CrazyGames, and it is where the player's saves are kept. Nothing can be
 *    read before it is up.
 * 2. **The language**, from the platform, the URL, what was saved and the browser, in that order
 *    (see src/i18n.ts). Before anything is drawn: text already made keeps its wording.
 * 3. **The saves**, asked for while the loading is going on anyway. A store that is slow or not
 *    there hands back nothing, and nothing is a player who has never played.
 * 4. **The physics WASM**, which has to be awaited before any world is made.
 * 5. **The canvas**, following the window, at the screen's pixel ratio.
 * 6. **The audio**, which cannot make a sound until the player has touched the page, so it is set
 *    up now and waits for that by itself.
 * 7. **`loadingFinished`**, once the first interactive screen is actually up. Portals measure it.
 */

import { Howl, Howler } from 'howler';
import { Application } from 'pixi.js';
import { Audio, type HowlConstructor, type HowlerLike } from './audio/Audio';
import { MUSIC, MusicState, SFX } from './audio/manifest';
import { followPixelRatio, onResize, resolution } from './core/Screen';
import { Store } from './core/Store';
import { Scene } from './game/Scene';
import { Saves } from './game/Progress';
import { detectLanguage, LANGUAGE_STORAGE_KEY, setLanguage } from './i18n';
import { initPhysics } from './physics/Physics';
import { platform } from './platform';
import { localStore } from './platform/storage';

/** TEMPLATE: the same colour as the page background in index.html, so nothing flashes between them. */
const BACKGROUND = 0x1a1a2e;

async function main(): Promise<void> {
  await platform.init();
  setLanguage(detectLanguage(platform.language(), localStore.get(LANGUAGE_STORAGE_KEY)));

  const saves = new Saves(new Store(platform));
  const progress = await saves.load();
  await initPhysics();

  const app = new Application();
  await app.init({
    // The canvas follows the window, and the game follows the canvas (see `onResize` below), so
    // the game can be played in any window on any screen, and go on being played while the window
    // changes shape.
    resizeTo: window,
    background: BACKGROUND,
    antialias: true,
    resolution: resolution(),
    autoDensity: true,
    // Pixi picks WebGL by default. Set `preference: 'webgpu'` to prefer WebGPU; it falls back to
    // WebGL where no adapter is available.
  });
  followPixelRatio(app);
  document.getElementById('app')!.appendChild(app.canvas);
  if (import.meta.env.DEV) Object.assign(globalThis, { __PIXI_APP__: app }); // PixiJS devtools hook

  // Howler is handed in rather than imported by the audio system, so it can be tested against a
  // fake; this cast is the one place the real one is named.
  const audio = new Audio({ Howl: Howl as unknown as HowlConstructor, Howler: Howler as unknown as HowlerLike, keyPrefix: 'game' });
  audio.registerMusic(MUSIC);
  audio.registerSfxManifest(SFX);
  audio.installUnlockListeners();
  void audio.preloadSfx();
  audio.setMusicState(MusicState.PLAY, { pauseState: MusicState.PAUSE });

  const scene = new Scene(app, audio, saves, progress);
  app.stage.addChild(scene);
  onResize(app, (width, height) => scene.reframe(width, height));

  // A tab nobody is looking at is not play, and portals count the difference. The audio system
  // watches the page itself; this is the other half of it, for the platform.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) platform.gameplayStop();
    else platform.gameplayStart();
  });

  // Everything is loaded and the first screen is up.
  platform.loadingFinished();
  platform.gameplayStart();
}

/**
 * The shape every ad takes, wherever one is shown from: stop play, mute the game for the length of
 * it, show it, then start again. `showInterstitial` resolves whether or not an ad was actually
 * shown, so the game always comes back.
 */
export async function interstitial(audio: Audio): Promise<void> {
  platform.gameplayStop();
  audio.setAdActive(true);
  try {
    await platform.showInterstitial();
  } finally {
    audio.setAdActive(false);
    platform.gameplayStart();
  }
}

main().catch((err) => {
  console.error('Failed to start the game', err);
});
