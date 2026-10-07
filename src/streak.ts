import {
  breaksStreak,
  dk,
  isAchieved,
  isRestDay,
  type DateKey,
  type Habit,
  type LogLevel,
} from './models';

export interface StreakResult {
  /** 現在の連続日数。休息日は加算されないが、途切れもしない。 */
  current: number;
  /** 過去最長の連続日数。 */
  longest: number;
  /**
   * 現在の連続のうち、最低ラインで繋いだ日数。
   * 「無理をせず続いている」ことを可視化するために使う。
   */
  currentMinimumDays: number;
}

export const EMPTY_STREAK: StreakResult = {
  current: 0,
  longest: 0,
  currentMinimumDays: 0,
};

export type LevelMap = Record<DateKey, LogLevel>;

/**
 * 連続記録の計算。DB に依存しない純粋な関数なので単体テストできる。
 *
 * 設計の肝は「未達以外では途切れない」こと。
 * - 通常ライン / 最低ライン → 加算する
 * - 休息日 → 加算も途切れもせず素通りする
 * - 未達 → 途切れる
 * - 未記録 → その日が休息日なら素通り、そうでなければ途切れる
 *   ただし「今日」はまだ終わっていないので、未記録でも途切れさせない
 */
export function computeStreak(
  habit: Habit,
  levels: LevelMap,
  today: DateKey = dk.today(),
): StreakResult {
  const start = habit.createdAt;
  if (today < start) return EMPTY_STREAK;

  // --- 現在の連続記録: 今日から過去へ遡る ---
  let current = 0;
  let currentMinimumDays = 0;
  let cursor = today;

  while (cursor >= start) {
    const level = levels[cursor];
    const isToday = cursor === today;

    if (level === undefined) {
      // 未記録。今日と休息日は素通り、それ以外は途切れ。
      if (isToday || isRestDay(habit, cursor)) {
        cursor = dk.addDays(cursor, -1);
        continue;
      }
      break;
    }
    if (breaksStreak(level)) {
      // 今日の未達だけは猶予を与える(まだ挽回できるため)。
      if (isToday) {
        cursor = dk.addDays(cursor, -1);
        continue;
      }
      break;
    }
    if (level === 'rest') {
      cursor = dk.addDays(cursor, -1);
      continue;
    }

    current += 1;
    if (level === 'minimum') currentMinimumDays += 1;
    cursor = dk.addDays(cursor, -1);
  }

  // --- 最長記録: 作成日から今日へ走査する ---
  let longest = 0;
  let running = 0;
  for (const day of dk.range(start, today)) {
    const level = levels[day];
    if (level === undefined) {
      if (isRestDay(habit, day) || day === today) continue;
      running = 0;
      continue;
    }
    if (level === 'rest') continue;
    if (breaksStreak(level)) {
      if (day === today) continue;
      running = 0;
      continue;
    }
    running += 1;
    if (running > longest) longest = running;
  }
  if (current > longest) longest = current;

  return { current, longest, currentMinimumDays };
}

/** 期間内の達成率。休息日と未記録の今日は母数から除く。 */
export function achievementRate(
  habit: Habit,
  levels: LevelMap,
  from: DateKey,
  to: DateKey,
  today: DateKey = dk.today(),
): number {
  let total = 0;
  let achieved = 0;

  for (const day of dk.range(from, to)) {
    if (day < habit.createdAt) continue;
    if (day > today) break;

    const level = levels[day];
    if (level === 'rest') continue;
    if (level === undefined) {
      if (isRestDay(habit, day) || day === today) continue;
      total += 1; // 未記録は未達として母数に入れる
      continue;
    }
    total += 1;
    if (isAchieved(level)) achieved += 1;
  }
  return total === 0 ? 0 : achieved / total;
}
