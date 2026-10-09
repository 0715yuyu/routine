import { database } from './db';
import {
  computeStreak,
  type LevelMap,
  type StreakResult,
} from './streak';
import {
  breaksStreak,
  dk,
  isAchieved,
  isRestDay,
  levelFor,
  sessionsOf,
  type DateKey,
  type Habit,
  type HabitLog,
  type SessionEntry,
  type TodayEntry,
} from './models';

/** 週次振り返りで「未達だった日」を一覧表示するための1件。 */
export interface MissedDay {
  habit: Habit;
  date: DateKey;
  /** 記録そのものが無かった(=つけ忘れ)か。 */
  unrecorded: boolean;
}

// ---------------- Habit ----------------

export async function createHabit(
  habit: Omit<Habit, 'id'>,
): Promise<number> {
  const db = await database();
  return db.add('habits', habit as Habit) as Promise<number>;
}

export async function updateHabit(habit: Habit): Promise<void> {
  const db = await database();
  await db.put('habits', habit);
}

/**
 * 習慣は削除せずアーカイブする。
 * 削除すると過去のログも消え、カレンダーの履歴に穴が空くため。
 */
export async function archiveHabit(habitId: number): Promise<void> {
  const db = await database();
  const habit = await db.get('habits', habitId);
  if (habit) await db.put('habits', { ...habit, archived: true });
}

export async function activeHabits(): Promise<Habit[]> {
  const db = await database();
  const all = await db.getAll('habits');
  return all
    .filter((h) => !h.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder || (a.id ?? 0) - (b.id ?? 0));
}

export async function findHabit(habitId: number): Promise<Habit | undefined> {
  const db = await database();
  return db.get('habits', habitId);
}

// ---------------- Log ----------------

export async function findLog(
  habitId: number,
  date: DateKey,
): Promise<HabitLog | undefined> {
  const db = await database();
  return db.getFromIndex('logs', 'habit_date', [habitId, date]);
}

/** ホーム画面1画面分。習慣とその日のログを束ねて返す。 */
export async function entriesFor(date: DateKey): Promise<TodayEntry[]> {
  const db = await database();
  const habits = await activeHabits();
  if (habits.length === 0) return [];

  const logs = await db.getAllFromIndex('logs', 'date', date);
  const byHabit = new Map(logs.map((log) => [log.habitId, log]));
  return habits.map((habit) => ({ habit, log: byHabit.get(habit.id!) }));
}

/**
 * 1回分を足す。1日に何度もやる場合の基本操作。
 *
 * 合計を書き換えるのではなく積み上げるので、朝に1段落・
 * 夜に3段落といった記録が両方残る。休息として記録済みの日に
 * 実績が入ったら、休息を上書きして0から積み直す。
 */
export async function addSession(
  habit: Habit,
  delta: number,
  date: DateKey = dk.today(),
): Promise<HabitLog> {
  const existing = await findLog(habit.id!, date);
  const previous = sessionsOf(existing);
  const base = previous.reduce((sum, s) => sum + s.value, 0);
  const total = base + delta;

  return upsert({
    habit,
    date,
    value: total,
    level: levelFor(habit, total),
    sessions: [...previous, { at: new Date().toISOString(), value: delta }],
    contextTag: habit.contextTag,
    note: existing?.note,
  });
}

export const addMinimum = (habit: Habit, date?: DateKey) =>
  addSession(habit, habit.minimumTarget, date);

export const addNormal = (habit: Habit, date?: DateKey) =>
  addSession(habit, habit.normalTarget, date);

/**
 * その日の合計を直接指定する。
 * 「数値を入力して記録」で使う。セッションは1件にまとめ直す。
 */
export async function setTotal(
  habit: Habit,
  value: number,
  date: DateKey = dk.today(),
): Promise<HabitLog> {
  const existing = await findLog(habit.id!, date);
  return upsert({
    habit,
    date,
    value,
    level: levelFor(habit, value),
    sessions: value > 0 ? [{ at: new Date().toISOString(), value }] : [],
    contextTag: habit.contextTag,
    note: existing?.note,
  });
}

/** 休息日として記録する。連続記録は途切れない。 */
export const markRest = (habit: Habit, date: DateKey = dk.today()) =>
  upsert({
    habit,
    date,
    value: 0,
    level: 'rest',
    sessions: [],
    contextTag: undefined,
    note: undefined,
  });

/** 記録を取り消して未記録に戻す。 */
export async function clearLog(
  habitId: number,
  date: DateKey,
): Promise<void> {
  const db = await database();
  const existing = await findLog(habitId, date);
  if (existing?.id !== undefined) await db.delete('logs', existing.id);
}

/**
 * 取り消し用。直前のログをそのまま書き戻す。
 * 記録前が未記録だった場合は削除する。
 */
export async function restoreLog(
  habitId: number,
  date: DateKey,
  previous: HabitLog | undefined,
): Promise<void> {
  if (!previous) {
    await clearLog(habitId, date);
    return;
  }
  const db = await database();
  await db.put('logs', previous);
}

