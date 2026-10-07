import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { dk, WEEKDAY_LABELS, type DateKey, type Habit, type HabitLog } from '../models';
import {
  clearLog,
  entriesFor,
  exportAll,
  importAll,
  levelsBetween,
  markRest,
  record,
  recordMinimum,
  recordNormal,
  streakOf,
  findLog,
  findHabit,
} from '../repository';
import { HabitCard, type HabitDayView } from './HabitCard';
import { HabitEditor } from './HabitEditor';
import { useTimer } from './useTimer';

interface Toast {
  message: string;
  undo?: () => Promise<void>;
}

export function App() {
  const [today, setToday] = useState<DateKey>(dk.today());
  const [views, setViews] = useState<HabitDayView[] | null>(null);
  const [editing, setEditing] = useState<{ habit?: Habit } | null>(null);
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
      })),
    );
    setViews(next);
  }, []);

  /**
   * タイマーが終わったら、最低ラインを自動で記録する。
   *
   * 始められた時点で目的は果たされているので、
   * 改めてボタンを押させない。すでに最低ライン以上の記録が
   * あるときは上書きしない。
   */
  const onTimerFinish = async (habitId: number) => {
    const habit = await findHabit(habitId);
    if (!habit) return;
    const date = dk.today();
    const existing = await findLog(habitId, date);
    if (!existing || existing.achievedValue < habit.minimumTarget) {
      await recordMinimum(habit, date);
    }
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

  const showToast = (next: Toast) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  };

  /** 記録を実行して再読み込みし、取り消し手段を添えて知らせる。 */
  const act = async (habit: Habit, action: () => Promise<unknown>) => {
    const previous = await findLog(habit.id!, today);
    await action();
    await load();
    showToast({
      message: `${habit.name} を記録しました`,
      undo: async () => {
        // 誤タップの取り消しで、元の記録まで消えないように戻す。
        await restore(habit, previous, today);
        await load();
        setToast(null);
      },
    });
  };

  const askValue = async (habit: Habit, current: number) => {
    const input = prompt(
      `${habit.name} の今日の実績(${habit.unit})\n` +
        `最低 ${habit.minimumTarget} / 通常 ${habit.normalTarget}`,
      String(current),
    );
    if (input === null) return;
    const value = Number(input);
    if (!Number.isFinite(value) || value < 0) return;
    await act(habit, () => record({ habit, value, date: today }));
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

  return (
    <div class="app">
      <header class="topbar">
        <h1>今日</h1>
        <span class="date">
          {dk.format(today)}({WEEKDAY_LABELS[dk.weekday(today) - 1]})
        </span>
        <span class="spacer" />
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
        views.map((view) => (
          <HabitCard
            key={view.entry.habit.id}
            view={view}
            today={today}
            onNormal={() =>
              act(view.entry.habit, () => recordNormal(view.entry.habit, today))
            }
            onMinimum={() =>
              act(view.entry.habit, () =>
                recordMinimum(view.entry.habit, today),
              )
            }
            onRest={() =>
              act(view.entry.habit, () => markRest(view.entry.habit, today))
            }
            onClear={async () => {
              await clearLog(view.entry.habit.id!, today);
              await load();
            }}
            onCustom={() =>
              askValue(view.entry.habit, view.entry.log?.achievedValue ?? 0)
            }
            onEdit={() => setEditing({ habit: view.entry.habit })}
            timerRemainingMs={
              timer.timer?.habitId === view.entry.habit.id
                ? timer.remainingMs
                : null
            }
            onStartTimer={() =>
              timer.start(
                view.entry.habit.id!,
                view.entry.habit.timerMinutes ?? 5,
              )
            }
            onStopTimer={timer.stop}
          />
        ))
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

async function restore(
  habit: Habit,
  previous: HabitLog | undefined,
  date: DateKey,
) {
  if (!previous) {
    await clearLog(habit.id!, date);
    return;
  }
  if (previous.level === 'rest') {
    await markRest(habit, date);
    return;
  }
  await record({ habit, value: previous.achievedValue, date });
}
