# Working in this repo

A TypeScript + Vite game built for five platforms from one entry point, drawn either in 2D with
Pixi.js v8 or in 3D with three.js. Read [README.md](README.md) first for what each piece is; this
file is the map and the house rules.

## The map

Most of it does not know or care what is drawing. The two renderers are the `*3d` twins below, and
a project keeps one of each pair — `RENDERER` in `vite.config.ts` says which, and TEMPLATE.md
§ *Pick a renderer* says what to delete.

```
src/platform/        one adapter per platform behind one interface; only ever imported as `@platform`
src/core/Screen.ts   device pixels and the resize hook: `followScreen` (knows no renderer)
src/core/Store.ts    saves: never throws, one write in flight per key, versioned structures
src/audio/Audio.ts   music as a state, sound effects with a cap; Howler is injected, not imported
src/i18n.ts          typed lines, and where a language is settled from
test/                node --test straight over TypeScript, no build
build/obfuscate.ts   what ships obfuscated and what deliberately does not

                     2D — Pixi              3D — three.js
startup order        src/main.ts            src/main3d.ts
how much world       src/core/View.ts       src/core/View3d.ts   (pure, tested)
physics              src/physics/Physics.ts src/physics/Physics3d.ts
THE GAME             src/game/Scene.ts      src/game/Scene3d.ts  (meant to be replaced)
```

The two halves are the same game written twice, deliberately: the startup order, the resize rule
and the demo read the same in both, so the diff between them is only ever the renderer. Keep it
that way — a fix to one is usually a fix to the other.

## House rules

- **One adapter per bundle.** Game code imports `platform` from `src/platform`, never a named
  adapter. A build that carries two portals' SDKs gets rejected by both.
- **Adapters never throw.** A missing SDK, a refused write, a dead network: warn and degrade. The
  game must still be playable on localhost with everything switched off.
- **Nothing below `reframe` knows the screen size.** In 2D the world is drawn in metres × PPM and
  carried onto the screen by one `scale`; in 3D it is drawn in metres and carried by where the
  camera is. Either way, `reframe` is the only thing that is told a width and a height, and if a
  new thing wants the window size, what it actually wants is `fitView`.
- **One resize path.** `followScreen` is the only thing that watches the window, and it hands down
  a width, a height and a pixel ratio. Nothing else listens to `resize`, and no renderer is left to
  follow the window by itself — two things sizing the canvas is two things disagreeing about it.
- **Saves are budgeted.** Yandex Games refuses past 200 KB and takes one send at a time. Check
  `JSON.stringify(save).length` before adding a field, and spell big structures out in short keys
  and plain numbers.
- **A save's shape is versioned; a plain number is not.** Bump `SAVE_VERSION` when the structure
  changes — a half-read save puts the player back into a game that is subtly not the one they left.
- **Audio waits for a gesture.** Never call `playSfx` at startup expecting sound. `waitForUnlock()`
  is the gate; the manager handles the rest.
- **Ads mute and pause.** `platform.gameplayStop()` + `audio.setAdActive(true)` around every ad —
  `interstitial()` in whichever `main` this project uses is the shape.
- **Test the rule, not the browser.** Anything that can be a pure function belongs in `test/`.
  A fake Howl (see `test/audio.test.ts`) beats a headless browser for state machines.
- **Comments say why.** The code says what. Look at the comments in `View.ts` or `Audio.ts` for the
  register: what was tried, what broke, what the number is for.

## Known traps, paid for once already

- **Rapier 0.20 panics.** `rapier2d-compat` 0.20.0 panics inside `world.step` once structures tear
  apart. Pinned to `^0.19.3`; do not bump without a torn-structure stress test. `rapier3d-compat`
  is held at the same release on purpose — same solver, same caution, and one Rapier in the lock
  file rather than two.
- **A `transformIndexHtml` that picks the entry has to be `order: 'pre'`.** Vite reads the entry
  module out of the script tag before a default-ordered hook runs, so `RENDERER=three` would give a
  page that says `main3d.ts` and a bundle that is still Pixi — no error anywhere, and the wrong
  engine shipped. `rendererEntry` in `vite.config.ts` carries the note; check the bundle, not the
  HTML, if it is ever touched.
- **three.js frees nothing by itself.** A geometry and a material each hold GPU memory until
  `.dispose()` is called; removing a mesh from a scene does not. `Scene3d` makes one of each and
  lends them to every box, and `destroy` is the only place either is disposed.
- **A camera ignores everything until `updateProjectionMatrix()`.** Setting `fov` or `aspect` and
  wondering why a resize did nothing is the most common three.js hour there is.
