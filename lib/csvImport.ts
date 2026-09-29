import Papa from 'papaparse';
import { Transaction, Bank, MerchantMapping } from '../types';

// Reads a bank statement CSV into transactions: detects the date/description/money columns,
// fills in whichever of GBP/AED is missing using that month's historical rate, and
// auto-categorises merchants that memory has seen 3+ times. Used by the Import CSV pop-up.

const AED_TO_GBP_RATE = 0.21;

// Historical GBP->AED rate, fetched per calendar month (keyed "YYYY-MM") and cached for the
// life of the page — used to fill in whichever currency an import doesn't provide, using the
// actual rate for that transaction's month instead of one flat rate applied everywhere. Backed
// by a free, keyless historical-rates API (no ECB feed publishes AED, so frankfurter.app etc.
// don't work here). Falls back to the static AED_TO_GBP_RATE if the fetch fails for any reason
// (offline, rate limited, a month with no published data) so an import never hard-fails on this.
const monthlyGbpToAedRateCache = new Map<string, number>();
const fetchMonthlyGbpToAedRate = async (month: string): Promise<number> => {
  const cached = monthlyGbpToAedRateCache.get(month);
  if (cached) return cached;
  const fallback = 1 / AED_TO_GBP_RATE;
  try {
    const res = await fetch(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${month}-01/v1/currencies/gbp.json`);
    if (!res.ok) throw new Error('rate fetch failed');
    const data = await res.json();
    const rate = data?.gbp?.aed;
    const resolved = typeof rate === 'number' && rate > 0 ? rate : fallback;
    monthlyGbpToAedRateCache.set(month, resolved);
    return resolved;
  } catch {
    monthlyGbpToAedRateCache.set(month, fallback);
    return fallback;
  }
};

const pad2 = (n: number): string => String(n).padStart(2, '0');

// Builds a YYYY-MM-DD string directly from parts instead of round-tripping through
// Date + toISOString(), which converts to UTC and silently shifts the date back a day
// whenever the local timezone is ahead of UTC (e.g. UK during BST, UAE at UTC+4).
const buildDateString = (year: number, month: number, day: number): string | null => {
  const d = new Date(year, month - 1, day);
  // Date() normalizes overflowing values (e.g. Feb 30 -> Mar 2) instead of erroring,
  // so this catches genuinely invalid dates.
  if (isNaN(d.getTime()) || d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
};

// A 4-digit year within a sane range for a real transaction — used to disambiguate which way
// round an 8-digit compact date reads, since both orderings can independently parse into a
// technically-valid calendar date (e.g. "15062026" is validly either 15 Jun 2026 or the year
// 1506, June 20th).
const isPlausibleTransactionYear = (dateStr: string | null): boolean => {
  if (!dateStr) return false;
  const year = Number(dateStr.slice(0, 4));
  return year >= 2000 && year <= 2100;
};

// Bank statements export dates as DD/MM/YYYY, but `new Date(str)` assumes US MM/DD/YYYY
// for slash-separated strings, silently swapping day/month whenever the day is <= 12.
// Some banks (e.g. Wio) export a compact 8-digit string instead, with no separators at all —
// `new Date()` can't parse that, returning Invalid Date, so it's matched explicitly here. Which
// of the two common orderings (YYYYMMDD vs DDMMYYYY) it actually is varies by export, so both
// are tried and whichever produces a plausible, recent year wins — guessing wrong here used to
// silently fail validation and fall all the way through to defaulting to today's date instead
// of the real transaction date.
const parseTransactionDate = (rawDate: string): string => {
  const trimmed = String(rawDate).trim();

  const compactMatch = trimmed.match(/^(\d{8})$/);
  if (compactMatch) {
    const digits = compactMatch[1];
    const asYyyymmdd = buildDateString(Number(digits.slice(0, 4)), Number(digits.slice(4, 6)), Number(digits.slice(6, 8)));
    const asDdmmyyyy = buildDateString(Number(digits.slice(4, 8)), Number(digits.slice(2, 4)), Number(digits.slice(0, 2)));
    if (isPlausibleTransactionYear(asYyyymmdd)) return asYyyymmdd!;
    if (isPlausibleTransactionYear(asDdmmyyyy)) return asDdmmyyyy!;
    if (asYyyymmdd) return asYyyymmdd;
    if (asDdmmyyyy) return asDdmmyyyy;
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const built = buildDateString(Number(year), Number(month), Number(day));
    if (built) return built;
  }

  const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    const built = buildDateString(Number(year), Number(month), Number(day));
    if (built) return built;
  }

  const fallback = new Date(rawDate);
  if (!isNaN(fallback.getTime())) {
    return `${fallback.getFullYear()}-${pad2(fallback.getMonth() + 1)}-${pad2(fallback.getDate())}`;
  }
  const today = new Date();
  return `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
};

// `error` is set (and `transactions` empty) when the file can't be used.
export interface CsvParseResult { transactions: Omit<Transaction, 'id'>[]; autoCount: number; error?: string }

export const parseBankCsv = (file: File, bank: Bank, merchantMappings: MerchantMapping[]): Promise<CsvParseResult> =>
  new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      error: () => resolve({ transactions: [], autoCount: 0, error: "Couldn't read that file. Check it's a CSV export from your bank." }),
      complete: async (results) => {
        if (results.errors.length > 0) {
          resolve({ transactions: [], autoCount: 0, error: "Couldn't read that file. Check it's a CSV export from your bank." });
          return;
        }
        resolve(await buildTransactions(results.data as any[], results.meta.fields || [], bank, merchantMappings));
      },
    });
  });

