import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioStream,
  type AudioPlayer,
  type AudioStream,
  type AudioStreamBuffer,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { Sound } from '@/hooks/slide-sounds';
import { Framer, firstChannel, thinningFactor } from '@/lib/frames';
import { PitchSmoother, detectPitch, level } from '@/lib/pitch';

export type Listening =
  | 'off'
  | 'on'
  /** The person said no to the microphone. */
  | 'denied'
  /** This device or browser cannot stream the microphone. */
  | 'unsupported'
  | 'failed';

/** How a call to playThenListen ended. */
export type RoundStart =
  /** The tone played and the microphone is now on. */
  | 'listening'
  /** The microphone could not be used. `status` says why. */
  | 'failed'
  /** Stopped before the microphone came on. */
  | 'cancelled';

export type PitchListener = {
  status: Listening;
  /** What went wrong, when status is 'failed'. */
  problem: string | null;
  /**
   * Play a sound to its end, then turn the microphone on. Pass null to turn
   * the microphone on with no sound first.
   *
   * The two cannot overlap. On an iPhone this kind of microphone stream puts
   * the phone in record-only mode, and nothing plays until it stops.
   */
  playThenListen: (sound: Sound | null) => Promise<RoundStart>;
  /** Turn everything off: the sound if it is playing, the microphone if it is on. */
  stop: () => void;
};

/**
 * If a sound never reports that it ended, stop waiting this long after it
 * should have. The wait has to be longer than the sound: a fixed limit once
 * cut the last note off a long song line.
 */
const PATIENCE_MS = 2500;

/**
 * Puts the phone's sound system back in normal playing mode: sound comes out
 * of the speaker at full volume, and plays even when the silent switch is on.
 *
 * The microphone stream leaves the phone in a "measurement" setting, in which
 * the speaker is very quiet. Asking for 'doNotMix' is what makes expo-audio
 * reset that setting; with the default it is left as the stream set it.
 */
async function switchToSpeaker(): Promise<void> {
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
      interruptionMode: 'doNotMix',
    });
  } catch {
    // If the mode cannot be set, still try to play.
  }
}

/**
 * Play a sound from the start and wait until it ends. If it has not loaded
 * yet, wait for that first. Returns a function that gives up waiting.
 */
function playToEnd(player: AudioPlayer, ms: number, done: () => void): () => void {
  let started = false;
  let startedAt = 0;
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    clearInterval(ask);
    subscription.remove();
    done();
  };
  const begin = () => {
    started = true;
    // Wait for the rewind to finish before playing. A sound that has already
    // played once sits at its end, and playing from there is silent.
    player
      .seekTo(0)
      .catch(() => {})
      .then(() => {
        if (finished) return;
        startedAt = Date.now();
        player.play();
      });
  };
  const subscription = player.addListener('playbackStatusUpdate', (status) => {
    if (!started && status.isLoaded) begin();
    // Ignore an "ended" left over from the last time this sound played.
    else if (startedAt > 0 && status.didJustFinish && Date.now() - startedAt > 300) finish();
  });
  const timer = setTimeout(finish, ms + PATIENCE_MS);
  // A sound made a moment ago may still be loading, and its "loaded" message
  // can be missed. So ask it directly, a few times a second, until it is.
  const ask = setInterval(() => {
    if (started || finished) clearInterval(ask);
    else if (player.isLoaded) begin();
  }, 50);
  if (player.isLoaded) begin();

  return finish;
}

/**
 * Turn the microphone stream off if it is on.
 *
 * When a screen closes, the phone throws the stream away, sometimes before
 * the last of this code has finished. Touching a thrown-away stream is an
 * error, and there is nothing left to stop, so that error is ignored.
 */
function stopStream(stream: AudioStream | null): void {
  try {
    if (stream?.isStreaming) stream.stop();
  } catch {
    // Already released with its screen.
  }
}

/**
 * Listens to the microphone and reports the pitch being sung.
 *
 * `onPitch` is called about ten times a second while listening, with the
 * pitch in hertz or null for silence, and how loud the sound was. The sound is analyzed on the phone,
 * a slice at a time, and thrown away. Nothing is recorded or sent anywhere.
 */
