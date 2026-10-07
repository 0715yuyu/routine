import {
  isAchieved,
  isRestDay,
  LEVEL_LABEL,
  type DateKey,
  type TodayEntry,
} from '../models';
import type { LevelMap, StreakResult } from '../streak';
import { WeekDots } from './WeekDots';

export interface HabitDayView {
  entry: TodayEntry;
  weekLevels: LevelMap;
  streak: StreakResult;
}

export function HabitCard(props: {
  view: HabitDayView;
  today: DateKey;
  onNormal: () => void;
  onMinimum: () => void;
  onRest: () => void;
  onClear: () => void;
  onCustom: () => void;
  onEdit: () => void;
}) {
  const { habit, log } = props.view.entry;
  const { streak } = props.view;
  const level = log?.level;
  const value = log?.achievedValue ?? 0;

  const restToday =
    (level === 'rest' || isRestDay(habit, props.today)) && !isAchieved(level);

  const progress = Math.min(1, value / habit.normalTarget) * 100;
  const minimumAt =
    Math.min(1, habit.minimumTarget / habit.normalTarget) * 100;

  return (
    <div class="card">
      <div class="card-head">
        <div style="flex:1">
          <h2 class="card-title">{habit.name}</h2>
          <div class="card-meta">
            {streak.current > 0 && (
              <span class="streak">{streak.current}日連続</span>
            )}
            {/* 「最低ラインで繋いだ日」をあえて見せる。
                無理をしていない日も記録のうちだと示すため。 */}
            {streak.current > 0 && streak.currentMinimumDays > 0 && (
              <span>(うち最低ライン{streak.currentMinimumDays}日)</span>
            )}
            {streak.current === 0 && streak.longest > 0 && (
              <span>最長{streak.longest}日</span>
            )}
          </div>
        </div>
        {habit.contextTag && <span class="tag">{habit.contextTag}</span>}
        <button class="icon-button" onClick={props.onEdit} aria-label="編集">
          ⋯
        </button>
      </div>

      {restToday ? (
        <div class="rest-row">
          <span>今日は休息日</span>
          <span class="spacer" />
          {/* 休息日でもやりたい日はある。記録の道は塞がない。 */}
          <button class="link-button" onClick={props.onMinimum}>
            やる
          </button>
        </div>
      ) : (
        <>
          <div class="progress-row">
            <button
              class="link-button"
              style="padding:0"
              onClick={props.onCustom}
            >
              {value} / {habit.normalTarget}
              {habit.unit}
            </button>
            {level && (
              <span class={`level${isAchieved(level) ? ' done' : ''}`}>
                {LEVEL_LABEL[level]}
              </span>
            )}
          </div>

          <div class="track">
            <div class="fill" style={{ width: `${progress}%` }} />
            <div class="minimum-mark" style={{ left: `${minimumAt}%` }} />
          </div>

          <div class="actions">
            {/* 最低ラインを左、通常ラインを右に置く。
                疲れている日に最初に目に入る位置が最低ライン。 */}
            <button class="btn-minimum" onClick={props.onMinimum}>
              最低 {habit.minimumTarget}
              {habit.unit}
            </button>
            <button
              class={`btn-normal${level === 'normal' ? ' done' : ''}`}
              onClick={props.onNormal}
            >
              達成 {habit.normalTarget}
              {habit.unit}
            </button>
          </div>
          <div class="rest-row" style="margin-top:12px;font-size:13px">
            <button
              class="link-button"
              style="padding:0;font-size:13px"
              onClick={props.onRest}
            >
              今日は休む
            </button>
            <span class="spacer" />
            {log && (
              <button
                class="link-button"
                style="padding:0;font-size:13px"
                onClick={props.onClear}
              >
                記録を取り消す
              </button>
            )}
          </div>
        </>
      )}

      <WeekDots
        habit={habit}
        levels={props.view.weekLevels}
        today={props.today}
      />
    </div>
  );
}
