# Using this template, and keeping it fed

Two halves: what to do when you start a project from it, and what to do when a project finds
something the template should have had.

## 1. Starting a project

**Use this template** on [github.com/nikulnik/game-template](https://github.com/nikulnik/game-template)
gives a fresh repo with no history. Locally:

```bash
git clone ~/projects/game-template my-game
cd my-game && rm -rf .git && git init
npm install && npm run dev
```

`git clone` carries only committed files: no `node_modules`, no `dist`, no history to disown beyond
the one `rm -rf .git`. Dependencies are never copied between projects — every project installs its
own from `package-lock.json`.

### Pick a renderer

Do this first: it decides which half of the template you are keeping, and half the files below
come in pairs.

|  | 2D | 3D |
| --- | --- | --- |
| Draws with | Pixi.js v8 | three.js |
| Physics | `@dimforge/rapier2d-compat`, y-**down** | `@dimforge/rapier3d-compat`, y-**up** |
| Units | metres × `PPM` (50 px), one `scale` onto the screen | metres, and the camera does the rest |
| HUD | drawn in the scene | `#hud`, a DOM overlay |
| Startup | `src/main.ts` | `src/main3d.ts` |

Look at both — `npm run dev` and `npm run dev:3d` are the same demo, boxes dropped on a floor.
Then set `DEFAULT_RENDERER` in `vite.config.ts` and delete the other half:

```bash
# Keeping 2D — delete the three.js half
rm src/main3d.ts src/game/Scene3d.ts src/core/View3d.ts src/physics/Physics3d.ts test/view3d.test.ts
npm uninstall three @types/three @dimforge/rapier3d-compat
# and the #hud div and its styles in index.html

# Keeping 3D — delete the Pixi half
rm src/main.ts src/game/Scene.ts src/core/View.ts src/physics/Physics.ts test/view.test.ts
npm uninstall pixi.js @dimforge/rapier2d-compat
```

Nothing is renamed by either of those, so `main3d.ts` stays `main3d.ts` in a 3D project and the
`RENDERER` switch goes on working. Leave the names alone even though they will look odd in a game
that has no 2D half: `sync.json` matches by path, and a `View3d.ts` renamed to `View.ts` is
indistinguishable from a 2D game's `View.ts` from the template's side, which is a `!!` on two files
that were never meant to be the same.

Do not keep both. One renderer is ~570 KB of vendor code, two WebGL contexts and two resize paths,
and the only thing it really buys is Pixi's 2D UI over a three.js world — which the DOM overlay
already does, better, for nothing.

### Rename

Every placeholder is marked `TEMPLATE:` in the source. `grep -rn "TEMPLATE:" src *.ts *.html *.yml`
finds all of them; this is the list:

| What | Where |
| --- | --- |
| `game-template`, description | `package.json` |
| `DEFAULT_RENDERER` | `vite.config.ts` — see *Pick a renderer* above |
| `<title>Game</title>` | `index.html` |
| Page background `#1a1a2e` | `index.html`, `src/main.ts` / `src/main3d.ts` (`BACKGROUND`), `electron/main.cjs` |
| `com.example.game`, `Game` | `capacitor.config.ts`, `electron-builder.yml` |
| `keyPrefix: 'game'` (volume keys) | `src/main.ts` / `src/main3d.ts` |
| Save keys and the save's shape | `src/game/Progress.ts` |
| The lines the game says | `src/i18n.ts` (`TRANSLATIONS`) |
| Languages spoken | `src/i18n.ts` (`LANGUAGES`) — and add a column to every line |
| Music states, music and cue files | `src/audio/manifest.ts` |
| How much world a screen shows | `src/core/View.ts` (`LEAST`, `MOST`) — then fix `test/view.test.ts` |
| …in 3D, and where the camera sits | `src/core/View3d.ts` (`LEAST`, `MOST`, `FOV`, `DISTANCE`) — then fix `test/view3d.test.ts` |
| The HUD's look, in 3D | `#hud` in `index.html` |

### Gut

- `src/game/Scene.ts` or `Scene3d.ts` — the demo. Delete it and write the game; keep `reframe` and
  the rule that nothing under it knows the screen size (see CLAUDE.md).
- `src/game/Progress.ts` — keep the pattern, replace the shape.
- `test/*.test.ts` — `view` (or `view3d`) and `i18n` stay useful as they are; `store` and `audio`
  test the machinery and can stay untouched.

### Drop what the game does not need

- No physics? Delete `src/physics/`, drop the `@dimforge/rapier*-compat` you kept, and remove the
  `physics` group from `codeSplitting.groups` in `vite.config.ts`.
- No audio? Delete `src/audio/`, drop `howler` and `@types/howler`, and the audio wiring in your
  `main`.
- Web only? Delete the adapters you will not ship, their `build:` scripts, `electron/`,
  `capacitor.config.ts`, `electron-builder.yml` — and trim `PLATFORMS` in `vite.config.ts`.

Keep `src/platform/` even for a web-only game: it is the seam that makes a portal build a
day's work rather than a rewrite.

### Keep the link back

A project that cannot remember where it came from stops feeding the template, so do this in the
scaffold, not later. In the new repo's `CLAUDE.md`, replace the section *The games this template
answers to* (it is the template's own, and wrong in a game) with:

~~~markdown
## Feeding the template

This repo came out of `~/projects/game-template`, and the debt runs both ways. When a change here
is **not about this game** — a platform adapter or portal SDK fix, a resize or view rule, a save
guard, audio behaviour, a build flag, a dependency pin, a trap that cost real time and deserves a
comment — port it back to the template in the same session, before the reason is forgotten.

```bash
cd ~/projects/game-template && npm run sync -- ~/projects/MY-GAME --diff
```

`!!` marks files meant to be identical that have drifted; decide which side is right and fix both.
`+` marks files this game has and the template does not. Anything only this game would ever want
stays here. The `game-template` skill covers the rest.
~~~

Then, in the template: add the project to `sources` in `sync.json`, and to the list under *The
games this template answers to* in its `CLAUDE.md`. Both sides now know about each other, which is
the whole mechanism — there is nothing automatic behind it.

### Then

Set the store metadata up early — icons and covers take longer than the code:

| Portal | Needs |
| --- | --- |
| CrazyGames | zip (`npm run zip:crazygames`), 800×450 cover, 16:9 and 2:3 preview video, description |
| Yandex Games | zip (`npm run zip:yandex`), 800×450 and 2:3 covers, icon, Russian description |
| Google Play / App Store | `npm run mobile:sync`, then the native project's own icon and screenshot sets |

## 2. Keeping the template fed

The template is only worth what the last project taught it. Two directions, both cheap:

### Something reusable appeared in a game

When a game grows a piece that is *not about that game* — a new platform adapter, a fix in the
resize rule, a save-store guard, an audio behaviour, a build flag, a trap worth a comment — port it
back here the same day, while the reason is still fresh. Small and often beats a yearly merge.

1. `npm run sync -- ../that-game` from the template. `!!` marks files meant to be identical that
   are not — that is the fix, in one direction or the other. `+` lists files the game has that the
   template does not: candidates for adoption.
2. Move the piece over, strip the game's own names out of it, and give it a test if it can have one.
3. Add it to `sync.json` if it is a new shared file, and to the table in `README.md`.
4. `npm run typecheck && npm test && npm run build:all`, and `RENDERER=three npm run build:all` if
   the piece is in a file both halves use, then commit with the reason in the message.

### Something was fixed here

Run the same check from the template and push the fix into each game that carries the file. The
games are listed under `sources` in `sync.json`; add a project there when it starts using this.

### Is it definitely common? Three questions

Port it only if all three answer yes. They are cheap to ask and they settle almost every case:

1. **Would the next game want this before it has any gameplay?** Startup order, a platform quirk,
   the resize rule, saves, audio, a build flag — yes. Anything that presumes bricks, waves, levels,
   an economy or a weapon — no. A 3D game and a 2D one both count as *the next game*: if the piece
   is true of only one renderer it still belongs here, in that half.
2. **Can it be stated without naming this game?** If the code or the comment has to say *core*,
   *fort*, *creep* or *shot* to make sense, it is not template material; if it only needs to say
   *the world*, *the screen*, *a save*, it is.
3. **Would leaving it here cost the next game the same day again?** A trap already paid for — an
   SDK that rejects two adapters, a version that panics, a build that silently drops a chunk —
   belongs here even when it is only a comment. That is the template's main job.

One yes and two nos is a game's own business. Three yeses and it is late already.

### What does *not* belong here

Anything only true of one game: its scenes, its economy, its art, its levels, its lines. When in
doubt, ask whether the next game would delete it — if yes, it stays in the game.
