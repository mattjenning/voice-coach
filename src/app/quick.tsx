import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ExercisePlayer } from '@/components/exercise-player';
import { ReportCard } from '@/components/report-card';
import { ShiftButtons } from '@/components/shift-buttons';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Label, ListRow, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { volumeSteps, type Step, type StepResult } from '@/lib/exercise';
import { noteName } from '@/lib/notes';
import { hitSteps } from '@/lib/hits';
import { STARTS, scaleSteps, type StartChoice } from '@/lib/quick';
import { slideSteps, type Difficulty, type SlideOrder } from '@/lib/slide';

/**
 * The kinds of practice. Scale mode is the original: one note at a time up a
 * scale. It was called Step mode until 2026-11-23.
 */
type Mode = 'scale' | 'slide' | 'hits' | 'volume';

const TITLES: Record<Mode, string> = {
  scale: 'Scale mode',
  slide: 'Slide mode',
  hits: 'Hit the Notes',
  volume: 'Volume match',
};

const MODES: { mode: Mode; title: string; line: string }[] = [
  {
    mode: 'scale',
    title: 'Scale mode',
    line: 'Eight notes up a major scale. Hear each one, sing it back, hold it for 2 seconds.',
  },
  {
    mode: 'slide',
    title: 'Slide mode',
    line: 'Seven slides from one note to another. The app plays each glide first, then you follow it.',
  },
  {
    mode: 'hits',
    title: 'Hit the Notes',
    line: 'Five short runs of solid notes. The app plays each run first, then you land on every note.',
  },
  {
    mode: 'volume',
    title: 'Volume match',
    line: 'Sing soft, then loud, so the app learns your range. Then hit five loudness targets.',
  },
];

const CHOICES: { choice: StartChoice; label: string }[] = [
  { choice: 'bass', label: 'Bass' },
  { choice: 'baritone', label: 'Baritone' },
  { choice: 'tenor', label: 'Tenor' },
  { choice: 'alto', label: 'Alto' },
  { choice: 'mezzo', label: 'Mezzo' },
  { choice: 'soprano', label: 'Soprano' },
];

const ORDERS: { order: SlideOrder; label: string }[] = [
  { order: 'up', label: 'Up' },
  { order: 'down', label: 'Down' },
  { order: 'random', label: 'Random' },
];

const LEVELS: { level: Difficulty; label: string }[] = [
  { level: 'easy', label: 'Easy' },
  { level: 'medium', label: 'Medium' },
  { level: 'hard', label: 'Hard' },
];

/** Volume match plays no note, so its start is only a placeholder. */
const ANY_NOTE = 48;

const span = (start: number) => `${noteName(start)} to ${noteName(start + 12)}`;

/** What one set is called on a report card. */
function setTitle(mode: Mode, start: number, order: SlideOrder, level: Difficulty): string {
  if (mode === 'volume') return 'Volume match';
  if (mode === 'scale') return `Scale, ${span(start)}`;
  if (mode === 'hits') return `Hit the Notes, ${level}, ${span(start)}`;
  const label = ORDERS.find((each) => each.order === order)?.label.toLowerCase() ?? order;
  return `Slides, ${level}, ${label}, ${span(start)}`;
}

/** One finished set: what it was and how every note or slide went. */
type FinishedSet = { title: string; results: StepResult[] };

type View_ =
  | { name: 'menu' }
  | { name: 'choose'; mode: Mode }
  /** A set is playing. `attempt` counts starts, so each one begins fresh. */
  | { name: 'singing'; mode: Mode; start: number; order: SlideOrder; steps: Step[]; attempt: number }
  | { name: 'report'; mode: Mode; start: number; order: SlideOrder; showLatest: boolean }
  /** Every finished set of the session, in full. */
  | { name: 'session'; back: View_ };

