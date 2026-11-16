import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  SLIDE_TOLERANCE_CENTS,
  VOLUME_TOLERANCE,
  stepPath,
  timeLeftMs,
  type Path,
  type Run,
  type Volume,
} from '@/lib/exercise';
import { HOLD, formatOctaves, type TargetReading } from '@/lib/hold';
import { formatCents, nearestNote } from '@/lib/notes';
import { stepLabel } from '@/lib/slide';

/**
 * A running exercise.
 *
 * The one loud thing on this screen is the pitch field. Pitch runs up and
 * down it, as pitch does: sing sharp and your mark rises, sing flat and it
 * sinks. The heavy line across the middle is the note. While you are on it,
 * yellow floods in from the left, and when the yellow reaches the far side
 * the note is yours. Everything else on the screen stays quiet.
 */

/** The field shows a whole semitone either side of the note. */
const FIELD_RANGE_CENTS = 100;
const FIELD_HEIGHT = 260;

const seconds = (ms: number, digits: number) => (ms / 1000).toFixed(digits);
/** "2" for 2000, "3.5" for 3500. */
const wholeSeconds = (ms: number) => seconds(ms, Number.isInteger(ms / 1000) ? 0 : 1);

/** "33 cents sharp, one octave below the note" */
export function howClose(reading: TargetReading): string {
  const octave = formatOctaves(reading.octaves);
  const cents = formatCents(reading.cents, HOLD.toleranceCents);
  return octave ? `${cents}, ${octave} the note` : cents;
}

/** How far up the field a pitch sits, as a share of its height. 0.5 is on the note. */
function height(cents: number): number {
  const clamped = Math.max(-FIELD_RANGE_CENTS, Math.min(FIELD_RANGE_CENTS, cents));
  return (clamped + FIELD_RANGE_CENTS) / (2 * FIELD_RANGE_CENTS);
}

const percent = (share: number) => `${Math.max(0, Math.min(100, share * 100))}%` as const;

/** The pitch field for a held note. */
function NoteField({ reading, flood }: { reading: TargetReading | null; flood: number }) {
  const theme = useTheme();
  const zone = HOLD.toleranceCents / FIELD_RANGE_CENTS / 2;
  return (
    <View style={[styles.field, { backgroundColor: theme.field }]}>
      <View style={[styles.flood, { backgroundColor: theme.tune, width: percent(flood) }]} />
      {/* The in-tune band: two fine lines either side of the note. */}
      <View style={[styles.fine, { backgroundColor: theme.onTune, bottom: percent(0.5 + zone) }]} />
      <View style={[styles.fine, { backgroundColor: theme.onTune, bottom: percent(0.5 - zone) }]} />
      <View style={[styles.noteLine, { backgroundColor: theme.onTune }]} />
      {reading !== null && (
        <View
          style={[
            styles.mark,
            {
              bottom: percent(height(reading.cents)),
              backgroundColor: reading.inTune ? theme.onTune : theme.voice,
              borderColor: theme.onTune,
            },
          ]}
        />
      )}
      <ThemedText type="small" style={[styles.edge, styles.edgeTop, { color: theme.onTune }]}>
        sharp
      </ThemedText>
      <ThemedText type="small" style={[styles.edge, styles.edgeBottom, { color: theme.onTune }]}>
        flat
      </ThemedText>
    </View>
  );
}

/**
 * The field for a loudness step. Loud is up, soft is down. The band is the
 * loudness to hit, and the ball is how loud you are now. While you are in
 * the band, yellow floods in from the left, as it does for a held note.
 */
function VolumeField({
  volume,
  loudness,
  flood,
}: {
  volume: Volume;
  loudness: number | null;
  flood: number;
}) {
  const theme = useTheme();
  // The field shows a little beyond the singer's own softest and loudest.
  const up = (share: number) => percent((share + 0.15) / 1.3);
  const inRange =
    volume.kind === 'match' &&
    loudness !== null &&
    Math.abs(loudness - volume.target) <= VOLUME_TOLERANCE;
  return (
    <View style={[styles.field, { backgroundColor: theme.field }]}>
      <View style={[styles.flood, { backgroundColor: theme.tune, width: percent(flood) }]} />
      {volume.kind === 'match' && (
        <View
          style={[
            styles.band,
            {
              borderColor: theme.onTune,
              bottom: up(volume.target - VOLUME_TOLERANCE),
              height: percent((2 * VOLUME_TOLERANCE) / 1.3),
            },
          ]}
        />
      )}
      {loudness !== null && (
        <View
          style={[
            styles.mark,
            {
              bottom: up(loudness),
              backgroundColor: inRange ? theme.onTune : theme.voice,
              borderColor: theme.onTune,
            },
          ]}
        />
      )}
      <ThemedText type="small" style={[styles.edge, styles.edgeTop, { color: theme.onTune }]}>
        loud
      </ThemedText>
      <ThemedText type="small" style={[styles.edge, styles.edgeBottom, { color: theme.onTune }]}>
        soft
      </ThemedText>
    </View>
  );
}

