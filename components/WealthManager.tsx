
import React, { useState } from 'react';
import { DebtItem, AssetItem } from '../types';
import { Plus, Trash2, Landmark, Wallet, TrendingUp, DollarSign, X } from 'lucide-react';

interface WealthManagerProps {
  debts: DebtItem[];
  assets: AssetItem[];
  onAddDebt: (debt: Omit<DebtItem, 'id'>) => void;
  onDeleteDebt: (id: string) => void;
  onAddAsset: (asset: Omit<AssetItem, 'id'>) => void;
  onDeleteAsset: (id: string) => void;
}

const WealthManager: React.FC<WealthManagerProps> = ({ 
  debts, 
  assets, 
  onAddDebt, 
  onDeleteDebt, 
  onAddAsset, 
  onDeleteAsset 
}) => {
  const [activeTab, setActiveTab] = useState<'debts' | 'assets'>('debts');

  // Form States
  const [debtName, setDebtName] = useState('');
  const [debtAmount, setDebtAmount] = useState('');
  const [debtType, setDebtType] = useState<DebtItem['type']>('credit');
  const [debtRate, setDebtRate] = useState('');

  const [assetName, setAssetName] = useState('');
  const [assetAmount, setAssetAmount] = useState('');
  const [assetType, setAssetType] = useState<AssetItem['type']>('cash');

  const totalDebt = debts.reduce((sum, d) => sum + d.amount, 0);
  const totalAssets = assets.reduce((sum, a) => sum + a.amount, 0);
  const netWorth = totalAssets - totalDebt;

  const handleAddDebt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!debtName || !debtAmount) return;
    onAddDebt({
      name: debtName,
      amount: parseFloat(debtAmount),
      type: debtType,
      interestRate: debtRate ? parseFloat(debtRate) : undefined,
    });
    setDebtName('');
    setDebtAmount('');
    setDebtRate('');
  };

  const handleAddAsset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetName || !assetAmount) return;
    onAddAsset({
      name: assetName,
      amount: parseFloat(assetAmount),
      type: assetType,
    });
    setAssetName('');
    setAssetAmount('');
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      
      {/* Top Banner: Net Worth */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-5 sm:p-6 text-white shadow-lg relative overflow-hidden">
         <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <p className="text-slate-400 font-medium text-sm mb-1">Total Net Worth</p>
              <div className="flex items-baseline gap-2">
                 <span className="text-2xl font-medium text-slate-500">£</span>
                 <h2 className="text-4xl font-bold tracking-tight font-mono">
                    {netWorth.toLocaleString()}
                 </h2>
              </div>
            </div>
            <div className="flex gap-4 sm:gap-8">
               <div className="text-right">
                  <p className="text-emerald-400 text-xs font-bold uppercase tracking-wider">Total Assets</p>
                  <p className="text-xl font-bold text-white font-mono flex items-center justify-end gap-1">
                    <span className="text-emerald-400/50 text-sm">£</span>
                    {totalAssets.toLocaleString(undefined, { notation: 'compact' })}
                  </p>
               </div>
               <div className="text-right">
                  <p className="text-orange-400 text-xs font-bold uppercase tracking-wider">Total Debt</p>
                  <p className="text-xl font-bold text-white font-mono flex items-center justify-end gap-1">
                    <span className="text-orange-400/50 text-sm">£</span>
                    {totalDebt.toLocaleString(undefined, { notation: 'compact' })}
                  </p>
               </div>
            </div>
         </div>
         {/* Background Decoration */}
         <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
      </div>

      {/* Tabs */}
      <div className="flex bg-white p-1 rounded-xl border border-slate-200 w-full sm:w-fit">
        <button
          onClick={() => setActiveTab('debts')}
          className={`flex-1 sm:flex-none px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'debts' ? 'bg-orange-50 text-orange-700 shadow-sm ring-1 ring-orange-200' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Landmark size={16} />
          Debt Tracker
        </button>
        <button
          onClick={() => setActiveTab('assets')}
          className={`flex-1 sm:flex-none px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'assets' ? 'bg-emerald-50 text-emerald-700 shadow-sm ring-1 ring-emerald-200' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Wallet size={16} />
          Assets
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Form Column */}
        <div className="lg:col-span-1">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm sticky top-6">
             <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
               {activeTab === 'debts' ? <Plus size={18} className="text-orange-600" /> : <Plus size={18} className="text-emerald-600" />}
               {activeTab === 'debts' ? 'Add New Debt' : 'Add New Asset'}
             </h3>

             {activeTab === 'debts' ? (
                <form onSubmit={handleAddDebt} className="space-y-4">
                   <div>
                     <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Creditor Name</label>
                     <input 
                       required
                       type="text" 
                       placeholder="e.g. Amex Gold"
                       value={debtName}
                       onChange={e => setDebtName(e.target.value)}
                       className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
                     />
                   </div>
                   <div>
                     <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Amount Owed</label>
                     <div className="relative mt-1">
                        <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input 
                          required
                          type="number" 
                          placeholder="0.00"
                          value={debtAmount}
                          onChange={e => setDebtAmount(e.target.value)}
                          className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
                        />
                     </div>
                   </div>
                   <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Type</label>
                        <select 
                          value={debtType} 
                          onChange={e => setDebtType(e.target.value as any)}
                          className="w-full mt-1 px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
                        >
                           <option value="credit">Credit Card</option>
                           <option value="loan">Loan</option>
                           <option value="mortgage">Mortgage</option>
                           <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">APR % (Opt)</label>
                        <input 
                          type="number" 
                          placeholder="0%"
                          value={debtRate}
                          onChange={e => setDebtRate(e.target.value)}
                          className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
                        />
                      </div>
                   </div>
                   <button className="w-full mt-2 bg-orange-600 hover:bg-orange-700 text-white font-bold py-2.5 rounded-lg transition-colors shadow-sm shadow-orange-200">
                      Add Debt
                   </button>
                </form>
             ) : (
                <form onSubmit={handleAddAsset} className="space-y-4">
                   <div>
                     <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Asset Name</label>
                     <input 
                       required
                       type="text" 
                       placeholder="e.g. Chase Savings"
                       value={assetName}
                       onChange={e => setAssetName(e.target.value)}
                       className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                     />
                   </div>
                   <div>
                     <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Current Value</label>
                     <div className="relative mt-1">
                        <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input 
                          required
                          type="number" 
                          placeholder="0.00"
                          value={assetAmount}
                          onChange={e => setAssetAmount(e.target.value)}
                          className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                        />
                     </div>
                   </div>
                   <div>
                        <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Type</label>
                        <select 
                          value={assetType} 
                          onChange={e => setAssetType(e.target.value as any)}
                          className="w-full mt-1 px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                        >
                           <option value="cash">Cash / Savings</option>
                           <option value="investment">Investments</option>
                           <option value="property">Property</option>
                           <option value="crypto">Crypto</option>
                           <option value="other">Other</option>
                        </select>
                   </div>
                   <button className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg transition-colors shadow-sm shadow-emerald-200">
                      Add Asset
                   </button>
                </form>
             )}
          </div>
        </div>

        {/* List Column */}
        <div className="lg:col-span-2 space-y-4">
            {activeTab === 'debts' ? (
              <>
                 <h3 className="text-lg font-bold text-slate-800 flex items-center justify-between">
                    Your Debts
                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full">{debts.length} items</span>
                 </h3>
                 
                 {debts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-slate-400">
                        <Landmark size={32} className="mb-2 opacity-50" />
                        <p className="text-sm font-medium">You are debt free! Or haven't added any yet.</p>
                    </div>
                 ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {debts.map(item => (
                            <div key={item.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-orange-200 transition-all">
                                <div>
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
                                            <Landmark size={18} />
                                        </div>
                                        <button onClick={() => onDeleteDebt(item.id)} className="text-slate-300 hover:text-rose-500 transition-colors">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                    <h4 className="font-bold text-slate-800">{item.name}</h4>
                                    <p className="text-xs text-slate-500 font-medium capitalize">{item.type} {item.interestRate ? `• ${item.interestRate}% APR` : ''}</p>
                                </div>
                                <div className="mt-4 pt-4 border-t border-slate-50">
                                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Owed Amount</p>
                                    <div className="flex justify-between items-center">
                                       <span className="text-slate-400 font-medium select-none">£</span>
                                       <p className="text-xl font-bold text-slate-900 font-mono">
                                          {item.amount.toLocaleString()}
                                       </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                 )}
              </>
            ) : (
              <>
                 <h3 className="text-lg font-bold text-slate-800 flex items-center justify-between">
                    Your Assets
                    <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">{assets.length} items</span>
                 </h3>

                 {assets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-slate-400">
                        <Wallet size={32} className="mb-2 opacity-50" />
                        <p className="text-sm font-medium">Track your savings and investments here.</p>
                    </div>
                 ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {assets.map(item => (
                            <div key={item.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-emerald-200 transition-all">
                                <div>
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                                            <TrendingUp size={18} />
                                        </div>
                                        <button onClick={() => onDeleteAsset(item.id)} className="text-slate-300 hover:text-rose-500 transition-colors">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                    <h4 className="font-bold text-slate-800">{item.name}</h4>
                                    <p className="text-xs text-slate-500 font-medium capitalize">{item.type}</p>
                                </div>
                                <div className="mt-4 pt-4 border-t border-slate-50">
                                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Value</p>
                                    <div className="flex justify-between items-center">
                                       <span className="text-slate-400 font-medium select-none">£</span>
                                       <p className="text-xl font-bold text-slate-900 font-mono">
                                          {item.amount.toLocaleString()}
                                       </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                 )}
              </>
            )}
        </div>

      </div>
    </div>
  );
};

export default WealthManager;