- **`PCFSoftShadowMap` was removed in three r186.** It warns and quietly falls back to
  `PCFShadowMap`, which is the default; `VSMShadowMap` is the one still worth asking for.
- **A directional light's shadow camera covers almost nothing by default.** It is orthographic and
  has to be told the size of the world it lights, and every metre of that spends resolution out of
  the same shadow map. `Scene3d.light` sizes it to the arena and no more.
- **The chunk split is load-bearing.** In `vite.config.ts`, `codeSplitting.groups` keeps vendor code
  out of the game chunk. Not just for size: the scene extends `Container` (Pixi) or `Group`
  (three.js) at module scope, so if the vendor code sat in the entry chunk the two would import each
  other, the game chunk would evaluate first, and every `extends` would throw on a binding in its
  temporal dead zone. Vite's older `manualChunks` merges everything and reintroduces exactly that —
  don't switch back.
- **Obfuscation and source maps are exclusive.** `BUILD_SOURCEMAP=1` to debug a build, `OBFUSCATE=0`
  to read one. Asking for both fails the build on purpose.
- **A background tab does not animate.** `requestAnimationFrame` is throttled to nothing when the
  tab is hidden, so a game inspected from a script "looks frozen". Step it by hand (below).

## Driving the game from a script

The dev build hangs the game on a global, which is the whole debugging story: the scene, its
physics world and every system are reachable from the console, from Chrome automation, or from a
page script. Two things are worth being able to do to any game — step its clock by hand, and give
it any screen — and both halves can do both.

**Pixi**, on `window.__PIXI_APP__`:

```js
const app = window.__PIXI_APP__;
const scene = app.stage.children[0];

// Step time by hand — minutes of play in seconds, and the only way to see anything in a tab
// that is not in front (rAF is throttled there).
let t = performance.now();
for (let i = 0; i < 600; i++) { t += 16.7; app.ticker.update(t); }

// Any screen, without touching the window.
app.renderer.resize(390, 844);
scene.reframe(390, 844);
scene.bounds;                      // what fitView made of it
```

**three.js**, on `window.__GAME__`, which is `{ renderer, world, camera, scene, step }`. There is no
ticker to fight here: `step` *is* the frame, so the loop and the script drive the game the same way.

```js
const g = window.__GAME__;

for (let i = 0; i < 600; i++) g.step(16.7);   // ten seconds of play, now

g.renderer.setSize(390, 844);                 // any screen, without touching the window
g.scene.reframe(390, 844);
g.scene.bounds;                               // where fitView put the camera, and what it sees
```

For a screenshot of an exact moment, stop the loop (`renderer.setAnimationLoop(null)`, or
`app.ticker.stop()` behind a flag set before `main()` runs) and step it one frame at a time.
Anything the game does on a timer should be reachable as a field for the same reason — a test or a
screenshot should never have to wait out a two-second telegraph in real time.

## Before you call something done

This repo is kept uninstalled — no `node_modules`, no `dist` — so that nothing here can leak into a
project by being copied. Run `npm install` first (`npm run sync` needs nothing, it is plain node).

```bash
npm install
npm run typecheck && npm test && npm run build:all
RENDERER=three npm run build:all
```

`build:all` is not optional when the change touches `vite.config.ts`, `src/platform/` or anything
imported by either `main`: four of the five builds are the ones nobody runs by accident, and the
other renderer is the fifth thing nobody runs by accident. `RENDERER=three npm run dev` is the same
switch for looking at it.

While this repo carries both halves, a change to a shared file has to be true of both. The cheap
check is that the two demos still behave the same: drop a few boxes, step the clock, give it a
phone-shaped screen (see *Driving the game from a script*).

## The games this template answers to

*(Reading this inside a game cloned from the template? This section is the template's own — replace
it with the `## Feeding the template` block in TEMPLATE.md § 1 → Keep the link back.)*

```
~/projects/game         the fort/siege game this template was largely cut from
~/projects/creepstorm   started from this template — the three.js half, and the only game on it
~/projects/lidlness     Go backend + Pixi frontend; the audio manager came out of fe/src/audio_manager.js
```

Each of them carries the same rule in its own `CLAUDE.md`: anything that is not about that game
comes back here. From this side, check for drift before starting work and after a game ships
something shared:

```bash
npm run sync -- ~/projects/creepstorm --diff
```

`!!` = files meant to be identical that have drifted, `+` = files the game has and this does not,
`~` = same idea, different shape. A new game started from here gets added to this list.
