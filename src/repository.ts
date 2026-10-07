import { database } from './db';
import {
  computeStreak,
  type LevelMap,
  type StreakResult,
} from './streak';
import {
  breaksStreak,
  dk,
  isRestDay,
  levelFor,
  type DateKey,
  type Habit,
  type HabitLog,
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
 * 実績値を指定して記録する。達成レベルは levelFor が決める。
 *
 * 最低ライン未満の値を記録した場合は 'missed' になるが、
 * 実績値そのものは残る(「0 ではなかった」ことを振り返りで使う)。
 */
export async function record(options: {
  habit: Habit;
  value: number;
  date?: DateKey;
  contextTag?: string;
  note?: string;
}): Promise<HabitLog> {
  const { habit, value } = options;
  return upsert({
    habit,
    date: options.date ?? dk.today(),
    value,
    level: levelFor(habit, value),
    contextTag: options.contextTag ?? habit.contextTag,
    note: options.note,
  });
}

export const recordNormal = (habit: Habit, date?: DateKey) =>
  record({ habit, value: habit.normalTarget, date });

export const recordMinimum = (habit: Habit, date?: DateKey) =>
  record({ habit, value: habit.minimumTarget, date });

/**
 * 既存の実績に加算する。SRS の復習枚数など、
 * 1日に何度かに分けて積み上がる習慣で使う。
 */
export async function addProgress(
  habit: Habit,
  delta: number,
  date: DateKey = dk.today(),
): Promise<HabitLog> {
  const existing = await findLog(habit.id!, date);
  // 休息として記録済みの日に実績が入ったら、休息を上書きして加算する。
  const base =
    !existing || existing.level === 'rest' ? 0 : existing.achievedValue;
  return record({ habit, value: base + delta, date });
}

/** 休息日として記録する。連続記録は途切れない。 */
export const markRest = (habit: Habit, date: DateKey = dk.today()) =>
  upsert({
    habit,
    date,
    value: 0,
    level: 'rest',
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

async function upsert(options: {
  habit: Habit;
  date: DateKey;
  value: number;
  level: HabitLog['level'];
  contextTag?: string;
  note?: string;
}): Promise<HabitLog> {
  const db = await database();
  const habitId = options.habit.id!;
  const now = new Date().toISOString();
  const existing = await findLog(habitId, options.date);

  // createdAt は残したいので、既存行があれば引き継ぐ。
  const log: HabitLog = {
    id: existing?.id,
    habitId,
    date: options.date,
    achievedValue: options.value,
    level: options.level,
    contextTag: options.contextTag,
    note: options.note ?? existing?.note,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const id = await db.put('logs', log);
  return { ...log, id: id as number };
}

// ---------------- 集計 ----------------

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