const buildTransactions = async (
  data: any[],
  headers: string[],
  bank: Bank,
  merchantMappings: MerchantMapping[]
): Promise<CsvParseResult> => {
  // Column detection - matches your Supabase columns exactly
  const dateCol = headers.find(h => h === 'Transaction Date') || headers.find(h => /date|time/i.test(h));
  const descCol = headers.find(h => h === 'Description') || headers.find(h => /desc|narrative|merchant/i.test(h));
  const bankCol = headers.find(h => h === 'Bank Account') || headers.find(h => /bank/i.test(h));

  // Exact match for Money columns (matches Supabase schema)
  const moneyOutGBPCol = headers.find(h => h === 'Money Out - GBP') || headers.find(h => /money.*out.*gbp/i.test(h));
  const moneyInGBPCol = headers.find(h => h === 'Money In - GBP') || headers.find(h => /money.*in.*gbp/i.test(h));
  const moneyOutAEDCol = headers.find(h => h === 'Money Out - AED') || headers.find(h => /money.*out.*aed/i.test(h));
  const moneyInAEDCol = headers.find(h => h === 'Money In - AED') || headers.find(h => /money.*in.*aed/i.test(h));

  // Fallback to single amount column
  const amountCol = headers.find(h => /^amount$|^value$|^debit$|^credit$|^cost$/i.test(h));

  // Check if we have the multi-column format or single amount
  const hasMultiColumns = moneyOutGBPCol || moneyInGBPCol || moneyOutAEDCol || moneyInAEDCol;

  if (!dateCol || (!hasMultiColumns && !amountCol)) {
     return { transactions: [], autoCount: 0, error: "Couldn't find the right columns. The file needs a date column plus money columns (Money Out - GBP, Money In - GBP, …) or a single Amount column." };
  }

  let autoCategorizedCount = 0;

  // First pass (synchronous): parse every row, but don't fill in a missing currency yet —
  // just record which month's rate it'll need. This lets every unique month's historical
  // rate be fetched once, in parallel, instead of doing it serially per-row.
  interface StagedRow {
      dateStr: string;
      month: string;
      rawDesc: string;
      amountGBP: number;
      amountAED: number;
      needsGbpToAed: boolean;
      needsAedToGbp: boolean;
      isIncome: boolean;
      bankName: string;
      categoryId: string;
      categoryName: string;
      subcategoryName: string;
      wasAutoCategorized: boolean;
  }

  const staged: StagedRow[] = [];
  const monthsNeedingRate = new Set<string>();

  data.forEach((row) => {
      const rawDate = row[dateCol];
      const rawDesc = descCol ? row[descCol] : 'Unknown Transaction';
      const dateStr = parseTransactionDate(rawDate);
      const month = dateStr.slice(0, 7);

      let amountGBP = 0;
      let amountAED = 0;
      let isIncome = false;
      let needsGbpToAed = false;
      let needsAedToGbp = false;

      if (hasMultiColumns) {
          // Parse multi-column format. Math.abs guards against a stray minus sign already
          // present in the source CSV's Money In/Out cell — these columns should always be
          // a positive magnitude, with which column it's in (In vs Out) carrying direction.
          // Without it, a negative value here both mis-detects income vs expense below and
          // silently cancels out other transactions when summed elsewhere in the app.
          const moneyOutGBP = moneyOutGBPCol ? Math.abs(parseFloat(String(row[moneyOutGBPCol]).replace(/[^0-9.-]/g, '')) || 0) : 0;
          const moneyInGBP = moneyInGBPCol ? Math.abs(parseFloat(String(row[moneyInGBPCol]).replace(/[^0-9.-]/g, '')) || 0) : 0;
          const moneyOutAED = moneyOutAEDCol ? Math.abs(parseFloat(String(row[moneyOutAEDCol]).replace(/[^0-9.-]/g, '')) || 0) : 0;
          const moneyInAED = moneyInAEDCol ? Math.abs(parseFloat(String(row[moneyInAEDCol]).replace(/[^0-9.-]/g, '')) || 0) : 0;

          // Determine if income or expense
          isIncome = moneyInGBP > 0 || moneyInAED > 0;
          amountGBP = isIncome ? moneyInGBP : moneyOutGBP;
          amountAED = isIncome ? moneyInAED : moneyOutAED;

          // Skip rows with no amounts
          if (amountGBP === 0 && amountAED === 0) return;

          // If one currency is missing, convert from the other using that month's actual rate
          if (amountGBP === 0 && amountAED > 0) {
              needsAedToGbp = true;
              monthsNeedingRate.add(month);
          }
          if (amountAED === 0 && amountGBP > 0) {
              needsGbpToAed = true;
              monthsNeedingRate.add(month);
          }
      } else {
          // Single amount column (legacy format)
          const rawAmount = row[amountCol];
          let amountSource = parseFloat(String(rawAmount).replace(/[^0-9.-]/g, ''));
          if (isNaN(amountSource)) return;

          isIncome = amountSource >= 0;
          const isForeign = bank.currency !== 'GBP';
          if (isForeign) {
              amountAED = Math.abs(amountSource);
              needsAedToGbp = true;
          } else {
              amountGBP = Math.abs(amountSource);
              needsGbpToAed = true;
          }
          monthsNeedingRate.add(month);
      }

      // Use bank from CSV if available, otherwise use selected bank
      const bankName = bankCol && row[bankCol] ? row[bankCol] : bank.name;

      // Auto-categorize based on merchant mappings (threshold: 3+ times)
      const MAPPING_THRESHOLD = 3;
      let categoryId = '';
      let categoryName = '';
      let subcategoryName = '';
      let wasAutoCategorized = false;

      // Find matching merchant mapping (exact match on description)
      const mapping = merchantMappings.find(m =>
        m.merchant_pattern.toLowerCase() === rawDesc.toLowerCase()
      );

      // Only auto-categorize if the mapping has been confirmed 3+ times
      if (mapping && (mapping.count || 0) >= MAPPING_THRESHOLD) {
        categoryId = mapping.category_id;
        categoryName = mapping.category_name;
        subcategoryName = mapping.subcategory_name;
        wasAutoCategorized = true;
        autoCategorizedCount++;
      }

      staged.push({
          dateStr, month, rawDesc, amountGBP, amountAED, needsGbpToAed, needsAedToGbp,
          isIncome, bankName, categoryId, categoryName, subcategoryName, wasAutoCategorized
      });
  });

  // Fetch each distinct month's historical GBP->AED rate once, in parallel.
  const rateByMonth = new Map<string, number>();
  await Promise.all(Array.from(monthsNeedingRate).map(async (month) => {
      rateByMonth.set(month, await fetchMonthlyGbpToAedRate(month));
  }));

  const parsed: Omit<Transaction, 'id'>[] = staged.map((r) => {
      let amountGBP = r.amountGBP;
      let amountAED = r.amountAED;
      if (r.needsGbpToAed) {
          amountAED = amountGBP * (rateByMonth.get(r.month) ?? (1 / AED_TO_GBP_RATE));
      } else if (r.needsAedToGbp) {
          amountGBP = amountAED / (rateByMonth.get(r.month) ?? (1 / AED_TO_GBP_RATE));
      }
      return {
          date: r.dateStr,
          amount: amountGBP,
          amountGBP: amountGBP,
          amountAED: amountAED,
          originalAmount: amountAED > 0 ? amountAED : undefined,
          originalCurrency: amountAED > 0 ? 'AED' : undefined,
          type: r.isIncome ? 'INCOME' : 'EXPENSE',
          categoryId: r.categoryId,
          categoryName: r.categoryName,
          subcategoryName: r.subcategoryName,
          description: r.rawDesc,
          notes: r.wasAutoCategorized ? '✨ Auto-categorized' : '',
          excluded: false,
          bankName: r.bankName
      };
  });

  if (parsed.length === 0) return { transactions: [], autoCount: 0, error: 'No transactions found in that file.' };
  return { transactions: parsed, autoCount: autoCategorizedCount };
};

// Sends the parsed rows to the user's webhook (Settings), if one is set.
export const sendImportWebhook = async (url: string, bankName: string, fileName: string, transactions: Omit<Transaction, 'id'>[]): Promise<string | null> => {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: bankName, fileName, count: transactions.length, uploadedAt: new Date().toISOString(), transactions }),
    });
    return res.ok ? null : `Webhook failed: HTTP ${res.status} ${res.statusText}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return msg === 'Failed to fetch' || msg.includes('NetworkError') ? 'Webhook network error (likely CORS).' : `Webhook error: ${msg}`;
  }
};
