# assets

Audio, and anything else the build should emit with a content hash.

- `music/` — long tracks. Streamed (`html5: true`), so they never stall the first frame.
- `sfx/` — short cues. Decoded into Web Audio, where latency is what matters.

Reference them from `src/audio/manifest.ts` through `new URL('../../assets/…', import.meta.url)`.
That is what makes Vite emit the file into `dist/<platform>/assets` and rewrite the reference; a
plain string path would 404 everywhere but the dev server.

Cues recorded at different times sit at different levels, and nothing sounds more amateur than a
mix where one button click is twice as loud as the next. `npm run audio:loudness` reports every
cue against the corpus, and `npm run audio:loudness -- --fix` aligns the strays. It needs ffmpeg,
and it leaves peak-limited files alone — those need a re-cut, not a gain change.

Formats: mp3 plays everywhere. Give Howler more than one source only if you have a reason to.
