/**
 * Turns the microphone's stream of sample buffers into evenly sized frames
 * for the pitch detector.
 *
 * The phone hands over sound in buffers whose size it chooses. The detector
 * wants slices of one fixed size, overlapping so the reading updates often.
 * This file does that regrouping. It also thins the samples out: a phone
 * records 48,000 samples a second, which is far more detail than a voice's
 * pitch needs, and thinning it makes detection about nine times cheaper.
 *
 * Pure maths. No microphone or screen code.
 */

/** Samples a second the detector works at. Plenty for notes up to C6. */
export const ANALYSIS_RATE = 16_000;

/** Keep one channel of interleaved sound: [L, R, L, R] becomes [L, L]. */
export function firstChannel(data: Float32Array, channels: number): Float32Array {
  if (channels <= 1) return data;
  const out = new Float32Array(Math.floor(data.length / channels));
  for (let i = 0; i < out.length; i++) out[i] = data[i * channels];
  return out;
}

/** How many incoming samples to merge into one. 48,000 gives 3; 16,000 gives 1. */
export function thinningFactor(sampleRate: number, target = ANALYSIS_RATE): number {
  return Math.max(1, Math.round(sampleRate / target));
}

export class Framer {
  readonly frameSize: number;
  readonly hop: number;
  private frame: Float32Array;
  private filled = 0;
  private carrySum = 0;
  private carryCount = 0;

  /**
   * @param frameSize samples in each frame. 1024 at 16,000 a second is 64 ms.
   * @param hop how far the window moves between frames. Half a frame means
   *   each frame shares half its sound with the one before.
   */
  constructor(frameSize = 1024, hop = 512) {
    this.frameSize = frameSize;
    this.hop = hop;
    this.frame = new Float32Array(frameSize);
  }

  /**
   * Add a buffer of samples. Returns every frame that became complete.
   * Samples are merged in groups of `factor` by averaging, which also
   * smooths away detail too fine to keep.
   */
  push(samples: Float32Array, factor = 1): Float32Array[] {
    const frames: Float32Array[] = [];
    for (let i = 0; i < samples.length; i++) {
      this.carrySum += samples[i];
      this.carryCount++;
      if (this.carryCount < factor) continue;
      this.frame[this.filled++] = this.carrySum / this.carryCount;
      this.carrySum = 0;
      this.carryCount = 0;
      if (this.filled === this.frameSize) {
        frames.push(this.frame.slice());
        this.frame.copyWithin(0, this.hop);
        this.filled = this.frameSize - this.hop;
      }
    }
    return frames;
  }

  reset(): void {
    this.filled = 0;
    this.carrySum = 0;
    this.carryCount = 0;
  }
}
