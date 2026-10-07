import { useEffect, useRef, useState } from 'preact/hooks';

const KEY = 'routine.timer';

export interface RunningTimer {
  habitId: number;
  /** 終了時刻(ミリ秒)。経過を数えるのではなく、終点を保存する。 */
  endsAt: number;
  minutes: number;
}

function readStored(): RunningTimer | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RunningTimer) : null;
  } catch {
    return null;
  }
}

function writeStored(timer: RunningTimer | null) {
  try {
    if (timer) localStorage.setItem(KEY, JSON.stringify(timer));
    else localStorage.removeItem(KEY);
  } catch {
    // プライベートブラウズなどで保存できなくても、動作自体は続ける。
  }
}

// 終了音。iOS は操作をきっかけにしないと音を出せないので、
// 「開始」のタップで AudioContext を作っておく。
let audio: AudioContext | null = null;

function prepareSound() {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    audio = null;
  }
}

function beep() {
  if (!audio) return;
  try {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, audio.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.6);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.6);
  } catch {
    // 音が出せなくても画面表示だけで成立する。
  }
}

/**
 * ひとつだけ走るタイマー。
 *
 * 同時に2つの習慣をやることはないので、意図的に1本に絞っている。
 * 新しく開始すると前のものは破棄される。
 */
export function useTimer(onFinish: (habitId: number) => void) {
  const [timer, setTimer] = useState<RunningTimer | null>(readStored);
  const [now, setNow] = useState(() => Date.now());
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;

  useEffect(() => {
    if (!timer) return;

    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, 500);
    // 画面に戻った瞬間にも取り直す。バックグラウンドでは
    // setInterval が止められるため、これがないと残り時間がずれる。
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [timer]);

  useEffect(() => {
    if (!timer || now < timer.endsAt) return;
    const finished = timer;
    writeStored(null);
    setTimer(null);
    beep();
    finishRef.current(finished.habitId);
  }, [now, timer]);

  const start = (habitId: number, minutes: number) => {
    prepareSound();
    const next: RunningTimer = {
      habitId,
      endsAt: Date.now() + minutes * 60_000,
      minutes,
    };
    writeStored(next);
    setTimer(next);
    setNow(Date.now());
  };

  const stop = () => {
    writeStored(null);
    setTimer(null);
  };

  /** 延長。「あと少し」で止めたくないときのため。 */
  const extend = (minutes: number) => {
    if (!timer) return;
    const next = { ...timer, endsAt: timer.endsAt + minutes * 60_000 };
    writeStored(next);
    setTimer(next);
  };

  return {
    timer,
    remainingMs: timer ? Math.max(0, timer.endsAt - now) : 0,
    start,
    stop,
    extend,
  };
}

export function formatRemaining(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
