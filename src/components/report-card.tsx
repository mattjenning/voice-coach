import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, Label } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { StepResult } from '@/lib/exercise';
import { HOLD } from '@/lib/hold';
import { formatCents, noteName } from '@/lib/notes';
import { grade, rangeSize, summarize } from '@/lib/report';

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {label}
      </ThemedText>
      <ThemedText style={styles.numbers}>{value}</ThemedText>
    </View>
  );
}

/** One line per note: its name, whether it was matched, and the best attempt. */
function NoteRows({ results }: { results: StepResult[] }) {
  const theme = useTheme();
  return (
    <View style={styles.rows}>
      {results.map((result, i) => {
        let attempt = 'not heard';
        if (result.closestCents !== null) {
          attempt = formatCents(result.closestCents, HOLD.toleranceCents);
          if (!result.matched && Math.abs(result.closestCents) <= HOLD.toleranceCents) {
            attempt = 'in tune, not held';
          }
        }
        return (
          <View key={i} style={styles.row}>
            <ThemedText style={styles.rowNote}>
              {result.step.midi === null ? 'Any note' : noteName(result.step.midi)}
            </ThemedText>
            <ThemedText
              type="smallBold"
              style={[styles.rowMark, { color: result.matched ? theme.good : theme.off }]}>
              {result.matched ? 'Matched' : 'Missed'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.rowAttempt}>
              {result.matched ? '' : attempt}
            </ThemedText>
          </View>
        );
      })}
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
  return (
    <Card>
      <Label>{title}</Label>
      <View style={styles.top}>
        <ThemedText
          type="title"
          style={[styles.grade, { color: letter === 'A' || letter === 'B' ? theme.good : theme.off }]}>
          {letter ?? '–'}
        </ThemedText>
        <View style={styles.facts}>
          <Fact label="Notes matched" value={`${summary.matched} of ${summary.attempted}`} />
          <Fact
            label="Average miss"
            value={
              summary.averageOffCents === null
                ? 'nothing heard'
                : `${Math.round(summary.averageOffCents)} cents`
            }
          />
          <Fact
            label="Range matched"
            value={
              summary.lowestSung === null || summary.highestSung === null
                ? 'none yet'
                : `${noteName(summary.lowestSung)} to ${noteName(summary.highestSung)}`
            }
          />
          <Fact label="Range size" value={range === 1 ? '1 note' : `${range} notes`} />
        </View>
      </View>
      {notes && <NoteRows results={results} />}
    </Card>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  grade: {
    fontSize: 72,
    lineHeight: 80,
    minWidth: 64,
    textAlign: 'center',
  },
  facts: {
    flex: 1,
    gap: Spacing.one,
  },
  fact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  numbers: {
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
    flexShrink: 1,
  },
  rows: {
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  rowNote: {
    width: 56,
  },
  rowMark: {
    width: 72,
  },
  rowAttempt: {
    flex: 1,
  },
});