async function upsert(options: {
  habit: Habit;
  date: DateKey;
  value: number;
  level: HabitLog['level'];
  sessions: SessionEntry[];
  contextTag?: string;
  note?: string;
}): Promise<HabitLog> {
  const db = await database();
  const habitId = options.habit.id!;
  const now = new Date().toISOString();
  const existing = await findLog(habitId, options.date);

  // createdAt は残したいので、既存行があれば引き継ぐ。
  const log: HabitLog = {
    habitId,
    date: options.date,
    achievedValue: options.value,
    level: options.level,
    sessions: options.sessions,
    contextTag: options.contextTag,
    note: options.note,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  // 新規行では id の項目自体を渡さない。id: undefined を入れると
  // 仕様に厳密な実装が「不正なキー」として弾く(自動採番されない)。
  if (existing?.id !== undefined) log.id = existing.id;

  const id = await db.put('logs', log);
  return { ...log, id: id as number };
}

// ---------------- 集計 ----------------

/** その習慣の全ログ。自分用の規模(年365件)なので全件読んで問題ない。 */
export async function allLogsOf(habitId: number): Promise<HabitLog[]> {
  const db = await database();
  return db.getAllFromIndex(
    'logs',
    'habit_date',
    IDBKeyRange.bound([habitId, '0000-00-00'], [habitId, '9999-99-99']),
  );
}

/**
 * 期間内の日付 → レベルの対応表。
 * カレンダー表示と連続記録の計算の両方で使う。
 */
export async function levelsBetween(
  habitId: number,
  from: DateKey,
  to: DateKey,
): Promise<LevelMap> {
  const db = await database();
  const logs = await db.getAllFromIndex(
    'logs',
    'habit_date',
    IDBKeyRange.bound([habitId, from], [habitId, to]),
  );
  const map: LevelMap = {};
  for (const log of logs) map[log.date] = log.level;
  return map;
}

export async function streakOf(
  habit: Habit,
  today: DateKey = dk.today(),
): Promise<StreakResult> {
  const levels = await levelsBetween(habit.id!, habit.createdAt, today);
  return computeStreak(habit, levels, today);
}

/**
 * 累積の集計。
 *
 * 連続記録は途切れると 0 に戻るので、達成感の支えには向かない。
 * 合計と達成日数は減らないので、こちらを前面に出す。
 */
export interface HabitTotals {
  /** 指定月の合計実績。 */
  monthTotal: number;
  /** 通算の合計実績。 */
  allTotal: number;
  /** 指定月に通常ラインを達成した日数。 */
  monthNormalDays: number;
  /** 指定月に最低ラインで繋いだ日数。 */
  monthMinimumDays: number;
  /** 指定月の休息日数。 */
  monthRestDays: number;
  /** 通算で達成(通常+最低)した日数。 */
  allAchievedDays: number;
  /** 指定月の日付 → レベル。カレンダー表示用。 */
  monthLevels: LevelMap;
}

export async function totalsOf(
  habitId: number,
  month: DateKey = dk.today(),
): Promise<HabitTotals> {
  const logs = await allLogsOf(habitId);
  const prefix = month.slice(0, 7); // 'YYYY-MM'

  const totals: HabitTotals = {
    monthTotal: 0,
    allTotal: 0,
    monthNormalDays: 0,
    monthMinimumDays: 0,
    monthRestDays: 0,
    allAchievedDays: 0,
    monthLevels: {},
  };

  for (const log of logs) {
    totals.allTotal += log.achievedValue;
    if (isAchieved(log.level)) totals.allAchievedDays += 1;

    if (log.date.startsWith(prefix)) {
      totals.monthLevels[log.date] = log.level;
      totals.monthTotal += log.achievedValue;
      if (log.level === 'normal') totals.monthNormalDays += 1;
      if (log.level === 'minimum') totals.monthMinimumDays += 1;
      if (log.level === 'rest') totals.monthRestDays += 1;
    }
  }
  return totals;
}

/**
 * 週次振り返り用。指定週のうち、未達・つけ忘れだった日を集める。
 * 休息日と未来の日付は含めない。
 */
export async function missedDaysInWeek(
  anyDayOfWeek: DateKey,
  today: DateKey = dk.today(),
): Promise<MissedDay[]> {
  const start = dk.weekStart(anyDayOfWeek);
  const end = dk.addDays(start, 6);
  const habits = await activeHabits();
  const result: MissedDay[] = [];

  for (const habit of habits) {
    const levels = await levelsBetween(habit.id!, start, end);
    for (const day of dk.range(start, end)) {
      if (day > today) break;
      if (day < habit.createdAt) continue;
      if (isRestDay(habit, day)) continue;

      const level = levels[day];
      if (level === undefined) {
        result.push({ habit, date: day, unrecorded: true });
      } else if (breaksStreak(level)) {
        result.push({ habit, date: day, unrecorded: false });
      }
    }
  }
  return result;
}

// ---------------- バックアップ ----------------

/**
 * 全データを JSON にする。
 *
 * iOS では、1週間アプリを開かないと IndexedDB ごと削除される。
 * Safari の履歴消去でも消える。この機能は任意ではなく必須。
 */
export async function exportAll(): Promise<string> {
  const db = await database();
  const [habits, logs] = await Promise.all([
    db.getAll('habits'),
    db.getAll('logs'),
  ]);
  return JSON.stringify(
    { version: 1, exportedAt: new Date().toISOString(), habits, logs },
    null,
    2,
  );
}

/** エクスポートした JSON を復元する。既存データは置き換える。 */
export async function importAll(json: string): Promise<void> {
  const parsed = JSON.parse(json) as { habits: Habit[]; logs: HabitLog[] };
  if (!Array.isArray(parsed.habits) || !Array.isArray(parsed.logs)) {
    throw new Error('形式が違います');
  }
  const db = await database();
  const tx = db.transaction(['habits', 'logs'], 'readwrite');
  await tx.objectStore('habits').clear();
  await tx.objectStore('logs').clear();
  for (const habit of parsed.habits) await tx.objectStore('habits').put(habit);
  for (const log of parsed.logs) await tx.objectStore('logs').put(log);
  await tx.done;
}
