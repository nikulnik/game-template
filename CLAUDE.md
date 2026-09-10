# Working in this repo

A Pixi.js v8 + TypeScript + Vite game built for five platforms from one entry point. Read
[README.md](README.md) first for what each piece is; this file is the map and the house rules.

## The map

```
src/main.ts          the order startup has to happen in — platform, language, saves, physics, canvas, audio
src/platform/        one adapter per platform behind one interface; only ever imported as `@platform`
src/core/View.ts     how much world a screen shows, and at what scale (pure, tested)
src/core/Screen.ts   device pixels: resolution, pixel-ratio following, the resize hook
src/core/Store.ts    saves: never throws, one write in flight per key, versioned structures
src/audio/Audio.ts   music as a state, sound effects with a cap; Howler is injected, not imported
src/physics/         Rapier, y-down, fixed timestep, PPM = 50
src/i18n.ts          typed lines, and where a language is settled from
src/game/            THE GAME. Everything here is meant to be replaced.
test/                node --test straight over TypeScript, no build
build/obfuscate.ts   what ships obfuscated and what deliberately does not
```

## House rules

- **One adapter per bundle.** Game code imports `platform` from `src/platform`, never a named
  adapter. A build that carries two portals' SDKs gets rejected by both.
- **Adapters never throw.** A missing SDK, a refused write, a dead network: warn and degrade. The
  game must still be playable on localhost with everything switched off.
- **Nothing below `reframe` knows the screen size.** The world is drawn in metres × PPM and carried
  onto the screen by one `scale`. If a new thing needs the window size, it wants `fitView`.
- **Saves are budgeted.** Yandex Games refuses past 200 KB and takes one send at a time. Check
  `JSON.stringify(save).length` before adding a field, and spell big structures out in short keys
  and plain numbers.
- **A save's shape is versioned; a plain number is not.** Bump `SAVE_VERSION` when the structure
  changes — a half-read save puts the player back into a game that is subtly not the one they left.
- **Audio waits for a gesture.** Never call `playSfx` at startup expecting sound. `waitForUnlock()`
  is the gate; the manager handles the rest.
- **Ads mute and pause.** `platform.gameplayStop()` + `audio.setAdActive(true)` around every ad —
  `interstitial()` in `src/main.ts` is the shape.
- **Test the rule, not the browser.** Anything that can be a pure function belongs in `test/`.
  A fake Howl (see `test/audio.test.ts`) beats a headless browser for state machines.
- **Comments say why.** The code says what. Look at the comments in `View.ts` or `Audio.ts` for the
  register: what was tried, what broke, what the number is for.

## Known traps, paid for once already

- **Rapier 0.20 panics.** `rapier2d-compat` 0.20.0 panics inside `world.step` once structures tear
  apart. Pinned to `^0.19.3`; do not bump without a torn-structure stress test.
- **The chunk split is load-bearing.** In `vite.config.ts`, `codeSplitting.groups` keeps vendor code
  out of the game chunk. Not just for size: game classes extend `Container` at module scope, so if
  the vendor code sat in the entry chunk the two would import each other, the game chunk would
  evaluate first, and every `extends` would throw on a binding in its temporal dead zone. Vite's
  older `manualChunks` merges everything and reintroduces exactly that — don't switch back.
- **Obfuscation and source maps are exclusive.** `BUILD_SOURCEMAP=1` to debug a build, `OBFUSCATE=0`
  to read one. Asking for both fails the build on purpose.
- **A background tab does not animate.** `requestAnimationFrame` is throttled to nothing when the
  tab is hidden, so a game inspected from a script "looks frozen". Step it by hand (below).

## Driving the game from a script

The dev build hangs the Pixi application on `window.__PIXI_APP__`, which is the whole debugging
story: the scene, its physics world and every system are reachable from the console, from Chrome
automation, or from a page script.

```js
const app = window.__PIXI_APP__;
const scene = app.stage.children[0];

// Step time by hand — minutes of play in seconds, and the only way to see anything in a tab
// that is not in front (rAF is throttled there).
let t = performance.now();
for (let i = 0; i < 600; i++) { t += 16.7; app.ticker.update(t); }

// Any screen, without touching the window.
app.renderer.resize(390, 844);
scene.bounds;                      // what fitView made of it
```

For a screenshot of an exact moment, stop the ticker at creation (`app.ticker.stop()` behind a flag
set before `main()` runs) and step it one frame at a time. Anything the game does on a timer should
be reachable as a field for the same reason — a test or a screenshot should never have to wait out
a two-second telegraph in real time.

## Before you call something done

```bash
npm run typecheck && npm test && npm run build:all
```

`build:all` is not optional when the change touches `vite.config.ts`, `src/platform/` or anything
imported by `main.ts`: four of the five builds are the ones nobody runs by accident.
