'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { fetchApi } from '../../../../lib/api-client';
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  ArrowLeft,
  Bot,
  ShieldAlert,
  Send,
  Sparkles,
  Copy,
  Check,
  Building2,
  Calendar,
  MapPin,
  TrendingDown,
  Layers,
  ChevronDown,
  ChevronUp,
  FileText,
  UserCheck,
  CheckSquare,
  Square,
  HelpCircle,
  Info
} from 'lucide-react';
import Link from 'next/link';
import {
  AnomalySeverityBadge,
  ReviewStatusBadge,
  AnomalyTypeBadge,
  ColourBadge
} from '../../../../components/common/Badge';

export default function AnomalyDetailPage() {
  const params = useParams();
  const anomalyId = params.anomalyId as string;

  const [dismissReason, setDismissReason] = useState('');
  const [showDismissInput, setShowDismissInput] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [showPnlContext, setShowPnlContext] = useState(false);
  const [completedActions, setCompletedActions] = useState<Record<number, boolean>>({});

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
      setActionMessage(`Review status successfully updated to ${status}`);
      setShowDismissInput(false);
      setDismissReason('');
      refetch();
      setTimeout(() => setActionMessage(null), 5000);
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

  const copySummaryToClipboard = () => {
    if (!anomaly) return;
    const pnl = anomaly.dailyPnl;
    const fc = pnl?.submission?.fc;
    const dateStr = pnl?.submission?.businessDate?.split('T')[0];
    const text = `PROZO ANOMALY REPORT
FC: ${fc?.code} - ${fc?.name}
Date: ${dateStr}
Breach: ${anomaly.metricKey} (${anomaly.type})
Actual: ${Number(anomaly.actualPct).toFixed(2)}% (Target: ${Number(anomaly.targetMinPct || 0).toFixed(1)}% - ${Number(anomaly.targetMaxPct || 0).toFixed(1)}%)
Deviation: +${Number(anomaly.deviationPP || 0).toFixed(2)} pp
Impact: ₹${Number(anomaly.impactAmount || 0).toLocaleString('en-IN')}
Severity: ${anomaly.severity}
Status: ${anomaly.reviewStatus}
AI Summary: ${pnl?.aiReport?.investigation?.summary || 'N/A'}`;

    navigator.clipboard.writeText(text);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  const toggleActionItem = (idx: number) => {
    setCompletedActions(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  // Human readable metric name
  const formatMetricKey = (key: string) => {
    const map: Record<string, string> = {
      manpowerCost: 'Manpower Cost',
      packagingCost: 'Packaging Cost',
      powerFuelCost: 'Power & Fuel Cost',
      fcRent: 'FC Rent',
      equipmentRentals: 'Equipment Rentals',
      overheads: 'Overheads',
      cm1: 'CM1 Margin',
      cm1Pct: 'CM1 % Margin',
      cm2: 'CM2 Margin',
      cm2Pct: 'CM2 % Margin',
      revenue: 'Revenue'
    };
    return map[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  };

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto p-12 text-center space-y-3">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="text-xs text-slate-500 font-medium">Loading comprehensive anomaly report...</p>
      </div>
    );
  }

  if (!anomaly) {
    return (
      <div className="max-w-5xl mx-auto p-12 bg-white rounded-xl border border-red-200 text-center space-y-3">
        <AlertTriangle className="w-8 h-8 text-red-500 mx-auto" />
        <h3 className="text-base font-bold text-slate-900">Anomaly Not Found</h3>
        <p className="text-xs text-slate-500">The requested anomaly ID could not be retrieved or has been removed.</p>
        <Link
          href="/anomalies"
          className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
          Back to Anomalies Directory
        </Link>
      </div>
    );
  }

  const pnl = anomaly.dailyPnl;
  const fc = pnl?.submission?.fc;
  const dateStr = pnl?.submission?.businessDate?.split('T')[0];
  const aiReport = pnl?.aiReport;
  const investigation = aiReport?.investigation;
  const recommendations = aiReport?.recommendations;

  const actualPctNum = Number(anomaly.actualPct || 0);
  const targetMinNum = Number(anomaly.targetMinPct || 0);
  const targetMaxNum = Number(anomaly.targetMaxPct || 0);
  const deviationNum = Number(anomaly.deviationPP || 0);
  const impactNum = Number(anomaly.impactAmount || 0);

  // Calculate breach gauge positioning
  const gaugeMax = Math.max(actualPctNum * 1.25, targetMaxNum * 1.3, 30);
  const minPosPct = Math.min(100, Math.max(0, (targetMinNum / gaugeMax) * 100));
  const maxPosPct = Math.min(100, Math.max(0, (targetMaxNum / gaugeMax) * 100));
  const actualPosPct = Math.min(100, Math.max(0, (actualPctNum / gaugeMax) * 100));

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Breadcrumb Navigation & Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center space-x-2 text-xs text-slate-500">
          <Link href="/anomalies" className="hover:text-blue-600 font-medium flex items-center">
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            Anomalies
          </Link>
          <span>/</span>
          <span className="font-semibold text-slate-700">{fc?.code}</span>
          <span>/</span>
          <span className="text-slate-400 font-mono text-[11px] truncate max-w-[120px]">{anomaly.id}</span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={copySummaryToClipboard}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center transition-colors shadow-2xs"
          >
            {copiedSummary ? (
              <>
                <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                Copied Summary
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 mr-1 text-slate-400" />
                Copy Summary
              </>
            )}
          </button>
          <Link
            href={`/fcs/${fc?.id}`}
            className="px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold flex items-center transition-colors"
          >
            <Building2 className="w-3.5 h-3.5 mr-1" />
            View FC Timeline
          </Link>
        </div>
      </div>

      {/* Hero Header Banner Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-xs border border-blue-200">
                {fc?.code}
              </span>
              <AnomalyTypeBadge type={anomaly.type} />
              <AnomalySeverityBadge severity={anomaly.severity} />
              {pnl?.colour && <ColourBadge colour={pnl.colour} />}
            </div>

            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {formatMetricKey(anomaly.metricKey)} Threshold Breach
            </h1>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
              <span className="flex items-center">
                <Building2 className="w-3.5 h-3.5 text-slate-400 mr-1.5" />
                <strong>{fc?.name}</strong>
              </span>
              {fc?.location && (
                <span className="flex items-center text-slate-500">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 mr-1.5" />
                  {fc.location}
                </span>
              )}
              <span className="flex items-center">
                <Calendar className="w-3.5 h-3.5 text-slate-400 mr-1.5" />
                Business Date: <strong className="ml-1 text-slate-800">{dateStr}</strong>
              </span>
            </div>
          </div>

          {/* Current Review Status & Overrun Badge */}
          <div className="flex flex-col md:items-end justify-center p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Governance Status
            </span>
            <div className="mt-1">
              <ReviewStatusBadge status={anomaly.reviewStatus} />
            </div>
            <div className="mt-2 text-right">
              <div className="text-[10px] text-slate-400 font-medium">Overrun Financial Impact</div>
              <div className="text-lg font-bold text-red-600">
                {impactNum > 0 ? `₹${impactNum.toLocaleString('en-IN')}` : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Visual Breach Meter / Progress Bar */}
        <div className="pt-3 border-t border-slate-100 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-slate-500">Metric Threshold Visualization:</span>
            <span className="text-red-600 font-bold">
              Actual: {actualPctNum.toFixed(2)}% (Breached target max by +{deviationNum.toFixed(2)} pp)
            </span>
          </div>

          <div className="relative h-6 bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
            {/* Target band zone */}
            <div
              className="absolute top-0 bottom-0 bg-emerald-100 border-x border-emerald-300"
              style={{
                left: `${minPosPct}%`,
                width: `${Math.max(2, maxPosPct - minPosPct)}%`
              }}
              title={`Target Allowed Band: ${targetMinNum.toFixed(1)}% - ${targetMaxNum.toFixed(1)}%`}
            />

            {/* Overrun zone */}
            {actualPosPct > maxPosPct && (
              <div
                className="absolute top-0 bottom-0 bg-rose-200/80 border-r border-rose-400"
                style={{
                  left: `${maxPosPct}%`,
                  width: `${actualPosPct - maxPosPct}%`
                }}
                title={`Overrun Deviation: +${deviationNum.toFixed(2)} pp`}
              />
            )}

            {/* Actual percentage marker */}
            <div
              className="absolute top-0 bottom-0 w-1 bg-red-600 z-10 shadow-xs"
              style={{ left: `${actualPosPct}%` }}
              title={`Actual: ${actualPctNum.toFixed(2)}%`}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
            <span>0%</span>
            <span className="text-emerald-700 font-medium">
              Target Band: {targetMinNum.toFixed(1)}% – {targetMaxNum.toFixed(1)}%
            </span>
            <span className="font-bold text-red-600">Actual: {actualPctNum.toFixed(2)}%</span>
            <span>{Math.round(gaugeMax)}%</span>
          </div>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center space-x-2 animate-in fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* SECTION 1: Verified Deterministic Financial Facts */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center">
            <ShieldAlert className="w-4 h-4 text-blue-600 mr-2" />
            Section 1: Verified Deterministic Financial Facts (System of Record)
          </h3>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
            Engine Rule v1.0
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="text-[11px] text-slate-500 font-semibold uppercase">Actual % of Revenue</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {actualPctNum.toFixed(2)}%
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Cost: ₹{pnl?.[anomaly.metricKey] ? Number(pnl[anomaly.metricKey]).toLocaleString('en-IN') : '—'}
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="text-[11px] text-slate-500 font-semibold uppercase">Configured Target Band</div>
            <div className="text-2xl font-bold text-slate-800 mt-1">
              {anomaly.targetMinPct ? `${targetMinNum.toFixed(1)}% – ${targetMaxNum.toFixed(1)}%` : 'N/A'}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Active for this FC tier</div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="text-[11px] text-slate-500 font-semibold uppercase">Deviation Margin</div>
            <div className="text-2xl font-bold text-amber-600 mt-1">
              +{deviationNum.toFixed(2)} pp
            </div>
            <div className="text-[11px] text-amber-700/80 mt-1 font-medium">Exceeds upper tolerance</div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="text-[11px] text-slate-500 font-semibold uppercase">Financial Overrun Impact</div>
            <div className="text-2xl font-bold text-red-600 mt-1">
              {impactNum > 0 ? `₹${impactNum.toLocaleString('en-IN')}` : '—'}
            </div>
            <div className="text-[11px] text-red-600/80 mt-1 font-medium">Deterministic loss</div>
          </div>
        </div>

        {/* Rule description */}
        <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200 text-xs text-slate-700 flex items-start space-x-2">
          <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
          <div>
            <strong className="text-slate-900">Deterministic Rule Validation:</strong> {anomaly.description}
          </div>
        </div>

        {/* Collapsible Full P&L Daily Context */}
        {pnl && (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowPnlContext(!showPnlContext)}
              className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-xs font-bold text-slate-800 transition-colors"
            >
              <span className="flex items-center">
                <FileText className="w-3.5 h-3.5 text-slate-500 mr-2" />
                FC Daily P&L Context ({dateStr}) — Revenue: ₹{Number(pnl.revenue).toLocaleString('en-IN')}, CM1: {Number(pnl.cm1Pct).toFixed(2)}%, CM2: {Number(pnl.cm2Pct).toFixed(2)}%
              </span>
              {showPnlContext ? (
                <ChevronUp className="w-4 h-4 text-slate-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-500" />
              )}
            </button>

            {showPnlContext && (
              <div className="p-4 bg-white divide-y divide-slate-100 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-4">
                  <div>
                    <span className="text-slate-500 text-[11px]">Total Day Revenue</span>
                    <div className="font-bold text-slate-900 text-sm mt-0.5">
                      ₹{Number(pnl.revenue).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[11px]">CM1 Amount & %</span>
                    <div className="font-bold text-emerald-700 text-sm mt-0.5">
                      ₹{Number(pnl.cm1).toLocaleString('en-IN')} ({Number(pnl.cm1Pct).toFixed(2)}%)
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[11px]">CM2 Amount & %</span>
                    <div className="font-bold text-blue-700 text-sm mt-0.5">
                      ₹{Number(pnl.cm2).toLocaleString('en-IN')} ({Number(pnl.cm2Pct).toFixed(2)}%)
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[11px]">FC Colour Band</span>
                    <div className="mt-1">
                      <ColourBadge colour={pnl.colour} />
                    </div>
                  </div>
                </div>

                <div className="pt-3">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Line Item Breakdown:
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                    <div className={`p-2.5 rounded-lg border ${anomaly.metricKey === 'manpowerCost' ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                      <span className="text-slate-500 text-[10px]">Manpower Cost</span>
                      <div className="font-bold text-slate-900">₹{Number(pnl.manpowerCost).toLocaleString('en-IN')}</div>
                    </div>
                    <div className={`p-2.5 rounded-lg border ${anomaly.metricKey === 'packagingCost' ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                      <span className="text-slate-500 text-[10px]">Packaging Cost</span>
                      <div className="font-bold text-slate-900">₹{Number(pnl.packagingCost).toLocaleString('en-IN')}</div>
                    </div>
                    <div className={`p-2.5 rounded-lg border ${anomaly.metricKey === 'powerFuelCost' ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                      <span className="text-slate-500 text-[10px]">Power & Fuel Cost</span>
                      <div className="font-bold text-slate-900">₹{Number(pnl.powerFuelCost).toLocaleString('en-IN')}</div>
                    </div>
                    <div className={`p-2.5 rounded-lg border ${anomaly.metricKey === 'fcRent' ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                      <span className="text-slate-500 text-[10px]">FC Rent</span>
                      <div className="font-bold text-slate-900">₹{Number(pnl.fcRent).toLocaleString('en-IN')}</div>
                    </div>
                    <div className={`p-2.5 rounded-lg border ${anomaly.metricKey === 'equipmentRentals' ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                      <span className="text-slate-500 text-[10px]">Equipment Rentals</span>
                      <div className="font-bold text-slate-900">₹{Number(pnl.equipmentRentals).toLocaleString('en-IN')}</div>
                    </div>
                    <div className={`p-2.5 rounded-lg border ${anomaly.metricKey === 'overheads' ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                      <span className="text-slate-500 text-[10px]">Overheads</span>
                      <div className="font-bold text-slate-900">₹{Number(pnl.overheads).toLocaleString('en-IN')}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SECTION 2: AI Investigation Agent Findings */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-100 gap-2">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Section 2: AI Investigation Agent Analysis
              </h3>
              <p className="text-[11px] text-slate-500">
                LangGraph 2-Agent Multi-Step Investigation Workflow
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 text-[11px]">
            {aiReport?.model && (
              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px] border border-slate-200">
                {aiReport.model}
              </span>
            )}
            <span className={`px-2 py-0.5 rounded font-bold border ${
              aiReport?.status === 'COMPLETED'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-indigo-50 text-indigo-700 border-indigo-200'
            }`}>
              {aiReport ? `Status: ${aiReport.status}` : 'AI Pending'}
            </span>
          </div>
        </div>

        {investigation ? (
          <div className="space-y-4 text-xs">
            {/* Executive AI Summary Box */}
            <div className="p-4 bg-linear-to-r from-indigo-50/80 via-blue-50/40 to-slate-50 rounded-xl border border-indigo-100">
              <div className="flex items-center space-x-1.5 text-indigo-900 font-bold text-xs uppercase tracking-wider mb-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Executive Root Cause Summary:</span>
              </div>
              <p className="text-slate-800 leading-relaxed font-normal text-xs">
                {investigation.summary}
              </p>
            </div>

            {/* Corroborated Findings */}
            <div>
              <div className="font-bold text-slate-800 mb-2.5 uppercase text-[11px] tracking-wider flex items-center">
                <Layers className="w-3.5 h-3.5 text-slate-500 mr-1.5" />
                Corroborated Findings & Verified Line-Item Evidence:
              </div>
              <div className="space-y-2.5">
                {(investigation.findings || []).map((f: any, idx: number) => {
                  const isHighConf = f.confidence === 'HIGH';
                  return (
                    <div
                      key={idx}
                      className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 text-xs">
                          {formatMetricKey(f.lineItem)}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            isHighConf
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}
                        >
                          Confidence: {f.confidence}
                        </span>
                      </div>
                      <p className="mt-1.5 text-slate-700 leading-relaxed text-xs">
                        {f.explanation}
                      </p>
                      {f.evidenceRefs && f.evidenceRefs.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                          <span className="text-slate-400 font-medium">Evidence Source:</span>
                          {f.evidenceRefs.map((ref: string, i: number) => (
                            <code
                              key={i}
                              className="px-1.5 py-0.5 bg-white border border-slate-200 text-slate-700 rounded font-mono shadow-2xs"
                            >
                              {ref}
                            </code>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Hypothesized Root Causes */}
            {investigation.possibleCauses?.length > 0 && (
              <div className="pt-2">
                <div className="font-bold text-slate-800 mb-2 uppercase text-[11px] tracking-wider">
                  Hypothesized Root Causes (Subject to Operational Verification):
                </div>
                <div className="space-y-1.5">
                  {investigation.possibleCauses.map((c: any, i: number) => (
                    <div
                      key={i}
                      className="p-2.5 bg-slate-50/60 rounded-lg border border-slate-200 flex items-start justify-between text-xs text-slate-700"
                    >
                      <span>{c.cause}</span>
                      <span className="text-[10px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200 ml-2 shrink-0">
                        Confidence: {c.confidence}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-slate-400 text-xs italic py-6 text-center bg-slate-50 rounded-xl">
            AI Investigation report not yet generated or pending processing for this record.
          </div>
        )}
      </div>

      {/* SECTION 3: AI Recommendation Agent Action Items */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
              <CheckCircle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Section 3: AI Recommendation Agent Action Items
              </h3>
              <p className="text-[11px] text-slate-500">
                Corrective action plan assigned to facility & functional leadership
              </p>
            </div>
          </div>

          {recommendations?.priority && (
            <span
              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                recommendations.priority === 'CRITICAL'
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              Priority: {recommendations.priority}
            </span>
          )}
        </div>

        {recommendations?.recommendations?.length > 0 ? (
          <div className="space-y-3">
            {recommendations.recommendations.map((rec: any, idx: number) => {
              const isChecked = !!completedActions[idx];
              const isCritical = rec.priority === 'CRITICAL';

              return (
                <div
                  key={idx}
                  className={`p-4 rounded-xl border transition-all ${
                    isChecked
                      ? 'bg-slate-50/60 border-slate-200 opacity-75'
                      : 'bg-white border-slate-200 shadow-2xs hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <button
                      onClick={() => toggleActionItem(idx)}
                      className="mt-0.5 text-slate-400 hover:text-emerald-600 transition-colors"
                      title={isChecked ? 'Mark incomplete' : 'Mark complete'}
                    >
                      {isChecked ? (
                        <CheckSquare className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>

                    <div className="flex-1 space-y-1 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px]">
                          [{rec.responsibleTeam}]
                        </span>
                        <span
                          className={`font-bold px-2 py-0.5 rounded text-[10px] border ${
                            isCritical
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          Priority: {rec.priority}
                        </span>
                      </div>

                      <div
                        className={`text-sm font-bold mt-1.5 ${
                          isChecked ? 'line-through text-slate-500' : 'text-slate-900'
                        }`}
                      >
                        {rec.action}
                      </div>

                      <div className="text-slate-600 text-xs mt-0.5">
                        <strong className="text-slate-700">Rationale:</strong> {rec.reason}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-slate-400 text-xs italic py-6 text-center bg-slate-50 rounded-xl">
            No specific action items recorded.
          </div>
        )}
      </div>

      {/* SECTION 4: Manager Review Governance & Actions */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-6">
        <div>
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            Section 4: Manager Governance & Review Workflow
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Record manager decisions, operational justifications, or audit findings
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => handleStatusUpdate('ACKNOWLEDGED')}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs transition-colors flex items-center shadow-xs"
          >
            <Clock className="w-3.5 h-3.5 mr-1.5" />
            Acknowledge Anomaly
          </button>
          <button
            onClick={() => handleStatusUpdate('RESOLVED')}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors flex items-center shadow-xs"
          >
            <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
            Mark Resolved
          </button>
          <button
            onClick={() => handleStatusUpdate('NEEDS_INVESTIGATION')}
            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs transition-colors flex items-center shadow-xs"
          >
            <HelpCircle className="w-3.5 h-3.5 mr-1.5" />
            Needs Deep Investigation
          </button>
          <button
            onClick={() => setShowDismissInput(!showDismissInput)}
            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-800 text-white font-semibold text-xs transition-colors flex items-center shadow-xs"
          >
            <XCircle className="w-3.5 h-3.5 mr-1.5" />
            Dismiss Anomaly...
          </button>
        </div>

        {/* Dismissal Input Drawer */}
        {showDismissInput && (
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-300 space-y-3 animate-in fade-in">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-800">
                Mandatory Operational Dismissal Justification:
              </label>
              <button
                onClick={() => setShowDismissInput(false)}
                className="text-slate-400 hover:text-slate-600 text-xs"
              >
                Cancel
              </button>
            </div>

            {/* Quick Templates */}
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <span className="text-slate-500 mr-1 self-center">Templates:</span>
              <button
                type="button"
                onClick={() => setDismissReason('Pre-approved festival surge dispatch overtime')}
                className="px-2 py-1 rounded bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
              >
                Festival Surge Overtime
              </button>
              <button
                type="button"
                onClick={() => setDismissReason('Contractual utility tariff increase pre-approved by leadership')}
                className="px-2 py-1 rounded bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
              >
                Contractual Price Hike
              </button>
              <button
                type="button"
                onClick={() => setDismissReason('One-time emergency equipment repair cost')}
                className="px-2 py-1 rounded bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
              >
                One-time Repair
              </button>
              <button
                type="button"
                onClick={() => setDismissReason('Data entry error in raw file (re-submission in progress)')}
                className="px-2 py-1 rounded bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
              >
                Data Entry Correction
              </button>
            </div>

            <textarea
              rows={2}
              value={dismissReason}
              onChange={e => setDismissReason(e.target.value)}
              placeholder="Explain why this financial threshold breach is acceptable or pre-approved..."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
            />
            <button
              onClick={() => handleStatusUpdate('DISMISSED', dismissReason)}
              disabled={!dismissReason.trim()}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg disabled:opacity-50 transition-colors shadow-xs"
            >
              Confirm Governance Dismissal
            </button>
          </div>
        )}

        {/* Append-Only Audit History Timeline */}
        <div className="pt-6 border-t border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center">
              <Clock className="w-3.5 h-3.5 text-slate-400 mr-1.5" />
              Append-Only Audit Review History:
            </h4>
            <span className="text-[11px] text-slate-400">
              {(anomaly.reviews || []).length} events recorded
            </span>
          </div>

          <div className="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
            {(anomaly.reviews || []).length === 0 ? (
              <div className="text-xs text-slate-400 italic py-2">
                No review events or governance actions logged yet.
              </div>
            ) : (
              (anomaly.reviews || []).map((rev: any) => {
                const isStatusChange = rev.action?.startsWith('STATUS_CHANGE');
                return (
                  <div key={rev.id} className="relative group">
                    {/* Node dot */}
                    <div
                      className={`absolute -left-6 top-1 w-3.5 h-3.5 rounded-full border-2 border-white ${
                        isStatusChange ? 'bg-blue-600' : 'bg-slate-400'
                      }`}
                    />

                    <div className="p-3.5 bg-slate-50/80 rounded-xl text-xs border border-slate-200 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-1.5">
                          <UserCheck className="w-3.5 h-3.5 text-slate-500" />
                          <span className="font-bold text-slate-800">
                            {rev.actor?.name || 'Automated System'}
                          </span>
                          <span className="text-slate-400 text-[10px]">({rev.actor?.email})</span>
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {new Date(rev.createdAt).toLocaleString()}
                        </span>
                      </div>

                      <div className="font-semibold text-blue-700 text-xs">
                        {rev.action}
                      </div>

                      {rev.reason && (
                        <div className="text-slate-700 bg-white p-2 rounded border border-slate-200 text-xs mt-1">
                          <strong className="text-slate-800">Justification:</strong> {rev.reason}
                        </div>
                      )}

                      {rev.comment && (
                        <div className="text-slate-700 bg-white p-2 rounded border border-slate-200 text-xs mt-1">
                          <strong className="text-slate-800">Note:</strong> {rev.comment}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Add Note Form */}
          <form onSubmit={handleAddNote} className="mt-5 space-y-2">
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
              Add Note to Audit Trail:
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                placeholder="Document verification findings, manager notes, or status remarks..."
                className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
              <button
                type="submit"
                disabled={!newNote.trim()}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center transition-colors shadow-xs"
              >
                <Send className="w-3.5 h-3.5 mr-1" />
                Post Note
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
