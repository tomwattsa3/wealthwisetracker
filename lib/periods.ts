// Shared by the Dashboard (SpendingPatterns) and Category Sheets: period windows, month
// indexing and merchant grouping, so both pages agree on what "6 months" or "Careem" means.

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const TOM = ['1–7', '8–14', '15–21', '22–end'];

export const PERIODS = [
  { id: 'mtd', label: 'MTD' },
  { id: 'thisMonth', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: '3m', label: '3 months' },
  { id: '6m', label: '6 months' },
  { id: 'ytd', label: 'Year to date' },
  { id: '12m', label: '12 months' },
] as const;
export type PeriodId = typeof PERIODS[number]['id'];

// "YYYY-MM" month index, used as a sortable key.
export const monthKey = (date: string) => date.slice(0, 7);
export const keyToIndex = (key: string) => Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1;
export const indexLabel = (i: number) => MONTHS[i % 12];
export const indexToKey = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
export const daysIn = (i: number) => new Date(Math.floor(i / 12), (i % 12) + 1, 0).getDate();
export const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export interface PeriodWindow {
  start: string; // inclusive YYYY-MM-DD
  end: string;   // inclusive YYYY-MM-DD
  monthIdxs: number[];
  single: boolean; // one calendar month → day-by-day view
  dayLimit: number; // days of that month shown / counted (MTD stops at today)
  label: string;
  name: string; // plain period name for messages ("September 2026")
  prev: { start: string; end: string; label: string } | null; // equal-length period before it
}

export const inWindow = (d: string, w: { start: string; end: string }) => d.slice(0, 10) >= w.start && d.slice(0, 10) <= w.end;

// Calendar periods (MTD, this/last month, YTD) follow today's date; the rolling 3/6/12-month
// windows end at the latest imported month (lastIdx) instead, so un-imported months don't drag
// every average down.
export const computeWindow = (period: PeriodId, today: string, lastIdx: number): PeriodWindow => {
  const curIdx = keyToIndex(monthKey(today));
    const monthSpan = (idx: number, lastDay = daysIn(idx)) => ({ start: `${indexToKey(idx)}-01`, end: `${indexToKey(idx)}-${String(lastDay).padStart(2, '0')}` });
    const monthName = (idx: number) => `${FULL_MONTHS[idx % 12]} ${Math.floor(idx / 12)}`;
    const day = Number(today.slice(8, 10));
    if (period === 'mtd' || period === 'thisMonth' || period === 'lastMonth') {
      const idx = period === 'lastMonth' ? curIdx - 1 : curIdx;
      const limit = period === 'mtd' ? day : daysIn(idx);
      const prevLimit = period === 'mtd' ? Math.min(day, daysIn(idx - 1)) : daysIn(idx - 1);
      return {
        ...monthSpan(idx, limit),
        monthIdxs: [idx],
        single: true,
        dayLimit: limit,
        label: period === 'mtd' ? `${monthName(idx)} so far` : monthName(idx),
        name: monthName(idx),
        prev: { ...monthSpan(idx - 1, prevLimit), label: period === 'mtd' ? `the same days of ${FULL_MONTHS[(idx - 1) % 12]}` : FULL_MONTHS[(idx - 1) % 12] },
      };
    }
    if (period === 'ytd') {
      const y = Math.floor(curIdx / 12);
      const first = y * 12;
      return {
        start: `${y}-01-01`,
        end: today,
        monthIdxs: Array.from({ length: curIdx - first + 1 }, (_, i) => first + i),
        single: false,
        dayLimit: 0,
        label: `1 Jan – ${day} ${MONTHS[curIdx % 12]} ${y}`,
        name: `${y} so far`,
        prev: { start: `${y - 1}-01-01`, end: `${y - 1}${today.slice(4)}`, label: 'the same time last year' },
      };
    }
    const n = period === '3m' ? 3 : period === '6m' ? 6 : 12;
    const first = lastIdx - n + 1;
    return {
      start: monthSpan(first).start,
      end: monthSpan(lastIdx).end,
      monthIdxs: Array.from({ length: n }, (_, i) => first + i),
      single: false,
      dayLimit: 0,
      label: `${monthName(first)} – ${monthName(lastIdx)}`,
      name: `${monthName(first)} – ${monthName(lastIdx)}`,
      prev: { start: monthSpan(first - n).start, end: monthSpan(first - 1).end, label: `the previous ${n} months` },
    };
};

// Groups merchant descriptions that are the same payee written slightly differently
// ("Motor city llc - Parking" / "Motor city llc Parking", "Subscription fee for Jan 2026" /
// "... for Feb 2026", "Tesco Bank" / "Tesco Bank - Loan Payment") by their first two words once
// dates, numbers and punctuation are stripped.
export const merchantKey = (desc: string) => {
  const cleaned = desc
    .toLowerCase()
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.split(' ').slice(0, 2).join(' ') || desc.toLowerCase();
};

export const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
export const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
