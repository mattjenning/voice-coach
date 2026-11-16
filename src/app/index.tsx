import { useAudioPlayer } from 'expo-audio';
import { useReducer } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { tones } from '@/data/tones';
import { usePitch, type Listening } from '@/hooks/use-pitch';
import { useTheme } from '@/hooks/use-theme';
import { HOLD, compareToTarget, formatOctaves, type TargetReading } from '@/lib/hold';
import { formatCents, formatHz, midiToHz, nearestNote, noteName } from '@/lib/notes';
import {
  HIGHEST_TARGET,
  LOWEST_TARGET,
  START,
  practiceReducer,
  type Practice,
} from '@/lib/practice';

/** The reference tone lasts 1.2 seconds. Ignore the microphone a little longer than that. */
const TONE_PAUSE_MS = 1500;
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

/** Choose the note to match, and hear it. */
function TargetCard({
  target,
  onChange,
  onHear,
}: {
  target: number;
  onChange: (midi: number) => void;
  onHear: () => void;
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
          disabled={target <= LOWEST_TARGET}
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
          disabled={target >= HIGHEST_TARGET}
          onPress={() => onChange(target + 1)}
        />
      </View>
      <Button label="Hear it" onPress={onHear} />
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

/** What the singer is doing right now, in words and on the meter. */
function Readout({ practice, listening }: { practice: Practice; listening: boolean }) {
  const theme = useTheme();
  const { hz, target, hold } = practice;
  const sung = hz === null ? null : nearestNote(hz);
  const reading = hz === null ? null : compareToTarget(hz, target);

  let detail = listening ? 'Sing the note and hold it.' : 'Tap Start, then sing.';
  if (reading !== null) {
    const octave = formatOctaves(reading.octaves);
    detail = formatCents(reading.cents, HOLD.toleranceCents);
    if (octave) detail += `, ${octave} the target`;
  }

  const progress = Math.min(1, hold.heldMs / HOLD.goalMs);
  const seconds = (Math.min(hold.heldMs, HOLD.goalMs) / 1000).toFixed(1);
  const goal = (HOLD.goalMs / 1000).toFixed(0);

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
      <ThemedText style={styles.centered}>{detail}</ThemedText>
      <Meter reading={reading} />
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
        style={[styles.holdTrack, { backgroundColor: theme.backgroundSelected }]}>
        <View
          style={[styles.holdFill, { backgroundColor: theme.good, width: `${progress * 100}%` }]}
        />
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
        {hold.done
          ? `Matched ${noteName(target)}. You held it in tune for ${goal} seconds.`
          : `Held in tune: ${seconds} of ${goal} seconds`}
      </ThemedText>
    </ThemedView>
  );
}

export default function PracticeScreen() {
  const [practice, dispatch] = useReducer(practiceReducer, START);
  const pitch = usePitch((hz, atMs) => dispatch({ type: 'pitch', hz, atMs }));
  const player = useAudioPlayer(tones[practice.target]);
  const listening = pitch.status === 'on';
  const trouble = statusLine(pitch.status, pitch.problem);

  const hear = () => {
    // The microphone would hear the phone's own tone and score it as singing.
    pitch.pauseFor(TONE_PAUSE_MS);
    dispatch({ type: 'quiet' });
    player.seekTo(0);
    player.play();
  };

  const toggle = () => {
    if (listening) {
      pitch.stop();
      dispatch({ type: 'quiet' });
    } else {
      pitch.start();
    }
  };

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
            target={practice.target}
            onChange={(midi) => dispatch({ type: 'target', midi })}
            onHear={hear}
          />

          <Readout practice={practice} listening={listening} />

          {practice.hold.done && (
            <View style={styles.row}>
              <View style={styles.grow}>
                <Button label="Again" onPress={() => dispatch({ type: 'again' })} />
              </View>
              <View style={styles.grow}>
                <Button
                  label="Next note up"
                  disabled={practice.target >= HIGHEST_TARGET}
                  onPress={() => dispatch({ type: 'target', midi: practice.target + 1 })}
                />
              </View>
            </View>
          )}

          <Button
            primary
            label={listening ? 'Stop listening' : 'Start listening'}
            disabled={pitch.status === 'starting'}
            onPress={toggle}
          />

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
  holdTrack: {
    height: Spacing.two,
    borderRadius: Spacing.one,
    overflow: 'hidden',
  },
  holdFill: {
    height: '100%',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  grow: {
    flex: 1,
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
