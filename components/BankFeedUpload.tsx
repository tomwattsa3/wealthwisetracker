
import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import { Upload, AlertCircle, FileSpreadsheet, ChevronDown, Webhook, Loader2, CheckCircle2 } from 'lucide-react';
import { Transaction, Bank, MerchantMapping } from '../types';

interface BankFeedUploadProps {
  onImport: (transactions: Omit<Transaction, 'id'>[]) => void;
  webhookUrl?: string;
  banks: Bank[];
  merchantMappings?: MerchantMapping[];
}

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

const BankFeedUpload: React.FC<BankFeedUploadProps> = ({ onImport, webhookUrl, banks, merchantMappings = [] }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBankId, setSelectedBankId] = useState<string>(banks.length > 0 ? banks[0].id : '');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [webhookStatus, setWebhookStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [webhookErrorMessage, setWebhookErrorMessage] = useState<string | null>(null);
  
  const selectedBank = useMemo(() => banks.find(b => b.id === selectedBankId) || banks[0] || { name: 'Unknown', currency: 'GBP', id: 'unknown', icon: '?' }, [selectedBankId, banks]);

  const handleFileUpload = (file: File) => {
    setError(null);
    setSuccessMessage(null);
    setWebhookStatus('idle');
    setWebhookErrorMessage(null);
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        if (results.errors.length > 0) {
          setError("Error parsing CSV file. Please check the format.");
          return;
        }

        const data = results.data as any[];
        const headers = results.meta.fields || [];

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
           setError("Could not detect required columns. Need 'Transaction Date' + money columns (MONEY OUT GBP, MONEY IN GBP, etc.) or 'Date' + 'Amount'.");
           return;
        }

        let count = 0;
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
                const isForeign = selectedBank.currency !== 'GBP';
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
            const bankName = bankCol && row[bankCol] ? row[bankCol] : selectedBank.name;

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
            count++;
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

        if (parsed.length === 0) {
            setError("No valid transactions found in file.");
            return;
        }

        // Webhook Logic
        let webhookResultMsg = '';
        if (webhookUrl) {
            setWebhookStatus('sending');
            try {
                const response = await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        source: selectedBank.name,
                        fileName: file.name,
                        count: parsed.length,
                        uploadedAt: new Date().toISOString(),
                        transactions: parsed
                    })
                });

                if (response.ok) {
                    setWebhookStatus('success');
                    webhookResultMsg = ' & sent to webhook';
                } else {
                    setWebhookStatus('error');
                    webhookResultMsg = ' but webhook failed';
                    setWebhookErrorMessage(`HTTP Error: ${response.status} ${response.statusText}`);
                    console.error('Webhook failed', response.statusText);
                }
            } catch (err) {
                setWebhookStatus('error');
                webhookResultMsg = ' but webhook error';
                
                let errorMsg = 'Unknown error';
                if (err instanceof Error) {
                    errorMsg = err.message;
                    // Provide a hint for common CORS errors
                    if (errorMsg === 'Failed to fetch' || errorMsg.includes('NetworkError')) {
                        errorMsg = 'Network Error (Likely CORS). The webhook URL may not allow requests from this domain.';
                    }
                }
                setWebhookErrorMessage(errorMsg);
                console.error('Webhook error', err);
            }
        }

        // Direct Import
        onImport(parsed);
        const autoMsg = autoCategorizedCount > 0 ? ` (${autoCategorizedCount} auto-categorized)` : '';
        setSuccessMessage(`Successfully imported ${count} transactions${autoMsg}${webhookResultMsg}.`);
        
        // Clear success message after 10 seconds (longer to read error)
        setTimeout(() => {
            setSuccessMessage(null);
            setWebhookStatus('idle');
            setWebhookErrorMessage(null);
        }, 10000);
      }
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type === "text/csv" || file.name.endsWith('.csv'))) {
      handleFileUpload(file);
    } else {
      setError("Please upload a valid CSV file.");
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  return (
      <div className="flex flex-col h-full animate-in fade-in space-y-2 sm:space-y-4">

          {/* Upload Section */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`
                w-full h-full rounded-xl p-4 flex flex-col justify-center items-start gap-3 transition-all border-2 border-dashed relative overflow-hidden
                ${isDragging ? 'border-[#635bff] bg-indigo-50/50 scale-[1.01] shadow-lg' : 'border-slate-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 hover:border-indigo-300 hover:bg-slate-50 dark:hover:bg-neutral-700'}
            `}
          >
              <div className="flex items-center gap-2.5 relative z-10">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isDragging ? 'bg-[#635bff] text-white' : 'bg-indigo-50 text-[#635bff]'}`}>
                      <Upload size={16} />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-neutral-200 flex items-center gap-2 flex-wrap">
                    <span>Upload Bank Feed</span>
                    {webhookUrl && (
                      <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full uppercase tracking-wider font-bold flex items-center gap-1">
                        <Webhook size={9} /> Live
                      </span>
                    )}
                  </h3>
              </div>

              {/* Bank Selector & File Input */}
              <div className="flex flex-row items-center gap-2 w-full relative z-10">
                 <div className="relative flex-1">
                    <select
                        value={selectedBankId}
                        onChange={(e) => setSelectedBankId(e.target.value)}
                        className="w-full appearance-none bg-white dark:bg-neutral-700 border border-slate-200 dark:border-neutral-600 text-slate-700 dark:text-neutral-300 py-2 pl-2.5 pr-6 rounded-lg text-xs font-bold focus:outline-none focus:border-[#635bff] focus:ring-4 focus:ring-[#635bff]/10 cursor-pointer"
                    >
                        {banks.map(bank => (
                            <option key={bank.id} value={bank.id}>{bank.name}</option>
                        ))}
                    </select>
                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500 pointer-events-none" />
                 </div>

                 <label className="relative shrink-0">
                      <input
                        type="file"
                        accept=".csv"
                        onChange={(e) => e.target.files && handleFileUpload(e.target.files[0])}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <span className="bg-[#635bff] hover:bg-[#5851e3] text-white px-3 py-2 rounded-lg text-xs font-bold shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer">
                          {webhookStatus === 'sending' ? (
                             <Loader2 size={13} className="animate-spin" />
                          ) : (
                             <FileSpreadsheet size={13} />
                          )}
                          <span>{webhookStatus === 'sending' ? 'Sending...' : 'Select CSV'}</span>
                      </span>
                  </label>
              </div>
          </div>

          {error && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 flex items-center gap-2 text-sm font-medium animate-in slide-in-from-top-2">
                  <AlertCircle size={16} />
                  {error}
              </div>
          )}
          
          {successMessage && (
              <div className={`p-3 border rounded-xl flex flex-col gap-1 animate-in slide-in-from-top-2 ${
                  webhookStatus === 'error' ? 'bg-orange-50 border-orange-100' : 'bg-emerald-50 border-emerald-100'
              }`}>
                  <div className={`flex items-center gap-2 text-sm font-medium ${
                      webhookStatus === 'error' ? 'text-orange-700' : 'text-emerald-600'
                  }`}>
                      {webhookStatus === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
                      {successMessage}
                  </div>
                  
                  {webhookStatus === 'error' && webhookErrorMessage && (
                      <div className="text-xs text-orange-800 bg-orange-100/50 p-2 rounded-lg ml-6 font-mono break-all">
                          Error: {webhookErrorMessage}
                      </div>
                  )}
              </div>
          )}
      </div>
  );
};

export default BankFeedUpload;
