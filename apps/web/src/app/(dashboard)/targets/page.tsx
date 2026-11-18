'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '../../../lib/api-client';
import { useAuth } from '../../../components/providers';
import { Sliders, PlusCircle, AlertCircle, CheckCircle } from 'lucide-react';

export default function TargetRulesPage() {
  const { user } = useAuth();
  const [metricKey, setMetricKey] = useState('MANPOWER');
  const [minPct, setMinPct] = useState('15.0');
  const [maxPct, setMaxPct] = useState('20.0');
  const [effectiveFrom, setEffectiveFrom] = useState('2026-01-01');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: rules, refetch } = useQuery({
    queryKey: ['target-rules'],
    queryFn: () => fetchApi<any[]>('/target-rules')
  });

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      await fetchApi('/target-rules', {
        method: 'POST',
        body: JSON.stringify({
          metricKey,
          minPct,
          maxPct,
          effectiveFrom
        })
      });
      setStatusMessage('Target rule created successfully.');
      refetch();
    } catch (err: any) {
      alert(`Failed to create target rule: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (user?.role !== 'ADMIN') {
    return (
      <div className="p-8 text-center text-xs text-red-600 font-bold bg-white rounded-xl border border-red-200">
        Access Restricted: Only System Administrators can configure target rules.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Financial Target Rules Governance</h2>
        <p className="text-xs text-slate-500 mt-1">
          Configure effective-dated target ranges for direct cost lines and contribution margins
        </p>
      </div>

      {statusMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold flex items-center">
          <CheckCircle className="w-4 h-4 mr-2" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Create New Rule Form */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center">
          <PlusCircle className="w-4 h-4 text-blue-600 mr-2" />
          Create New Target Rule
        </h3>

        <form onSubmit={handleCreateRule} className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end text-xs">
          <div>
            <label className="block font-semibold text-slate-600 mb-1">Metric Key:</label>
            <select
              value={metricKey}
              onChange={e => setMetricKey(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="MANPOWER">MANPOWER</option>
              <option value="PACKAGING">PACKAGING</option>
              <option value="POWER_AND_FUEL">POWER_AND_FUEL</option>
              <option value="FC_RENT">FC_RENT</option>
              <option value="EQUIPMENT_RENTALS">EQUIPMENT_RENTALS</option>
              <option value="OVERHEADS">OVERHEADS</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-600 mb-1">Min Target %:</label>
            <input
              type="number"
              step="0.01"
              required
              value={minPct}
              onChange={e => setMinPct(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-600 mb-1">Max Target %:</label>
            <input
              type="number"
              step="0.01"
              required
              value={maxPct}
              onChange={e => setMaxPct(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-600 mb-1">Effective From:</label>
            <input
              type="date"
              required
              value={effectiveFrom}
              onChange={e => setEffectiveFrom(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div className="sm:col-span-4 flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors"
            >
              {isSubmitting ? 'Saving...' : 'Add Target Rule'}
            </button>
          </div>
        </form>
      </div>

      {/* Target Rules Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Active Target Rules
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-semibold uppercase border-b border-slate-200">
                <th className="py-3 px-4">Metric</th>
                <th className="py-3 px-4">Scope</th>
                <th className="py-3 px-4 text-center">Min %</th>
                <th className="py-3 px-4 text-center">Max %</th>
                <th className="py-3 px-4">Effective From</th>
                <th className="py-3 px-4">Effective To</th>
                <th className="py-3 px-4">Created By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(rules || []).map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="py-3.5 px-4 font-bold text-slate-900">{r.metricKey}</td>
                  <td className="py-3.5 px-4">
                    {r.fc ? (
                      <span className="font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                        {r.fc.code}
                      </span>
                    ) : (
                      <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                        Global
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-center font-bold text-slate-800">
                    {Number(r.minPct).toFixed(1)}%
                  </td>
                  <td className="py-3.5 px-4 text-center font-bold text-slate-800">
                    {Number(r.maxPct).toFixed(1)}%
                  </td>
                  <td className="py-3.5 px-4 text-slate-600">{r.effectiveFrom.split('T')[0]}</td>
                  <td className="py-3.5 px-4 text-slate-600">
                    {r.effectiveTo ? r.effectiveTo.split('T')[0] : 'Indefinite'}
                  </td>
                  <td className="py-3.5 px-4 text-slate-500">{r.createdBy?.name || 'System'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
