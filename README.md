# game-template

A Pixi.js v8 + TypeScript + Vite skeleton for a browser game that ships to five places from one
codebase: the open web, CrazyGames, Yandex Games, a desktop app and a phone.

It is a working game, not a pile of snippets: `npm i && npm run dev` drops boxes on a floor. That
demo (`src/game/Scene.ts`) is the one file meant to be deleted; everything around it is the part
worth copying.

## What is in it

| Piece | Where | What it saves you |
| --- | --- | --- |
| Five platform builds from one entry | `vite.config.ts` | One adapter per bundle, relative asset paths, `dist/<platform>` |
| Platform adapters (ads, saves, language) | `src/platform/` | CrazyGames and Yandex SDKs behind one interface that never throws |
| Saves | `src/core/Store.ts`, `src/game/Progress.ts` | Versioned, budgeted, ordered writes, no crash on a dead store |
| Screen fit and resize | `src/core/View.ts`, `src/core/Screen.ts` | One scale for any screen, no letterboxing, pixel-ratio following |
| Language detection | `src/i18n.ts` | Platform → `?lang=` → saved → browser, with typed lines |
| Physics | `src/physics/Physics.ts` | Rapier 2D, y-down, fixed timestep, PPM |
| Music and sound | `src/audio/Audio.ts` | Unlock on first gesture, mute when unwatched or mid-ad, music as a state |
| Minifying and obfuscating | `build/obfuscate.ts` | Your code hidden, the engines left fast |
| Tests without a build step | `test/` | `node --test` straight over TypeScript |

## Start a project from it

```bash
npx degit github:USER/game-template my-game    # or: cp -r, then rm -rf .git && git init
cd my-game && npm install
npm run dev
```

Then work through [TEMPLATE.md](TEMPLATE.md) — every placeholder to rename and every file to gut.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server (web adapter) at http://localhost:5173 |
| `npm run dev:crazygames` | Dev server with the CrazyGames SDK in local mode (fake ads) |
| `npm run dev:yandex` | Dev server with the Yandex Games SDK |
| `npm run build` | Web build to `dist/web` |
| `npm run build:<platform>` | Build for `web`, `crazygames`, `yandex`, `electron` or `mobile` |
| `npm run build:all` | All five |
| `npm run zip:crazygames` / `zip:yandex` | Build and zip for upload to the developer console |
| `npm run electron:start` | Build and run in an Electron window |
| `npm run electron:package` | A distributable installer into `release/` (see `electron-builder.yml`) |
| `npm run mobile:add:android` / `mobile:add:ios` | One-time: generate the native project |
| `npm run mobile:sync` | Build and copy the web assets into the native projects |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Node's test runner over `test/*.test.ts` (needs Node 22.18+) |
| `npm run audio:loudness` | Report how level the cues in `assets/sfx` are; `-- --fix` aligns them (needs ffmpeg) |

## How platform builds work

`vite build --mode <platform>`:

1. Aliases `@platform` to `src/platform/<platform>.ts`, so exactly one adapter is bundled — the
   CrazyGames build contains no Yandex code and vice versa. **Keep it that way**: a portal rejects
   a build that phones another portal's SDK.
2. Defines `__PLATFORM__` for tree-shaking ad-hoc branches.
3. Writes to `dist/<platform>` with relative asset paths (`base: './'`), which zip uploads,
   Electron's `file://` and Capacitor all need.
4. Minifies with terser, then obfuscates this project's own chunks and nothing else.

Game code only ever imports `platform` from `src/platform`:

```ts
import { platform } from './platform';

await platform.init();               // load the SDK
platform.loadingFinished();          // assets loaded, first screen visible
platform.gameplayStart();            // level started / unpaused

platform.gameplayStop();             // before an ad
await platform.showInterstitial();   // see `interstitial()` in src/main.ts
platform.gameplayStart();

const earned = await platform.showRewarded();
await platform.setItem('game', JSON.stringify(state));   // saves go through `Store`
```

Every adapter degrades to a no-op when its SDK is missing, so the game always runs on localhost.

| Adapter | SDK | Ads | Saves | Language |
| --- | --- | --- | --- | --- |
| `web.ts` | none | none (rewarded resolves `true`) | localStorage | none, the browser decides |
| `crazygames.ts` | CrazyGames HTML5 SDK v3 | midgame + rewarded | `SDK.data`, 1 MB (cloud when signed in) | `SDK.user.systemInfo.locale` |
| `yandex.ts` | Yandex Games SDK v2 | fullscreen + rewarded | `player.setData`, 200 KB, one send at a time | `environment.i18n.lang` |
| `electron.ts` | none (extends web) | none | localStorage | the browser decides |
| `mobile.ts` | none (extends web) | none, add AdMob here | localStorage | the browser decides |

## Audio

`src/audio/Audio.ts` is Howler plus the four things every browser game gets wrong: it will not
play before the player's first click, it goes quiet when the tab is hidden or the game is in an
iframe nobody is looking at, it mutes for the length of an ad, and it treats music as a *state*
("menu", "play", "pause") rather than a track — picking one, crossfading, and holding the track
under a pause down so leaving the pause returns to it where it was.

Point `src/audio/manifest.ts` at files in `assets/`. Both lists start empty, and a cue that is not
in the manifest simply does not play, so the game runs with no audio at all.

## Screen fit

`fitView(width, height)` returns one scale for both axes: nothing is letterboxed, nothing is
stretched, and a screen's leftover shape becomes more world rather than black bars. Between about
600 and 2000 px across it draws at exactly the size the game is written in; past those a small
screen sees less world rather than a fort of specks, and a huge one sees the same arena drawn
bigger. `reframe(width, height)` in the scene is called on every resize and lays everything out
from that alone — which is why a phone rotating mid-game is not a special case.

## Tests

`node --test test/*.test.ts` runs the TypeScript directly, with no build step, which is why modules
under test import each other with a `.ts` extension. Anything that can be a pure function tested
this way should be: the view rule, the save format, the language rule and the audio state machine
all are, and none of them needs a browser.

## The rest

- [TEMPLATE.md](TEMPLATE.md) — what to rename, what to gut, and how this template is kept fed.
- [CLAUDE.md](CLAUDE.md) — the map and the house rules, for an agent or a new pair of hands.
