import { useState } from 'react';
import { ExercisePlayer } from '@/components/exercise-player';
import { ReportCard } from '@/components/report-card';
import { ShiftButtons } from '@/components/shift-buttons';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Label, Screen } from '@/components/ui';
import type { StepResult } from '@/lib/exercise';
import { noteName } from '@/lib/notes';
import { STARTS, scaleSteps, type StartChoice } from '@/lib/quick';

const CHOICES: { choice: StartChoice; label: string }[] = [
  { choice: 'low', label: 'Low' },
  { choice: 'medium', label: 'Medium' },
  { choice: 'high', label: 'High' },
];

const span = (start: number) => `${noteName(start)} to ${noteName(start + 12)}`;

type View_ =
  /** Choosing where to start. */
  | { name: 'choose' }
  /** A set is playing. `set` counts sets, so each one starts fresh. */
  | { name: 'singing'; start: number; set: number }
  | { name: 'report'; start: number; last: StepResult[] };

export default function QuickPracticeScreen() {
  const [view, setView] = useState<View_>({ name: 'choose' });
  /** Every result since this screen opened. The session report adds these up. */
  const [session, setSession] = useState<StepResult[]>([]);
  const [sets, setSets] = useState(0);

  const sing = (start: number) => {
    setSets(sets + 1);
    setView({ name: 'singing', start, set: sets + 1 });
  };

  if (view.name === 'singing') {
    const { start } = view;
    return (
      <Screen title="Quick practice" subtitle={`One octave up: ${span(start)}`}>
        <ExercisePlayer
          key={view.set}
          steps={scaleSteps(start)}
          onDone={(results) => {
            setSession([...session, ...results]);
            setView({ name: 'report', start, last: results });
          }}
          onQuit={() => setView(session.length > 0 ? { name: 'report', start, last: [] } : { name: 'choose' })}
        />
      </Screen>
    );
  }

  if (view.name === 'report') {
    const { start, last } = view;
    return (
      <Screen back title="Report card" subtitle={`Sets this session: ${sets}`}>
        {last.length > 0 && <ReportCard notes title={`This set · ${span(start)}`} results={last} />}
        <ReportCard title="This session" results={session} />
        <Card>
          <Label>Go again</Label>
          <ShiftButtons start={start} onChoose={sing} />
          <ThemedText type="small" themeColor="textSecondary">
            Moves the whole scale. One note is the next piano key. That set was {span(start)}.
          </ThemedText>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      back
      title="Quick practice"
      subtitle="Eight notes up a major scale. Each plays for 3 seconds, then you have 3.5 seconds to sing it and hold it for 2.">
      <Card>
        <Label>Where to start</Label>
        {CHOICES.map(({ choice, label }) => (
          <Button
            key={choice}
            label={`${label} · ${span(STARTS[choice])}`}
            onPress={() => sing(STARTS[choice])}
          />
        ))}
        <ThemedText type="small" themeColor="textSecondary">
          The same note in a higher or lower octave counts, so pick by ear. You can move up or
          down after each set.
        </ThemedText>
      </Card>
    </Screen>
  );
}
