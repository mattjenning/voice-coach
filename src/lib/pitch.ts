/**
 * Pitch detection: turn a short slice of microphone samples into a frequency.
 *
 * The method is YIN (de Cheveigné and Kawahara, 2002). The idea in plain
 * words: a sung note is a wave that repeats. Slide a copy of the sound
 * against itself and measure how different the two are at each shift. At a
 * shift of exactly one repeat, the copy lines up and the difference drops to
 * nearly zero. That shift is the period, and the pitch is the sample rate
 * divided by the period.
 *
 * Pure maths. No microphone or screen code, so it is tested without a phone.
 */

export type Pitch = {
  hz: number;
  /** 0 to 1. Near 1 means a clean, steady note. Low means noise or breath. */
  clarity: number;
};

export type PitchOptions = {
  /** Lowest pitch to look for. C2, the bottom of a bass voice, is 65 Hz. */
  minHz?: number;
  /** Highest pitch to look for. C6, the top of a soprano voice, is 1047 Hz. */
  maxHz?: number;
  /** How good the match must be. Lower is stricter. YIN's paper uses 0.1 to 0.15. */
  threshold?: number;
  /** Quieter than this counts as silence. Samples run from -1 to 1. */
  minLevel?: number;
};

const DEFAULTS = { minHz: 60, maxHz: 1100, threshold: 0.15, minLevel: 0.01 };

/** Loudness of a slice: the root mean square of its samples. 0 is silence. */
export function level(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

/**
 * The pitch of one slice of sound, or null for silence and noise.
 * The slice must hold at least two repeats of the lowest pitch wanted:
 * at 16,000 samples a second and 60 Hz, that is 534 samples.
 */
export function detectPitch(
  samples: Float32Array,
  sampleRate: number,
  options: PitchOptions = {},
): Pitch | null {
  const { minHz, maxHz, threshold, minLevel } = { ...DEFAULTS, ...options };
  const size = samples.length;
  const shortest = Math.max(2, Math.floor(sampleRate / maxHz));
  const longest = Math.min(Math.ceil(sampleRate / minHz), Math.floor(size / 2));
  if (longest <= shortest) return null;
  if (level(samples) < minLevel) return null;

  // Step 1: how different is the sound from itself at each shift?
  const span = size - longest;
  const difference = new Float32Array(longest + 1);
  for (let shift = 1; shift <= longest; shift++) {
    let sum = 0;
    for (let i = 0; i < span; i++) {
      const delta = samples[i] - samples[i + shift];
      sum += delta * delta;
    }
    difference[shift] = sum;
  }

  // Step 2: divide each value by the average so far. Without this, tiny
  // shifts always look like the best match.
  const normalized = new Float32Array(longest + 1);
  normalized[0] = 1;
  let running = 0;
  for (let shift = 1; shift <= longest; shift++) {
    running += difference[shift];
    normalized[shift] = running === 0 ? 1 : (difference[shift] * shift) / running;
  }

  // Step 3: take the first shift that is good enough, then walk down to the
  // bottom of that dip. Taking the first dip, not the deepest, avoids
  // reporting a note one octave too low.
  let best = -1;
  for (let shift = shortest; shift <= longest; shift++) {
    if (normalized[shift] < threshold) {
      while (shift + 1 <= longest && normalized[shift + 1] < normalized[shift]) shift++;
      best = shift;
      break;
    }
  }
  if (best === -1) return null;

  // Step 4: the true period usually falls between two samples. Fit a curve
  // through the dip and its two neighbors to find the real low point.
  let period = best;
  if (best > 1 && best < longest) {
    const before = normalized[best - 1];
    const at = normalized[best];
    const after = normalized[best + 1];
    const curve = before - 2 * at + after;
    if (curve !== 0) period = best + (before - after) / (2 * curve);
  }

  return { hz: sampleRate / period, clarity: Math.max(0, 1 - normalized[best]) };
}

/**
 * Steadies a stream of pitch readings. Reports the middle value of the last
 * few, which throws away one-off jumps, and holds through a brief gap so the
 * display does not flicker between a note and nothing.
 */
export class PitchSmoother {
  private recent: number[] = [];
  private gaps = 0;
  private readonly size: number;
  private readonly maxGaps: number;

  constructor(size = 5, maxGaps = 3) {
    this.size = size;
    this.maxGaps = maxGaps;
  }

  push(hz: number | null): number | null {
    if (hz === null) {
      this.gaps++;
      if (this.gaps >= this.maxGaps) this.recent = [];
    } else {
      this.gaps = 0;
      this.recent.push(hz);
      if (this.recent.length > this.size) this.recent.shift();
    }
    if (this.recent.length === 0) return null;
    const sorted = [...this.recent].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  reset(): void {
    this.recent = [];
    this.gaps = 0;
  }
}
