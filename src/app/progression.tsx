import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ExercisePlayer } from '@/components/exercise-player';
import { ReportCard } from '@/components/report-card';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Label, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useProgress } from '@/hooks/use-progress';
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

type View_ =
  | { name: 'path' }
  /** `attempt` counts tries, so each one starts fresh. */
  | { name: 'singing'; level: Level; attempt: number }
  | { name: 'result'; level: Level; results: StepResult[]; passed: boolean };

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
  const theme = useTheme();
  const passed = isPassed(progress, level);
  const open = isOpen(progress, level);
  const isNext = nextLevel(progress) === level;
  return (
    <View style={[styles.level, !open && styles.locked]}>
      <View style={styles.levelText}>
        <ThemedText type="smallBold" style={{ color: passed ? theme.good : theme.textSecondary }}>
          {passed ? `Level ${number} · passed` : open ? `Level ${number}` : `Level ${number} · locked`}
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
  const { progress, loaded, save } = useProgress();
  const [view, setView] = useState<View_>({ name: 'path' });
  const [attempts, setAttempts] = useState(0);
  const [erasing, setErasing] = useState(false);

  const start = (level: Level) => {
    setAttempts(attempts + 1);
    setView({ name: 'singing', level, attempt: attempts + 1 });
  };

  if (view.name === 'singing') {
    const { level } = view;
    return (
      <Screen title={level.title} subtitle={level.task}>
        <ExercisePlayer
          key={view.attempt}
          steps={levelSteps(progress, level)}
          onDone={(results) => {
            save(applyResults(progress, level, results));
            setView({ name: 'result', level, results, passed: didPass(level, results) });
          }}
          onQuit={() => setView({ name: 'path' })}
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
            : `${level.title} needs ${level.passMark} of ${results.length}. Have another go.`
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
        <Button label="All levels" onPress={() => setView({ name: 'path' })} />
      </Screen>
    );
  }

  const earned = achievements(progress);
  return (
    <Screen
      back
      title="Progression"
      subtitle="Guided practice from your first note. Each level trains one thing and opens the next.">
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
                <ThemedText
                  type="smallBold"
                  style={{ color: each.earned ? theme.good : theme.textSecondary }}>
                  {each.earned ? 'Earned' : 'To earn'}
                </ThemedText>
                <View style={styles.levelText}>
                  <ThemedText>{each.title}</ThemedText>
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
    fontWeight: 600,
  },
  achievement: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
});