/** Roughly how long after a step starts its sound begins. */
const SOUND_LEAD_MS = 250;

/** Milliseconds since `key` last changed, refreshed about twenty times a second while `running`. */
function useElapsed(running: boolean, key: number): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) return;
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - startedAt), 50);
    return () => {
      clearInterval(timer);
      setElapsed(0);
    };
  }, [running, key]);
  return running ? elapsed : 0;
}

/**
 * The pitch field for a slide: time runs left to right, pitch bottom to top.
 * The small dots are the path.
 *
 * While the app plays the slide, a ring rides along the path so you can see
 * what you are hearing. On your turn the ring sets off again when you start
 * singing, showing where the tone would be, and a ball shows where your
 * voice is. Keep the ball in the ring.
 */
function PathField({ run, path }: { run: Run; path: Path }) {
  const theme = useTheme();
  const total = path.totalMs;
  const lowest = path.lowest - 1.5;
  const highest = path.highest + 1.5;
  const up = (midi: number) => percent((midi - lowest) / (highest - lowest));
  const dots = Array.from({ length: 49 }, (_, i) => (i / 48) * total);

  const playing = run.phase === 'tone';
  const heardFor = useElapsed(playing, run.turn) - SOUND_LEAD_MS;
  const sungFor =
    run.slideStartedAt === null || run.clockMs === null ? null : run.clockMs - run.slideStartedAt;
  // Where the tone is right now: while it plays, or on your turn once you have started.
  // On your turn, before you start, the ring waits at the beginning of the path.
  const waiting = run.phase === 'listening' && sungFor === null;
  const toneAt = playing ? (heardFor > 0 ? heardFor : null) : waiting ? 0 : sungFor;
  const ring = toneAt === null ? null : Math.min(toneAt, total);
  const voice =
    !playing && ring !== null && run.reading !== null
      ? path.midiAt(ring) + run.reading.cents / 100
      : null;

  return (
    <View style={[styles.field, { backgroundColor: theme.field }]}>
      <View
        style={[
          styles.flood,
          { backgroundColor: theme.tune, width: percent(playing || ring === null ? 0 : ring / total) },
        ]}
      />
      {dots.map((tMs) => (
        <View
          key={tMs}
          style={[
            styles.pathDot,
            {
              backgroundColor: theme.onTune,
              left: percent(tMs / total),
              bottom: up(path.midiAt(tMs)),
            },
          ]}
        />
      ))}
      {run.trace.map((point) => {
        const off = Math.abs(point.midi - path.midiAt(point.tMs)) * 100;
        return (
          <View
            key={point.tMs}
            style={[
              styles.trailDot,
              {
                backgroundColor: off <= SLIDE_TOLERANCE_CENTS ? theme.onTune : theme.voice,
                left: percent(point.tMs / total),
                bottom: up(point.midi),
              },
            ]}
          />
        );
      })}
      {ring !== null && (
        <View
          style={[
            styles.ring,
            {
              borderColor: theme.onTune,
              left: percent(ring / total),
              bottom: up(path.midiAt(ring)),
            },
          ]}
        />
      )}
      {voice !== null && ring !== null && run.reading !== null && (
        <View
          style={[
            styles.ball,
            {
              backgroundColor: run.reading.inTune ? theme.onTune : theme.voice,
              borderColor: theme.onTune,
              left: percent(ring / total),
              bottom: up(voice),
            },
          ]}
        />
      )}
    </View>
  );
}

/** One square per step: yellow for matched, tangerine for missed, outlined for the one in play. */
function StepMarks({ run }: { run: Run }) {
  const theme = useTheme();
  return (
    <View style={styles.marks}>
      {run.steps.map((_, i) => {
        const result = run.results[i];
        const current = i === run.index && result === undefined;
        const fill =
          result === undefined ? 'transparent' : result.matched ? theme.tune : theme.voice;
        return (
          <View
            key={i}
            style={[
              styles.stepMark,
              { backgroundColor: fill, borderColor: theme.text },
              current && styles.stepMarkCurrent,
              !current && result === undefined && styles.stepMarkWaiting,
            ]}
          />
        );
      })}
    </View>
  );
}

