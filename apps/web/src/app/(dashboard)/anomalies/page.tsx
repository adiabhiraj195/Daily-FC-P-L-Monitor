'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '../../../lib/api-client';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function AnomaliesListPage() {
  const { data: anomalies, isLoading } = useQuery({
    queryKey: ['anomalies-list'],
    queryFn: () => fetchApi<any[]>('/anomalies')
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Anomalies & AI Investigations</h2>
        <p className="text-xs text-slate-500 mt-1">
          Review financial threshold breaches, AI root cause findings, and manager action items
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">FC</th>
                <th className="py-3 px-4">Anomaly Type</th>
                <th className="py-3 px-4">Metric</th>
                <th className="py-3 px-4 text-right">Actual %</th>
                <th className="py-3 px-4 text-right">Overrun Impact</th>
                <th className="py-3 px-4 text-center">Severity</th>
                <th className="py-3 px-4 text-center">Review Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(anomalies || []).map(anom => {
                const fc = anom.dailyPnl?.submission?.fc;
                const date = anom.dailyPnl?.submission?.businessDate?.split('T')[0];

                return (
                  <tr key={anom.id} className="hover:bg-slate-50">
                    <td className="py-3.5 px-4 font-medium text-slate-700">{date}</td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      {fc ? `${fc.code}` : '—'}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-800">{anom.type}</td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded bg-slate-100 font-bold text-slate-700">
                        {anom.metricKey}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-slate-800">
                      {Number(anom.actualPct).toFixed(2)}%
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-red-600">
                      {anom.impactAmount ? `₹${Number(anom.impactAmount).toLocaleString('en-IN')}` : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        anom.severity === 'CRITICAL'
                          ? 'bg-red-100 text-red-800'
                          : anom.severity === 'HIGH'
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {anom.severity}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold text-[10px]">
                        {anom.reviewStatus}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <Link
                        href={`/anomalies/${anom.id}`}
                        className="inline-flex items-center text-xs font-semibold text-blue-600 hover:text-blue-800"
                      >
                        Inspect Investigation
                        <ArrowRight className="w-3.5 h-3.5 ml-1" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {(!anomalies || anomalies.length === 0) && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400 italic">
                    No anomalies found.
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
