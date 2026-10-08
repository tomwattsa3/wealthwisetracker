
import React, { useState, useEffect } from 'react';
import { Save, Trash2, Webhook, CheckCircle2, Building, Plus, CreditCard, ChevronRight, LogOut, Sparkles, X, Loader2, Sun, Moon, KeyRound, Eye, EyeOff, Bell } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Bank, MerchantMapping } from '../types';
import { loadReminder, saveReminder, registerReminderSync, reminderSupport, ReminderPrefs, DEFAULT_REMINDER } from '../lib/offline';

interface SettingsManagerProps {
  webhookUrl: string;
  onWebhookChange: (url: string) => void;
  banks: Bank[];
  onAddBank: (bank: Bank) => void;
  onDeleteBank: (id: string) => void;
  darkMode?: boolean;
  onToggleDarkMode?: (val: boolean) => void;
  onLogout?: () => void;
  merchantMemory?: {
    totalCount: number;
    readyCount: number;
    mappings: MerchantMapping[];
    onPreviewBackfill: () => BackfillItem[];
    onExecuteBackfill: (items: BackfillItem[]) => Promise<void>;
    onDeleteMapping: (pattern: string) => void;
  };
}

export interface BackfillItem {
  merchant_pattern: string;
  category_id: string;
  category_name: string;
  subcategory_name: string;
  count: number;
}

