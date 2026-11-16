import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';

import { tonePlayer } from '@/hooks/tone-players';
import { stepPath, type Path, type Step } from '@/lib/exercise';
import { pathSound } from '@/lib/slide';
import { writeWav } from '@/lib/wav';

/** Samples a second for a made sound. Enough for its overtones, small enough to make quickly. */
const SOUND_RATE = 12_000;

const players = new Map<string, AudioPlayer>();

/** A short, stable name for a path, to file its sound under. */
function nameOf(step: Step): string {
  const text = JSON.stringify([step.midi, step.slide, step.phrase]);
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = (hash * 33 + text.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

/**
 * A player for the sound of a slide or a phrase.
 *
 * There are far too many possible slides to ship a sound file for each, so
 * the sound is made on the phone the first time it is needed: worked out as
 * numbers, saved as a small file in the phone's throwaway storage, and
 * played from there. If any of that fails, the first note plays instead, so
 * the exercise still runs.
 */
function pathPlayer(step: Step, path: Path, fromMidi: number): AudioPlayer {
  const key = nameOf(step);
  const ready = players.get(key);
  if (ready !== undefined) return ready;
  let player: AudioPlayer;
  try {
    const file = new File(Paths.cache, `path-${key}.wav`);
    file.create({ overwrite: true });
    file.writeSync(writeWav(pathSound(path, SOUND_RATE), SOUND_RATE));
    player = createAudioPlayer({ uri: file.uri });
  } catch {
    player = tonePlayer(fromMidi);
  }
  players.set(key, player);
  return player;
}

/** The sound to play before a step, or null for a step with no sound. */
export function stepPlayer(step: Step): AudioPlayer | null {
  if (step.midi === null) return null;
  const path = stepPath(step);
  return path === null ? tonePlayer(step.midi) : pathPlayer(step, path, step.midi);
}
