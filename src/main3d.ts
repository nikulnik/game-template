/**
 * Where the game starts when it is drawn with three.js, and the order everything has to happen in.
 * The Pixi twin is src/main.ts; a project keeps one of them, and `RENDERER` in vite.config.ts says
 * which (see TEMPLATE.md § Pick a renderer).
 *
 * The order is the point of this file, and it is the same order in both halves:
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
 *
 * The one structural difference from the Pixi half: three.js has no ticker, so the frame loop is
 * spelled out here. That turns out to be the better end of the deal — `step` below is the whole of
 * how the game is driven from a script or a screenshot test (see CLAUDE.md).
 */

import { Howl, Howler } from 'howler';
import { Color, PerspectiveCamera, Scene as World, WebGLRenderer } from 'three';
import { Audio, type HowlConstructor, type HowlerLike } from './audio/Audio';
import { MUSIC, MusicState, SFX } from './audio/manifest';
import { followScreen } from './core/Screen';
import { Store } from './core/Store';
import { FOV } from './core/View3d';
import { Scene } from './game/Scene3d';
import { Saves } from './game/Progress';
import { detectLanguage, LANGUAGE_STORAGE_KEY, setLanguage } from './i18n';
import { initPhysics } from './physics/Physics3d';
import { platform } from './platform';
import { localStore } from './platform/storage';

/** TEMPLATE: the same colour as the page background in index.html, so nothing flashes between them. */
const BACKGROUND = 0x1a1a2e;
/** How near and how far the camera can see, in metres. Anything outside is not drawn. */
const NEAR = 0.1;
const FAR = 200;

async function main(): Promise<void> {
  await platform.init();
  setLanguage(detectLanguage(platform.language(), localStore.get(LANGUAGE_STORAGE_KEY)));

  const saves = new Saves(new Store(platform));
  const progress = await saves.load();
  await initPhysics();

  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  // Shadows are off by default and cost nothing until something asks to cast one (see Scene3d).
  // The type is left alone: `PCFSoftShadowMap` was removed in three r186 and only warns and falls
  // back to `PCFShadowMap`, which is the default anyway. `VSMShadowMap` is the one still worth
  // asking for, and only for large soft shadows.
  renderer.shadowMap.enabled = true;
  const host = document.getElementById('app')!;
  host.appendChild(renderer.domElement);

  const world = new World();
  world.background = new Color(BACKGROUND);
  // The aspect ratio is a placeholder: `reframe` sets it, along with everything else about the
  // camera, from the first call `followScreen` makes below.
  const camera = new PerspectiveCamera(FOV, 1, NEAR, FAR);

  // Howler is handed in rather than imported by the audio system, so it can be tested against a
  // fake; this cast is the one place the real one is named.
  const audio = new Audio({ Howl: Howl as unknown as HowlConstructor, Howler: Howler as unknown as HowlerLike, keyPrefix: 'game' });
  audio.registerMusic(MUSIC);
  audio.registerSfxManifest(SFX);
  audio.installUnlockListeners();
  void audio.preloadSfx();
  audio.setMusicState(MusicState.PLAY, { pauseState: MusicState.PAUSE });

  const scene = new Scene({ camera, canvas: renderer.domElement, hud: document.getElementById('hud')! }, audio, saves, progress);
  world.add(scene);
  // The canvas follows the window and the game follows the canvas, in that order, every time.
  // `setPixelRatio` before `setSize`: the size is in page pixels and the ratio is what turns it
  // into device ones, so the other way round draws one frame at the old density.
  followScreen(host, (width, height, res) => {
    renderer.setPixelRatio(res);
    renderer.setSize(width, height);
    scene.reframe(width, height);
  });

  /** One frame, by hand. Everything that moves is moved from here and nowhere else. */
  const step = (deltaMs: number): void => {
    scene.tick(deltaMs);
    renderer.render(world, camera);
  };

  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const deltaMs = now - last;
    last = now;
    step(deltaMs);
  });

  if (import.meta.env.DEV) Object.assign(globalThis, { __GAME__: { renderer, world, camera, scene, step } });

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
