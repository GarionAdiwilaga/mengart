"use client";

import { useState } from "react";
import { Plus, Trash2, CheckCircle2, AlertCircle, Loader2, Sparkles, ShieldCheck, Ban, Info } from "lucide-react";
import { saveCommissionScopeRulesAction } from "@/app/actions/commissions";

interface ScopeRuleItem {
  id?: string;
  ruleType: "do" | "dont" | "general";
  title: string;
  description?: string | null;
  displayOrder: number;
}

interface ScopeRulesEditorProps {
  initialRules: ScopeRuleItem[];
}

export function ScopeRulesEditor({ initialRules }: ScopeRulesEditorProps) {
  const [rules, setRules] = useState<ScopeRuleItem[]>(initialRules || []);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<"do" | "dont" | "general">("do");
  const [isLoading, setIsLoading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const newItem: ScopeRuleItem = {
      ruleType: newType,
      title: newTitle.trim(),
      displayOrder: rules.length,
    };

    setRules((prev) => [...prev, newItem]);
    setNewTitle("");
  };

  const handleRemoveRule = (index: number) => {
    setRules((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveAll = async () => {
    setIsLoading(true);
    setError(null);
    setSavedSuccess(false);

    try {
      await saveCommissionScopeRulesAction(rules);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      setError(err?.message || "Gagal menyimpan ketentuan komisi");
    } finally {
      setIsLoading(false);
    }
  };

  const doRules = rules.filter((r) => r.ruleType === "do");
  const dontRules = rules.filter((r) => r.ruleType === "dont");
  const generalRules = rules.filter((r) => r.ruleType === "general");

  return (
    <div className="flex flex-col gap-6">
      {savedSuccess ? (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>Ketentuan Do/Don't komisi berhasil disimpan!</span>
        </div>
      ) : null}

      {error ? (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* Add New Rule Form */}
      <form onSubmit={handleAddRule} className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col sm:flex-row items-center gap-3">
        <div className="w-full sm:w-48">
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as any)}
            className="w-full px-3 py-2.5 rounded-xl bg-[#181c26] border border-white/10 text-white text-xs font-sans focus:outline-none"
          >
            <option value="do">DO (Menerima)</option>
            <option value="dont">DON'T (Tidak Menerima)</option>
            <option value="general">GENERAL (Ketentuan Umum)</option>
          </select>
        </div>

        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="contoh: Original Character (OC), Fanart, Mecha, NSFW..."
          className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none text-xs font-sans"
        />

        <button
          type="submit"
          className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>Tambah</span>
        </button>
      </form>

      {/* Scope Grid Display */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {/* DO Column */}
        <div className="glass-panel p-5 rounded-2xl flex flex-col gap-3">
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 border-b border-white/5 pb-2">
            <ShieldCheck className="h-4 w-4" />
            <span>DO (MENERIMA)</span>
          </div>
          {doRules.length === 0 ? (
            <span className="text-xs text-zinc-600 italic py-2">Belum ada daftar</span>
          ) : (
            <ul className="flex flex-col gap-2">
              {doRules.map((rule, idx) => (
                <li key={idx} className="flex items-center justify-between text-xs text-zinc-300 p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                  <span>{rule.title}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveRule(rules.indexOf(rule))}
                    className="text-zinc-500 hover:text-red-400 p-1"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* DON'T Column */}
        <div className="glass-panel p-5 rounded-2xl flex flex-col gap-3">
          <div className="flex items-center gap-2 text-xs font-mono text-red-400 border-b border-white/5 pb-2">
            <Ban className="h-4 w-4" />
            <span>DON'T (TIDAK MENERIMA)</span>
          </div>
          {dontRules.length === 0 ? (
            <span className="text-xs text-zinc-600 italic py-2">Belum ada daftar</span>
          ) : (
            <ul className="flex flex-col gap-2">
              {dontRules.map((rule, idx) => (
                <li key={idx} className="flex items-center justify-between text-xs text-zinc-300 p-2 rounded-lg bg-red-500/5 border border-red-500/20">
                  <span>{rule.title}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveRule(rules.indexOf(rule))}
                    className="text-zinc-500 hover:text-red-400 p-1"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* GENERAL Column */}
        <div className="glass-panel p-5 rounded-2xl flex flex-col gap-3">
          <div className="flex items-center gap-2 text-xs font-mono text-blue-400 border-b border-white/5 pb-2">
            <Info className="h-4 w-4" />
            <span>GENERAL (KETENTUAN UMUM)</span>
          </div>
          {generalRules.length === 0 ? (
            <span className="text-xs text-zinc-600 italic py-2">Belum ada daftar</span>
          ) : (
            <ul className="flex flex-col gap-2">
              {generalRules.map((rule, idx) => (
                <li key={idx} className="flex items-center justify-between text-xs text-zinc-300 p-2 rounded-lg bg-blue-500/5 border border-blue-500/20">
                  <span>{rule.title}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveRule(rules.indexOf(rule))}
                    className="text-zinc-500 hover:text-red-400 p-1"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSaveAll}
          disabled={isLoading}
          className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition-all shadow-md shadow-amber-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-black" />
              <span>Menyimpan Ketentuan...</span>
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5 text-black" />
              <span>Simpan Cakupan Do/Don't</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
