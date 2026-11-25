import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ExercisePlayer } from '@/components/exercise-player';
import { ReportCard } from '@/components/report-card';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Label, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { usePasses } from '@/hooks/use-passes';
import { modePages } from '@/hooks/mode-pages';
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

/**
 * The pages of Song mode. Each is a real page, so the phone's swipe back
 * shows the page underneath. A line and its result take each other's place,
 * so a swipe back from either lands on the list of lines.
 */
type View_ =
  | { name: 'lines' }
  /** Singing one line, or the whole song when `line` is null. */
  | { name: 'singing'; line: number | null }
  | { name: 'result'; line: number | null; results: StepResult[] };

/** The clean passes are read once for all the pages. */
const useSongPasses = () => usePasses(SONG);

export const SongPages = modePages<View_, ReturnType<typeof useSongPasses>>({ name: 'lines' }, useSongPasses);

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
  const { view, shared, push, replace, back, toFirst } = SongPages.usePage();
  const { passes, save } = shared;
  const [erasing, setErasing] = useState(false);

  /** Sing a line. From the list it opens on top; from a result it takes its place. */
  const sing = (line: number | null) => {
    if (view.name === 'lines') push({ name: 'singing', line });
    else replace({ name: 'singing', line });
  };

  if (view.name === 'singing') {
    const { line } = view;
    return (
      <Screen
        title={line === null ? SONG.title : `Line ${line + 1}`}
        subtitle={line === null ? 'All four lines, one after another.' : SONG.lines[line].words}>
        <ExercisePlayer
          steps={line === null ? songSteps(SONG) : [lineStep(SONG, line)]}
          onDone={(results) => {
            save(addPasses(passes, line ?? 0, results));
            replace({ name: 'result', line, results });
          }}
          onQuit={back}
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
        <Button label="All lines" onPress={toFirst} />
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
              pressed && { backgroundColor: theme.accent },
            ]}>
            {({ pressed }) => {
              const ink = pressed ? { color: theme.onAccent } : null;
              return (
                <>
                  <View style={styles.lineText}>
                    <ThemedText type="small" themeColor="textSecondary" style={ink}>
                      Line {index + 1}
                      {passes[index] >= PASSES_TO_MASTER ? ', mastered' : ''}
                    </ThemedText>
                    <ThemedText style={[styles.words, ink]}>{each.words}</ThemedText>
                  </View>
                  <PassMarks count={passes[index]} />
                </>
              );
            }}
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
    marginHorizontal: -Spacing.two,
    paddingHorizontal: Spacing.two,
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
