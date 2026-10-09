import { useEffect, useState } from 'preact/hooks';
import {
  dk,
  isRestDay,
  WEEKDAY_LABELS,
  type DateKey,
  type Habit,
} from '../models';
import {
  activeHabits,
  streakOf,
  totalsOf,
  type HabitTotals,
} from '../repository';
import type { StreakResult } from '../streak';

interface Row {
  habit: Habit;
  totals: HabitTotals;
  streak: StreakResult;
}

/**
 * 記録画面。
 *
 * 達成感の主役はここ。埋まっていくマスと、減らない累計を見せる。
 * 月をまたいで振り返れるよう、月の送りを付けている。
 */
export function HistoryScreen(props: { onClose: () => void }) {
  const today = dk.today();
  const [month, setMonth] = useState<DateKey>(dk.monthStart(today));
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const habits = await activeHabits();
      const next = await Promise.all(
        habits.map(async (habit) => ({
          habit,
          totals: await totalsOf(habit.id!, month),
          streak: await streakOf(habit, today),
        })),
      );
      if (alive) setRows(next);
    })();
    return () => {
      alive = false;
    };
  }, [month, today]);

  const shiftMonth = (delta: number) => {
    const d = dk.parse(month);
    setMonth(dk.of(new Date(d.getFullYear(), d.getMonth() + delta, 1)));
  };

  const d = dk.parse(month);
  // 未来の月は見ても意味がないので、進む側は今月で止める。
  const atLatest = month >= dk.monthStart(today);

  return (
    <div class="sheet">
      <div class="sheet-head">
        <h2>記録</h2>
        <button class="icon-button" onClick={props.onClose}>
          閉じる
        </button>
      </div>

      <div class="month-nav">
        <button class="icon-button" onClick={() => shiftMonth(-1)}>
          ‹
        </button>
        <span class="month-label">
          {d.getFullYear()}年{d.getMonth() + 1}月
        </span>
        <button
          class="icon-button"
          onClick={() => shiftMonth(1)}
          disabled={atLatest}
          style={atLatest ? 'opacity:0.3' : ''}
        >
          ›
        </button>
      </div>

      {rows === null ? null : rows.length === 0 ? (
        <p class="empty">まだ習慣がありません</p>
      ) : (
        rows.map((row) => (
          <HabitHistory
            key={row.habit.id}
            row={row}
            month={month}
            today={today}
          />
        ))
      )}
    </div>
  );
}

function HabitHistory(props: { row: Row; month: DateKey; today: DateKey }) {
  const { habit, totals, streak } = props.row;
  const first = dk.monthStart(props.month);
  const last = dk.monthEnd(props.month);
  // 月曜はじまりに揃えるため、前後の週にはみ出した分も描く。
  const gridStart = dk.weekStart(first);
  const gridEnd = dk.addDays(dk.weekStart(last), 6);
  const days = dk.range(gridStart, gridEnd);

  return (
    <div class="card history-card">
      <h3 class="card-title">{habit.name}</h3>

      <div class="grid-head">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div class="grid">
        {days.map((day) => {
          const outside = day < first || day > last;
          const future = day > props.today;
          const level =
            totals.monthLevels[day] ??
            (isRestDay(habit, day) ? 'rest' : 'none');
          return (
            <div
              key={day}
              class={`cell ${outside || future ? 'none' : level}${
                outside ? ' outside' : ''
              }${future ? ' future' : ''}${day === props.today ? ' today' : ''}`}
            >
              {outside ? '' : dk.parse(day).getDate()}
            </div>
          );
        })}
      </div>

      <div class="stats">
        <Stat
          label="今月の合計"
          value={`${totals.monthTotal}${habit.unit}`}
          strong
        />
        <Stat label="達成した日" value={`${totals.monthNormalDays}日`} />
        <Stat label="最低ライン" value={`${totals.monthMinimumDays}日`} />
        <Stat label="休息" value={`${totals.monthRestDays}日`} />
      </div>

      <div class="stats">
        <Stat
          label="通算の合計"
          value={`${totals.allTotal}${habit.unit}`}
          strong
        />
        <Stat label="通算で続けた日" value={`${totals.allAchievedDays}日`} />
        <Stat label="いまの連続" value={`${streak.current}日`} />
        <Stat label="最長の連続" value={`${streak.longest}日`} />
      </div>
    </div>
  );
}

function Stat(props: { label: string; value: string; strong?: boolean }) {
  return (
    <div class="stat">
      <span class="stat-label">{props.label}</span>
      <span class={`stat-value${props.strong ? ' strong' : ''}`}>
        {props.value}
      </span>
    </div>
  );
}
