import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import {
  dk,
  WEEKDAY_LABELS,
  type DateKey,
  type Habit,
  type HabitLog,
} from '../models';
import {
  addMinimum,
  addNormal,
  clearLog,
  entriesFor,
  exportAll,
  findHabit,
  findLog,
  importAll,
  levelsBetween,
  markRest,
  restoreLog,
  setTotal,
  streakOf,
  totalsOf,
} from '../repository';
import { HabitCard, type HabitDayView } from './HabitCard';
import { HabitEditor } from './HabitEditor';
import { HistoryScreen } from './HistoryScreen';
import { useTimer } from './useTimer';

interface Toast {
  message: string;
  undo?: () => Promise<void>;
}

export function App() {
  const [today, setToday] = useState<DateKey>(dk.today());
  const [views, setViews] = useState<HabitDayView[] | null>(null);
  const [editing, setEditing] = useState<{ habit?: Habit } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    // 日付をまたいだまま開きっぱなしのことがあるので、毎回取り直す。
    const now = dk.today();
    setToday(now);

    const entries = await entriesFor(now);
    const weekStart = dk.weekStart(now);
    const next = await Promise.all(
      entries.map(async (entry) => ({
        entry,
        weekLevels: await levelsBetween(
          entry.habit.id!,
          weekStart,
          dk.addDays(weekStart, 6),
        ),
        streak: await streakOf(entry.habit, now),
        totals: await totalsOf(entry.habit.id!, now),
      })),
    );
    setViews(next);
  }, []);

  const showToast = (next: Toast) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  };

  /**
   * タイマーが終わったら、最低ラインを1回分足す。
   *
   * 始められた時点で目的は果たされているので、改めて
   * ボタンを押させない。加算なので、1日に何度走らせても正しく積む。
   */
  const onTimerFinish = async (habitId: number) => {
    const habit = await findHabit(habitId);
    if (!habit) return;
    await addMinimum(habit, dk.today());
    await load();
    showToast({ message: `${habit.name} — 終了。記録しました` });
  };

  const timer = useTimer((habitId) => void onTimerFinish(habitId));

  useEffect(() => {
    void load();

    // ホーム画面から復帰したときに、日付と記録を取り直す。
    // PWA はプロセスが残り続けるので、これがないと前日の表示のままになる。
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  /** 記録を実行して再読み込みし、取り消し手段を添えて知らせる。 */
  const act = async (
    habit: Habit,
    action: () => Promise<unknown>,
    message: string,
  ) => {
    const previous = await findLog(habit.id!, today);
    await action();
    await load();
    showToast({
      message,
      undo: async () => {
        // 誤タップの取り消しで、元の記録まで消えないように戻す。
        await restoreLog(habit.id!, today, previous as HabitLog | undefined);
        await load();
        setToast(null);
      },
    });
  };

  const askValue = async (habit: Habit, current: number) => {
    const input = prompt(
      `${habit.name} の今日の合計(${habit.unit})\n` +
        `最低 ${habit.minimumTarget} / 通常 ${habit.normalTarget}`,
      String(current),
    );
    if (input === null) return;
    const value = Number(input);
    if (!Number.isFinite(value) || value < 0) return;
    await act(
      habit,
      () => setTotal(habit, value, today),
      `${habit.name} を ${value}${habit.unit} にしました`,
    );
  };

  const download = async () => {
    const json = await exportAll();
    const url = URL.createObjectURL(
      new Blob([json], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `routine-${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const upload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!confirm('現在のデータを、読み込んだ内容で置き換えます。')) return;
      try {
        await importAll(await file.text());
        await load();
        showToast({ message: '読み込みました' });
      } catch {
        showToast({ message: '読み込めませんでした' });
      }
    };
    input.click();
  };

  if (editing) {
    return (
      <HabitEditor
        habit={editing.habit}
        onClose={(changed) => {
          setEditing(null);
          if (changed) void load();
        }}
      />
    );
  }

  if (showHistory) {
    return <HistoryScreen onClose={() => setShowHistory(false)} />;
  }

  return (
    <div class="app">
      <header class="topbar">
        <h1>今日</h1>
        <span class="date">
          {dk.format(today)}({WEEKDAY_LABELS[dk.weekday(today) - 1]})
        </span>
        <span class="spacer" />
        <button
          class="icon-button"
          onClick={() => setShowHistory(true)}
          title="記録"
        >
          記録
        </button>
        <button class="icon-button" onClick={download} title="書き出し">
          ↓
        </button>
        <button class="icon-button" onClick={upload} title="読み込み">
          ↑
        </button>
        <button class="icon-button" onClick={() => setEditing({})}>
          ＋
        </button>
      </header>

      {views === null ? null : views.length === 0 ? (
        <div class="empty">
          <h2>まだ習慣がありません</h2>
          <p>
            最初は2〜3個だけにして、
            <br />
            最低ラインを「これなら必ずできる」まで下げておくと続きます。
          </p>
          <button class="primary-wide" onClick={() => setEditing({})}>
            習慣を追加
          </button>
        </div>
      ) : (
        views.map((view) => {
          const habit = view.entry.habit;
          return (
            <HabitCard
              key={habit.id}
              view={view}
              today={today}
              onAddNormal={() =>
                act(
                  habit,
                  () => addNormal(habit, today),
                  `${habit.name} +${habit.normalTarget}${habit.unit}`,
                )
              }
              onAddMinimum={() =>
                act(
                  habit,
                  () => addMinimum(habit, today),
                  `${habit.name} +${habit.minimumTarget}${habit.unit}`,
                )
              }
              onRest={() =>
                act(
                  habit,
                  () => markRest(habit, today),
                  `${habit.name} を休息にしました`,
                )
              }
              onClear={async () => {
                await clearLog(habit.id!, today);
                await load();
              }}
              onCustom={() =>
                askValue(habit, view.entry.log?.achievedValue ?? 0)
              }
              onEdit={() => setEditing({ habit })}
              timerRemainingMs={
                timer.timer?.habitId === habit.id ? timer.remainingMs : null
              }
              onStartTimer={() =>
                timer.start(habit.id!, habit.timerMinutes ?? 5)
              }
              onStopTimer={timer.stop}
            />
          );
        })
      )}

      {toast && (
        <div class="toast">
          <span>{toast.message}</span>
          <span class="spacer" />
          {toast.undo && <button onClick={toast.undo}>取り消す</button>}
        </div>
      )}
    </div>
  );
}
