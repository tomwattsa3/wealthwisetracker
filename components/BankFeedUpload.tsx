
import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import { Upload, AlertCircle, FileSpreadsheet, ChevronDown, Webhook, Loader2, CheckCircle2, Sparkles } from 'lucide-react';
import { Transaction, Bank, MerchantMapping } from '../types';

interface BankFeedUploadProps {
  onImport: (transactions: Omit<Transaction, 'id'>[]) => void;
  webhookUrl?: string;
  banks: Bank[];
  merchantMappings?: MerchantMapping[];
}

const AED_TO_GBP_RATE = 0.21;

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

        const parsed: Omit<Transaction, 'id'>[] = [];
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

        data.forEach((row) => {
            const rawDate = row[dateCol];
            const rawDesc = descCol ? row[descCol] : 'Unknown Transaction';

            let amountGBP = 0;
            let amountAED = 0;
            let isIncome = false;

            if (hasMultiColumns) {
                // Parse multi-column format
                const moneyOutGBP = moneyOutGBPCol ? parseFloat(String(row[moneyOutGBPCol]).replace(/[^0-9.-]/g, '')) || 0 : 0;
                const moneyInGBP = moneyInGBPCol ? parseFloat(String(row[moneyInGBPCol]).replace(/[^0-9.-]/g, '')) || 0 : 0;
                const moneyOutAED = moneyOutAEDCol ? parseFloat(String(row[moneyOutAEDCol]).replace(/[^0-9.-]/g, '')) || 0 : 0;
                const moneyInAED = moneyInAEDCol ? parseFloat(String(row[moneyInAEDCol]).replace(/[^0-9.-]/g, '')) || 0 : 0;

                // Determine if income or expense
                isIncome = moneyInGBP > 0 || moneyInAED > 0;
                amountGBP = isIncome ? moneyInGBP : moneyOutGBP;
                amountAED = isIncome ? moneyInAED : moneyOutAED;

                // Skip rows with no amounts
                if (amountGBP === 0 && amountAED === 0) return;

                // If one currency is missing, convert from the other
                if (amountGBP === 0 && amountAED > 0) {
                    amountGBP = amountAED * AED_TO_GBP_RATE;
                }
                if (amountAED === 0 && amountGBP > 0) {
                    amountAED = amountGBP / AED_TO_GBP_RATE;
                }
            } else {
                // Single amount column (legacy format)
                const rawAmount = row[amountCol];
                let amountSource = parseFloat(String(rawAmount).replace(/[^0-9.-]/g, ''));
                if (isNaN(amountSource)) return;

                isIncome = amountSource >= 0;
                const isForeign = selectedBank.currency !== 'GBP';
                const rate = selectedBank.currency === 'AED' ? AED_TO_GBP_RATE : 1;
                amountGBP = Math.abs(amountSource * rate);
                amountAED = isForeign ? Math.abs(amountSource) : amountGBP / AED_TO_GBP_RATE;
            }

            // Date Formatting
            const dateObj = new Date(rawDate);
            const dateStr = !isNaN(dateObj.getTime())
                ? dateObj.toISOString().split('T')[0]
                : new Date().toISOString().split('T')[0];

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

            parsed.push({
                date: dateStr,
                amount: amountGBP,
                amountGBP: amountGBP,
                amountAED: amountAED,
                originalAmount: amountAED > 0 ? amountAED : undefined,
                originalCurrency: amountAED > 0 ? 'AED' : undefined,
                type: isIncome ? 'INCOME' : 'EXPENSE',
                categoryId,
                categoryName,
                subcategoryName,
                description: rawDesc,
                notes: wasAutoCategorized ? '✨ Auto-categorized' : '',
                excluded: false,
                bankName: bankName
            });
            count++;
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
      <div className="flex flex-col animate-in fade-in space-y-2 sm:space-y-4">

          {/* Upload Section */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`
                w-full rounded-xl sm:rounded-2xl p-3 sm:p-6 flex flex-col md:flex-row items-center justify-between gap-3 sm:gap-6 transition-all border-2 border-dashed relative overflow-hidden
                ${isDragging ? 'border-[#635bff] bg-indigo-50/50 scale-[1.01] shadow-lg' : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50'}
            `}
          >
              <div className="flex items-center gap-3 sm:gap-5 flex-1 relative z-10 w-full">
                  <div className={`p-2 sm:p-4 rounded-lg sm:rounded-xl shrink-0 ${isDragging ? 'bg-[#635bff] text-white' : 'bg-indigo-50 text-[#635bff]'}`}>
                      <Upload size={20} className="sm:w-7 sm:h-7" />
                  </div>
                  <div className="min-w-0 flex-1">
                      <h3 className="text-sm sm:text-lg font-bold text-slate-900 mb-0.5 sm:mb-1 flex items-center gap-2 flex-wrap">
                        <span>Upload Bank Feed</span>
                        {/* Hide badges on mobile */}
                        {merchantMappings.length > 0 && (() => {
                          const readyCount = merchantMappings.filter(m => (m.count || 0) >= 3).length;
                          const learningCount = merchantMappings.length - readyCount;
                          return (
                            <span className="hidden sm:flex text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full uppercase tracking-wider font-bold items-center gap-1">
                              <Sparkles size={10} /> {readyCount} Ready{learningCount > 0 ? `, ${learningCount} Learning` : ''}
                            </span>
                          );
                        })()}
                        {webhookUrl ? (
                          <span className="hidden sm:flex text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full uppercase tracking-wider font-bold items-center gap-1">
                            <Webhook size={10} /> Webhook Active
                          </span>
                        ) : (
                          <span className="hidden sm:flex text-[10px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full uppercase tracking-wider font-bold items-center gap-1">
                            <AlertCircle size={10} /> Webhook Not Active
                          </span>
                        )}
                      </h3>
                      <p className="text-xs sm:text-sm text-slate-500 truncate">
                          {selectedBank.currency === 'AED'
                            ? `CSV from ${selectedBank.name}. AED → GBP.`
                            : `CSV from ${selectedBank.name}. GBP.`
                          }
                      </p>
                  </div>
              </div>

              {/* Bank Selector & File Input */}
              <div className="flex flex-row items-center gap-2 sm:gap-3 w-full md:w-auto relative z-10">
                 <div className="relative flex-1 sm:w-48 sm:flex-none">
                    <select
                        value={selectedBankId}
                        onChange={(e) => setSelectedBankId(e.target.value)}
                        className="w-full appearance-none bg-white border border-slate-200 text-slate-700 py-2 sm:py-2.5 pl-2 sm:pl-3 pr-6 sm:pr-8 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold focus:outline-none focus:border-[#635bff] focus:ring-4 focus:ring-[#635bff]/10 cursor-pointer"
                    >
                        {banks.map(bank => (
                            <option key={bank.id} value={bank.id}>{bank.name}</option>
                        ))}
                    </select>
                    <ChevronDown size={12} className="sm:w-3.5 sm:h-3.5 absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                 </div>

                 <label className="relative shrink-0">
                      <input
                        type="file"
                        accept=".csv"
                        onChange={(e) => e.target.files && handleFileUpload(e.target.files[0])}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <span className="bg-[#635bff] hover:bg-[#5851e3] text-white px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap cursor-pointer">
                          {webhookStatus === 'sending' ? (
                             <Loader2 size={14} className="sm:w-4 sm:h-4 animate-spin" />
                          ) : (
                             <FileSpreadsheet size={14} className="sm:w-4 sm:h-4" />
                          )}
                          <span className="hidden sm:inline">{webhookStatus === 'sending' ? 'Sending...' : 'Select CSV'}</span>
                          <span className="sm:hidden">CSV</span>
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
