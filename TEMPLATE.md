# Using this template, and keeping it fed

Two halves: what to do when you start a project from it, and what to do when a project finds
something the template should have had.

## 1. Starting a project

```bash
npx degit github:USER/game-template my-game     # or cp -r, then rm -rf .git && git init
cd my-game && npm install && npm run dev
```

### Rename

Every placeholder is marked `TEMPLATE:` in the source. `grep -rn "TEMPLATE:" src *.ts *.html *.yml`
finds all of them; this is the list:

| What | Where |
| --- | --- |
| `game-template`, description | `package.json` |
| `<title>Game</title>` | `index.html` |
| Page background `#1a1a2e` | `index.html`, `src/main.ts` (`BACKGROUND`), `electron/main.cjs` |
| `com.example.game`, `Game` | `capacitor.config.ts`, `electron-builder.yml` |
| `keyPrefix: 'game'` (volume keys) | `src/main.ts` |
| Save keys and the save's shape | `src/game/Progress.ts` |
| The lines the game says | `src/i18n.ts` (`TRANSLATIONS`) |
| Languages spoken | `src/i18n.ts` (`LANGUAGES`) — and add a column to every line |
| Music states, music and cue files | `src/audio/manifest.ts` |
| How much world a screen shows | `src/core/View.ts` (`LEAST`, `MOST`) — then fix `test/view.test.ts` |

### Gut

- `src/game/Scene.ts` — the demo. Delete it and write the game; keep `reframe` and the one-scale
  rule (see CLAUDE.md).
- `src/game/Progress.ts` — keep the pattern, replace the shape.
- `test/*.test.ts` — `view` and `i18n` stay useful as they are; `store` and `audio` test the
  machinery and can stay untouched.

### Drop what the game does not need

- No physics? Delete `src/physics/`, drop `@dimforge/rapier2d-compat`, and remove the `physics`
  group from `codeSplitting.groups` in `vite.config.ts`.
- No audio? Delete `src/audio/`, drop `howler` and `@types/howler`, and the audio wiring in
  `src/main.ts`.
- Web only? Delete the adapters you will not ship, their `build:` scripts, `electron/`,
  `capacitor.config.ts`, `electron-builder.yml` — and trim `PLATFORMS` in `vite.config.ts`.

Keep `src/platform/` even for a web-only game: it is the seam that makes a portal build a
day's work rather than a rewrite.

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
4. `npm run typecheck && npm test && npm run build:all`, then commit with the reason in the message.

### Something was fixed here

Run the same check from the template and push the fix into each game that carries the file. The
games are listed under `sources` in `sync.json`; add a project there when it starts using this.

### What does *not* belong here

Anything only true of one game: its scenes, its economy, its art, its levels, its lines. When in
doubt, ask whether the next game would delete it — if yes, it stays in the game.
