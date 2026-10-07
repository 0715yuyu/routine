import { useState } from 'preact/hooks';
import {
  dk,
  WEEKDAY_LABELS,
  type Habit,
  type HabitType,
} from '../models';
import { archiveHabit, createHabit, updateHabit } from '../repository';

/** 習慣の作成・編集。habit が未指定なら新規作成。 */
export function HabitEditor(props: {
  habit?: Habit;
  onClose: (changed: boolean) => void;
}) {
  const h = props.habit;
  const isNew = !h;

  const [name, setName] = useState(h?.name ?? '');
  const [type, setType] = useState<HabitType>(h?.type ?? 'study');
  const [unit, setUnit] = useState(h?.unit ?? '回');
  const [normal, setNormal] = useState(h ? String(h.normalTarget) : '');
  const [minimum, setMinimum] = useState(h ? String(h.minimumTarget) : '');
  const [restDays, setRestDays] = useState<number[]>(h?.restDays ?? []);
  const [time, setTime] = useState(h?.triggerTime ?? '');
  const [tag, setTag] = useState(h?.contextTag ?? '');
  const [error, setError] = useState<string | null>(null);

  const toggleRestDay = (weekday: number) =>
    setRestDays((days) =>
      days.includes(weekday)
        ? days.filter((d) => d !== weekday)
        : [...days, weekday],
    );

  const save = async () => {
    const n = Number(normal);
    const m = Number(minimum);

    if (!name.trim()) return setError('名前を入力してください');
    if (!unit.trim()) return setError('単位を入力してください');
    if (!Number.isInteger(n) || n <= 0) return setError('通常ラインは1以上の整数');
    if (!Number.isInteger(m) || m <= 0) return setError('最低ラインは1以上の整数');
    if (m > n) return setError('最低ラインは通常ライン以下にしてください');

    const base = {
      name: name.trim(),
      type,
      unit: unit.trim(),
      normalTarget: n,
      minimumTarget: m,
      restDays: [...restDays].sort(),
      triggerTime: time || undefined,
      contextTag: tag.trim() || undefined,
      archived: false,
      sortOrder: h?.sortOrder ?? 0,
      createdAt: h?.createdAt ?? dk.today(),
    };

    if (h?.id !== undefined) {
      await updateHabit({ ...base, id: h.id });
    } else {
      await createHabit(base);
    }
    props.onClose(true);
  };

  const archive = async () => {
    const ok = confirm(
      '一覧から外します。これまでの記録は残り、カレンダーの履歴も消えません。',
    );
    if (!ok || h?.id === undefined) return;
    await archiveHabit(h.id);
    props.onClose(true);
  };

  return (
    <div class="sheet">
      <div class="sheet-head">
        <h2>{isNew ? '習慣を追加' : '習慣を編集'}</h2>
        <button class="icon-button" onClick={() => props.onClose(false)}>
          閉じる
        </button>
      </div>

      <div class="field">
        <label>習慣の名前</label>
        <input
          value={name}
          placeholder="英語論文を読む / スクワット"
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
        />
      </div>

      <div class="field">
        <label>種類</label>
        <div class="chips">
          {(
            [
              ['study', '学習'],
              ['exercise', '運動'],
              ['other', 'その他'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              class={`chip${type === value ? ' on' : ''}`}
              onClick={() => setType(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div class="field">
        <div class="row">
          <div>
            <label>最低ライン</label>
            <input
              type="number"
              inputMode="numeric"
              value={minimum}
              onInput={(e) => setMinimum((e.target as HTMLInputElement).value)}
            />
          </div>
          <div>
            <label>通常ライン</label>
            <input
              type="number"
              inputMode="numeric"
              value={normal}
              onInput={(e) => setNormal((e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="narrow">
            <label>単位</label>
            <input
              value={unit}
              onInput={(e) => setUnit((e.target as HTMLInputElement).value)}
            />
          </div>
        </div>
        <p class="hint">
          最低ラインは「どんなに疲れていても必ずできる量」まで下げます。
          1段落、5回、3分。ここを低く設定できるかで続くかが決まります。
        </p>
      </div>

      <div class="field">
        <label>休息日</label>
        <div class="chips">
          {WEEKDAY_LABELS.map((label, i) => (
            <button
              key={label}
              class={`chip${restDays.includes(i + 1) ? ' on' : ''}`}
              onClick={() => toggleRestDay(i + 1)}
            >
              {label}
            </button>
          ))}
        </div>
        <p class="hint">
          選んだ曜日は、記録しなくても連続記録が途切れません。
        </p>
      </div>

      <div class="field">
        <label>予定時刻</label>
        <input
          type="time"
          value={time}
          onInput={(e) => setTime((e.target as HTMLInputElement).value)}
        />
        <p class="hint">
          Web からは通知を出せないので、この時刻は目安です。
          iOS の「ショートカット」アプリで、同じ時刻にこのアプリを開く
          オートメーションを作ると通知の代わりになります。
        </p>
      </div>

      <div class="field">
        <label>場所タグ(任意)</label>
        <input
          value={tag}
          placeholder="研究室 / 自宅 / ジム"
          onInput={(e) => setTag((e.target as HTMLInputElement).value)}
        />
        <p class="hint">
          週次の振り返りで「どこでできたか」を見るために使います。
        </p>
      </div>

      {error && <p class="error">{error}</p>}

      <button class="primary-wide" onClick={save}>
        保存
      </button>

      {!isNew && (
        <button class="danger-wide" onClick={archive}>
          この習慣をやめる
        </button>
      )}
    </div>
  );
}
