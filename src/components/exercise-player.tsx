import { useEffect, useReducer } from 'react';
import { AppState } from 'react-native';

import { RunView } from '@/components/run-view';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { stepPlayer } from '@/hooks/slide-sounds';
import { usePitch, type Listening } from '@/hooks/use-pitch';
import { NO_RUN, runReducer, type Run, type Step, type StepResult } from '@/lib/exercise';

function trouble(status: Listening, problem: string | null): string | null {
  switch (status) {
    case 'denied':
      return 'The microphone is turned off for this app. Turn it on in the Settings app, then try again.';
    case 'unsupported':
      return 'This device cannot stream the microphone. Open the app on an iPhone.';
    case 'failed':
      return `The microphone did not start. ${problem ?? ''}`.trim();
    default:
      return null;
  }
}

const begin = (steps: Step[]): Run => runReducer(NO_RUN, { type: 'start', steps });

/**
 * Runs an exercise from its first step to its last without being asked:
 * tone, listen, next tone, listen, and so on. It starts as soon as it
 * appears on screen.
 *
 * `onDone` gets the results when the last step ends. `onQuit` is called if
 * the singer stops early or the app leaves the screen.
 */
export function ExercisePlayer({
  steps,
  onDone,
  onQuit,
}: {
  steps: Step[];
  onDone: (results: StepResult[]) => void;
  onQuit: () => void;
}) {
  const [run, dispatch] = useReducer(runReducer, steps, begin);
  const { status, problem, playThenListen, stop } = usePitch((hz, atMs) =>
    dispatch({ type: 'pitch', hz, atMs }),
  );
  const { phase, turn, index } = run;
  const step = run.steps[index];
  const next = run.steps[index + 1];

  // Each new turn: play the step's sound, then listen. A step with no note
  // skips the sound. `turn` changes exactly once per step, so this runs once.
  useEffect(() => {
    if (phase !== 'tone' || step === undefined) return;
    let current = true;
    playThenListen(stepPlayer(step))
      .catch(() => 'failed' as const)
      .then((outcome) => {
        if (!current) return;
        dispatch(outcome === 'listening' ? { type: 'listen', atMs: Date.now() } : { type: 'stop' });
      });
    return () => {
      current = false;
    };
  }, [turn, phase, step, playThenListen]);

  // Get the next step's sound ready while this one is in play.
  useEffect(() => {
    if (next !== undefined) stepPlayer(next);
  }, [next]);

  // Keep the countdown moving even if no sound arrives.
  useEffect(() => {
    if (phase !== 'listening') return;
    const timer = setInterval(() => dispatch({ type: 'tick', atMs: Date.now() }), 250);
    return () => clearInterval(timer);
  }, [phase]);

  // When the last step ends, turn the microphone off and hand the results over.
  const results = run.results;
  useEffect(() => {
    if (phase !== 'done') return;
    stop();
    onDone(results);
  }, [phase, results, stop, onDone]);

  // Leaving the app ends the exercise. Coming back to a half-played set is confusing.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') onQuit();
    });
    return () => subscription.remove();
  }, [onQuit]);

  // Turn everything off when this leaves the screen.
  useEffect(() => stop, [stop]);

  const message = trouble(status, problem);
  if (phase === 'ready') {
    return (
      <>
        <ThemedText themeColor="off">{message ?? 'Stopped.'}</ThemedText>
        <Button label="Back" onPress={onQuit} />
      </>
    );
  }

  return (
    <>
      <RunView run={run} />
      <Button label="Stop" onPress={onQuit} />
    </>
  );
}
