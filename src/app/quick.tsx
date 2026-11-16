import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ExercisePlayer } from '@/components/exercise-player';
import { ReportCard } from '@/components/report-card';
import { ShiftButtons } from '@/components/shift-buttons';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Label, ListRow, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { Step, StepResult } from '@/lib/exercise';
import { noteName } from '@/lib/notes';
import { STARTS, scaleSteps, type StartChoice } from '@/lib/quick';
import { slideSteps, type SlideOrder } from '@/lib/slide';

/** The kinds of practice. Step mode is the original: one note at a time up a scale. */
type Mode = 'step' | 'slide';

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

const span = (start: number) => `${noteName(start)} to ${noteName(start + 12)}`;

/** What one set is called on a report card. */
function setTitle(mode: Mode, start: number, order: SlideOrder): string {
  if (mode === 'step') return `Steps, ${span(start)}`;
  const label = ORDERS.find((each) => each.order === order)?.label.toLowerCase() ?? order;
  return `Slides, ${label}, ${span(start)}`;
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

  const everything = sets.flatMap((set) => set.results);
  const setCount = sets.length === 1 ? '1 set' : `${sets.length} sets`;

  const sing = (mode: Mode, start: number, slideOrder: SlideOrder) => {
    // Random slides are picked here, once, so the set does not change under the singer.
    const steps = mode === 'step' ? scaleSteps(start) : slideSteps(start, slideOrder, Math.random);
    setAttempts(attempts + 1);
    setView({ name: 'singing', mode, start, order: slideOrder, steps, attempt: attempts + 1 });
  };

  if (view.name === 'singing') {
    const { mode, start } = view;
    const title = setTitle(mode, start, view.order);
    return (
      <Screen title={mode === 'step' ? 'Step mode' : 'Slide mode'} subtitle={title}>
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
        <Card>
          <Label>Go again</Label>
          <ShiftButtons start={start} onChoose={(next) => sing(mode, next, view.order)} />
          <ThemedText type="small" themeColor="textSecondary">
            Moves the whole scale. One note is the next piano key. That set was {span(start)}.
          </ThemedText>
        </Card>
        <Button label="Change mode" onPress={() => setView({ name: 'menu' })} />
      </Screen>
    );
  }

  if (view.name === 'choose') {
    const { mode } = view;
    return (
      <Screen
        title={mode === 'step' ? 'Step mode' : 'Slide mode'}
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
              Step up climbs the scale a slide at a time. Step down comes back. Random mixes
              jumps between any two notes with slides that go up and come back down.
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
        <Button label="Change mode" onPress={() => setView({ name: 'menu' })} />
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
            onPress={() => setView({ name: 'choose', mode: each.mode })}
          />
        ))}
        <ListRow
          disabled
          title="Volume match"
          detail="Sing your best note and match a loudness target, soft to loud."
          note="Not built yet."
        />
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
