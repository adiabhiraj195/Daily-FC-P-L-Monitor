'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { fetchApi } from '../../../../lib/api-client';
import { ColourBadge } from '../../../../components/common/Badge';
import {
  Building2,
  Calendar,
  AlertTriangle,
  RotateCw,
  TrendingUp,
  Layers,
  ArrowLeft
} from 'lucide-react';
import Link from 'next/link';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid
} from 'recharts';

export default function FCDetailPage() {
  const params = useParams();
  const fcId = params.fcId as string;
  const [dateRange, setDateRange] = useState({ from: '2026-11-01', to: '2026-11-30' });

  // FC Details query
  const { data: fc } = useQuery({
    queryKey: ['fc-detail', fcId],
    queryFn: () => fetchApi<any>(`/fcs/${fcId}`)
  });

  // P&L records query
  const { data: pnlRecords, refetch: refetchPnl } = useQuery({
    queryKey: ['fc-pnl', fcId, dateRange.from, dateRange.to],
    queryFn: () => fetchApi<any[]>(`/fcs/${fcId}/pnl?from=${dateRange.from}&to=${dateRange.to}`)
  });

  // Anomalies query
  const { data: anomalies } = useQuery({
    queryKey: ['fc-anomalies', fcId],
    queryFn: () => fetchApi<any[]>(`/fcs/${fcId}/anomalies`)
  });

  const latestPnl = pnlRecords && pnlRecords[0];

  // Chart data
  const chartData = (pnlRecords || [])
    .slice()
    .reverse()
    .map(p => ({
      date: p.submission.businessDate.split('T')[0],
      revenue: Number(p.revenue),
      cm1Pct: Number(p.cm1Pct),
      cm2Pct: Number(p.cm2Pct)
    }));

  return (
    <div className="space-y-8">
      {/* Back button & Header */}
      <div>
        <Link
          href="/fcs"
          className="inline-flex items-center text-xs font-semibold text-slate-500 hover:text-slate-800 mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          Back to Fulfilment Centres Directory
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div>
            <div className="flex items-center space-x-3">
              <span className="text-sm font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
                {fc?.code}
              </span>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">{fc?.name}</h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Location: <strong>{fc?.location || 'General'}</strong> | Manager:{' '}
              <strong>{fc?.managers && fc.managers[0] ? fc.managers[0].user.name : 'Unassigned'}</strong>
            </p>
          </div>
        </div>
      </div>

      {/* Latest Performance Snapshot */}
      {latestPnl && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Latest P&L Result ({latestPnl.submission.businessDate.split('T')[0]} - Version {latestPnl.submission.version})
            </h3>
            <ColourBadge colour={latestPnl.colour} />
          </div>

          {/* Key Metric Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-50 rounded-xl">
              <div className="text-xs text-slate-500 font-semibold uppercase">Daily Revenue</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">
                ₹{Number(latestPnl.revenue).toLocaleString('en-IN')}
              </div>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl">
              <div className="text-xs text-slate-500 font-semibold uppercase">Contribution Margin 1 (CM1)</div>
              <div className="text-2xl font-bold text-indigo-600 mt-1">
                {Number(latestPnl.cm1Pct).toFixed(2)}%
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">Amount: ₹{Number(latestPnl.cm1).toLocaleString('en-IN')} (Target: 65-70%)</div>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl">
              <div className="text-xs text-slate-500 font-semibold uppercase">Contribution Margin 2 (CM2)</div>
              <div className="text-2xl font-bold text-emerald-600 mt-1">
                {Number(latestPnl.cm2Pct).toFixed(2)}%
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">Amount: ₹{Number(latestPnl.cm2).toLocaleString('en-IN')} (Target: 15-30%)</div>
            </div>
          </div>

          {/* 6 Cost Line Items Breakdown */}
          <div>
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
              Six Direct Cost Lines Breakdown
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-semibold uppercase border-b border-slate-200">
                    <th className="py-2.5 px-3">Cost Line</th>
                    <th className="py-2.5 px-3 text-right">Actual Amount</th>
                    <th className="py-2.5 px-3 text-right">Actual %</th>
                    <th className="py-2.5 px-3 text-center">Target Band</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-right">Overrun Impact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {latestPnl.costLines.map((line: any) => (
                    <tr key={line.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-semibold text-slate-800">{line.lineItem}</td>
                      <td className="py-2.5 px-3 text-right font-medium text-slate-900">
                        ₹{Number(line.amount).toLocaleString('en-IN')}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-800">
                        {Number(line.percentage).toFixed(2)}%
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-500">
                        {line.targetMinPct ? `${Number(line.targetMinPct).toFixed(1)}% – ${Number(line.targetMaxPct).toFixed(1)}%` : 'Not Configured'}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          line.status === 'ABOVE_MAX'
                            ? 'bg-red-100 text-red-800'
                            : line.status === 'BELOW_MIN'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {line.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-red-600">
                        {line.excessAmount ? `+₹${Number(line.excessAmount).toLocaleString('en-IN')}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Historical Margin Chart */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">
            Margin Performance Trend (CM1% & CM2%)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} domain={[0, 100]} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line type="monotone" dataKey="cm1Pct" name="CM1 Margin %" stroke="#4f46e5" strokeWidth={2} />
                <Line type="monotone" dataKey="cm2Pct" name="CM2 Margin %" stroke="#10b981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Flagged Anomalies & AI Reports */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
          Flagged Anomalies & AI Investigations History
        </h3>

        <div className="space-y-3">
          {(anomalies || []).map((anomaly: any) => (
            <div
              key={anomaly.id}
              className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between hover:border-blue-400 transition-colors"
            >
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-xs text-slate-900">{anomaly.type}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold">
                    {anomaly.metricKey}
                  </span>
                  <span className="text-xs font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                    Status: {anomaly.reviewStatus}
                  </span>
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  {anomaly.description}
                </div>
              </div>

              <Link
                href={`/anomalies/${anomaly.id}`}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800"
              >
                Review AI Report →
              </Link>
            </div>
          ))}
          {(!anomalies || anomalies.length === 0) && (
            <div className="text-center py-6 text-slate-400 italic text-xs">
              No anomalies recorded for this fulfilment centre.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
