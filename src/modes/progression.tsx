import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ExercisePlayer } from '@/components/exercise-player';
import { ReportCard } from '@/components/report-card';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Label, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useProgress } from '@/hooks/use-progress';
import { modePages } from '@/hooks/mode-pages';
import { useTheme } from '@/hooks/use-theme';
import type { StepResult } from '@/lib/exercise';
import { noteName } from '@/lib/notes';
import {
  COMING_LEVELS,
  LEVELS,
  NEW_PROGRESS,
  achievements,
  applyResults,
  didPass,
  isOpen,
  isPassed,
  levelSteps,
  nextLevel,
  type Level,
  type Progress,
} from '@/lib/progression';

/**
 * The pages of Progression. Each is a real page, so the phone's swipe back
 * shows the page underneath. A level and its result take each other's place,
 * so a swipe back from either lands on the list of levels.
 */
type View_ =
  | { name: 'path' }
  | { name: 'singing'; level: Level }
  | { name: 'result'; level: Level; results: StepResult[]; passed: boolean };

/** Progress is read once for all the pages, so a result shows on the list at once. */
export const ProgressionPages = modePages<View_, ReturnType<typeof useProgress>>({ name: 'path' }, useProgress);

function LevelRow({
  level,
  number,
  progress,
  onStart,
}: {
  level: Level;
  number: number;
  progress: Progress;
  onStart: () => void;
}) {
  const passed = isPassed(progress, level);
  const open = isOpen(progress, level);
  const isNext = nextLevel(progress) === level;
  return (
    <View style={[styles.level, !open && styles.locked]}>
      <View style={styles.levelText}>
        <ThemedText type="smallBold" themeColor={passed ? 'text' : 'textSecondary'}>
          {passed ? `Level ${number}, passed` : open ? `Level ${number}` : `Level ${number}, locked`}
        </ThemedText>
        <ThemedText style={styles.levelTitle}>{level.title}</ThemedText>
        {open && (
          <ThemedText type="small" themeColor="textSecondary">
            {level.trains}
          </ThemedText>
        )}
      </View>
      {open && <Button primary={isNext} label={passed ? 'Again' : 'Start'} onPress={onStart} />}
    </View>
  );
}

export default function ProgressionScreen() {
  const theme = useTheme();
  const { view, shared, push, replace, back, toFirst } = ProgressionPages.usePage();
  const { progress, loaded, save } = shared;
  const [erasing, setErasing] = useState(false);

  /** Start a level. From the list it opens on top; from a result it takes its place. */
  const start = (level: Level) => {
    if (view.name === 'path') push({ name: 'singing', level });
    else replace({ name: 'singing', level });
  };

  if (view.name === 'singing') {
    const { level } = view;
    return (
      <Screen title={level.title} subtitle={level.task}>
        <ExercisePlayer
          steps={levelSteps(progress, level)}
          onDone={(results) => {
            save(applyResults(progress, level, results));
            replace({ name: 'result', level, results, passed: didPass(level, results) });
          }}
          onQuit={back}
        />
      </Screen>
    );
  }

  if (view.name === 'result') {
    const { level, results, passed } = view;
    const upNext = nextLevel(progress);
    const foundHome = level.id === 'home' && passed && progress.home !== null;
    return (
      <Screen
        title={passed ? 'Level passed' : 'Not yet'}
        subtitle={
          passed
            ? level.title
            : level.id === 'home'
              ? `${level.title} needs ${level.passMark} of ${results.length}. Have another go.`
              : `${level.title} needs ${level.passMark} of ${results.length}, or a C. Have another go.`
        }>
        {foundHome && progress.home !== null && (
          <Card>
            <Label>Your home note</Label>
            <ThemedText type="subtitle">{noteName(progress.home)}</ThemedText>
            <ThemedText themeColor="textSecondary">
              Every level from here is built around this note.
            </ThemedText>
          </Card>
        )}
        <ReportCard notes={results.length > 1} title="This level" results={results} />
        {passed && upNext !== null && (
          <Button primary label={`Next: ${upNext.title}`} onPress={() => start(upNext)} />
        )}
        <Button primary={!passed} label="Try it again" onPress={() => start(level)} />
        <Button label="All levels" onPress={toFirst} />
      </Screen>
    );
  }

  const earned = achievements(progress);
  return (
    <Screen
      back
      title="Progression"
      subtitle="Fifteen levels from your first note, easy to hard. Each trains one thing and opens the next.">
      {!loaded ? (
        <ThemedText themeColor="textSecondary">Loading your progress.</ThemedText>
      ) : (
        <>
          <Card>
            <Label>
              {progress.home === null ? 'Start here' : `Home note ${noteName(progress.home)}`}
            </Label>
            {LEVELS.map((level, i) => (
              <LevelRow
                key={level.id}
                level={level}
                number={i + 1}
                progress={progress}
                onStart={() => start(level)}
              />
            ))}
          </Card>

          <Card>
            <Label>Achievements</Label>
            {earned.map((each) => (
              <View key={each.title} style={styles.achievement}>
                <View
                  style={[
                    styles.medal,
                    {
                      borderColor: theme.text,
                      backgroundColor: each.earned ? theme.tune : 'transparent',
                    },
                    !each.earned && styles.locked,
                  ]}
                />
                <View style={styles.levelText}>
                  <ThemedText style={styles.levelTitle}>{each.title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {each.detail}
                  </ThemedText>
                </View>
              </View>
            ))}
          </Card>

          <Card>
            <Label>Coming later</Label>
            {COMING_LEVELS.map((line) => (
              <ThemedText key={line} themeColor="textSecondary">
                {line}
              </ThemedText>
            ))}
          </Card>

          {progress.passed.length > 0 && !erasing && (
            <Button label="Start over from level 1" onPress={() => setErasing(true)} />
          )}
          {erasing && (
            <Card>
              <ThemedText>
                Erase your home note, passed levels and achievements? This cannot be undone.
              </ThemedText>
              <Button
                label="Yes, erase my progress"
                onPress={() => {
                  save(NEW_PROGRESS);
                  setErasing(false);
                }}
              />
              <Button primary label="Keep my progress" onPress={() => setErasing(false)} />
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  level: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  locked: {
    opacity: 0.45,
  },
  levelText: {
    flex: 1,
    gap: Spacing.half,
  },
  levelTitle: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: 700,
  },
  medal: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
  },
  achievement: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
});
