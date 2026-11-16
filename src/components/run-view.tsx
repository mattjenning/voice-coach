import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, Label } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  SLIDE_TOLERANCE_CENTS,
  slideMidiAt,
  slideMs,
  timeLeftMs,
  type Run,
  type Slide,
} from '@/lib/exercise';
import { HOLD, formatOctaves, type TargetReading } from '@/lib/hold';
import { formatCents, formatHz, midiToHz, nearestNote, noteName } from '@/lib/notes';
import { stepLabel } from '@/lib/slide';

/** The meter shows half a semitone either side of the note. */
const METER_RANGE_CENTS = 50;

const seconds = (ms: number, digits: number) => (ms / 1000).toFixed(digits);
/** "2" for 2000, "3.5" for 3500. */
const wholeSeconds = (ms: number) => seconds(ms, Number.isInteger(ms / 1000) ? 0 : 1);

/** "33 cents sharp, one octave below the note" */
export function howClose(reading: TargetReading): string {
  const octave = formatOctaves(reading.octaves);
  const cents = formatCents(reading.cents, HOLD.toleranceCents);
  return octave ? `${cents}, ${octave} the note` : cents;
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

/**
 * A slide drawn as a picture: time runs left to right, pitch runs bottom to
 * top. The grey dots are the path to follow. The coloured dots are the
 * singer, green when on the path.
 */
function SlideGraph({ run, fromMidi, slide }: { run: Run; fromMidi: number; slide: Slide }) {
  const theme = useTheme();
  const total = slideMs(slide);
  const lowest = Math.min(fromMidi, slide.toMidi) - 1.5;
  const highest = Math.max(fromMidi, slide.toMidi) + 1.5;
  const across = (tMs: number) => `${Math.max(0, Math.min(100, (tMs / total) * 100))}%` as const;
  const up = (midi: number) =>
    `${Math.max(0, Math.min(100, ((midi - lowest) / (highest - lowest)) * 100))}%` as const;
  const path = Array.from({ length: 31 }, (_, i) => (i / 30) * total);
  return (
    <View style={[styles.graph, { backgroundColor: theme.backgroundSelected }]}>
      {path.map((tMs) => (
        <View
          key={tMs}
          style={[
            styles.pathDot,
            {
              backgroundColor: theme.textSecondary,
              left: across(tMs),
              bottom: up(slideMidiAt(fromMidi, slide, tMs)),
            },
          ]}
        />
      ))}
      {run.trace.map((point) => {
        const off = Math.abs(point.midi - slideMidiAt(fromMidi, slide, point.tMs)) * 100;
        return (
          <View
            key={point.tMs}
            style={[
              styles.sungDot,
              {
                backgroundColor: off <= SLIDE_TOLERANCE_CENTS ? theme.good : theme.off,
                left: across(point.tMs),
                bottom: up(point.midi),
              },
            ]}
          />
        );
      })}
    </View>
  );
}

/** One dot per step: green for matched, orange for missed, outlined for the one in play. */
function StepDots({ run }: { run: Run }) {
  const theme = useTheme();
  return (
    <View style={styles.dots}>
      {run.steps.map((_, i) => {
        const result = run.results[i];
        const color =
          result === undefined ? theme.backgroundSelected : result.matched ? theme.good : theme.off;
        const current = i === run.index && result === undefined;
        return (
          <View
            key={i}
            style={[
              styles.dot,
              { backgroundColor: color },
              current && { borderWidth: 2, borderColor: theme.text },
            ]}
          />
        );
      })}
    </View>
  );
}

/** A running exercise: which note is up, what is being sung, and how the hold is going. */
export function RunView({ run }: { run: Run }) {
  const theme = useTheme();
  const step = run.steps[run.index];
  if (step === undefined) return null;

  const { reading, hold, hz, phase } = run;
  const sung = hz === null ? null : nearestNote(hz);
  const anyNote = step.midi === null;
  const progress = Math.min(1, hold.heldMs / step.holdMs);
  const held = seconds(Math.min(hold.heldMs, step.holdMs), 1);

  const slide = step.slide;
  const onLine = run.slideHeard === 0 ? 0 : Math.round((100 * run.slideOnLine) / run.slideHeard);

  let detail = 'Listen.';
  if (phase === 'listening') {
    if (reading === null) {
      detail = anyNote ? 'Sing "ah" on any easy note.' : slide ? 'Sing the slide now.' : 'Sing it now.';
    }
    else detail = anyNote ? 'Keep it steady.' : howClose(reading);
  } else if (anyNote) {
    detail = 'Get ready.';
  }

  return (
    <>
      <Card>
        <View style={styles.between}>
          <Label>{anyNote ? 'Your note' : slide ? 'Slide to follow' : 'Note to match'}</Label>
          <Label>
            {run.index + 1} of {run.steps.length}
          </Label>
        </View>
        <View style={styles.target}>
          <ThemedText type="subtitle">{stepLabel(step)}</ThemedText>
          {step.midi !== null && slide === undefined && (
            <ThemedText type="small" themeColor="textSecondary">
              {formatHz(midiToHz(step.midi))}
            </ThemedText>
          )}
        </View>
        {run.steps.length > 1 && <StepDots run={run} />}
      </Card>

      <Card>
        <Label>You are singing</Label>
        <ThemedText
          type="title"
          style={[styles.sung, reading !== null && { color: reading.inTune ? theme.good : theme.off }]}>
          {sung === null ? '–' : sung.name}
        </ThemedText>
        <ThemedText style={styles.centered}>{detail}</ThemedText>
        {slide !== undefined && step.midi !== null ? (
          <>
            <SlideGraph run={run} fromMidi={step.midi} slide={slide} />
            <View style={styles.between}>
              <ThemedText type="smallBold">On the line</ThemedText>
              <ThemedText type="smallBold" style={styles.numbers}>
                {onLine}%
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.numbers}>
              {phase === 'listening' && run.slideStartedAt === null
                ? 'The clock starts when you do.'
                : ' '}
            </ThemedText>
          </>
        ) : (
          <>
            <Meter reading={reading} />
            <View style={styles.holdBlock}>
              <View style={styles.between}>
                <ThemedText type="smallBold">Held in tune</ThemedText>
                <ThemedText type="smallBold" style={styles.numbers}>
                  {held} of {wholeSeconds(step.holdMs)} seconds
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
                {phase === 'listening' ? `${seconds(timeLeftMs(run), 1)} seconds left` : ' '}
              </ThemedText>
            </View>
          </>
        )}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  between: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  target: {
    alignItems: 'center',
  },
  dots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
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
  graph: {
    height: 140,
    borderRadius: Spacing.two,
    overflow: 'hidden',
  },
  pathDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: -3,
    marginBottom: -3,
    opacity: 0.6,
  },
  sungDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: -5,
    marginBottom: -5,
  },
  holdBlock: {
    gap: Spacing.one,
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
});
