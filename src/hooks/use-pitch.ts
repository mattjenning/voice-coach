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
  /**
   * Play a sound through the speaker. If the microphone is on, it is turned
   * off first and back on after `ms`, because an iPhone will not play sound
   * while this kind of microphone stream is running.
   */
  playThrough: (play: () => void, ms: number) => Promise<void>;
};

/**
 * Puts the phone's sound system in playing mode: sound comes out of the
 * speaker, and plays even when the silent switch is on.
 */
async function switchToSpeaker(): Promise<void> {
  try {
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
  } catch {
    // If the mode cannot be set, still try to play.
  }
}

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
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    onPitch(hz, now);
  };

  const { stream } = useAudioStream({ channels: 1, encoding: 'float32', onBuffer });

  const cancelResume = () => {
    if (resumeTimer.current !== null) {
      clearTimeout(resumeTimer.current);
      resumeTimer.current = null;
    }
  };

  /** Turn the microphone stream on. Starting it puts the phone in record-only mode. */
  const begin = async () => {
    if (!stream) return;
    try {
      framer.current?.reset();
      smoother.current?.reset();
      await stream.start();
      setStatus('on');
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
      setStatus('failed');
    }
  };

  const start = async () => {
    // On the web, this version of expo-audio hands back no stream at all.
    if (!stream) {
      setStatus('unsupported');
      return;
    }
    cancelResume();
    setStatus('starting');
    setProblem(null);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setStatus('denied');
        return;
      }
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
      setStatus('failed');
      return;
    }
    await begin();
  };

  const stop = () => {
    cancelResume();
    if (stream?.isStreaming) stream.stop();
    setStatus('off');
  };

  const playThrough = async (play: () => void, ms: number) => {
    const resumeAfter = status === 'on';
    cancelResume();
    if (stream?.isStreaming) stream.stop();
    await switchToSpeaker();
    play();
    if (resumeAfter) {
      resumeTimer.current = setTimeout(() => {
        resumeTimer.current = null;
        begin();
      }, ms);
    }
  };

  // Stop listening when the app leaves the screen. A microphone left running
  // in the background is the kind of surprise nobody wants.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') return;
      if (resumeTimer.current !== null) {
        clearTimeout(resumeTimer.current);
        resumeTimer.current = null;
      }
      if (stream?.isStreaming) stream.stop();
      setStatus((current) => (current === 'on' ? 'off' : current));
    });
    return () => {
      subscription.remove();
      if (resumeTimer.current !== null) clearTimeout(resumeTimer.current);
    };
  }, [stream]);

  return { status, problem, start, stop, playThrough };
}
