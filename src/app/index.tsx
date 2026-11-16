import { useEffect, useReducer, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { tonePlayer, warmTone } from '@/hooks/tone-players';
import { usePitch, type Listening } from '@/hooks/use-pitch';
import { useTheme } from '@/hooks/use-theme';
import { HOLD, compareToTarget, formatOctaves, type TargetReading } from '@/lib/hold';
import { formatCents, formatHz, midiToHz, nearestNote, noteName } from '@/lib/notes';
import {
  HIGHEST_TARGET,
  LISTEN_MS,
  LOWEST_TARGET,
  START,
  practiceReducer,
  timeLeftMs,
  type Practice,
} from '@/lib/practice';

/** The meter shows half a semitone either side of the target. */
const METER_RANGE_CENTS = 50;

function Button({
  label,
  onPress,
  disabled = false,
  primary = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: primary ? theme.text : theme.backgroundSelected },
        (pressed || disabled) && styles.dimmed,
      ]}>
      <ThemedText style={[styles.buttonLabel, primary && { color: theme.background }]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/** Choose the note to match. Locked while a round is running. */
function TargetCard({
  target,
  locked,
  onChange,
}: {
  target: number;
  locked: boolean;
  onChange: (midi: number) => void;
}) {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
        Note to match
      </ThemedText>
      <View style={styles.targetRow}>
        <Button
          label="−"
          accessibilityLabel="Lower note"
          disabled={locked || target <= LOWEST_TARGET}
          onPress={() => onChange(target - 1)}
        />
        <View style={styles.targetName}>
          <ThemedText type="subtitle">{noteName(target)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {formatHz(midiToHz(target))}
          </ThemedText>
        </View>
        <Button
          label="+"
          accessibilityLabel="Higher note"
          disabled={locked || target >= HIGHEST_TARGET}
          onPress={() => onChange(target + 1)}
        />
      </View>
    </ThemedView>
  );
}

/** A needle that sits in the middle when the note is right. */
function Meter({ reading }: { reading: TargetReading | null }) {
  const theme = useTheme();
  const clamped =
    reading === null
      ? 0
      : Math.max(-METER_RANGE_CENTS, Math.min(METER_RANGE_CENTS, reading.cents));
  const position = ((clamped + METER_RANGE_CENTS) / (2 * METER_RANGE_CENTS)) * 100;
  const zone = (HOLD.toleranceCents / METER_RANGE_CENTS) * 100;
  return (
    <View>
      <View style={[styles.meter, { backgroundColor: theme.backgroundSelected }]}>
        <View
          style={[
            styles.meterZone,
            { backgroundColor: theme.good, left: `${50 - zone / 2}%`, width: `${zone}%` },
          ]}
        />
        {reading !== null && (
          <View
            style={[
              styles.needle,
              { backgroundColor: reading.inTune ? theme.good : theme.off, left: `${position}%` },
            ]}
          />
        )}
      </View>
      <View style={styles.meterLabels}>
        <ThemedText type="small" themeColor="textSecondary">
          flat
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          sharp
        </ThemedText>
      </View>
    </View>
  );
}

function statusLine(status: Listening, problem: string | null): string | null {
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

const seconds = (ms: number, digits: number) => (ms / 1000).toFixed(digits);
/** "2" for 2000, "3.5" for 3500. */
const wholeSeconds = (ms: number) => seconds(ms, Number.isInteger(ms / 1000) ? 0 : 1);

/** "33 cents sharp, one octave below the target" */
function howClose(reading: TargetReading): string {
  const octave = formatOctaves(reading.octaves);
  const cents = formatCents(reading.cents, HOLD.toleranceCents);
  return octave ? `${cents}, ${octave} the target` : cents;
}

/** One line saying what is happening, or how the round went. */
function describe(practice: Practice, reading: TargetReading | null): string {
  const { phase, result, closest, target } = practice;
  if (phase === 'tone') return 'Listen.';
  if (phase === 'listening') return reading === null ? 'Sing it now.' : howClose(reading);
  if (result === 'matched') return `Matched ${noteName(target)}.`;
  if (result === 'missed') {
    if (closest === null) {
      return 'Time is up. No note was heard. Try singing louder, or closer to the phone.';
    }
    if (closest.inTune) {
      return `Time is up. You reached the note but did not hold it for ${wholeSeconds(HOLD.goalMs)} seconds.`;
    }
    return `Time is up. Your closest was ${howClose(closest)}.`;
  }
  return `Tap the button to hear the note. Then you have ${wholeSeconds(LISTEN_MS)} seconds to sing it back.`;
}

/** What the singer is doing right now, in words and on the meter. */
function Readout({ practice }: { practice: Practice }) {
  const theme = useTheme();
  const { hz, target, hold, phase, result, closest } = practice;
  const sung = hz === null ? null : nearestNote(hz);
  const reading = hz === null ? null : compareToTarget(hz, target);
  // After a miss, leave the needle on the best attempt.
  const shown = reading ?? (result === 'missed' ? closest : null);
  const progress = Math.min(1, hold.heldMs / HOLD.goalMs);

  const held = seconds(Math.min(hold.heldMs, HOLD.goalMs), 1);
  const goal = wholeSeconds(HOLD.goalMs);

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
        You are singing
      </ThemedText>
      <ThemedText
        type="title"
        style={[styles.sung, reading !== null && { color: reading.inTune ? theme.good : theme.off }]}>
        {sung === null ? '–' : sung.name}
      </ThemedText>
      <ThemedText style={styles.centered}>{describe(practice, reading)}</ThemedText>
      <Meter reading={shown} />
      <View style={styles.holdBlock}>
        <View style={styles.holdHeading}>
          <ThemedText type="smallBold">Held in tune</ThemedText>
          <ThemedText type="smallBold" style={styles.numbers}>
            {held} of {goal} seconds
          </ThemedText>
        </View>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Held in tune"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
          style={[styles.holdTrack, { backgroundColor: theme.backgroundSelected }]}>
          <View
            style={[styles.holdFill, { backgroundColor: theme.good, width: `${progress * 100}%` }]}
          />
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.numbers}>
          {phase === 'listening' ? `${seconds(timeLeftMs(practice), 1)} seconds left` : ' '}
        </ThemedText>
      </View>
    </ThemedView>
  );
}