// Change the password you sign in with. Saved straight to your Supabase login; you stay signed in.
const ChangePassword: React.FC = () => {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const tooShort = pw.length > 0 && pw.length < 8;
  const mismatch = confirm.length > 0 && pw !== confirm;
  const ready = pw.length >= 8 && pw === confirm && !saving;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    setMsg(null);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setSaving(false);
    if (error) {
      setMsg({ ok: false, text: /reauth|recent/i.test(error.message) ? 'For security, sign out and back in, then change it straight away.' : error.message });
      return;
    }
    setPw('');
    setConfirm('');
    setMsg({ ok: true, text: 'Password changed. Use it next time you sign in.' });
  };

  const input = 'w-full h-11 px-3 pr-11 rounded-lg border border-slate-200 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-sm text-slate-900 dark:text-neutral-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';
  return (
    <form onSubmit={save} className="bg-white dark:bg-neutral-800 rounded-xl border border-slate-200 dark:border-neutral-600 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="p-2 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-300 rounded-lg"><KeyRound size={16} /></span>
        <div>
          <h3 className="font-bold text-slate-800 dark:text-neutral-200">Change password</h3>
          <p className="text-sm text-slate-500 dark:text-neutral-500">At least 8 characters</p>
        </div>
      </div>
      <input type="text" name="username" autoComplete="username" className="hidden" readOnly value="" />
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-neutral-400">
        New password
        <span className="relative">
          <input type={show ? 'text' : 'password'} value={pw} onChange={e => { setPw(e.target.value); setMsg(null); }} autoComplete="new-password" className={input} />
          <button type="button" onClick={() => setShow(v => !v)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-neutral-200">
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </span>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-neutral-400">
        Confirm new password
        <input type={show ? 'text' : 'password'} value={confirm} onChange={e => { setConfirm(e.target.value); setMsg(null); }} autoComplete="new-password" className={input} />
      </label>
      {(tooShort || mismatch) && <p className="text-xs text-rose-600 dark:text-rose-400">{tooShort ? 'Use at least 8 characters.' : "The two passwords don't match."}</p>}
      {msg && <p className={`text-xs font-medium ${msg.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{msg.text}</p>}
      <button type="submit" disabled={!ready} className="self-start min-h-[40px] px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-40 flex items-center gap-2">
        {saving && <Loader2 size={15} className="animate-spin" />}
        {saving ? 'Saving…' : 'Change password'}
      </button>
    </form>
  );
};

// A notification when your bank data gets old, checked in the background by the app's worker
// (public/sw.js). Kept on this phone only, since notifications belong to the device.
const ImportReminders: React.FC = () => {
  const [prefs, setPrefs] = useState<ReminderPrefs>(DEFAULT_REMINDER);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const support = reminderSupport();
  useEffect(() => { loadReminder().then(setPrefs); }, []);

  const update = async (next: ReminderPrefs) => {
    setPrefs(next);
    await saveReminder(next);
    await registerReminderSync(next.on);
  };

  const toggle = async () => {
    setMsg(null);
    if (prefs.on) { await update({ ...prefs, on: false }); return; }
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm !== 'granted') {
      setMsg({ ok: false, text: 'Notifications are blocked. Allow them in your phone settings: Apps → WealthWise → Notifications.' });
      return;
    }
    await update({ ...prefs, on: true });
    setMsg({ ok: true, text: `Done. You'll get a reminder when your data is more than ${prefs.days} days old.` });
  };

  const test = async () => {
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification('Time to update WealthWise', { body: 'This is what your import reminder will look like.', icon: '/icon-192.png', badge: '/icon-192.png', tag: 'import-reminder', data: { url: '/?tab=history&action=import' } });
    } catch {
      setMsg({ ok: false, text: "Couldn't show a notification here. Try it in the installed app." });
    }
  };

  return (
    <div className="bg-white dark:bg-neutral-800 rounded-xl border border-slate-200 dark:border-neutral-600 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="p-2 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-300 rounded-lg"><Bell size={16} /></span>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-slate-800 dark:text-neutral-200">Import reminders</h3>
          <p className="text-sm text-slate-500 dark:text-neutral-500">A notification when it's time to import a new statement</p>
        </div>
        {support.notifications && (
          <button type="button" role="switch" aria-checked={prefs.on} aria-label="Import reminders" onClick={toggle} className={`relative w-11 h-[26px] shrink-0 rounded-full transition-colors ${prefs.on ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-neutral-600'}`}>
            <span className={`absolute top-[3px] w-5 h-5 rounded-full bg-white shadow transition-all ${prefs.on ? 'left-[21px]' : 'left-[3px]'}`} />
          </button>
        )}
      </div>
      {!support.notifications ? (
        <p className="text-xs text-slate-500 dark:text-neutral-400">Reminders work in the installed app on your phone.</p>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-neutral-300">
            <span>Remind me when my data is older than</span>
            <div role="group" aria-label="Days" className="flex gap-0.5 p-[3px] bg-slate-100 dark:bg-neutral-700/60 rounded-[9px]">
              {[7, 14, 30].map(d => (
                <button key={d} type="button" onClick={() => update({ ...prefs, days: d })} aria-pressed={prefs.days === d} className={`px-2.5 py-1 rounded-[7px] text-xs ${prefs.days === d ? 'bg-white dark:bg-neutral-600 font-semibold text-slate-900 dark:text-neutral-100 shadow-sm' : 'text-slate-500 dark:text-neutral-400'}`}>{d} days</button>
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-neutral-400">
            {support.background ? 'Your phone checks about once or twice a day, so it may arrive a little after the day it\'s due. At most one reminder every 3 days.' : 'This browser can\'t check in the background. Reminders work in the installed Android app.'}
          </p>
          <div className="flex items-center gap-3">
            <button type="button" onClick={test} className="min-h-[36px] px-3 rounded-lg border border-slate-200 dark:border-neutral-600 text-sm font-semibold text-indigo-700 dark:text-indigo-300">Send a test</button>
          </div>
        </>
      )}
      {msg && <p className={`text-xs font-medium ${msg.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{msg.text}</p>}
    </div>
  );
};

const SettingsManager: React.FC<SettingsManagerProps> = ({
  webhookUrl,
  onWebhookChange,
  banks,
  onAddBank,
  onDeleteBank,
  darkMode,
  onToggleDarkMode,
  onLogout,
  merchantMemory
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'banks'>('general');
  const [urlInput, setUrlInput] = useState(webhookUrl);
  const [status, setStatus] = useState<'idle' | 'saved' | 'deleted'>('idle');

  // Backfill State
  const [backfillPreview, setBackfillPreview] = useState<BackfillItem[] | null>(null);
  const [isBackfilling, setIsBackfilling] = useState(false);

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
            <h2 className="text-2xl font-bold text-slate-900 dark:text-neutral-200 tracking-tight">Settings</h2>
            <p className="text-slate-500 dark:text-neutral-500 text-sm">Manage your application preferences and integrations.</p>
        </div>

        {/* Settings Tabs */}
        <div className="flex gap-2 border-b border-slate-200 dark:border-neutral-600 flex-shrink-0">
           <button
             onClick={() => setActiveTab('general')}
             className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${activeTab === 'general' ? 'border-[#635bff] text-[#635bff]' : 'border-transparent text-slate-500 dark:text-neutral-500 hover:text-slate-700 dark:hover:text-neutral-300'}`}
           >
             General & Webhooks
           </button>
           <button
             onClick={() => setActiveTab('banks')}
             className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${activeTab === 'banks' ? 'border-[#635bff] text-[#635bff]' : 'border-transparent text-slate-500 dark:text-neutral-500 hover:text-slate-700 dark:hover:text-neutral-300'}`}
           >
             Bank Accounts
           </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar pb-10">
          
          {/* GENERAL TAB */}
          {activeTab === 'general' && (
            <>
            {/* Dark Mode Toggle */}
            <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-sm border border-slate-100 dark:border-neutral-700 p-5 mb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {darkMode ? <Moon size={18} className="text-indigo-400" /> : <Sun size={18} className="text-amber-500" />}
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-neutral-200">Appearance</h3>
                    <p className="text-xs text-slate-500 dark:text-neutral-500">{darkMode ? 'Dark mode' : 'Light mode'}</p>
                  </div>
                </div>
                <button
                  onClick={() => onToggleDarkMode?.(!darkMode)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${darkMode ? 'bg-indigo-600' : 'bg-slate-200'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${darkMode ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-800 rounded-[10px] border border-slate-200 dark:border-neutral-600 shadow-sm overflow-hidden">
                <div className="p-3 border-b border-slate-100 dark:border-neutral-700 bg-slate-50/50 dark:bg-neutral-700/50 flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                        <Webhook size={20} />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-800 dark:text-neutral-200 uppercase tracking-wide">Bank Feed Webhook</h3>
                        <p className="text-xs text-slate-500 dark:text-neutral-500 font-medium">Configure where your bank upload data is sent.</p>
                    </div>
                </div>
                
                <div className="p-6">
                    <div className="max-w-2xl">
                        <label className="block text-xs font-bold text-slate-500 dark:text-neutral-500 uppercase mb-2">Webhook URL</label>
                        <div className="relative">
                            <input 
                                type="text" 
                                value={urlInput}
                                onChange={(e) => setUrlInput(e.target.value)}
                                placeholder="https://api.example.com/webhooks/bank-feed"
                                className="w-full pl-4 pr-12 py-3 bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-600 rounded-[10px] text-sm font-semibold text-slate-700 dark:text-neutral-400 outline-none focus:border-[#635bff] focus:ring-4 focus:ring-[#635bff]/10 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-500"
                            />
                            {status === 'saved' && (
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500 animate-in fade-in zoom-in">
                                    <CheckCircle2 size={18} />
                                </div>
                            )}
                        </div>
                        <p className="text-[11px] text-slate-400 dark:text-neutral-500 mt-2 leading-relaxed">
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
                                    className="px-6 py-2.5 bg-white dark:bg-neutral-800 border border-rose-200 hover:bg-rose-50 text-rose-600 text-sm font-bold rounded-[10px] transition-all flex items-center gap-2"
                                >
                                    <Trash2 size={16} />
                                    Delete
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            </>
          )}

          {/* Merchant Memory Section - visible on General tab */}
          {activeTab === 'general' && merchantMemory && (
            <div className="bg-white dark:bg-neutral-800 rounded-[10px] border border-slate-200 dark:border-neutral-600 shadow-sm overflow-hidden mt-6">
                <div className="p-3 border-b border-slate-100 dark:border-neutral-700 bg-slate-50/50 dark:bg-neutral-700/50 flex items-center gap-3">
                    <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                        <Sparkles size={20} />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-800 dark:text-neutral-200 uppercase tracking-wide">Merchant Memory</h3>
                        <p className="text-xs text-slate-500 dark:text-neutral-500 font-medium">Auto-categorize transactions based on past history.</p>
                    </div>
                </div>

                <div className="p-6">
                    {/* Stats */}
                    <div className="flex items-center gap-6 mb-4">
                        <div>
                            <p className="text-2xl font-bold text-slate-900 dark:text-neutral-200">{merchantMemory.totalCount}</p>
                            <p className="text-xs text-slate-500 dark:text-neutral-500 font-medium">Total Patterns</p>
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-emerald-600">{merchantMemory.readyCount}</p>
                            <p className="text-xs text-slate-500 dark:text-neutral-500 font-medium">Ready to Auto-Apply</p>
                        </div>
                    </div>
                    <p className="text-[11px] text-slate-400 dark:text-neutral-500 mb-4 leading-relaxed">
                        Merchants seen 3+ times will be auto-categorized on future uploads.
                        Use "Backfill" to scan your existing transactions and build memory from past data.
                    </p>

                    {/* Backfill Button / Preview */}
                    {!backfillPreview ? (
                        <button
                            onClick={() => {
                              const items = merchantMemory.onPreviewBackfill();
                              if (items.length === 0) return;
                              setBackfillPreview(items);
                            }}
                            className="px-6 py-2.5 bg-slate-900 dark:bg-neutral-600 hover:bg-slate-800 text-white text-sm font-bold rounded-[10px] shadow-md transition-all active:scale-95 flex items-center gap-2"
                        >
                            <Sparkles size={16} />
                            Backfill from Transactions
                        </button>
                    ) : (
                        <div className="border border-amber-200 bg-amber-50/50 rounded-lg p-4 space-y-3">
                            <p className="text-sm font-bold text-slate-800 dark:text-neutral-200">
                              Preview: {backfillPreview.length} merchants found
                              <span className="text-slate-500 dark:text-neutral-500 font-medium ml-1">
                                ({backfillPreview.filter(m => m.count >= 3).length} ready for auto-apply)
                              </span>
                            </p>
                            <div className="max-h-60 overflow-y-auto space-y-1.5 custom-scrollbar">
                              {backfillPreview.sort((a, b) => b.count - a.count).map((item) => (
                                <div key={item.merchant_pattern} className="flex items-center justify-between bg-white dark:bg-neutral-800 rounded-lg px-3 py-2 border border-slate-100 dark:border-neutral-700 text-sm">
                                    <div className="flex-1 min-w-0">
                                        <span className="font-semibold text-slate-800 dark:text-neutral-200 truncate block">{item.merchant_pattern}</span>
                                        <span className="text-xs text-slate-400 dark:text-neutral-500">{item.category_name}{item.subcategory_name ? ` > ${item.subcategory_name}` : ''}</span>
                                    </div>
                                    <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${item.count >= 3 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                      {item.count}x
                                    </span>
                                </div>
                              ))}
                            </div>
                            <div className="flex gap-2 pt-1">
                                <button
                                    onClick={async () => {
                                      setIsBackfilling(true);
                                      await merchantMemory.onExecuteBackfill(backfillPreview);
                                      setIsBackfilling(false);
                                      setBackfillPreview(null);
                                    }}
                                    disabled={isBackfilling}
                                    className="px-5 py-2 bg-slate-900 dark:bg-neutral-600 hover:bg-slate-800 text-white text-sm font-bold rounded-lg transition-all flex items-center gap-2 disabled:opacity-60"
                                >
                                    {isBackfilling ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                    Confirm Backfill ({backfillPreview.length})
                                </button>
                                <button
                                    onClick={() => setBackfillPreview(null)}
                                    disabled={isBackfilling}
                                    className="px-5 py-2 bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-600 text-slate-600 dark:text-neutral-400 text-sm font-bold rounded-lg hover:bg-slate-50 dark:hover:bg-neutral-700 transition-all"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Existing Mappings List */}
                    {merchantMemory.mappings.length > 0 && (
                      <div className="mt-6">
                        <h4 className="text-xs font-bold text-slate-500 dark:text-neutral-500 uppercase tracking-wide mb-3">Logged Merchants ({merchantMemory.mappings.length})</h4>
                        <div className="max-h-80 overflow-y-auto space-y-1.5 custom-scrollbar">
                          {merchantMemory.mappings
                            .slice()
                            .sort((a, b) => (b.count || 0) - (a.count || 0))
                            .map((m) => (
                              <div key={m.merchant_pattern} className="flex items-center justify-between bg-slate-50 dark:bg-neutral-700 rounded-lg px-3 py-2.5 group">
                                  <div className="flex-1 min-w-0">
                                      <span className="font-semibold text-sm text-slate-800 dark:text-neutral-200 truncate block">{m.merchant_pattern}</span>
                                      <span className="text-xs text-slate-400 dark:text-neutral-500">{m.category_name}{m.subcategory_name ? ` > ${m.subcategory_name}` : ''}</span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0 ml-2">
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${(m.count || 0) >= 3 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 dark:bg-neutral-600 text-slate-500 dark:text-neutral-500'}`}>
                                        {m.count || 1}x
                                      </span>
                                      <button
                                          onClick={() => merchantMemory.onDeleteMapping(m.merchant_pattern)}
                                          className="p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                                          title="Remove mapping"
                                      >
                                          <X size={14} />
                                      </button>
                                  </div>
                              </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {merchantMemory.mappings.length === 0 && !backfillPreview && (
                      <p className="mt-4 text-sm text-slate-400 dark:text-neutral-500 italic">No merchant mappings yet. Use backfill or categorize transactions to build memory.</p>
                    )}
                </div>
            </div>
          )}

          {/* BANKS TAB */}
          {activeTab === 'banks' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
               {/* Bank List */}
               <div className="lg:col-span-2 space-y-4">
                  <h3 className="text-lg font-bold text-slate-800 dark:text-neutral-200">Your Accounts</h3>
                  <div className="grid grid-cols-1 gap-3">
                     {banks.map(bank => (
                       <div key={bank.id} className="bg-white dark:bg-neutral-800 p-4 rounded-xl border border-slate-200 dark:border-neutral-600 shadow-sm flex items-center justify-between group">
                          <div className="flex items-center gap-4">
                             <div className="w-12 h-12 bg-slate-900 dark:bg-neutral-600 text-white rounded-lg flex items-center justify-center font-bold text-lg shadow-md">
                                {bank.icon}
                             </div>
                             <div>
                                <h4 className="font-bold text-slate-900 dark:text-neutral-200">{bank.name}</h4>
                                <span className="text-xs font-bold text-slate-500 dark:text-neutral-500 bg-slate-100 dark:bg-neutral-700 px-2 py-0.5 rounded-md">{bank.currency}</span>
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
                  <div className="bg-white dark:bg-neutral-800 rounded-[10px] border border-slate-200 dark:border-neutral-600 shadow-sm overflow-hidden sticky top-6">
                     <div className="p-3 border-b border-slate-100 dark:border-neutral-700 bg-slate-50/50 dark:bg-neutral-700/50 flex items-center gap-2">
                        <Building size={16} className="text-slate-500 dark:text-neutral-500" />
                        <h3 className="text-sm font-bold text-slate-800 dark:text-neutral-200">Add Bank Account</h3>
                     </div>
                     <form onSubmit={handleAddBankSubmit} className="p-5 space-y-4">
                        <div>
                           <label className="block text-xs font-bold text-slate-500 dark:text-neutral-500 uppercase mb-1.5">Bank Name</label>
                           <input
                             type="text"
                             required
                             value={newBankName}
                             onChange={(e) => setNewBankName(e.target.value)}
                             placeholder="e.g. HSBC"
                             className="w-full px-3 py-2.5 bg-slate-50 dark:bg-neutral-700 border border-slate-200 dark:border-neutral-600 rounded-lg text-sm font-semibold text-slate-700 dark:text-neutral-400 focus:border-[#635bff] focus:ring-2 focus:ring-[#635bff]/10 outline-none"
                           />
                        </div>

                        <div>
                           <label className="block text-xs font-bold text-slate-500 dark:text-neutral-500 uppercase mb-1.5">Currency</label>
                           <div className="relative">
                              <select
                                value={newBankCurrency}
                                onChange={(e) => setNewBankCurrency(e.target.value)}
                                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-neutral-700 border border-slate-200 dark:border-neutral-600 rounded-lg text-sm font-semibold text-slate-700 dark:text-neutral-400 focus:border-[#635bff] focus:ring-2 focus:ring-[#635bff]/10 outline-none appearance-none cursor-pointer"
                              >
                                 <option value="GBP">GBP (£)</option>
                                 <option value="USD">USD ($)</option>
                                 <option value="EUR">EUR (€)</option>
                                 <option value="AED">AED (Dh)</option>
                              </select>
                              <ChevronRight size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-neutral-500 rotate-90 pointer-events-none" />
                           </div>
                        </div>

                        <button
                          type="submit"
                          className="w-full py-2.5 bg-slate-900 dark:bg-neutral-600 hover:bg-slate-800 text-white font-bold rounded-lg shadow-md transition-all flex items-center justify-center gap-2"
                        >
                           <Plus size={16} />
                           Add Account
                        </button>
                     </form>
                  </div>
               </div>
            </div>
          )}

          {/* Account: change password, then sign out */}
          <div className="mt-8 pt-6 border-t border-slate-200 dark:border-neutral-600">
            <ImportReminders />
            <div className="mt-4"><ChangePassword /></div>
          </div>

          {/* Logout Section */}
          {onLogout && (
            <div className="mt-4">
              <div className="bg-white dark:bg-neutral-800 rounded-xl border border-slate-200 dark:border-neutral-600 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-800 dark:text-neutral-200">Sign Out</h3>
                    <p className="text-sm text-slate-500 dark:text-neutral-500">Log out of your account</p>
                  </div>
                  <button
                    onClick={onLogout}
                    className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold rounded-lg transition-colors flex items-center gap-2"
                  >
                    <LogOut size={16} />
                    Logout
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
    </div>
  );
};

export default SettingsManager;
