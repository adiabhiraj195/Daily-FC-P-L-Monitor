'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '../../../lib/api-client';
import { SubmissionStatusBadge, ColourBadge } from '../../../components/common/Badge';
import { Calendar, Building2, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function SubmissionsMonitorPage() {
  const [selectedDate, setSelectedDate] = useState('2026-11-20');

  const { data: fcStatusList, isLoading } = useQuery({
    queryKey: ['submissions-monitor', selectedDate],
    queryFn: () => fetchApi<any[]>(`/dashboard/fc-status?date=${selectedDate}`)
  });

  const missingList = (fcStatusList || []).filter(fc => fc.submissionStatus === 'MISSING');
  const receivedList = (fcStatusList || []).filter(fc => fc.submissionStatus !== 'MISSING');

  return (
    <div className="space-y-8">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Daily Submission Monitor</h2>
          <p className="text-xs text-slate-500 mt-1">
            Tracks data arrival, pipeline processing state, and explicit missing FC submissions
          </p>
        </div>

        <div className="flex items-center space-x-2 bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 shadow-inner">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-semibold text-slate-600">Selected Date:</span>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="text-xs font-bold text-slate-800 bg-transparent focus:outline-none"
          />
        </div>
      </div>

      {/* Missing Submissions Alert Callout if any */}
      {missingList.length > 0 && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start space-x-3 text-rose-900">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-bold">
              {missingList.length} Fulfilment Centre(s) with MISSING Submissions
            </div>
            <div className="text-xs text-rose-700 mt-0.5">
              The following FCs have not submitted financial data for {selectedDate}:{' '}
              <strong>{missingList.map(f => `${f.fcName} (${f.fcCode})`).join(', ')}</strong>.
              Leadership has been notified and alerts are generated.
            </div>
          </div>
        </div>
      )}

      {/* Grid of All FCs and their Ingestion States */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(fcStatusList || []).map(fc => {
          const isMissing = fc.submissionStatus === 'MISSING';

          return (
            <div
              key={fc.fcId}
              className={`p-5 rounded-xl border transition-all ${
                isMissing
                  ? 'bg-rose-50/50 border-rose-200 shadow-sm'
                  : 'bg-white border-slate-200 shadow-sm hover:border-blue-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-slate-900">{fc.fcCode}</span>
                <SubmissionStatusBadge status={fc.submissionStatus} />
              </div>

              <div className="text-xs text-slate-600 font-medium mt-1 truncate">
                {fc.fcName}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <div className="text-slate-500">
                  Manager: <span className="font-semibold text-slate-700">{fc.manager?.name || 'Unassigned'}</span>
                </div>
                {fc.colour && <ColourBadge colour={fc.colour} />}
              </div>

              <div className="mt-3 flex justify-end">
                <Link
                  href={`/fcs/${fc.fcId}`}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                >
                  View FC Timeline →
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
