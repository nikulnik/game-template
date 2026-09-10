#!/usr/bin/env node
// Measures every cue in assets/sfx against the loudness the mixed corpus sits at,
// and with --fix brings the strays into line.
//
// The game's cues are aligned at about -18.5 LUFS integrated under a -1.5 dBTP
// ceiling. Report first, then `--fix`; anything the report calls PEAK-LIMITED
// cannot reach the target on gain alone, because its peaks are already at the
// ceiling - that is a mastering decision (a limiter, or a re-cut), not an
// alignment one, so this script leaves it alone and says so.
//
//   node scripts/sfx-loudness.mjs            # report
//   node scripts/sfx-loudness.mjs --fix      # align anything off by >1.5 dB
//   node scripts/sfx-loudness.mjs --fix a.mp3 b.wav
//
// Short one-shots are measured with the file padded out to four seconds,
// because EBU R128 cannot gate a sound shorter than its own 400ms block and
// reports -70 for it. The padding costs a short cue a little level against a
// long one, which is why the tolerance is a decibel and a half rather than a
// tenth.

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TARGET_LUFS = -18.5;
const PEAK_CEILING_DBTP = -1.5;
const TOLERANCE_DB = 1.5;

const SFX_DIR = fileURLToPath(new URL('../assets/sfx/', import.meta.url));

// ffmpeg writes its measurements to stderr, so both streams are kept.
function ffmpeg(args) {
    const run = spawnSync('ffmpeg', ['-nostdin', '-hide_banner', '-nostats', ...args], {
        encoding: 'utf8',
    });

    return `${run.stdout || ''}${run.stderr || ''}`;
}

function measure(file) {
    const output = ffmpeg(['-i', join(SFX_DIR, file),
        '-af', 'apad=whole_dur=4,ebur128=peak=true', '-f', 'null', '-']);
    const tail = output.slice(output.lastIndexOf('Integrated loudness'));
    const loudness = Number(tail.match(/I:\s+(-?[\d.]+)\s+LUFS/)?.[1]);
    const peak = Number(tail.match(/Peak:\s+(-?[\d.]+)\s+dBFS/)?.[1]);

    return { loudness, peak };
}

function plan(file) {
    const { loudness, peak } = measure(file);
    if (!Number.isFinite(loudness) || !Number.isFinite(peak)) return null;

    const wanted = TARGET_LUFS - loudness;
    const headroom = PEAK_CEILING_DBTP - peak;

    return {
        file,
        loudness,
        peak,
        gain: Math.min(wanted, headroom),
        wanted,
        peakLimited: headroom < wanted - 0.05,
    };
}

function apply(entry) {
    const scratch = mkdtempSync(join(tmpdir(), 'sfx-'));
    const source = join(SFX_DIR, entry.file);
    const output = join(scratch, entry.file);
    const codec = entry.file.endsWith('.wav')
        ? ['-c:a', 'pcm_s16le']
        : ['-c:a', 'libmp3lame', '-q:a', '2'];

    try {
        copyFileSync(source, `${source}.bak`);
        ffmpeg(['-loglevel', 'error', '-y', '-i', source,
            '-af', `volume=${entry.gain.toFixed(2)}dB`, ...codec, output]);
        renameSync(output, source);
    } finally {
        rmSync(scratch, { recursive: true, force: true });
    }
}

const args = process.argv.slice(2);
const fix = args.includes('--fix');
const only = new Set(args.filter(argument => !argument.startsWith('--')));
const files = readdirSync(SFX_DIR)
    .filter(name => /\.(mp3|wav)$/i.test(name))
    .filter(name => only.size === 0 || only.has(name))
    .sort();

let strays = 0;
let stuck = 0;

for (const file of files) {
    const entry = plan(file);
    if (!entry) {
        console.log(`${file.padEnd(38)} unreadable`);
        continue;
    }

    const off = Math.abs(entry.loudness - TARGET_LUFS) > TOLERANCE_DB;
    const note = entry.peakLimited ? '  PEAK-LIMITED' : '';
    const row = `${file.padEnd(38)} I=${entry.loudness.toFixed(1).padStart(7)} `
        + `TP=${entry.peak.toFixed(1).padStart(6)}`;

    if (!off) {
        if (!fix) console.log(`${row}  ok`);
        continue;
    }

    if (entry.peakLimited && Math.abs(entry.gain) < 0.1) {
        // Already sitting on the ceiling: only a limiter or a re-cut moves it.
        stuck += 1;
        console.log(`${row}  at the ceiling, ${(TARGET_LUFS - entry.loudness).toFixed(1)} dB under target`);
        continue;
    }

    strays += 1;

    if (!fix || Math.abs(entry.gain) < 0.1) {
        console.log(`${row}  ${entry.gain >= 0 ? '+' : ''}${entry.gain.toFixed(2)} dB${note}`);
        continue;
    }

    apply(entry);
    const after = measure(file);
    console.log(`${row}  applied ${entry.gain >= 0 ? '+' : ''}${entry.gain.toFixed(2)} dB `
        + `-> I=${after.loudness.toFixed(1)} TP=${after.peak.toFixed(1)}${note}`);
}

console.log(`\n${files.length} cues: ${strays} correctable by gain, `
    + `${stuck} already at the ${PEAK_CEILING_DBTP} dBTP ceiling and quieter than `
    + `${TARGET_LUFS} LUFS anyway (needs a limiter or a re-cut, not a gain change)`);
