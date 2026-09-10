import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { obfuscateFirstParty } from './build/obfuscate.ts';

const PLATFORMS = ['web', 'crazygames', 'yandex', 'electron', 'mobile'] as const;
type PlatformName = (typeof PLATFORMS)[number];

const SRC_DIR = fileURLToPath(new URL('./src/', import.meta.url));
const ENTRY = fileURLToPath(new URL('./src/main.ts', import.meta.url));

/** `vite build --mode <platform>` selects the target. Plain `vite` / `vite build` mean "web". */
function resolvePlatform(mode: string): PlatformName {
  if ((PLATFORMS as readonly string[]).includes(mode)) return mode as PlatformName;
  if (mode === 'development' || mode === 'production') return 'web';
  throw new Error(`Unknown mode "${mode}". Use one of: ${PLATFORMS.join(', ')}`);
}

export default defineConfig(({ mode }) => {
  const platform = resolvePlatform(mode);
  // A source map hands back the original source in full, so it is the one thing that cannot ship
  // alongside an obfuscated bundle. Ask for either, and you get a readable build to debug.
  const sourcemap = process.env.BUILD_SOURCEMAP === '1';
  const obfuscate = !sourcemap && process.env.OBFUSCATE !== '0';

  return {
    // Relative asset URLs. Required for CrazyGames/Yandex zip uploads, Electron's file:// and Capacitor.
    base: './',
    define: {
      __PLATFORM__: JSON.stringify(platform),
    },
    resolve: {
      alias: {
        // `import { platform } from '@platform'` resolves to exactly one adapter,
        // so the other platforms' SDK code never ends up in the bundle.
        '@platform': fileURLToPath(new URL(`./src/platform/${platform}.ts`, import.meta.url)),
      },
    },
    plugins: obfuscate ? [obfuscateFirstParty(SRC_DIR)] : [],
    build: {
      outDir: `dist/${platform}`,
      emptyOutDir: true,
      target: 'es2022',
      sourcemap,
      /*
       * Terser rather than esbuild: it mangles module-top-level names too, drops comments and dead
       * branches more thoroughly, and takes several passes. All of that is a rename or a deletion,
       * so it costs nothing at runtime and leaves the obfuscator less to do.
       */
      minify: 'terser',
      terserOptions: {
        ecma: 2020,
        compress: {
          passes: 3,
          drop_debugger: true,
          // The `console.warn`s around the platform SDKs are the only report of a failed init in
          // the wild, so they stay. Anything left over from debugging goes.
          pure_funcs: ['console.log', 'console.debug', 'console.info', 'console.trace'],
        },
        mangle: { toplevel: true },
        format: { comments: false },
      },
      rolldownOptions: {
        output: {
          /*
           * Keeps this project's code in a chunk that holds nothing else, which is what lets the
           * obfuscator run over all of it and over none of Pixi or Rapier. Higher priority wins a
           * module outright, so the vendor groups claim their trees before `game` can pull them in
           * as dependencies.
           *
           * The split is also load-bearing: game classes extend `Container` and `Graphics` at
           * module scope, so were the vendor code left in the entry chunk the two chunks would
           * import each other, the game chunk would evaluate first, and every one of those
           * `extends` clauses would throw on a binding still in its temporal dead zone.
           */
          codeSplitting: {
            groups: [
              {
                // ~1.6MB of this is the WASM binary inlined as base64. Alone in a chunk it stays
                // out of the way, and out of the content hash of everything else.
                name: 'physics',
                test: /node_modules[\\/]@dimforge[\\/]/,
                priority: 30,
              },
              { name: 'vendor', test: /node_modules[\\/]/, priority: 20 },
              {
                // The entry module has to stay in the entry chunk; everything it pulls in can move.
                name: 'game',
                test: (id: string) => id.startsWith(SRC_DIR) && id !== ENTRY,
                priority: 10,
              },
            ],
          },
        },
      },
    },
    server: {
      port: 5173,
      host: true, // reachable from a phone on the same network
    },
  };
});
