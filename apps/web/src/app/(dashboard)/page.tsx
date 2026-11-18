'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { fetchApi } from '../../lib/api-client';
import { ColourBadge, SubmissionStatusBadge } from '../../components/common/Badge';
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Building2,
  Calendar,
  Layers,
  ArrowRight
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid
} from 'recharts';

export default function DashboardPage() {
  const [selectedDate, setSelectedDate] = useState('2026-11-20');
  const [colourFilter, setColourFilter] = useState<string>('ALL');

  // Summary query
  const { data: summary, isLoading: isSummaryLoading } = useQuery({
    queryKey: ['dashboard-summary', selectedDate],
    queryFn: () => fetchApi<any>(`/dashboard/summary?date=${selectedDate}`)
  });

  // FC Status table query
  const { data: fcStatusList, isLoading: isListLoading } = useQuery({
    queryKey: ['dashboard-fc-status', selectedDate],
    queryFn: () => fetchApi<any[]>(`/dashboard/fc-status?date=${selectedDate}`)
  });

  // Trends query
  const { data: trendData } = useQuery({
    queryKey: ['dashboard-trends'],
    queryFn: () => fetchApi<any[]>(`/dashboard/trends`)
  });

  const filteredList = (fcStatusList || []).filter(item => {
    if (colourFilter !== 'ALL' && item.colour !== colourFilter) return false;
    return true;
  });

  return (
    <div className="space-y-8">
      {/* Top Banner / Date Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Executive Margin Overview</h2>
          <p className="text-xs text-slate-500 mt-1">
            Real-time daily contribution margin governance across fulfilment centres
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 shadow-inner">
            <Calendar className="w-4 h-4 text-slate-400 mr-2" />
            <span className="text-xs font-semibold text-slate-600 mr-2">Business Date:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="text-xs font-bold text-slate-800 bg-transparent focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Revenue & Submissions */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <span>Total Network Revenue</span>
            <DollarSign className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">
              {summary ? `₹${Number(summary.aggregates.totalRevenue).toLocaleString('en-IN')}` : '...'}
            </div>
            <div className="text-xs text-slate-500 mt-1 flex items-center space-x-2">
              <span>Received: <strong className="text-slate-800">{summary?.receivedCount ?? 0}</strong>/{summary?.activeFcsCount ?? 0}</span>
              {summary?.missingCount > 0 && (
                <span className="text-red-600 font-bold bg-red-50 px-1.5 py-0.5 rounded">
                  {summary.missingCount} Missing
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Card 2: Weighted CM1% */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <span>Weighted CM1 Margin</span>
            <TrendingUp className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">
              {summary ? `${Number(summary.aggregates.weightedCM1Pct).toFixed(2)}%` : '...'}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Target band: <span className="font-semibold text-slate-700">65.0% – 70.0%</span>
            </div>
          </div>
        </div>

        {/* Card 3: Weighted CM2% */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <span>Weighted CM2 Margin</span>
            <Layers className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">
              {summary ? `${Number(summary.aggregates.weightedCM2Pct).toFixed(2)}%` : '...'}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Target band: <span className="font-semibold text-slate-700">15.0% – 30.0%</span>
            </div>
          </div>
        </div>

        {/* Card 4: Open Anomalies & Colour Health */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <span>Network Health Status</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <div className="space-x-1">
              <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-red-100 text-red-800">
                {summary?.colourCounts.RED ?? 0} Red
              </span>
              <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800">
                {summary?.colourCounts.YELLOW ?? 0} Ylw
              </span>
              <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800">
                {summary?.colourCounts.GREEN ?? 0} Grn
              </span>
              <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-800">
                {summary?.colourCounts.BLUE ?? 0} Blu
              </span>
            </div>
          </div>
          <div className="text-xs text-slate-500 mt-2 font-medium">
            Open anomalies requiring review: <strong className="text-slate-800">{summary?.openAnomaliesCount ?? 0}</strong>
          </div>
        </div>
      </div>

      {/* Chart: Network Margin & Revenue Trends */}
      {trendData && trendData.length > 0 && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">
            Network Margin & Revenue Trend (Weighted)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                <YAxis yAxisId="left" stroke="#94a3b8" fontSize={11} />
                <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" fontSize={11} domain={[0, 100]} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar yAxisId="left" dataKey="totalRevenue" name="Total Revenue (INR)" fill="#93c5fd" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="weightedCM1Pct" name="Weighted CM1 %" stroke="#4f46e5" strokeWidth={2} />
                <Line yAxisId="right" type="monotone" dataKey="weightedCM2Pct" name="Weighted CM2 %" stroke="#10b981" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Fulfilment Centres Status Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">Fulfilment Centre Status Table</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Individual FC contribution margins and anomaly counts for {selectedDate}
            </p>
          </div>

          <div className="flex items-center space-x-2 text-xs">
            <span className="font-semibold text-slate-500">Filter Status:</span>
            {['ALL', 'RED', 'YELLOW', 'GREEN', 'BLUE'].map(colour => (
              <button
                key={colour}
                onClick={() => setColourFilter(colour)}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                  colourFilter === colour
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {colour}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">FC Code & Name</th>
                <th className="py-3 px-4">Manager</th>
                <th className="py-3 px-4 text-right">Revenue</th>
                <th className="py-3 px-4 text-right">CM1 %</th>
                <th className="py-3 px-4 text-right">CM2 %</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Colour</th>
                <th className="py-3 px-4 text-center">Anomalies</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredList.map(fc => (
                <tr key={fc.fcId} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-slate-900">{fc.fcCode}</div>
                    <div className="text-[11px] text-slate-500 truncate max-w-xs">{fc.fcName}</div>
                  </td>
                  <td className="py-3.5 px-4 text-slate-600">
                    {fc.manager ? fc.manager.name : <span className="text-slate-400 italic">Unassigned</span>}
                  </td>
                  <td className="py-3.5 px-4 text-right font-medium text-slate-900">
                    {fc.revenue ? `₹${Number(fc.revenue).toLocaleString('en-IN')}` : '—'}
                  </td>
                  <td className="py-3.5 px-4 text-right font-bold text-slate-800">
                    {fc.cm1Pct ? `${Number(fc.cm1Pct).toFixed(2)}%` : '—'}
                  </td>
                  <td className="py-3.5 px-4 text-right font-bold text-slate-800">
                    {fc.cm2Pct ? `${Number(fc.cm2Pct).toFixed(2)}%` : '—'}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <SubmissionStatusBadge status={fc.submissionStatus} />
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <ColourBadge colour={fc.colour} />
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    {fc.anomaliesCount > 0 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                        {fc.anomaliesCount} Flagged
                      </span>
                    ) : (
                      <span className="text-slate-400 font-medium">None</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <Link
                      href={`/fcs/${fc.fcId}`}
                      className="inline-flex items-center text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      View Details
                      <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Link>
                  </td>
                </tr>
              ))}
              {filteredList.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400 italic">
                    No fulfilment centres match the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
