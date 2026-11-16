/**
 * Slide mode: the app plays a pitch that glides from one note to another,
 * and the singer follows the glide.
 *
 * A set is seven slides across one octave of a major scale. "Up" climbs the
 * scale one slide at a time, "down" comes back the same way, and "random"
 * jumps between any two notes of the scale.
 *
 * Pure logic. The sound is made here as numbers; saving and playing it is
 * done elsewhere.
 */
import { slideMidiAt, slideMs, slideStep, type Slide, type Step } from './exercise.ts';
import { midiToHz, noteName } from './notes.ts';
import { MAJOR_SCALE } from './quick.ts';

export type SlideOrder = 'up' | 'down' | 'random';

/**
 * The slides of one set.
 * `random` is a function that returns a number from 0 up to 1, like
 * Math.random. It is passed in so a check can use a repeatable one.
 */
export function slideSteps(start: number, order: SlideOrder, random: () => number): Step[] {
  const scale = MAJOR_SCALE.map((above) => start + above);
  const steps: Step[] = [];
  for (let i = 0; i < scale.length - 1; i++) {
    if (order === 'up') steps.push(slideStep(scale[i], scale[i + 1]));
    else if (order === 'down') steps.push(slideStep(scale[scale.length - 1 - i], scale[scale.length - 2 - i]));
    else {
      const from = Math.floor(random() * scale.length);
      // Pick a different note for the far end.
      const to = (from + 1 + Math.floor(random() * (scale.length - 1))) % scale.length;
      steps.push(slideStep(scale[from], scale[to]));
    }
  }
  return steps;
}

/** "C3 → D3" for a slide, "C3" for a plain note, "Any note" for a free one. */
export function stepLabel(step: Step): string {
  if (step.midi === null) return 'Any note';
  if (step.slide === undefined) return noteName(step.midi);
  return `${noteName(step.midi)} → ${noteName(step.slide.toMidi)}`;
}

const OVERTONES = [1, 0.71, 0.58, 0.5, 0.45, 0.41, 0.38, 0.35];

/**
 * The sound of a slide, as samples from -1 to 1.
 *
 * The pitch changes during the sound, so each sample moves the wave forward
 * by a little more or less than the last. Adding those small moves up, and
 * not restarting the wave at each pitch, is what keeps the glide smooth.
 */
export function slideSound(fromMidi: number, slide: Slide, sampleRate: number): Float32Array {
  const total = slideMs(slide);
  const count = Math.round((total / 1000) * sampleRate);
  const out = new Float32Array(count);
  const fadeIn = 0.03 * sampleRate;
  const fadeOut = 0.15 * sampleRate;
  let phase = 0;
  let loudest = 0;
  for (let i = 0; i < count; i++) {
    const hz = midiToHz(slideMidiAt(fromMidi, slide, (i / sampleRate) * 1000));
    phase += (2 * Math.PI * hz) / sampleRate;
    let sample = 0;
    for (let k = 0; k < OVERTONES.length; k++) {
      // Leave out overtones too high for this sample rate to carry.
      if (hz * (k + 1) < sampleRate / 2) sample += OVERTONES[k] * Math.sin(phase * (k + 1));
    }
    const fade = Math.min(1, i / fadeIn, (count - i) / fadeOut);
    out[i] = sample * fade;
    loudest = Math.max(loudest, Math.abs(out[i]));
  }
  if (loudest > 0) for (let i = 0; i < count; i++) out[i] = (out[i] * 0.9) / loudest;
  return out;
}
