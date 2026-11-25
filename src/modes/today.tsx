import { useState } from 'react';

import { ExercisePlayer } from '@/components/exercise-player';
import { ReportCard } from '@/components/report-card';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Label, Screen } from '@/components/ui';
import { useDaily } from '@/hooks/use-daily';
import { useProgress } from '@/hooks/use-progress';
import { modePages } from '@/hooks/mode-pages';
import {
  dailySets,
  dayKey,
  difficultyName,
  doneToday,
  finishDay,
  streakNow,
  type DailySet,
  type DayResult,
} from '@/lib/daily';
import type { StepResult } from '@/lib/exercise';
import { noteName } from '@/lib/notes';
import { LEVELS, applyResults, didPass, levelSteps } from '@/lib/progression';
import { grade, summarize } from '@/lib/report';

/** Finding the home note is level 1 of Progression. A first session starts with it. */
const HOME_LEVEL = LEVELS[0];

/**
 * The pages of Today's practice. Each is a real page, so the phone's swipe
 * back shows the page underneath. The parts of the day take each other's
 * place, so a swipe back from any of them lands on the Today page.
 */
type View_ =
  | { name: 'intro' }
  /** Finding the home note, for a singer who has none yet. */
  | { name: 'home' }
  /** About to sing set `at`. */
  | { name: 'ready'; at: number }
  | { name: 'singing'; at: number }
  | { name: 'done'; result: DayResult };

/** What every page of Today's practice shares while it is open. */
function useShared() {
  const { progress, loaded: progressLoaded, save: saveProgress } = useProgress();
  const { daily, loaded: dailyLoaded, save: saveDaily } = useDaily();
  const [sets, setSets] = useState<DailySet[]>([]);
  /** The results of each finished set, in order. */
  const [done, setDone] = useState<StepResult[][]>([]);
  const [missedHome, setMissedHome] = useState(false);
  return {
    progress,
    progressLoaded,
    saveProgress,
    daily,
    dailyLoaded,
    saveDaily,
    sets,
    setSets,
    done,
    setDone,
    missedHome,
    setMissedHome,
  };
}

export const TodayPages = modePages<View_, ReturnType<typeof useShared>>({ name: 'intro' }, useShared);

const days = (count: number) => (count === 1 ? '1 day' : `${count} days`);

