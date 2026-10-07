import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Habit, HabitLog } from './models';

/**
 * IndexedDB のスキーマ。
 *
 * localStorage でも足りる容量だが、工程4で SRS のカードが入ると
 * 数千件になるため、最初から IndexedDB にしておく。
 */
interface RoutineDB extends DBSchema {
  habits: {
    key: number;
    value: Habit;
    indexes: { archived_order: [number, number] };
  };
  logs: {
    key: number;
    value: HabitLog;
    // 1習慣1日1行を DB 側で保証する。二重に入ると連続記録が壊れるため。
    indexes: { habit_date: [number, string]; date: string };
  };
}

export type RoutineDatabase = IDBPDatabase<RoutineDB>;

let opening: Promise<RoutineDatabase> | null = null;

export function database(): Promise<RoutineDatabase> {
  if (!opening) {
    opening = openDB<RoutineDB>('routine', 1, {
      upgrade(db) {
        const habits = db.createObjectStore('habits', {
          keyPath: 'id',
          autoIncrement: true,
        });
        habits.createIndex('archived_order', ['archived', 'sortOrder']);

        const logs = db.createObjectStore('logs', {
          keyPath: 'id',
          autoIncrement: true,
        });
        logs.createIndex('habit_date', ['habitId', 'date'], { unique: true });
        logs.createIndex('date', 'date');
      },
    });
  }
  return opening;
}
