import { dk, isRestDay, WEEKDAY_LABELS, type DateKey, type Habit } from '../models';
import type { LevelMap } from '../streak';

/**
 * 今週の達成状況を7個のドットで表す。
 *
 * 数字(連続日数)より先にここへ目が行くようにしている。
 * 「全部埋まっているか」ではなく「色がいくつあるか」を見る設計。
 */
export function WeekDots(props: {
  habit: Habit;
  levels: LevelMap;
  today: DateKey;
}) {
  const start = dk.weekStart(props.today);

  return (
    <div class="week">
      {WEEKDAY_LABELS.map((label, i) => {
        const day = dk.addDays(start, i);
        const isToday = day === props.today;
        // 休息日に設定した曜日は、記録がなくても休息として表示する。
        const level =
          props.levels[day] ??
          (isRestDay(props.habit, day) ? 'rest' : 'none');

        return (
          <div key={day} class={`week-day${isToday ? ' today' : ''}`}>
            {label}
            <div
              class={`dot ${level}${day > props.today ? ' future' : ''}`}
            />
          </div>
        );
      })}
    </div>
  );
}
