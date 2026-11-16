import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ExercisePlayer } from '@/components/exercise-player';
import { ReportCard } from '@/components/report-card';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Label, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { usePasses } from '@/hooks/use-passes';
import { useTheme } from '@/hooks/use-theme';
import type { StepResult } from '@/lib/exercise';
import {
  AMAZING_GRACE,
  PASSES_TO_MASTER,
  addPasses,
  isClean,
  lineStep,
  nextLine,
  noPasses,
  songMastered,
  songSteps,
} from '@/lib/song';

const SONG = AMAZING_GRACE;

type View_ =
  | { name: 'lines' }
  /** Singing one line, or the whole song when `line` is null. `attempt` makes each try fresh. */
  | { name: 'singing'; line: number | null; attempt: number }
  | { name: 'result'; line: number | null; results: StepResult[] };

/** One square per clean pass needed: filled for each one earned. */
function PassMarks({ count }: { count: number }) {
  const theme = useTheme();
  return (
    <View style={styles.marks}>
      {Array.from({ length: PASSES_TO_MASTER }, (_, i) => (
        <View
          key={i}
          style={[
            styles.mark,
            { borderColor: theme.text, backgroundColor: i < count ? theme.tune : 'transparent' },
            i >= count && styles.waiting,
          ]}
        />
      ))}
    </View>
  );
}

export default function SongScreen() {
  const theme = useTheme();
  const { passes, save } = usePasses(SONG);
  const [view, setView] = useState<View_>({ name: 'lines' });
  const [attempts, setAttempts] = useState(0);
  const [erasing, setErasing] = useState(false);

  const sing = (line: number | null) => {
    setAttempts(attempts + 1);
    setView({ name: 'singing', line, attempt: attempts + 1 });
  };

  if (view.name === 'singing') {
    const { line } = view;
    return (
      <Screen
        title={line === null ? SONG.title : `Line ${line + 1}`}
        subtitle={line === null ? 'All four lines, one after another.' : SONG.lines[line].words}>
        <ExercisePlayer
          key={view.attempt}
          steps={line === null ? songSteps(SONG) : [lineStep(SONG, line)]}
          onDone={(results) => {
            save(addPasses(passes, line ?? 0, results));
            setView({ name: 'result', line, results });
          }}
          onQuit={() => setView({ name: 'lines' })}
        />
      </Screen>
    );
  }

  if (view.name === 'result') {
    const { line, results } = view;
    const clean = results.filter(isClean).length;
    const upNext = nextLine(passes);
    const title =
      line === null
        ? `${clean} of ${results.length} lines clean`
        : clean === 1
          ? 'Clean'
          : 'Not clean yet';
    return (
      <Screen
        title={title}
        subtitle={
          songMastered(passes)
            ? `Every line has ${PASSES_TO_MASTER} clean passes. ${SONG.title} is mastered.`
            : `A line is clean when at least 70% of it is on the notes and in time.`
        }>
        <ReportCard notes title={line === null ? SONG.title : SONG.lines[line].words} results={results} />
        <Button primary label="Sing it again" onPress={() => sing(line)} />
        {line !== null && upNext !== null && upNext !== line && (
          <Button label={`Go to line ${upNext + 1}`} onPress={() => sing(upNext)} />
        )}
        <Button label="All lines" onPress={() => setView({ name: 'lines' })} />
      </Screen>
    );
  }

  const mastered = songMastered(passes);
  return (
    <Screen
      back
      title={SONG.title}
      subtitle="The app sings a line, then you sing it back. Three clean passes master a line.">
      <View>
        {SONG.lines.map((each, index) => (
          <Pressable
            key={each.words}
            accessibilityRole="button"
            accessibilityLabel={`Line ${index + 1}: ${each.words}`}
            onPress={() => sing(index)}
            style={({ pressed }) => [
              styles.line,
              { borderBottomColor: theme.textSecondary },
              pressed && { backgroundColor: theme.backgroundSelected },
            ]}>
            <View style={styles.lineText}>
              <ThemedText type="small" themeColor="textSecondary">
                Line {index + 1}
                {passes[index] >= PASSES_TO_MASTER ? ', mastered' : ''}
              </ThemedText>
              <ThemedText style={styles.words}>{each.words}</ThemedText>
            </View>
            <PassMarks count={passes[index]} />
          </Pressable>
        ))}
      </View>

      <Button primary label="Sing the whole song" onPress={() => sing(null)} />

      <Card>
        <Label>{mastered ? 'Mastered' : 'How it works'}</Label>
        <ThemedText themeColor="textSecondary">
          Tap a line to practice it alone. A ring rides the tune while the app plays it. On your
          turn the ring sets off again when you start singing: keep your voice in it. Any octave
          counts.
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {SONG.credit} Free for anyone to sing and use.
        </ThemedText>
      </Card>

      {passes.some((count) => count > 0) && !erasing && (
        <Button label="Start this song over" onPress={() => setErasing(true)} />
      )}
      {erasing && (
        <Card>
          <ThemedText>Erase every clean pass for this song? This cannot be undone.</ThemedText>
          <Button
            label="Yes, erase them"
            onPress={() => {
              save(noPasses(SONG));
              setErasing(false);
            }}
          />
          <Button primary label="Keep them" onPress={() => setErasing(false)} />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lineText: {
    flex: 1,
    gap: Spacing.half,
  },
  words: {
    fontSize: 22,
    lineHeight: 28,
  },
  marks: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  mark: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
  },
  waiting: {
    opacity: 0.35,
  },
});
