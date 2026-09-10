import { createRequire } from 'node:module';
import type { ObfuscatorOptions } from 'javascript-obfuscator';
import type { Plugin } from 'vite';

// javascript-obfuscator ships CommonJS, and Node's lexer does not pick its named exports out of
// the bundle, so an `import { obfuscate }` from this ES module config fails to link.
const { obfuscate } = createRequire(import.meta.url)('javascript-obfuscator') as typeof import('javascript-obfuscator');

/**
 * Every transform here is either done at build time or is a rename, so none of them add work to a
 * running frame. The ones that would — listed and switched off below — are the reason a stock
 * `javascript-obfuscator` preset costs a game its frame rate.
 */
const PERFORMANCE_SAFE: ObfuscatorOptions = {
  compact: true,

  // Renaming. Free: the engine sees the same shapes, only the names in the source text change.
  // Not 'mangled-shuffled': that draws a fresh name prefix per run which `seed` does not pin down,
  // and this has to be reproducible (see `seed` below).
  identifierNamesGenerator: 'mangled',
  // Chunks are ES modules, so their top level is already private. Renaming globals could only
  // reach out and rename something the page shares with the SDKs.
  renameGlobals: false,
  simplify: true,

  /*
   * Literals move into one table, so `"napalm"` in the source reads as `a(0x1f)` in the bundle.
   * This is the transform that actually hides what the code does, and the only one with any
   * runtime cost at all: one call to a monomorphic function that returns an array element. It
   * measured at roughly 3-5% of this project's own per-frame code, which is 0.03ms of a 16.7ms
   * frame; see the README. Encoding the table would hide it from `grep` and cost 34%, so it is off.
   */
  stringArray: true,
  stringArrayThreshold: 1,
  stringArrayEncoding: [],      // 'base64'/'rc4' decode on every miss; plain lookups stay free
  stringArrayIndexShift: true,
  stringArrayRotate: true,      // one bounded pass over the table at module evaluation, never again
  stringArrayShuffle: true,     // build time only, so the table is not in source order
  stringArrayWrappersCount: 0,  // each wrapper is another call between the code and the string
  stringArrayCallsTransform: false,
  splitStrings: false,          // rebuilds every string by concatenation at runtime
  unicodeEscapeSequence: false, // parse-time only, but triples the size of the table

  /*
   * The expensive half of the tool, and the reason a stock preset costs a game its frame rate.
   * Control flow flattening puts a switch inside a loop around every block; dead code injection
   * inflates the bundle with branches that never run; the rest add work or checks to code that
   * has none. Unmeasured here, unlike the string table above — they are simply not worth timing.
   */
  controlFlowFlattening: false,
  deadCodeInjection: false,
  numbersToExpressions: false,
  transformObjectKeys: false,
  selfDefending: false,
  debugProtection: false,
  disableConsoleOutput: false,

  target: 'browser',
  sourceMap: false,
  /*
   * Rollup hashes a chunk's file name before this plugin rewrites its contents, so obfuscation has
   * to be a pure function of its input or two builds of the same source would ship different code
   * under the same hashed name and poison every cache in front of it.
   */
  seed: 0x5eed,
};

/**
 * Obfuscates the chunks made of this project's own code, and only those.
 *
 * Pixi and Rapier are open source — there is nothing in them to hide — and they are where the
 * frame goes, so putting a string table in front of their render and solver loops would be paying
 * for nothing. `vite.config.ts` gives them chunks of their own to keep them out of reach.
 */
export function obfuscateFirstParty(srcDir: string): Plugin {
  return {
    name: 'obfuscate-first-party',
    apply: 'build',
    // `generateBundle` runs after every `renderChunk`, which is where Vite minifies. Obfuscating
    // last means terser can't undo any of it, and the minified names are what get rewritten.
    enforce: 'post',
    generateBundle(options, bundle) {
      if (options.sourcemap) {
        this.error(
          'Obfuscation rewrites chunks after their source maps are generated, and a source map ' +
            'would hand back the original source anyway. Build without one, or set OBFUSCATE=0.',
        );
      }

      const done: string[] = [];
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk') continue;
        const modules = chunk.moduleIds.filter((id) => !id.startsWith('\0'));
        const firstParty = modules.some((id) => id.startsWith(srcDir));
        if (!firstParty || modules.some((id) => id.includes('node_modules'))) continue;

        const before = chunk.code.length;
        chunk.code = obfuscate(chunk.code, PERFORMANCE_SAFE).getObfuscatedCode();
        done.push(`${fileName} ${kb(before)} -> ${kb(chunk.code.length)}`);
      }

      if (done.length === 0) {
        this.warn('No first-party chunk to obfuscate. Check the codeSplitting groups in vite.config.ts.');
      } else {
        this.info(`obfuscated ${done.join(', ')}`);
      }
    },
  };
}

const kb = (bytes: number): string => `${(bytes / 1024).toFixed(1)}kB`;
