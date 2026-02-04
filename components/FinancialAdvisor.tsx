import React, { useState } from 'react';
import { Sparkles, Loader2, Lightbulb } from 'lucide-react';
import { Transaction } from '../types';
import { getFinancialAdvice } from '../services/geminiService';
import ReactMarkdown from 'react-markdown';

interface FinancialAdvisorProps {
  transactions: Transaction[];
}

const FinancialAdvisor: React.FC<FinancialAdvisorProps> = ({ transactions }) => {
  const [advice, setAdvice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGetAdvice = async () => {
    if (transactions.length === 0) {
      setAdvice("Please log some transactions first so I can analyze your spending!");
      return;
    }

    setLoading(true);
    const result = await getFinancialAdvice(transactions);
    setAdvice(result);
    setLoading(false);
  };

  return (
    <div className="bg-gradient-to-br from-violet-50 via-white to-indigo-50 rounded-2xl p-6 shadow-sm border border-violet-100 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white rounded-lg shadow-sm border border-violet-100">
            <Sparkles className="text-violet-600" size={18} />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">AI Advisor</h2>
            <p className="text-xs text-slate-500 font-medium">Powered by Gemini</p>
          </div>
        </div>
        
        <button
          onClick={handleGetAdvice}
          disabled={loading}
          className="px-3 py-1.5 bg-[#635bff] hover:bg-[#5851e3] disabled:opacity-50 text-white rounded-lg text-xs font-bold uppercase tracking-wide transition-all shadow-sm shadow-indigo-200 flex items-center gap-2"
        >
          {loading ? <Loader2 className="animate-spin" size={14} /> : <Lightbulb size={14} />}
          {loading ? 'Thinking...' : 'Insights'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
        {advice ? (
          <div className="p-4 bg-white rounded-xl border border-slate-100 text-sm leading-relaxed animate-in fade-in slide-in-from-bottom-2 text-slate-700 shadow-sm">
            <div className="prose prose-sm max-w-none prose-p:my-2 prose-headings:text-slate-900 prose-strong:text-slate-900 prose-ul:list-disc prose-ul:pl-4">
              <ReactMarkdown>{advice}</ReactMarkdown>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
             <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mb-3 shadow-sm border border-slate-100">
               <Sparkles className="text-slate-300" size={20} />
             </div>
             <p className="text-sm text-slate-500 leading-relaxed font-medium">
               Ready to analyze your spending habits. Click "Insights" to generate personalized financial tips.
             </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FinancialAdvisor;