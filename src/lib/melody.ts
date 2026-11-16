/**
 * Turns a recording of one voice into a melody map: a list of notes, each
 * with a start and an end time.
 *
 * It works in two steps. First, track the pitch across the recording, one
 * reading every 32 milliseconds. Second, group neighbouring readings that
 * sit on the same note. A singer's pitch wobbles (vibrato) and slides
 * between notes, so the grouping allows some wobble and drops the slides.
 *
 * This handles a voice on its own. A full song, with instruments, needs the
 * voice separated out first, which is a different job.
 *
 * Pure maths. No microphone, screen or disk code.
 */
import { Framer, thinningFactor } from './frames.ts';
import { hzToMidi } from './notes.ts';
import { detectPitch } from './pitch.ts';

export type MelodyNote = {
  /** Note number. 60 is middle C. */
  midi: number;
  startMs: number;
  endMs: number;
};

export type MelodyMap = {
  /** Version of this file layout, so old maps can be recognised later. */
  version: 1;
  title: string;
  durationMs: number;
  notes: MelodyNote[];
};

export type PitchPoint = {
  /** Middle of the slice this reading came from. */
  atMs: number;
  hz: number | null;
};

export type PitchTrack = {
  points: PitchPoint[];
  /** Time between one reading and the next. */
  stepMs: number;
};

/** The pitch across a whole recording, one reading per step. */
export function trackPitch(samples: Float32Array, sampleRate: number): PitchTrack {
  const factor = thinningFactor(sampleRate);
  const rate = sampleRate / factor;
  const framer = new Framer();
  const stepMs = (framer.hop / rate) * 1000;
  const halfFrameMs = ((framer.frameSize / rate) * 1000) / 2;
  const points: PitchPoint[] = [];
  const frames = framer.push(samples, factor);
  for (let i = 0; i < frames.length; i++) {
    const pitch = detectPitch(frames[i], rate);
    points.push({ atMs: i * stepMs + halfFrameMs, hz: pitch ? pitch.hz : null });
  }
  return { points, stepMs };
}

/**
 * Replace each reading with the middle value of itself and its neighbours.
 * A single wrong reading, such as a jump of an octave, disappears.
 */
export function steady(points: PitchPoint[], width = 5): PitchPoint[] {
  const reach = Math.floor(width / 2);
  return points.map((point, i) => {
    if (point.hz === null) return point;
    const near: number[] = [];
    for (let j = Math.max(0, i - reach); j <= Math.min(points.length - 1, i + reach); j++) {
      const hz = points[j].hz;
      if (hz !== null) near.push(hz);
    }
    near.sort((a, b) => a - b);
    return { atMs: point.atMs, hz: near[Math.floor(near.length / 2)] };
  });
}

export type NoteOptions = {
  /** A reading this many semitones from the note so far starts a new note. */
  maxDriftSemitones?: number;
  /** Notes shorter than this are slides or noise, and are dropped. */
  minNoteMs?: number;
  /** A silence up to this long inside a note does not split it. */
  maxGapMs?: number;
};

const NOTE_DEFAULTS = { maxDriftSemitones: 0.7, minNoteMs: 90, maxGapMs: 40 };

function middle(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Group a pitch track into notes. */
export function findNotes(track: PitchTrack, options: NoteOptions = {}): MelodyNote[] {
  const { maxDriftSemitones, minNoteMs, maxGapMs } = { ...NOTE_DEFAULTS, ...options };
  const half = track.stepMs / 2;
  const notes: MelodyNote[] = [];

  let pitches: number[] = [];
  let startMs = 0;
  let lastMs = 0;

  const close = () => {
    if (pitches.length > 0) {
      const endMs = lastMs + half;
      if (endMs - startMs >= minNoteMs) {
        notes.push({ midi: Math.round(middle(pitches)), startMs, endMs });
      }
    }
    pitches = [];
  };

  for (const point of steady(track.points)) {
    if (point.hz === null) {
      if (pitches.length > 0 && point.atMs - lastMs > maxGapMs + half) close();
      continue;
    }
    const midi = hzToMidi(point.hz);
    if (pitches.length > 0 && Math.abs(midi - middle(pitches)) > maxDriftSemitones) close();
    if (pitches.length === 0) startMs = point.atMs - half;
    pitches.push(midi);
    lastMs = point.atMs;
  }
  close();

  // Join pieces of one note that a brief dropout split in two.
  const joined: MelodyNote[] = [];
  for (const note of notes) {
    const previous = joined[joined.length - 1];
    if (previous && previous.midi === note.midi && note.startMs - previous.endMs <= maxGapMs) {
      previous.endMs = note.endMs;
    } else {
      joined.push({ ...note });
    }
  }
  return joined.map((note) => ({
    midi: note.midi,
    startMs: Math.round(note.startMs),
    endMs: Math.round(note.endMs),
  }));
}

/** A recording of one voice, in. A melody map, out. */
export function mapMelody(samples: Float32Array, sampleRate: number, title: string): MelodyMap {
  return {
    version: 1,
    title,
    durationMs: Math.round((samples.length / sampleRate) * 1000),
    notes: findNotes(trackPitch(samples, sampleRate)),
  };
}
