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
import { STARTS, scaleSteps, type StartChoice } from '@/lib/quick';
import { slideSteps, type Difficulty, type SlideOrder } from '@/lib/slide';

/** The kinds of practice. Step mode is the original: one note at a time up a scale. */
type Mode = 'step' | 'slide' | 'volume';

const TITLES: Record<Mode, string> = { step: 'Step mode', slide: 'Slide mode', volume: 'Volume match' };

const MODES: { mode: Mode; title: string; line: string }[] = [
  {
    mode: 'step',
    title: 'Step mode',
    line: 'Eight notes up a major scale. Hear each one, sing it back, hold it for 2 seconds.',
  },
  {
    mode: 'slide',
    title: 'Slide mode',
    line: 'Seven slides from one note to another. The app plays each glide first, then you follow it.',
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
  { order: 'up', label: 'Step up' },
  { order: 'down', label: 'Step down' },
  { order: 'random', label: 'Random' },
];

const LEVELS: { level: Difficulty; label: string }[] = [
  { level: 'easy', label: 'Easy' },
  { level: 'medium', label: 'Medium' },
  { level: 'hard', label: 'Hard' },
];

const span = (start: number) => `${noteName(start)} to ${noteName(start + 12)}`;

/** What one set is called on a report card. */
function setTitle(mode: Mode, start: number, order: SlideOrder, level: Difficulty): string {
  if (mode === 'volume') return `Volume match on ${noteName(start)}`;
  if (mode === 'step') return `Steps, ${span(start)}`;
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

  // Your best note: the plain note you have matched most closely this session.
  // Before any set is finished, C3 stands in. Any note works for loudness.
  let bestNote = 48;
  let bestMiss = Infinity;
  for (const result of everything) {
    const plain = result.step.slide === undefined && result.step.phrase === undefined;
    if (!plain || !result.matched || result.step.midi === null || result.closestCents === null) continue;
    if (Math.abs(result.closestCents) < bestMiss) {
      bestMiss = Math.abs(result.closestCents);
      bestNote = result.sungMidi ?? result.step.midi;
    }
  }
  bestNote = Math.min(84, Math.max(36, bestNote));
  const setCount = sets.length === 1 ? '1 set' : `${sets.length} sets`;

  const sing = (mode: Mode, start: number, slideOrder: SlideOrder) => {
    // Random slides are picked here, once, so the set does not change under the singer.
    const steps =
      mode === 'volume'
        ? volumeSteps(start)
        : mode === 'step'
          ? scaleSteps(start)
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
        <ReportCard title="This session" results={everything} />
        <Button
          label={`Full session report card (${setCount})`}
          onPress={() => setView({ name: 'session', back: view })}
        />
        {mode === 'volume' ? (
          <Button primary label="Go again" onPress={() => sing('volume', bestNote, view.order)} />
        ) : (
          <Card>
            <Label>Go again</Label>
            <ShiftButtons start={start} onChoose={(next) => sing(mode, next, view.order)} />
            <ThemedText type="small" themeColor="textSecondary">
              Moves the whole scale. One note is the next piano key. That set was {span(start)}.
            </ThemedText>
          </Card>
        )}
        <Button label="Change practice mode" onPress={() => setView({ name: 'menu' })} />
      </Screen>
    );
  }

  if (view.name === 'choose') {
    const { mode } = view;
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
              Step up climbs the scale. Step down comes back. Random goes either way.
            </ThemedText>
          </Card>
        )}
        {mode === 'slide' && (
          <Card>
            <Label>How hard</Label>
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
            <ThemedText type="small" themeColor="textSecondary">
              Easy slides move one note of the scale and last 4 seconds. Medium move up to three
              and last 5. Hard move up to five, last 6, and on Random may turn round and come back.
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
                ? sing('volume', bestNote, order)
                : setView({ name: 'choose', mode: each.mode })
            }
          />
        ))}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        Volume match starts on {noteName(bestNote)},{' '}
        {bestMiss === Infinity
          ? 'until you have matched a note this session.'
          : 'the note you have matched most closely this session.'}
      </ThemedText>
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