export function RunView({ run }: { run: Run }) {
  const theme = useTheme();
  const step = run.steps[run.index];
  if (step === undefined) return null;

  const { reading, hold, hz, phase } = run;
  const sung = hz === null ? null : nearestNote(hz);
  const anyNote = step.midi === null;
  const path = stepPath(step);
  const slide = path !== null;
  const phrase = step.phrase !== undefined;
  const volume = step.volume;
  const holdShare = step.holdMs <= 0 ? 0 : Math.min(1, hold.heldMs / step.holdMs);
  const onLine = run.slideHeard === 0 ? 0 : Math.round((100 * run.slideOnLine) / run.slideHeard);

  let detail = slide ? 'Listen. Your turn comes next.' : 'Listen.';
  if (phase === 'listening') {
    if (reading === null) {
      detail = anyNote ? 'Sing "ah" on any easy note.' : slide ? (phrase ? 'Your turn. Sing the line.' : 'Your turn. Sing the slide.') : 'Sing it now.';
    } else {
      detail = anyNote ? 'Keep it steady.' : slide ? 'Keep the ball in the ring.' : howClose(reading);
    }
  } else if (anyNote) {
    detail = 'Get ready.';
  }

  if (volume !== undefined) {
    if (phase !== 'listening') detail = 'Listen to the note. Any note will do.';
    else if (volume.kind === 'quiet') detail = 'Sing as softly as you can, and keep going.';
    else if (volume.kind === 'loud') detail = 'Sing loud, but stay comfortable.';
    else if (run.loudness === null) detail = 'Sing, and bring the ball into the band.';
    else {
      const gap = run.loudness - volume.target;
      detail = Math.abs(gap) <= VOLUME_TOLERANCE ? 'Hold it there.' : gap > 0 ? 'Softer.' : 'Louder.';
    }
  }

  let count = ' ';
  if (phase === 'listening') {
    count =
      slide && run.slideStartedAt === null
        ? 'The clock starts when you do.'
        : `${seconds(timeLeftMs(run), 1)} seconds left`;
  }

  return (
    <View style={styles.all}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <ThemedText type="small" themeColor="textSecondary">
            {volume !== undefined
              ? 'Match the volume'
              : anyNote
                ? 'Your note'
                : phrase
                  ? 'Sing the line'
                  : slide
                    ? 'Follow the slide'
                    : 'Match the note'}, {run.index + 1} of{' '}
            {run.steps.length}
          </ThemedText>
          <ThemedText
            numberOfLines={1}
            adjustsFontSizeToFit
            style={slide || volume !== undefined ? styles.slideTarget : styles.target}>
            {stepLabel(step)}
          </ThemedText>
        </View>
        <View style={styles.sungBlock}>
          <ThemedText type="small" themeColor="textSecondary">
            You
          </ThemedText>
          <ThemedText
            style={[
              styles.sung,
              { color: reading === null || reading.inTune ? theme.text : theme.off },
            ]}>
            {sung === null ? '–' : sung.name}
          </ThemedText>
        </View>
      </View>

      {volume !== undefined ? (
        <VolumeField volume={volume} loudness={run.loudness} flood={holdShare} />
      ) : path !== null ? (
        <PathField run={run} path={path} />
      ) : (
        <NoteField reading={reading} flood={holdShare} />
      )}

      <View style={styles.under}>
        <ThemedText style={styles.detail}>{detail}</ThemedText>
        <View style={styles.between}>
          <ThemedText type="smallBold">
            {volume !== undefined && volume.kind !== 'match'
              ? 'Learning your range'
              : slide
              ? `On the line ${onLine}%`
              : `${volume !== undefined ? 'Held in the band' : 'Held in tune'} ${seconds(Math.min(hold.heldMs, step.holdMs), 1)} of ${wholeSeconds(step.holdMs)} seconds`}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.numbers}>
            {count}
          </ThemedText>
        </View>
      </View>

      {run.steps.length > 1 && <StepMarks run={run} />}
    </View>
  );
}

const styles = StyleSheet.create({
  all: {
    gap: Spacing.three,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.three,
  },
  headText: {
    flex: 1,
  },
  target: Type.note,
  /** A slide's name is three times as long as a note's, so it is set smaller and kept on one line. */
  slideTarget: Type.figure,
  sungBlock: {
    alignItems: 'flex-end',
  },
  sung: {
    ...Type.figure,
    fontVariant: ['tabular-nums'],
  },
  field: {
    height: FIELD_HEIGHT,
    borderRadius: 24,
    overflow: 'hidden',
  },
  flood: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  noteLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '50%',
    height: 4,
    marginBottom: -2,
  },
  fine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    opacity: 0.35,
  },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 3,
    borderBottomWidth: 3,
  },
  mark: {
    position: 'absolute',
    right: '18%',
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    marginBottom: -18,
  },
  edge: {
    position: 'absolute',
    left: Spacing.three,
    opacity: 0.7,
  },
  edgeTop: {
    top: Spacing.two,
  },
  edgeBottom: {
    bottom: Spacing.two,
  },
  pathDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: -3,
    marginBottom: -3,
    opacity: 0.45,
  },
  trailDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: -4,
    marginBottom: -4,
  },
  ring: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    marginLeft: -17,
    marginBottom: -17,
  },
  ball: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    marginLeft: -10,
    marginBottom: -10,
  },
  under: {
    gap: Spacing.one,
  },
  detail: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: 600,
  },
  between: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  numbers: {
    fontVariant: ['tabular-nums'],
  },
  marks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  stepMark: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
  },
  stepMarkCurrent: {
    borderWidth: 4,
  },
  stepMarkWaiting: {
    opacity: 0.3,
  },
});