export function usePitch(
  onPitch: (hz: number | null, atMs: number, db: number) => void,
): PitchListener {
  const [status, setStatus] = useState<Listening>('off');
  const [problem, setProblem] = useState<string | null>(null);
  const framer = useRef<Framer | null>(null);
  const smoother = useRef<PitchSmoother | null>(null);
  /** Goes up by one each time a round starts or stops, so a stale round can tell. */
  const run = useRef(0);
  const sound = useRef<{ player: AudioPlayer; giveUp: () => void } | null>(null);

  const onBuffer = (buffer: AudioStreamBuffer) => {
    const now = Date.now();
    framer.current ??= new Framer();
    smoother.current ??= new PitchSmoother();
    const samples = firstChannel(new Float32Array(buffer.data), buffer.channels);
    const factor = thinningFactor(buffer.sampleRate);
    const rate = buffer.sampleRate / factor;
    const frames = framer.current.push(samples, factor);
    if (frames.length === 0) return;
    let hz: number | null = null;
    for (const frame of frames) {
      const pitch = detectPitch(frame, rate);
      hz = smoother.current.push(pitch ? pitch.hz : null);
    }
    // Loudness of this buffer in decibels: 0 is as loud as the microphone can hear,
    // and every 6 below that is half as loud.
    onPitch(hz, now, 20 * Math.log10(Math.max(level(samples), 1e-6)));
  };

  const { stream } = useAudioStream({ channels: 1, encoding: 'float32', onBuffer });

  const stop = useCallback(() => {
    run.current++;
    if (sound.current !== null) {
      try {
        sound.current.player.pause();
      } catch {
        // The sound has already gone.
      }
      sound.current.giveUp();
      sound.current = null;
    }
    stopStream(stream);
    setStatus((current) => (current === 'on' ? 'off' : current));
  }, [stream]);

  const playThenListen = useCallback(
    async (playing: Sound | null): Promise<RoundStart> => {
      stop();
      const mine = run.current;
      const fail = (error: unknown): RoundStart => {
        setProblem(error instanceof Error ? error.message : String(error));
        setStatus('failed');
        return 'failed';
      };

      // On the web, this version of expo-audio hands back no stream at all.
      if (!stream) {
        setStatus('unsupported');
        return 'failed';
      }
      setProblem(null);
      setStatus('off');

      // Ask for the microphone first, so the question never lands on top of the tone.
      try {
        const permission = await requestRecordingPermissionsAsync();
        if (!permission.granted) {
          setStatus('denied');
          return 'failed';
        }
      } catch (error) {
        return fail(error);
      }
      if (mine !== run.current) return 'cancelled';

      if (playing !== null) {
        const { player, ms } = playing;
        await switchToSpeaker();
        if (mine !== run.current) return 'cancelled';

        await new Promise<void>((resolve) => {
          sound.current = { player, giveUp: playToEnd(player, ms, resolve) };
        });
        if (mine !== run.current) return 'cancelled';
        sound.current = null;
        // Make sure the sound has let go of the speaker before the microphone
        // takes over. A sound still playing can leave the microphone deaf.
        try {
          player.pause();
        } catch {
          // The sound has already gone.
        }
      }

      try {
        framer.current?.reset();
        smoother.current?.reset();
        // Starting the stream puts the phone in record-only mode.
        await stream.start();
      } catch (error) {
        // If the round was stopped meanwhile, the stream may be gone. That is not a failure.
        return mine === run.current ? fail(error) : 'cancelled';
      }
      if (mine !== run.current) {
        stopStream(stream);
        return 'cancelled';
      }
      setStatus('on');
      return 'listening';
    },
    [stream, stop],
  );

  // Stop when the app leaves the screen. A microphone left running in the
  // background is the kind of surprise nobody wants.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      // 'inactive' is only a banner or the control panel passing over the app.
      if (state === 'background') stop();
    });
    return () => subscription.remove();
  }, [stop]);

  return { status, problem, playThenListen, stop };
}
