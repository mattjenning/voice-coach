import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, Label } from '@/components/ui';
import { Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { StepResult } from '@/lib/exercise';
import { HOLD } from '@/lib/hold';
import { formatCents, noteName } from '@/lib/notes';
import { grade, noteScore, rangeSize, summarize } from '@/lib/report';
import { stepLabel } from '@/lib/slide';

/** One fact: its name at the left, its value at the right, a thin rule under it. */
function Fact({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.fact, { borderBottomColor: theme.textSecondary }]}>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {label}
      </ThemedText>
      <ThemedText type="smallBold" style={styles.numbers}>
        {value}
      </ThemedText>
    </View>
  );
}

/** What went wrong on a missed note, in a few words. */
function attempt(result: StepResult): string {
  if (result.step.volume !== undefined) {
    return result.heldMs > 0 ? 'in the band, not held' : 'not in the band';
  }
  if (result.closestCents === null) return 'not heard';
  if (result.score !== undefined) return `${Math.round(result.closestCents)} cents off on average`;
  if (Math.abs(result.closestCents) <= HOLD.toleranceCents) return 'in tune, not held';
  return formatCents(result.closestCents, HOLD.toleranceCents);
}

/**
 * One line per note. The square at the left is the same mark the note had
 * while it was being sung: yellow for matched, tangerine for missed.
 */
function NoteRows({ results }: { results: StepResult[] }) {
  const theme = useTheme();
  return (
    <View>
      {results.map((result, i) => (
        <View key={i} style={[styles.row, { borderBottomColor: theme.textSecondary }]}>
          <View
            style={[
              styles.square,
              {
                borderColor: theme.text,
                backgroundColor: result.matched ? theme.tune : theme.voice,
              },
            ]}
          />
          <ThemedText style={styles.rowName}>{stepLabel(result.step)}</ThemedText>
          <ThemedText
            type="small"
            numberOfLines={1}
            style={[styles.rowAttempt, { color: result.matched ? theme.textSecondary : theme.off }]}>
            {result.matched ? 'matched' : attempt(result)}
          </ThemedText>
          <ThemedText type="smallBold" style={styles.rowScore}>
            {noteScore(result)}%
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

/**
 * A report card for a list of results: one set, or a whole session.
 * With `notes` on, it also lists every note.
 */
export function ReportCard({
  title,
  results,
  notes = false,
}: {
  title: string;
  results: StepResult[];
  notes?: boolean;
}) {
  const theme = useTheme();
  const summary = summarize(results);
  const letter = grade(summary);
  const range = rangeSize(summary);
  const passed = letter === 'A' || letter === 'B';
  const miss = summary.averageOffCents === null ? null : Math.round(summary.averageOffCents);
  return (
    <Card>
      <Label>{title}</Label>
      <View style={styles.top}>
        {/* The grade sits on a block of yellow when it is an A or a B. */}
        <View
          style={[
            styles.gradeBlock,
            { backgroundColor: passed ? theme.tune : theme.backgroundElement },
          ]}>
          <ThemedText style={[styles.grade, { color: passed ? theme.onTune : theme.text }]}>
            {letter ?? '–'}
          </ThemedText>
        </View>
        <View style={styles.facts}>
          <ThemedText style={styles.score}>
            {summary.score === null ? 'No notes yet' : `${summary.score}%`}
          </ThemedText>
          <Fact label="Matched" value={`${summary.matched} of ${summary.attempted}`} />
          <Fact
            label="Average miss"
            value={miss === null ? 'none measured' : miss === 1 ? '1 cent' : `${miss} cents`}
          />
          <Fact
            label="Range"
            value={
              summary.lowestSung === null || summary.highestSung === null
                ? 'none yet'
                : `${noteName(summary.lowestSung)} to ${noteName(summary.highestSung)}, ${range} ${range === 1 ? 'note' : 'notes'}`
            }
          />
        </View>
      </View>
      {notes && <NoteRows results={results} />}
    </Card>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Spacing.three,
  },
  gradeBlock: {
    width: 104,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grade: Type.grade,
  facts: {
    flex: 1,
  },
  score: {
    ...Type.figure,
    fontVariant: ['tabular-nums'],
  },
  fact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: Spacing.two,
    paddingVertical: Spacing.one + Spacing.half,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  numbers: {
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
    flexShrink: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  square: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 2,
  },
  rowName: {
    fontWeight: 700,
    minWidth: 48,
  },
  rowAttempt: {
    flex: 1,
  },
  rowScore: {
    width: 48,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
});
