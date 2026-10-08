// A small on-phone store (IndexedDB) shared with the service worker (public/sw.js uses the same
// database and keys). It holds:
//   - 'snapshot': your last loaded categories and transactions, shown when there's no connection
//   - 'reminder': whether to remind you to import, and after how many days
//   - 'lastImport': the date your bank data currently ends, so the reminder can check it
//     in the background without the app open
import type { Category, Transaction } from '../types';

const DB = 'wealthwise';
const STORE = 'kv';

const open = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB, 1);
  req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

export const kvGet = async <T>(key: string): Promise<T | undefined> => {
  try {
    const db = await open();
    return await new Promise<T | undefined>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch { return undefined; }
};

export const kvSet = async (key: string, value: unknown): Promise<void> => {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      if (value === undefined) tx.objectStore(STORE).delete(key); else tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* storage unavailable: the app still works online */ }
};

export interface Snapshot { userId: string; savedAt: string; categories: Category[]; transactions: Transaction[] }

export const saveSnapshot = (s: Snapshot) => kvSet('snapshot', s);
export const loadSnapshot = async (userId: string): Promise<Snapshot | undefined> => {
  const s = await kvGet<Snapshot>('snapshot');
  return s && s.userId === userId ? s : undefined;
};
export const clearSnapshot = () => kvSet('snapshot', undefined);

export interface ReminderPrefs { on: boolean; days: number }
export const DEFAULT_REMINDER: ReminderPrefs = { on: false, days: 14 };
export const loadReminder = async () => ({ ...DEFAULT_REMINDER, ...(await kvGet<ReminderPrefs>('reminder')) });
export const saveReminder = (p: ReminderPrefs) => kvSet('reminder', p);
export const saveLastImport = (v: { bank: string; date: string } | undefined) => kvSet('lastImport', v);

// Ask Android to wake the app's background worker about twice a day to check (Chrome decides
// the exact timing, based on how often you use the app).
export const reminderSupport = () => {
  if (typeof window === 'undefined') return { notifications: false, background: false };
  return {
    notifications: 'Notification' in window && 'serviceWorker' in navigator,
    background: 'serviceWorker' in navigator && 'periodicSync' in (ServiceWorkerRegistration.prototype as any),
  };
};

export const registerReminderSync = async (on: boolean) => {
  try {
    const reg: any = await navigator.serviceWorker.ready;
    if (!reg.periodicSync) return false;
    if (!on) { await reg.periodicSync.unregister('import-reminder'); return true; }
    await reg.periodicSync.register('import-reminder', { minInterval: 12 * 60 * 60 * 1000 });
    return true;
  } catch { return false; }
};
