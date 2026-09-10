/**
 * TEMPLATE: what the game plays. This is the one file in src/audio the game rewrites.
 *
 * Audio files live in assets/music and assets/sfx and are referenced through `new URL(...,
 * import.meta.url)`, which is what makes Vite emit them into `dist/<platform>/assets` with a
 * content hash and rewrite the reference. A path written as a bare string would not be, and would
 * 404 in every build but the dev server.
 *
 * Both lists start empty, so the template builds with no audio at all. Uncomment the examples once
 * there are files to point at, and run `npm run audio:loudness` to see whether the cues sit at the
 * same level as each other (it needs ffmpeg).
 */

import type { MusicTrack, SfxManifest } from './Audio.ts';

/** The states music is chosen by. A state with no track is simply silent. */
export const MusicState = {
  MENU: 'menu',
  PLAY: 'play',
  /** Passed to `setMusicState` as `pauseState`, which is what makes it hold the track under it. */
  PAUSE: 'pause',
} as const;

export const MUSIC: MusicTrack[] = [
  // { id: 'menu', state: MusicState.MENU, src: [new URL('../../assets/music/menu.mp3', import.meta.url).href] },
  // { id: 'play-1', state: MusicState.PLAY, src: [new URL('../../assets/music/play_1.mp3', import.meta.url).href] },
  // { id: 'play-2', state: MusicState.PLAY, src: [new URL('../../assets/music/play_2.mp3', import.meta.url).href] },
];

export const SFX: SfxManifest = {
  // A cue of its own per file …
  // drop: { sources: [new URL('../../assets/sfx/drop.mp3', import.meta.url).href], volume: 0.8, maxConcurrent: 4 },
  //
  // … or many cut out of one, which is one request instead of ten. The numbers are the start and
  // the length of each, in milliseconds.
  // ui: {
  //   sources: [new URL('../../assets/sfx/ui.mp3', import.meta.url).href],
  //   sprite: { click: [0, 180], back: [200, 240] },
  //   volume: 0.6,
  // },
};