export default function PracticeScreen() {
  const [practice, dispatch] = useReducer(practiceReducer, START);
  const pitch = usePitch((hz, atMs) => dispatch({ type: 'pitch', hz, atMs }));
  const { stop } = pitch;
  /** Counts rounds started, so a late answer from an old round can be told apart. */
  const rounds = useRef(0);
  const { phase, target, result } = practice;
  const busy = phase !== 'idle';
  const trouble = statusLine(pitch.status, pitch.problem);

  // One tap runs a whole round: the tone plays, then the microphone listens.
  const startRound = async (midi: number) => {
    const mine = ++rounds.current;
    dispatch({ type: 'begin', midi });
    const outcome = await pitch.playThenListen(tonePlayer(midi));
    // A round that was stopped and replaced must not touch the new one.
    if (mine !== rounds.current) return;
    dispatch(outcome === 'listening' ? { type: 'listen', atMs: Date.now() } : { type: 'stop' });
  };

  const stopRound = () => {
    stop();
    dispatch({ type: 'stop' });
  };

  // Turn the microphone off the moment a round ends, by a match or by the clock.
  useEffect(() => {
    if (phase === 'idle') stop();
  }, [phase, stop]);

  // Keep the countdown moving even if no sound arrives.
  useEffect(() => {
    if (phase !== 'listening') return;
    const timer = setInterval(() => dispatch({ type: 'tick', atMs: Date.now() }), 250);
    return () => clearInterval(timer);
  }, [phase]);

  // Load this note's tone and the next one up ahead of time.
  useEffect(() => {
    warmTone(target);
    warmTone(target + 1);
  }, [target]);

  let startLabel = 'Play note, then sing';
  if (result === 'matched') startLabel = 'Again';
  if (result === 'missed') startLabel = 'Try again';

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <ThemedText type="subtitle">Voice Coach</ThemedText>
            <ThemedText themeColor="textSecondary">
              Hear a note, sing it back, and hold it in tune.
            </ThemedText>
          </View>

          <TargetCard
            target={target}
            locked={busy}
            onChange={(midi) => dispatch({ type: 'target', midi })}
          />

          <Readout practice={practice} />

          {busy ? (
            <Button primary label="Stop" onPress={stopRound} />
          ) : (
            <Button primary label={startLabel} onPress={() => startRound(target)} />
          )}

          {!busy && result === 'matched' && target < HIGHEST_TARGET && (
            <Button label="Next note up" onPress={() => startRound(target + 1)} />
          )}

          {trouble !== null && <ThemedText themeColor="off">{trouble}</ThemedText>}

          <ThemedText type="small" themeColor="textSecondary">
            Notes matched this session: {practice.matched}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            The same note in a higher or lower octave counts, so pick whichever is comfortable.
            Your voice is analyzed on this phone. It is never recorded or sent anywhere.
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  content: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    paddingTop: Spacing.three,
    gap: Spacing.one,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  label: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 12,
    lineHeight: 16,
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  targetName: {
    flex: 1,
    alignItems: 'center',
  },
  sung: {
    textAlign: 'center',
    fontSize: 72,
    lineHeight: 80,
    fontVariant: ['tabular-nums'],
  },
  centered: {
    textAlign: 'center',
  },
  meter: {
    height: 44,
    borderRadius: Spacing.two,
    overflow: 'hidden',
  },
  meterZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    opacity: 0.25,
  },
  needle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 6,
    marginLeft: -3,
    borderRadius: 3,
  },
  meterLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: Spacing.one,
  },
  holdBlock: {
    gap: Spacing.one,
  },
  holdHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  numbers: {
    fontVariant: ['tabular-nums'],
  },
  holdTrack: {
    height: Spacing.four,
    borderRadius: Spacing.two,
    overflow: 'hidden',
  },
  holdFill: {
    height: '100%',
  },
  button: {
    minHeight: 48,
    minWidth: 48,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    fontWeight: 600,
  },
  dimmed: {
    opacity: 0.5,
  },
});