export default function TodayScreen() {
  const { view, shared, push, replace, back, leave } = TodayPages.usePage();
  const {
    progress,
    progressLoaded,
    saveProgress,
    daily,
    dailyLoaded,
    saveDaily,
    sets,
    setSets,
    done,
    setDone,
    missedHome,
    setMissedHome,
  } = shared;

  const today = dayKey(new Date());
  const scoreOf = (results: StepResult[] | undefined) =>
    results === undefined ? null : summarize(results).score;

  /** Draw today's sets, once, and go to the first. From the Today page it opens on top. */
  const begin = (home: number) => {
    setSets(dailySets(home, daily, Math.random));
    setDone([]);
    if (view.name === 'intro') push({ name: 'ready', at: 0 });
    else replace({ name: 'ready', at: 0 });
  };
  const sing = (at: number) => replace({ name: 'singing', at });

  if (!progressLoaded || !dailyLoaded) {
    return (
      <Screen back title="Today">
        <ThemedText themeColor="textSecondary">Loading your practice.</ThemedText>
      </Screen>
    );
  }

  if (view.name === 'home') {
    return (
      <Screen title={HOME_LEVEL.title} subtitle={HOME_LEVEL.task}>
        <ExercisePlayer
          steps={levelSteps(progress, HOME_LEVEL)}
          onDone={(results) => {
            const next = applyResults(progress, HOME_LEVEL, results);
            saveProgress(next);
            if (didPass(HOME_LEVEL, results) && next.home !== null) {
              setMissedHome(false);
              begin(next.home);
            } else {
              setMissedHome(true);
              back();
            }
          }}
          onQuit={back}
        />
      </Screen>
    );
  }

  if (view.name === 'singing') {
    const set = sets[view.at];
    return (
      <Screen title={set.title} subtitle={`Part ${view.at + 1} of ${sets.length}. ${set.line}`}>
        <ExercisePlayer
          steps={set.steps}
          onDone={(results) => {
            const all = [...done.slice(0, view.at), results];
            setDone(all);
            if (view.at + 1 < sets.length) {
              replace({ name: 'ready', at: view.at + 1 });
              return;
            }
            const part = (name: DailySet['part']) => scoreOf(all[sets.findIndex((each) => each.part === name)]);
            const result = finishDay(
              daily,
              today,
              { hits: part('hits'), slide: part('slide') },
              scoreOf(all.flat()),
            );
            saveDaily(result.daily);
            replace({ name: 'done', result });
          }}
          onQuit={() => replace({ name: 'ready', at: view.at })}
        />
      </Screen>
    );
  }

  if (view.name === 'ready') {
    const set = sets[view.at];
    const last = done[view.at - 1];
    const lastScore = scoreOf(last);
    return (
      <Screen
        title={view.at === 0 ? 'Ready?' : `Part ${view.at} done`}
        subtitle={
          view.at === 0 || lastScore === null
            ? `${sets.length} short parts, about three minutes.`
            : `${sets[view.at - 1].title}: ${lastScore}%, ${grade(summarize(last)) ?? ''}.`
        }>
        {/* How the part just sung went, on its colored grade block. */}
        {view.at > 0 && last !== undefined && lastScore !== null && (
          <ReportCard title={sets[view.at - 1].title} results={last} />
        )}
        <Card>
          <Label>{`Part ${view.at + 1} of ${sets.length}: ${set.title}`}</Label>
          <ThemedText themeColor="textSecondary">{set.line}</ThemedText>
          <Button primary label={view.at === 0 ? 'Start' : 'Next part'} onPress={() => sing(view.at)} />
        </Card>
        <Button label="Stop for today" onPress={leave} />
      </Screen>
    );
  }

  if (view.name === 'done') {
    const { result } = view;
    const everything = done.flat();
    const score = scoreOf(everything);
    return (
      <Screen
        title={result.firstToday ? `${days(result.daily.streak)} in a row` : 'Extra practice done'}
        subtitle={
          result.firstToday
            ? result.daily.streak === 1
              ? 'Today is done. Come back tomorrow to start a streak.'
              : 'Today is done. Same again tomorrow keeps it going.'
            : 'Your streak already counted today. This one was for you.'
        }>
        <ReportCard notes title="Today's practice" results={everything} />
        {(result.newBest || result.moved.length > 0) && (
          <Card>
            <Label>What changed</Label>
            {result.newBest && score !== null && (
              <ThemedText>{`A new best: ${score}%.`}</ThemedText>
            )}
            {result.moved.map((move) => (
              <ThemedText key={move.part}>
                {`${move.part === 'hits' ? 'Hit the notes' : 'Slides'} ${
                  move.up ? 'steps up' : 'eases off'
                } to ${difficultyName(move.to)} next time.`}
              </ThemedText>
            ))}
          </Card>
        )}
        <Button primary label="Done" onPress={leave} />
        {progress.home !== null && (
          <Button label="Go again with new notes" onPress={() => begin(progress.home ?? 0)} />
        )}
      </Screen>
    );
  }

  // The intro.
  const streak = streakNow(daily, today);
  const already = doneToday(daily, today);
  return (
    <Screen
      back
      title="Today"
      subtitle={
        already
          ? `Done for today. ${days(streak)} in a row.`
          : streak > 0
            ? `${days(streak)} in a row. Today keeps it going.`
            : 'One short session a day beats one long one a week.'
      }>
      {progress.home === null ? (
        <Card>
          <Label>First, your home note</Label>
          <ThemedText themeColor="textSecondary">
            {missedHome
              ? 'The app did not catch a steady note that time. Sing "ah" a little louder and hold it still for 2 seconds.'
              : 'Sing "ah" on any note that feels easy. The app builds every exercise around it, so nothing is too high or too low for you.'}
          </ThemedText>
          <Button
            primary
            label={missedHome ? 'Try again' : 'Find my home note'}
            onPress={() => push({ name: 'home' })}
          />
        </Card>
      ) : (
        <Card>
          <Label>About three minutes</Label>
          <ThemedText themeColor="textSecondary">
            {`A warm-up, three runs of notes (${difficultyName(daily.levels.hits).toLowerCase()}), four slides (${difficultyName(daily.levels.slide).toLowerCase()}) and one long note, all built around your home note, ${noteName(progress.home)}. Different notes every day. It gets harder when you do well and eases off when you do not.`}
          </ThemedText>
          <Button
            primary
            label={already ? 'Practice again' : "Start today's practice"}
            onPress={() => begin(progress.home ?? 0)}
          />
        </Card>
      )}
      {daily.sessions > 0 && (
        <Card>
          <Label>So far</Label>
          <ThemedText themeColor="textSecondary">
            {`${daily.sessions === 1 ? '1 session' : `${daily.sessions} sessions`} finished. Longest streak ${days(daily.longest)}.${
              daily.best === null ? '' : ` Best score ${daily.best}%.`
            }`}
          </ThemedText>
        </Card>
      )}
    </Screen>
  );
}
