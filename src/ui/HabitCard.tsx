import {
  formatClock,
  isAchieved,
  isRestDay,
  LEVEL_LABEL,
  sessionsOf,
  type DateKey,
  type TodayEntry,
} from '../models';
import type { HabitTotals } from '../repository';
import type { LevelMap, StreakResult } from '../streak';
import { formatRemaining } from './useTimer';
import { WeekDots } from './WeekDots';

export interface HabitDayView {
  entry: TodayEntry;
  weekLevels: LevelMap;
  streak: StreakResult;
  totals: HabitTotals;
}

export function HabitCard(props: {
  view: HabitDayView;
  today: DateKey;
  onAddNormal: () => void;
  onAddMinimum: () => void;
  onRest: () => void;
  onClear: () => void;
  onCustom: () => void;
  onEdit: () => void;
  timerRemainingMs: number | null;
  onStartTimer: () => void;
  onStopTimer: () => void;
}) {
  const { habit, log } = props.view.entry;
  const { streak, totals } = props.view;
  const level = log?.level;
  const value = log?.achievedValue ?? 0;
  const sessions = sessionsOf(log);

  const restToday =
    (level === 'rest' || isRestDay(habit, props.today)) && !isAchieved(level);

  const progress = Math.min(1, value / habit.normalTarget) * 100;
  const minimumAt =
    Math.min(1, habit.minimumTarget / habit.normalTarget) * 100;
  const overflow = Math.max(0, value - habit.normalTarget);

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
              <span>(最低ライン{streak.currentMinimumDays}日)</span>
            )}
            {streak.current === 0 && streak.longest > 0 && (
              <span>最長{streak.longest}日</span>
            )}
            {/* 連続記録は途切れると 0 に戻るので、達成感の支えには
                ならない。減らない数字を隣に置いておく。 */}
            {totals.monthTotal > 0 && (
              <span class="total">
                今月 {totals.monthTotal}
                {habit.unit}
              </span>
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
          <button class="link-button" onClick={props.onAddMinimum}>
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
            {/* 超過した分を見せる。目標ぴったりで打ち切ると、
                多くやった日が報われない。 */}
            {overflow > 0 && <span class="overflow">+{overflow}</span>}
            <span class="spacer" />
            {level && (
              // key を付けてレベルが変わるたび作り直し、
              // 達成した瞬間に小さく animate させる。
              <span
                key={level}
                class={`level${isAchieved(level) ? ' done' : ''}`}
              >
                {LEVEL_LABEL[level]}
              </span>
            )}
          </div>

          <div class="track">
            <div class="fill" style={{ width: `${progress}%` }} />
            <div class="minimum-mark" style={{ left: `${minimumAt}%` }} />
          </div>

          {/* 1日に何度かやった記録。回数が見えること自体が手応えになる。 */}
          {sessions.length > 1 && (
            <div class="sessions">
              {sessions.map((s, i) => (
                <span key={`${s.at}-${i}`} class="session">
                  {formatClock(s.at)} <b>+{s.value}</b>
                </span>
              ))}
            </div>
          )}

          {props.timerRemainingMs === null ? (
            <button class="timer-start" onClick={props.onStartTimer}>
              {habit.timerMinutes ?? 5}分だけ始める
            </button>
          ) : (
            <div class="timer-running">
              <span class="timer-count">
                {formatRemaining(props.timerRemainingMs)}
              </span>
              <span class="spacer" />
              <button class="link-button" onClick={props.onStopTimer}>
                中止
              </button>
            </div>
          )}

          <div class="actions">
            {/* 加算式にして、1日に何度でも押せるようにした。
                最低ラインを左に置くのは変えない。疲れている日に
                最初に目に入る位置が最低ラインであるため。 */}
            <button class="btn-minimum" onClick={props.onAddMinimum}>
              <span class="btn-cap">最低ライン</span>
              <span class="btn-main">
                +{habit.minimumTarget}
                {habit.unit}
              </span>
            </button>
            <button class="btn-normal" onClick={props.onAddNormal}>
              <span class="btn-cap">通常ライン</span>
              <span class="btn-main">
                +{habit.normalTarget}
                {habit.unit}
              </span>
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
