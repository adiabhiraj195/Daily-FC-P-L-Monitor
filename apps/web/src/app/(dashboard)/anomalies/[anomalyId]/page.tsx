'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { fetchApi } from '../../../../lib/api-client';
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  HelpCircle,
  Clock,
  ArrowLeft,
  Bot,
  ShieldAlert,
  Send
} from 'lucide-react';
import Link from 'next/link';

export default function AnomalyDetailPage() {
  const params = useParams();
  const anomalyId = params.anomalyId as string;

  const [dismissReason, setDismissReason] = useState('');
  const [showDismissInput, setShowDismissInput] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const { data: anomaly, refetch, isLoading } = useQuery({
    queryKey: ['anomaly-detail', anomalyId],
    queryFn: () => fetchApi<any>(`/anomalies/${anomalyId}`)
  });

  const handleStatusUpdate = async (status: string, reason?: string) => {
    try {
      await fetchApi(`/anomalies/${anomalyId}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reason })
      });
      setActionMessage(`Status updated to ${status}`);
      setShowDismissInput(false);
      refetch();
    } catch (err: any) {
      alert(`Update failed: ${err.message}`);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;

    try {
      await fetchApi(`/anomalies/${anomalyId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ note: newNote })
      });
      setNewNote('');
      refetch();
    } catch (err: any) {
      alert(`Failed to add note: ${err.message}`);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-xs text-slate-500">Loading anomaly report...</div>;
  }

  if (!anomaly) {
    return <div className="p-8 text-center text-xs text-red-500">Anomaly not found</div>;
  }

  const pnl = anomaly.dailyPnl;
  const fc = pnl?.submission?.fc;
  const dateStr = pnl?.submission?.businessDate?.split('T')[0];
  const aiReport = pnl?.aiReport;
  const investigation = aiReport?.investigation;
  const recommendations = aiReport?.recommendations;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Back button */}
      <div>
        <Link
          href="/anomalies"
          className="inline-flex items-center text-xs font-semibold text-slate-500 hover:text-slate-800 mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          Back to Anomalies Directory
        </Link>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-3">
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-100 text-red-800">
                {anomaly.type}
              </span>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                {anomaly.metricKey} Breach — {fc?.name} ({fc?.code})
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Business Date: <strong>{dateStr}</strong> | Severity: <strong>{anomaly.severity}</strong>
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold text-slate-500">Current Status:</span>
            <span className="text-xs font-bold px-2.5 py-1 rounded bg-slate-900 text-white">
              {anomaly.reviewStatus}
            </span>
          </div>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold">
          {actionMessage}
        </div>
      )}

      {/* SECTION 1: Deterministic Verified Financial Facts */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center">
          <ShieldAlert className="w-4 h-4 text-blue-600 mr-2" />
          Section 1: Verified Deterministic Financial Facts (System of Record)
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-3.5 bg-slate-50 rounded-lg">
            <div className="text-[11px] text-slate-500 font-semibold uppercase">Actual % of Revenue</div>
            <div className="text-xl font-bold text-slate-900 mt-1">
              {Number(anomaly.actualPct).toFixed(2)}%
            </div>
          </div>
          <div className="p-3.5 bg-slate-50 rounded-lg">
            <div className="text-[11px] text-slate-500 font-semibold uppercase">Configured Target Band</div>
            <div className="text-xl font-bold text-slate-800 mt-1">
              {anomaly.targetMinPct ? `${Number(anomaly.targetMinPct).toFixed(1)}% – ${Number(anomaly.targetMaxPct).toFixed(1)}%` : 'N/A'}
            </div>
          </div>
          <div className="p-3.5 bg-slate-50 rounded-lg">
            <div className="text-[11px] text-slate-500 font-semibold uppercase">Deviation Margin</div>
            <div className="text-xl font-bold text-amber-600 mt-1">
              +{Number(anomaly.deviationPP || 0).toFixed(2)}pp
            </div>
          </div>
          <div className="p-3.5 bg-slate-50 rounded-lg">
            <div className="text-[11px] text-slate-500 font-semibold uppercase">Deterministic Overrun</div>
            <div className="text-xl font-bold text-red-600 mt-1">
              {anomaly.impactAmount ? `₹${Number(anomaly.impactAmount).toLocaleString('en-IN')}` : '—'}
            </div>
          </div>
        </div>

        <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-200 text-xs text-slate-600">
          <strong>Rule Validation:</strong> {anomaly.description}
        </div>
      </div>

      {/* SECTION 2: AI Investigation Agent Findings */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center">
            <Bot className="w-4 h-4 text-indigo-600 mr-2" />
            Section 2: AI Investigation Agent Analysis
          </h3>
          <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold border border-indigo-200">
            {aiReport ? `Status: ${aiReport.status}` : 'AI Pending'}
          </span>
        </div>

        {investigation ? (
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-indigo-50/50 rounded-lg border border-indigo-100">
              <div className="font-bold text-slate-900 text-sm mb-1">Investigation Summary:</div>
              <p className="text-slate-700 leading-relaxed">{investigation.summary}</p>
            </div>

            <div>
              <div className="font-bold text-slate-800 mb-2 uppercase text-[11px] tracking-wider">
                Corroborated Findings & Evidence References:
              </div>
              <div className="space-y-2">
                {investigation.findings?.map((f: any, idx: number) => (
                  <div key={idx} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{f.lineItem}</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                        Confidence: {f.confidence}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-600">{f.explanation}</p>
                    <div className="mt-2 flex items-center space-x-1.5 text-[10px] text-slate-400">
                      <span>Evidence Refs:</span>
                      {f.evidenceRefs?.map((ref: string, i: number) => (
                        <code key={i} className="px-1 py-0.5 bg-slate-200 text-slate-700 rounded font-mono">
                          {ref}
                        </code>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {investigation.possibleCauses?.length > 0 && (
              <div>
                <div className="font-bold text-slate-800 mb-2 uppercase text-[11px] tracking-wider">
                  Hypothesized Root Causes (Subject to Verification):
                </div>
                <ul className="list-disc pl-5 space-y-1 text-slate-600">
                  {investigation.possibleCauses.map((c: any, i: number) => (
                    <li key={i}>{c.cause} (Confidence: {c.confidence})</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="text-slate-400 text-xs italic py-4">
            AI Investigation report not available for this record.
          </div>
        )}
      </div>

      {/* SECTION 3: AI Recommendation Agent Actions */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center">
          <CheckCircle className="w-4 h-4 text-emerald-600 mr-2" />
          Section 3: AI Recommendation Agent Action Items
        </h3>

        {recommendations?.recommendations?.length > 0 ? (
          <div className="space-y-3">
            {recommendations.recommendations.map((rec: any, idx: number) => (
              <div
                key={idx}
                className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                      [{rec.responsibleTeam}]
                    </span>
                    <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                      rec.priority === 'CRITICAL' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      Priority: {rec.priority}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 mt-2">{rec.action}</div>
                  <div className="text-slate-500 mt-0.5">{rec.reason}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-slate-400 text-xs italic py-4">No recommendations recorded.</div>
        )}
      </div>

      {/* SECTION 4: Manager Review Governance & Actions */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
          Section 4: Manager Review & Governance Actions
        </h3>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => handleStatusUpdate('ACKNOWLEDGED')}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs transition-colors"
          >
            Acknowledge Anomaly
          </button>
          <button
            onClick={() => handleStatusUpdate('RESOLVED')}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors"
          >
            Mark Resolved
          </button>
          <button
            onClick={() => setShowDismissInput(!showDismissInput)}
            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-800 text-white font-semibold text-xs transition-colors"
          >
            Dismiss Anomaly...
          </button>
        </div>

        {showDismissInput && (
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-300 space-y-3">
            <label className="block text-xs font-bold text-slate-700">
              Mandatory Dismissal Justification Reason:
            </label>
            <input
              type="text"
              value={dismissReason}
              onChange={e => setDismissReason(e.target.value)}
              placeholder="e.g., Pre-approved festival surge overtime, planned variance."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => handleStatusUpdate('DISMISSED', dismissReason)}
              disabled={!dismissReason.trim()}
              className="px-4 py-1.5 bg-red-600 text-white text-xs font-bold rounded disabled:opacity-50"
            >
              Confirm Dismissal
            </button>
          </div>
        )}

        {/* Audit Timeline */}
        <div className="pt-6 border-t border-slate-100">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center">
            <Clock className="w-3.5 h-3.5 text-slate-400 mr-1.5" />
            Append-Only Audit Review History:
          </h4>
          <div className="space-y-2">
            {(anomaly.reviews || []).map((rev: any) => (
              <div key={rev.id} className="p-3 bg-slate-50 rounded-lg text-xs border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">{rev.actor?.name} ({rev.actor?.email})</span>
                  <span className="text-[11px] text-slate-400">{new Date(rev.createdAt).toLocaleString()}</span>
                </div>
                <div className="mt-1 font-semibold text-blue-700">{rev.action}</div>
                {rev.reason && <div className="text-slate-600 mt-0.5">Reason: {rev.reason}</div>}
                {rev.comment && <div className="text-slate-600 mt-0.5">Note: {rev.comment}</div>}
              </div>
            ))}
          </div>

          {/* Add Note Form */}
          <form onSubmit={handleAddNote} className="mt-4 flex space-x-2">
            <input
              type="text"
              value={newNote}
              onChange={e => setNewNote(e.target.value)}
              placeholder="Add investigation note to audit trail..."
              className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg flex items-center"
            >
              <Send className="w-3.5 h-3.5 mr-1" />
              Add Note
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
