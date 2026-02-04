
import React, { useState, useEffect } from 'react';
import { Save, Trash2, Webhook, CheckCircle2, Building, Plus, CreditCard, ChevronRight } from 'lucide-react';
import { Bank } from '../types';

interface SettingsManagerProps {
  webhookUrl: string;
  onWebhookChange: (url: string) => void;
  banks: Bank[];
  onAddBank: (bank: Bank) => void;
  onDeleteBank: (id: string) => void;
}

const SettingsManager: React.FC<SettingsManagerProps> = ({ 
  webhookUrl, 
  onWebhookChange,
  banks,
  onAddBank,
  onDeleteBank
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'banks'>('general');
  const [urlInput, setUrlInput] = useState(webhookUrl);
  const [status, setStatus] = useState<'idle' | 'saved' | 'deleted'>('idle');

  // Bank Form State
  const [newBankName, setNewBankName] = useState('');
  const [newBankCurrency, setNewBankCurrency] = useState('GBP');

  // Sync if prop changes externally
  useEffect(() => {
    setUrlInput(webhookUrl);
  }, [webhookUrl]);

  const handleSaveWebhook = () => {
    onWebhookChange(urlInput);
    setStatus('saved');
    setTimeout(() => setStatus('idle'), 2000);
  };

  const handleDeleteWebhook = () => {
    onWebhookChange('');
    setUrlInput('');
    setStatus('deleted');
    setTimeout(() => setStatus('idle'), 2000);
  };

  const handleAddBankSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBankName.trim()) return;

    // Generate simple icon initials
    const words = newBankName.split(' ');
    const icon = words.length > 1 
      ? (words[0][0] + words[1][0]).toUpperCase() 
      : newBankName.substring(0, 2).toUpperCase();

    const newBank: Bank = {
      id: crypto.randomUUID(),
      name: newBankName.trim(),
      currency: newBankCurrency,
      icon: icon
    };

    onAddBank(newBank);
    setNewBankName('');
    setNewBankCurrency('GBP');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in h-full flex flex-col">
        <div className="flex flex-col gap-1 mb-2 flex-shrink-0">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Settings</h2>
            <p className="text-slate-500 text-sm">Manage your application preferences and integrations.</p>
        </div>

        {/* Settings Tabs */}
        <div className="flex gap-2 border-b border-slate-200 flex-shrink-0">
           <button
             onClick={() => setActiveTab('general')}
             className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${activeTab === 'general' ? 'border-[#635bff] text-[#635bff]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
           >
             General & Webhooks
           </button>
           <button
             onClick={() => setActiveTab('banks')}
             className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${activeTab === 'banks' ? 'border-[#635bff] text-[#635bff]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
           >
             Bank Accounts
           </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar pb-10">
          
          {/* GENERAL TAB */}
          {activeTab === 'general' && (
            <div className="bg-white rounded-[10px] border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                        <Webhook size={20} />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Bank Feed Webhook</h3>
                        <p className="text-xs text-slate-500 font-medium">Configure where your bank upload data is sent.</p>
                    </div>
                </div>
                
                <div className="p-6">
                    <div className="max-w-2xl">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Webhook URL</label>
                        <div className="relative">
                            <input 
                                type="text" 
                                value={urlInput}
                                onChange={(e) => setUrlInput(e.target.value)}
                                placeholder="https://api.example.com/webhooks/bank-feed"
                                className="w-full pl-4 pr-12 py-3 bg-white border border-slate-200 rounded-[10px] text-sm font-semibold text-slate-700 outline-none focus:border-[#635bff] focus:ring-4 focus:ring-[#635bff]/10 transition-all placeholder:text-slate-300"
                            />
                            {status === 'saved' && (
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500 animate-in fade-in zoom-in">
                                    <CheckCircle2 size={18} />
                                </div>
                            )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                            When configured, uploading a CSV in the "Transactions" tab will also POST the parsed data to this URL. 
                            Leave blank to process locally only.
                        </p>

                        <div className="flex items-center gap-3 mt-6">
                            <button 
                                onClick={handleSaveWebhook}
                                className="px-6 py-2.5 bg-[#635bff] hover:bg-[#5851e3] text-white text-sm font-bold rounded-[10px] shadow-md shadow-indigo-200 transition-all active:scale-95 flex items-center gap-2"
                            >
                                <Save size={16} />
                                Save Configuration
                            </button>
                            
                            {webhookUrl && (
                                <button 
                                    onClick={handleDeleteWebhook}
                                    className="px-6 py-2.5 bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 text-sm font-bold rounded-[10px] transition-all flex items-center gap-2"
                                >
                                    <Trash2 size={16} />
                                    Delete
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
          )}

          {/* BANKS TAB */}
          {activeTab === 'banks' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
               {/* Bank List */}
               <div className="lg:col-span-2 space-y-4">
                  <h3 className="text-lg font-bold text-slate-800">Your Accounts</h3>
                  <div className="grid grid-cols-1 gap-3">
                     {banks.map(bank => (
                       <div key={bank.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between group">
                          <div className="flex items-center gap-4">
                             <div className="w-12 h-12 bg-slate-900 text-white rounded-lg flex items-center justify-center font-bold text-lg shadow-md">
                                {bank.icon}
                             </div>
                             <div>
                                <h4 className="font-bold text-slate-900">{bank.name}</h4>
                                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">{bank.currency}</span>
                             </div>
                          </div>
                          
                          <button 
                            onClick={() => onDeleteBank(bank.id)}
                            className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete Bank"
                          >
                            <Trash2 size={18} />
                          </button>
                       </div>
                     ))}
                  </div>
               </div>

               {/* Add Bank Form */}
               <div>
                  <div className="bg-white rounded-[10px] border border-slate-200 shadow-sm overflow-hidden sticky top-6">
                     <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                        <Building size={16} className="text-slate-500" />
                        <h3 className="text-sm font-bold text-slate-800">Add Bank Account</h3>
                     </div>
                     <form onSubmit={handleAddBankSubmit} className="p-5 space-y-4">
                        <div>
                           <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Bank Name</label>
                           <input 
                             type="text"
                             required
                             value={newBankName}
                             onChange={(e) => setNewBankName(e.target.value)}
                             placeholder="e.g. HSBC" 
                             className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold focus:border-[#635bff] focus:ring-2 focus:ring-[#635bff]/10 outline-none"
                           />
                        </div>

                        <div>
                           <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Currency</label>
                           <div className="relative">
                              <select 
                                value={newBankCurrency}
                                onChange={(e) => setNewBankCurrency(e.target.value)}
                                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold focus:border-[#635bff] focus:ring-2 focus:ring-[#635bff]/10 outline-none appearance-none cursor-pointer"
                              >
                                 <option value="GBP">GBP (£)</option>
                                 <option value="USD">USD ($)</option>
                                 <option value="EUR">EUR (€)</option>
                                 <option value="AED">AED (Dh)</option>
                              </select>
                              <ChevronRight size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 rotate-90 pointer-events-none" />
                           </div>
                        </div>

                        <button 
                          type="submit"
                          className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg shadow-md transition-all flex items-center justify-center gap-2"
                        >
                           <Plus size={16} />
                           Add Account
                        </button>
                     </form>
                  </div>
               </div>
            </div>
          )}

        </div>
    </div>
  );
};

export default SettingsManager;