export default function PracticeScreen() {
  const [view, setView] = useState<View_>({ name: 'menu' });
  /** Every set finished since this screen opened. Sets stopped early are not kept. */
  const [sets, setSets] = useState<FinishedSet[]>([]);
  const [attempts, setAttempts] = useState(0);
  const [order, setOrder] = useState<SlideOrder>('up');
  const [level, setLevel] = useState<Difficulty>('easy');

  const everything = sets.flatMap((set) => set.results);
  const setCount = sets.length === 1 ? '1 set' : `${sets.length} sets`;

  const sing = (mode: Mode, start: number, slideOrder: SlideOrder) => {
    // Random slides are picked here, once, so the set does not change under the singer.
    const steps =
      mode === 'volume'
        ? volumeSteps()
        : mode === 'scale'
          ? scaleSteps(start)
          : mode === 'hits'
            ? hitSteps(start, level, Math.random)
            : slideSteps(start, slideOrder, level, Math.random);
    setAttempts(attempts + 1);
    setView({ name: 'singing', mode, start, order: slideOrder, steps, attempt: attempts + 1 });
  };

  if (view.name === 'singing') {
    const { mode, start } = view;
    const title = setTitle(mode, start, view.order, level);
    return (
      <Screen title={TITLES[mode]} subtitle={title}>
        <ExercisePlayer
          key={view.attempt}
          steps={view.steps}
          onDone={(results) => {
            setSets([...sets, { title, results }]);
            setView({ name: 'report', mode, start, order: view.order, showLatest: true });
          }}
          onQuit={() =>
            setView(
              sets.length > 0
                ? { name: 'report', mode, start, order: view.order, showLatest: false }
                : mode === 'volume'
                  ? { name: 'menu' }
                  : { name: 'choose', mode },
            )
          }
        />
      </Screen>
    );
  }

  if (view.name === 'session') {
    return (
      <Screen title="Session report card" subtitle={`${setCount} finished, newest first.`}>
        <ReportCard title="Whole session" results={everything} />
        {[...sets].reverse().map((set, i) => (
          <ReportCard
            key={sets.length - i}
            notes
            title={`Set ${sets.length - i}: ${set.title}`}
            results={set.results}
          />
        ))}
        <Button primary label="Back" onPress={() => setView(view.back)} />
      </Screen>
    );
  }

  if (view.name === 'report') {
    const { mode, start, showLatest } = view;
    const latest = sets[sets.length - 1];
    return (
      <Screen back title="Report card" subtitle={`Sets finished this session: ${sets.length}`}>
        {showLatest && latest !== undefined && (
          <ReportCard notes title={`This set: ${latest.title}`} results={latest.results} />
        )}
        {mode === 'volume' ? (
          <Button primary label="Go again" onPress={() => sing('volume', ANY_NOTE, view.order)} />
        ) : (
          <Card>
            <Label>Go again</Label>
            <ShiftButtons start={start} onChoose={(next) => sing(mode, next, view.order)} />
            <ThemedText type="small" themeColor="textSecondary">
              Moves the whole scale. One note is the next piano key. That set was {span(start)}.
            </ThemedText>
          </Card>
        )}
        <ReportCard title="This session" results={everything} />
        <Button
          label={`Full session report card (${setCount})`}
          onPress={() => setView({ name: 'session', back: view })}
        />
        <Button label="Change practice mode" onPress={() => setView({ name: 'menu' })} />
      </Screen>
    );
  }

  if (view.name === 'choose') {
    const { mode } = view;
    const levelButtons = (
      <View style={styles.row}>
        {LEVELS.map((each) => (
          <View key={each.level} style={styles.cell}>
            <Button
              compact
              label={each.label}
              primary={each.level === level}
              onPress={() => setLevel(each.level)}
            />
          </View>
        ))}
      </View>
    );
    return (
      <Screen
        title={TITLES[mode]}
        subtitle={MODES.find((each) => each.mode === mode)?.line}>
        {mode === 'slide' && (
          <Card>
            <Label>Which way</Label>
            <View style={styles.row}>
              {ORDERS.map((each) => (
                <View key={each.order} style={styles.cell}>
                  <Button
                    compact
                    label={each.label}
                    primary={each.order === order}
                    onPress={() => setOrder(each.order)}
                  />
                </View>
              ))}
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              Up slides all rise and Down slides all fall, each from a different note. Random goes
              either way.
            </ThemedText>
          </Card>
        )}
        {mode === 'slide' && (
          <Card>
            <Label>How hard</Label>
            {levelButtons}
            <ThemedText type="small" themeColor="textSecondary">
              Easy slides move one note of the scale. Medium move up to three and take a little
              longer. Hard move three to five, take longer still, and on Random may turn round part
              way. Every slide has its own speed.
            </ThemedText>
          </Card>
        )}
        {mode === 'hits' && (
          <Card>
            <Label>How hard</Label>
            {levelButtons}
            <ThemedText type="small" themeColor="textSecondary">
              Easy: four notes, each 0.75 seconds, a scale note apart, all one way, inside five
              notes. Medium: six half-second notes, up to two apart, turning round once, across the
              octave. Hard: eight notes of 0.4 seconds, jumps up to four, any direction.
            </ThemedText>
          </Card>
        )}
        <Card>
          <Label>Where to start</Label>
          <View>
            {CHOICES.map(({ choice, label }) => (
              <ListRow
                key={choice}
                title={label}
                value={span(STARTS[choice])}
                onPress={() => sing(mode, STARTS[choice], order)}
              />
            ))}
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            Named after the six voice types, lowest to highest. Pick the one that feels easy, not
            the one you think you are. You can move up or down after each set.
          </ThemedText>
        </Card>
        <Button label="Change practice mode" onPress={() => setView({ name: 'menu' })} />
      </Screen>
    );
  }

  return (
    <Screen back title="Quick practice" subtitle="Pick a kind of practice.">
      <View>
        {MODES.map((each) => (
          <ListRow
            key={each.mode}
            title={each.title}
            detail={each.line}
            onPress={() =>
              each.mode === 'volume'
                ? sing('volume', ANY_NOTE, order)
                : setView({ name: 'choose', mode: each.mode })
            }
          />
        ))}
      </View>
      {sets.length > 0 && (
        <Button
          label={`Session report card (${setCount})`}
          onPress={() => setView({ name: 'session', back: view })}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  cell: {
    flex: 1,
  },
});
