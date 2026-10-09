/** 'YYYY-MM-DD' 形式の日付キー。 */
export type DateKey = string;

export type HabitType = 'study' | 'exercise' | 'other';

/**
 * 1日の達成レベル。
 *
 * 'rest' を 'missed' と別の値にしているのが設計上の肝で、
 * 休息日は連続記録を切らさないし、未達としてもカウントしない。
 */
export type LogLevel = 'normal' | 'minimum' | 'rest' | 'missed';

export const LEVEL_LABEL: Record<LogLevel, string> = {
  normal: '達成',
  minimum: '最低ライン',
  rest: '休息',
  missed: '未達',
};

/** 連続記録に加算されるか。 */
export const isAchieved = (level: LogLevel | undefined): boolean =>
  level === 'normal' || level === 'minimum';

/** 連続記録を切るか。 */
export const breaksStreak = (level: LogLevel | undefined): boolean =>
  level === 'missed';

export interface Habit {
  id?: number;
  name: string;
  type: HabitType;
  /** 単位(枚 / 回 / 分 など)。表示用。 */
  unit: string;
  /** 通常ライン。これ以上で 'normal'。 */
  normalTarget: number;
  /** 最低ライン。これ以上 normalTarget 未満で 'minimum'。 */
  minimumTarget: number;
  /** 休息日の曜日。1(月)〜7(日)。 */
  restDays: number[];
  /** 予定時刻 'HH:MM'。iOS ではショートカットの設定に使う目安。 */
  triggerTime?: string;
  /** 「とりあえず始める」タイマーの長さ(分)。未設定なら5分。 */
  timerMinutes?: number;
  /** 実行場所のタグ(研究室 / 自宅 / ジム)。 */
  contextTag?: string;
  archived: boolean;
  sortOrder: number;
  createdAt: DateKey;
}

/** 1回分の記録。1日に何度かに分けてやった分を個別に残す。 */
export interface SessionEntry {
  /** 記録した時刻(ISO 文字列)。 */
  at: string;
  /** そのとき足した量。 */
  value: number;
}

export interface HabitLog {
  id?: number;
  habitId: number;
  date: DateKey;
  /** その日の合計。sessions の合計と一致する。 */
  achievedValue: number;
  level: LogLevel;
  /**
   * その日の個々の記録。
   *
   * 1日1行のまま中に配列を持たせている。行を増やすと
   * 連続記録の計算が壊れるため。この項目が無い古い行も
   * そのまま読めるよう、読み出し側で合計から補う。
   */
  sessions?: SessionEntry[];
  contextTag?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

/** ホーム画面1行分。習慣と、その日のログ(未記録なら undefined)。 */
export interface TodayEntry {
  habit: Habit;
  log?: HabitLog;
}

export const isRestDay = (habit: Habit, date: DateKey): boolean =>
  habit.restDays.includes(dk.weekday(date));

/** 実績値から達成レベルを判定する。休息日の扱いは呼び出し側が先に処理する。 */
export const levelFor = (habit: Habit, value: number): LogLevel => {
  if (value >= habit.normalTarget) return 'normal';
  if (value >= habit.minimumTarget) return 'minimum';
  return 'missed';
};

/**
 * 日付の操作。
 *
 * Date ではなく 'YYYY-MM-DD' の文字列を基本形にしている。
 * 文字列のまま加減算すればタイムゾーンや夏時間の影響を受けず、
 * 辞書順がそのまま日付順になるので範囲の比較も単純になる。
 */
export const dk = {
  of(d: Date): DateKey {
    const y = String(d.getFullYear()).padStart(4, '0');
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  today(): DateKey {
    return dk.of(new Date());
  },

  parse(key: DateKey): Date {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  },

  addDays(key: DateKey, days: number): DateKey {
    const d = dk.parse(key);
    d.setDate(d.getDate() + days);
    return dk.of(d);
  },

  /** 1(月)〜7(日)。JS の getDay() は 0=日 なので変換する。 */
  weekday(key: DateKey): number {
    const n = dk.parse(key).getDay();
    return n === 0 ? 7 : n;
  },

  /** 月曜はじまりの週の開始日。 */
  weekStart(key: DateKey): DateKey {
    return dk.addDays(key, -(dk.weekday(key) - 1));
  },

  monthStart(key: DateKey): DateKey {
    return `${key.slice(0, 7)}-01`;
  },

  monthEnd(key: DateKey): DateKey {
    const d = dk.parse(key);
    return dk.of(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  },

  /** 両端を含む日付の列。 */
  range(from: DateKey, to: DateKey): DateKey[] {
    const out: DateKey[] = [];
    let cursor = from;
    while (cursor <= to) {
      out.push(cursor);
      cursor = dk.addDays(cursor, 1);
    }
    return out;
  },

  format(key: DateKey): string {
    const d = dk.parse(key);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  },
};

export const WEEKDAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'];

/** 'HH:MM' 形式の時刻。セッション一覧の表示用。 */
export function formatClock(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * ログからセッション一覧を取り出す。
 * sessions を持たない古い行は、合計を1回分として扱う。
 */
export function sessionsOf(log: HabitLog | undefined): SessionEntry[] {
  if (!log || log.level === 'rest') return [];
  if (log.sessions?.length) return log.sessions;
  if (log.achievedValue > 0) {
    return [{ at: log.createdAt, value: log.achievedValue }];
  }
  return [];
}
