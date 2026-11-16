import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioStream,
  type AudioStreamBuffer,
} from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { Framer, firstChannel, thinningFactor } from '@/lib/frames';
import { PitchSmoother, detectPitch } from '@/lib/pitch';

export type Listening =
  | 'off'
  | 'starting'
  | 'on'
  /** The person said no to the microphone. */
  | 'denied'
  /** This device or browser cannot stream the microphone. */
  | 'unsupported'
  | 'failed';

export type PitchListener = {
  status: Listening;
  /** What went wrong, when status is 'failed'. */
  problem: string | null;
  start: () => Promise<void>;
  stop: () => void;
  /** Ignore the microphone for a moment, so the app does not hear its own tone. */
  pauseFor: (ms: number) => void;
};

/**
 * Listens to the microphone and reports the pitch being sung.
 *
 * `onPitch` is called about thirty times a second while listening, with the
 * pitch in hertz or null for silence. The sound is analyzed on the phone,
 * a slice at a time, and thrown away. Nothing is recorded or sent anywhere.
 */
export function usePitch(onPitch: (hz: number | null, atMs: number) => void): PitchListener {
  const [status, setStatus] = useState<Listening>('off');
  const [problem, setProblem] = useState<string | null>(null);
  const framer = useRef<Framer | null>(null);
  const smoother = useRef<PitchSmoother | null>(null);
  const pausedUntil = useRef(0);

  const onBuffer = (buffer: AudioStreamBuffer) => {
    const now = Date.now();
    framer.current ??= new Framer();
    smoother.current ??= new PitchSmoother();
    if (now < pausedUntil.current) {
      framer.current.reset();
      smoother.current.reset();
      return;
    }
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
    onPitch(hz, now);
  };

  const { stream } = useAudioStream({ channels: 1, encoding: 'float32', onBuffer });

  const start = async () => {
    // On the web, this version of expo-audio hands back no stream at all.
    if (!stream) {
      setStatus('unsupported');
      return;
    }
    setStatus('starting');
    setProblem(null);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setStatus('denied');
        return;
      }
      // Lets the app record and play its reference tone in the same session,
      // and keeps the tone audible when the phone's silent switch is on.
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      framer.current?.reset();
      smoother.current?.reset();
      await stream.start();
      setStatus('on');
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
      setStatus('failed');
    }
  };

  const stop = () => {
    stream?.stop();
    setStatus('off');
  };

  const pauseFor = (ms: number) => {
    pausedUntil.current = Date.now() + ms;
  };

  // Stop listening when the app leaves the screen. A microphone left running
  // in the background is the kind of surprise nobody wants.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && stream?.isStreaming) {
        stream.stop();
        setStatus('off');
      }
    });
    return () => subscription.remove();
  }, [stream]);

  return { status, problem, start, stop, pauseFor };
}
