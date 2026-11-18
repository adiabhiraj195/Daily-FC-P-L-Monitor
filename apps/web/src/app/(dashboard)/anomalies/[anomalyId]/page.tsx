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
  Info,
  Users,
  Boxes,
  Activity,
  History,
  AlertCircle,
  FileSpreadsheet,
  Lock,
  FileCode2,
  Loader2
} from 'lucide-react';
import Link from 'next/link';
import {
  AnomalySeverityBadge,
  ReviewStatusBadge,
  AnomalyTypeBadge,
  ColourBadge
} from '../../../../components/common/Badge';
import { AIInputInspectorModal } from '../../../../components/anomalies/AIInputInspectorModal';
import {
  formatMetricName,
  normalizeInvestigationOutput,
  normalizeRecommendationOutput,
  resolveEvidenceRefs,
  resolveAnomalyRef,
  resolveFindingRefs
} from '@prozo/shared';

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
  const [selectedReportIndex, setSelectedReportIndex] = useState<number>(0);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [isTriggeringAi, setIsTriggeringAi] = useState(false);
  const [aiActionMessage, setAiActionMessage] = useState<string | null>(null);
  const [aiErrorMessage, setAiErrorMessage] = useState<string | null>(null);

  const { data: anomaly, refetch, isLoading } = useQuery({
    queryKey: ['anomaly-detail', anomalyId],
    queryFn: () => fetchApi<any>(`/anomalies/${anomalyId}`)
  });

  const handleTriggerAI = async () => {
    setIsTriggeringAi(true);
    setAiErrorMessage(null);
    setAiActionMessage(null);
    try {
      const res = await fetchApi<any>(`/anomalies/${anomalyId}/trigger-ai`, {
        method: 'POST'
      });
      setAiActionMessage(
        `AI Investigation completed successfully! Generated report v${res?.version || res?.report?.version || 'new'}.`
      );
      refetch();
      setTimeout(() => setAiActionMessage(null), 6000);
    } catch (err: any) {
      setAiErrorMessage(err.message || 'Failed to trigger AI investigation');
      setTimeout(() => setAiErrorMessage(null), 8000);
    } finally {
      setIsTriggeringAi(false);
    }
  };

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
AI Summary: ${activeReport?.investigation?.summary || 'N/A'}`;

    navigator.clipboard.writeText(text);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  const toggleActionItem = (idx: number) => {
    setCompletedActions(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const formatMetricKey = (key?: string | null) => {
    return formatMetricName(key);
  };

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto p-12 text-center space-y-3">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="text-xs text-slate-500 font-medium">Loading comprehensive anomaly report...</p>
      </div>
    );
  }

  if (!anomaly) {
    return (
      <div className="max-w-6xl mx-auto p-12 bg-white rounded-xl border border-red-200 text-center space-y-3">
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

  // AI report versions handling with robust unboxing & normalization
  const reportVersions = anomaly.aiReportVersions || (pnl?.aiReport ? [pnl.aiReport] : []);
  const activeReport = reportVersions[selectedReportIndex] || pnl?.aiReport;
  const investigation = normalizeInvestigationOutput(activeReport?.investigation);
  const recommendations = normalizeRecommendationOutput(activeReport?.recommendations);

  // Evidence Registry & Anomalies List for Reference Resolution
  const evidenceRegistry =
    investigation?.evidenceRegistry ||
    activeReport?.investigation?.investigationContext?.evidenceRegistry ||
    activeReport?.investigationContext?.evidenceRegistry ||
    anomaly?.aiInputPayload?.evidenceRegistry ||
    anomaly?.aiInputPayload?.compactPayload?.evidenceRegistry ||
    [];

  const allAnomaliesList =
    anomaly?.aiInputPayload?.anomalies ||
    pnl?.anomalies ||
    (anomaly ? [anomaly] : []);

  const actualPctNum = Number(anomaly.actualPct || 0);
  const targetMinNum = Number(anomaly.targetMinPct || 0);
  const targetMaxNum = Number(anomaly.targetMaxPct || 0);
  const deviationNum = Number(anomaly.deviationPP || 0);
  const impactNum = Number(anomaly.impactAmount || 0);

  // Operational Context
  const opContext = anomaly.operationalContext;
  const opsData = opContext?.operations;
  const laborData = opContext?.labor;
  const derivedOps = opContext?.derived?.operations;
  const derivedLabor = opContext?.derived?.workforce;
  const derivedProd = opContext?.derived?.productivity;
  const histComparisons = opContext?.historicalComparisons || [];
  const completeness = opContext?.completeness;
  const contractorRecon = opContext?.contractorReconciliation;

  // AI Investigation Readiness & Input Payload
  const aiReadiness = anomaly.aiReadiness;
  const canTriggerAi = aiReadiness
    ? aiReadiness.canTrigger
    : !!(completeness?.hasPnl && completeness?.hasOperations && completeness?.hasLabor);
  const missingFiles: string[] = aiReadiness?.missingFiles || (
    [
      !completeness?.hasPnl ? 'Financial P&L' : null,
      !completeness?.hasOperations ? 'Daily Operations' : null,
      !completeness?.hasLabor ? 'Daily Labor' : null
    ].filter(Boolean) as string[]
  );
  const aiInputPayload = anomaly.aiInputPayload;
  const aiPromptPreview = anomaly.aiPromptPreview;

  // Visual breach meter calculation
  const gaugeMax = Math.max(actualPctNum * 1.25, targetMaxNum * 1.3, 30);
  const minPosPct = Math.min(100, Math.max(0, (targetMinNum / gaugeMax) * 100));
  const maxPosPct = Math.min(100, Math.max(0, (targetMaxNum / gaugeMax) * 100));
  const actualPosPct = Math.min(100, Math.max(0, (actualPctNum / gaugeMax) * 100));

  const getEvidenceBadge = (classification?: string) => {
    switch (classification) {
      case 'OBSERVED_FACT':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            Confirmed Observation (Fact)
          </span>
        );
      case 'SUPPORTED_HYPOTHESIS':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
            Supported Hypothesis
          </span>
        );
      case 'UNVERIFIED_POSSIBILITY':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
            Unverified Possibility
          </span>
        );
      case 'DATA_QUALITY_ISSUE':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-300">
            Data Quality Issue
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
            Observation
          </span>
        );
    }
  };

  const getCompletenessBadge = (status?: string) => {
    switch (status) {
      case 'COMPLETE':
        return <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Full Evidence (Complete)</span>;
      case 'FINANCIAL_ONLY':
        return <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">Financial Data Only</span>;
      case 'PENDING_OPERATIONS':
        return <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300">Pending Operations Upload</span>;
      case 'PENDING_LABOR':
        return <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300">Pending Labor Upload</span>;
      case 'PARTIAL':
        return <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">Partial Data Available</span>;
      case 'INSUFFICIENT_DATA':
        return <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-rose-50 text-rose-800 border border-rose-300">Insufficient Data</span>;
      default:
        return <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">{status || 'Unknown'}</span>;
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
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

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsInspectorOpen(true)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center transition-colors shadow-2xs"
            title="Inspect evidence data payload fed to AI"
          >
            <FileCode2 className="w-3.5 h-3.5 mr-1 text-indigo-600" />
            Inspect AI Input
          </button>

          <button
            onClick={handleTriggerAI}
            disabled={!canTriggerAi || isTriggeringAi}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center transition-colors shadow-2xs ${
              canTriggerAi && !isTriggeringAi
                ? 'bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 hover:from-indigo-700 text-white cursor-pointer active:scale-98'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
            }`}
            title={
              !canTriggerAi
                ? `AI Investigation is locked until all 3 files are uploaded. Missing: ${missingFiles.join(', ')}`
                : 'Trigger AI Root-Cause Investigation'
            }
          >
            {isTriggeringAi ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin text-white" />
                Investigating...
              </>
            ) : (
              <>
                {canTriggerAi ? (
                  <Sparkles className="w-3.5 h-3.5 mr-1 text-white" />
                ) : (
                  <Lock className="w-3.5 h-3.5 mr-1 text-slate-400" />
                )}
                <span>Trigger AI</span>
              </>
            )}
          </button>

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
              {getCompletenessBadge(activeReport?.evidenceCompleteness || completeness?.status)}
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
            <div
              className="absolute top-0 bottom-0 bg-emerald-100 border-x border-emerald-300"
              style={{
                left: `${minPosPct}%`,
                width: `${Math.max(2, maxPosPct - minPosPct)}%`
              }}
              title={`Target Allowed Band: ${targetMinNum.toFixed(1)}% - ${targetMaxNum.toFixed(1)}%`}
            />

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

      {/* Contractor Cost Reconciliation Alert Banner */}
      {contractorRecon?.flagged && (
        <div className="p-4 bg-amber-50 border-l-4 border-amber-500 rounded-r-xl shadow-xs space-y-1">
          <div className="flex items-center space-x-2 text-amber-900 font-bold text-xs">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>CONTRACTOR COST RECONCILIATION DISCREPANCY DETECTED</span>
          </div>
          <p className="text-xs text-amber-800 leading-relaxed">
            {contractorRecon.notes} Contractor reported ₹{Number(contractorRecon.contractorCost).toLocaleString('en-IN')} represents {contractorRecon.contractorCostShareOfManpower.toFixed(1)}% of total Manpower Cost (₹{Number(contractorRecon.manpowerCost).toLocaleString('en-IN')}).
          </p>
        </div>
      )}

      {/* Data Completeness Gap Notice */}
      {completeness && completeness.status !== 'COMPLETE' && (
        <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2">
          <div className="flex items-center space-x-2 text-blue-900 font-bold text-xs uppercase tracking-wider">
            <Info className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Operational Evidence Status: {completeness?.status?.replace(/_/g, ' ')}</span>
          </div>
          <p className="text-xs text-blue-800 leading-relaxed">
            {completeness.notes}
          </p>
          {completeness.missingDatasets && completeness.missingDatasets.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
              <span className="font-semibold text-blue-900">Missing Uploads:</span>
              {completeness.missingDatasets.map((ds: string) => (
                <span key={ds} className="px-2 py-0.5 bg-white border border-blue-300 rounded text-blue-700 font-mono">
                  {ds}
                </span>
              ))}
              <Link
                href="/uploads"
                className="ml-auto inline-flex items-center text-xs font-bold text-blue-700 hover:text-blue-900 underline"
              >
                Upload Operational Datasets →
              </Link>
            </div>
          )}
        </div>
      )}

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

      {/* SECTION 2: Operational Throughput Metrics */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
              <Boxes className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Section 2: Operational Throughput & Volume Intelligence
              </h3>
              <p className="text-[11px] text-slate-500">
                Facility handling metrics and derived throughput rates
              </p>
            </div>
          </div>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
            opsData ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'
          }`}>
            {opsData ? `Source: Upload v${opsData.version || 1}` : 'N/A (Pending Operations)'}
          </span>
        </div>

        {opsData ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-[10px] text-slate-500 font-bold uppercase">Inbound Shipments</div>
                <div className="text-lg font-bold text-slate-900 mt-1">{opsData.inboundShipments.toLocaleString()}</div>
                <div className="text-[10px] text-slate-400">shipments</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-[10px] text-slate-500 font-bold uppercase">Outbound Orders</div>
                <div className="text-lg font-bold text-blue-700 mt-1">{opsData.outboundOrders.toLocaleString()}</div>
                <div className="text-[10px] text-slate-400">orders dispatched</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-[10px] text-slate-500 font-bold uppercase">Units Processed</div>
                <div className="text-lg font-bold text-slate-900 mt-1">{opsData.unitsProcessed.toLocaleString()}</div>
                <div className="text-[10px] text-slate-400">total units</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-[10px] text-slate-500 font-bold uppercase">Order Lines</div>
                <div className="text-lg font-bold text-slate-900 mt-1">{opsData.orderLinesProcessed.toLocaleString()}</div>
                <div className="text-[10px] text-slate-400">lines handled</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-[10px] text-slate-500 font-bold uppercase">Operating Hours</div>
                <div className="text-lg font-bold text-slate-900 mt-1">{opsData.operatingHours} hrs</div>
                <div className="text-[10px] text-slate-400">facility run time</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-[10px] text-slate-500 font-bold uppercase">Storage Occupancy</div>
                <div className="text-lg font-bold text-slate-900 mt-1">
                  {opsData.storageOccupancyPct !== null ? `${opsData.storageOccupancyPct}%` : 'N/A'}
                </div>
                <div className="text-[10px] text-slate-400">usable capacity</div>
              </div>
            </div>

            {/* Derived Operational Metrics */}
            <div className="p-4 bg-slate-50/70 rounded-xl border border-slate-200">
              <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2">
                Deterministic Derived Operational Ratios:
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 text-[10px]">Units per Order:</span>
                  <div className="font-bold text-slate-900 text-sm">{derivedOps?.unitsPerOrder ?? 'N/A'}</div>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px]">Lines per Order:</span>
                  <div className="font-bold text-slate-900 text-sm">{derivedOps?.averageOrderLines ?? 'N/A'}</div>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px]">Orders / Operating Hr:</span>
                  <div className="font-bold text-emerald-700 text-sm">{derivedOps?.ordersPerOperatingHour ?? 'N/A'}</div>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px]">Returns Rate:</span>
                  <div className="font-bold text-slate-900 text-sm">{derivedOps?.returnsRate ? `${derivedOps.returnsRate}%` : '0%'}</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-center space-y-2">
            <Boxes className="w-6 h-6 text-slate-400 mx-auto" />
            <div className="text-xs font-semibold text-slate-700">Operational Dataset Not Uploaded</div>
            <p className="text-[11px] text-slate-500 max-w-md mx-auto">
              Inbound shipments, outbound orders, and unit throughput are currently unavailable (N/A). Upload Daily Operations data to enrich root-cause correlation.
            </p>
          </div>
        )}
      </div>

      {/* SECTION 3: Workforce & Labor Intelligence */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Section 3: Workforce & Labor Intelligence
              </h3>
              <p className="text-[11px] text-slate-500">
                Staffing, overtime hours, contractor utilization, and unit manpower cost
              </p>
            </div>
          </div>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
            laborData ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-100 text-slate-500 border-slate-200'
          }`}>
            {laborData ? `Source: Upload v${laborData.version || 1}` : 'N/A (Pending Labor)'}
          </span>
        </div>

        {laborData ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-[10px] text-slate-500 font-bold uppercase">Headcount (Plan vs Act)</div>
                <div className="text-lg font-bold text-slate-900 mt-1">
                  {laborData.actualHeadcount} <span className="text-xs font-normal text-slate-500">/ {laborData.plannedHeadcount}</span>
                </div>
                <div className="text-[10px] text-slate-400">workers on shift</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-[10px] text-slate-500 font-bold uppercase">Labour Hours (Plan vs Act)</div>
                <div className="text-lg font-bold text-slate-900 mt-1">
                  {laborData.actualPaidHours} <span className="text-xs font-normal text-slate-500">/ {laborData.plannedLabourHours}</span>
                </div>
                <div className="text-[10px] text-slate-400">total paid hours</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-[10px] text-slate-500 font-bold uppercase">Productive Hours</div>
                <div className="text-lg font-bold text-emerald-700 mt-1">{laborData.productiveHours} hrs</div>
                <div className="text-[10px] text-slate-400">on-task hours</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-[10px] text-slate-500 font-bold uppercase">Overtime Hours</div>
                <div className="text-lg font-bold text-amber-600 mt-1">{laborData.overtimeHours} hrs</div>
                <div className="text-[10px] text-slate-400">{derivedLabor ? `${derivedLabor.overtimeRatio}% of paid hrs` : ''}</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-[10px] text-slate-500 font-bold uppercase">Contractor Workers</div>
                <div className="text-lg font-bold text-slate-900 mt-1">{laborData.contractorHeadcount}</div>
                <div className="text-[10px] text-slate-400">{laborData.contractorHours} hrs logged</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-[10px] text-slate-500 font-bold uppercase">Contractor Cost</div>
                <div className="text-lg font-bold text-slate-900 mt-1">₹{Number(laborData.contractorCost).toLocaleString('en-IN')}</div>
                <div className="text-[10px] text-slate-400">vendor invoice detail</div>
              </div>
            </div>

            {/* Derived Workforce & Productivity Metrics */}
            <div className="p-4 bg-slate-50/70 rounded-xl border border-slate-200">
              <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2">
                Deterministic Unit Labor & Cost Efficiency Ratios:
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 text-[10px]">Labour Utilization:</span>
                  <div className="font-bold text-slate-900 text-sm">{derivedLabor?.labourUtilization ? `${derivedLabor.labourUtilization}%` : 'N/A'}</div>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px]">Contractor Hour Share:</span>
                  <div className="font-bold text-slate-900 text-sm">{derivedLabor?.contractorHourShare ? `${derivedLabor.contractorHourShare}%` : 'N/A'}</div>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px]">Manpower Cost / Order:</span>
                  <div className="font-bold text-blue-700 text-sm">{derivedProd?.manpowerCostPerOrder ? `₹${derivedProd.manpowerCostPerOrder}` : 'N/A'}</div>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px]">Cost / Paid Hour:</span>
                  <div className="font-bold text-slate-900 text-sm">{derivedProd?.manpowerCostPerPaidHour ? `₹${derivedProd.manpowerCostPerPaidHour}` : 'N/A'}</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-center space-y-2">
            <Users className="w-6 h-6 text-slate-400 mx-auto" />
            <div className="text-xs font-semibold text-slate-700">Daily Labor Dataset Not Uploaded</div>
            <p className="text-[11px] text-slate-500 max-w-md mx-auto">
              Workforce headcount, overtime hours, and contractor cost details are unavailable (N/A). Upload Daily Labor data to evaluate manpower efficiency.
            </p>
          </div>
        )}
      </div>

      {/* SECTION 4: Multi-Window Historical Baseline Comparisons */}
      {histComparisons.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                <History className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Section 4: Multi-Window Historical Baseline Comparisons
                </h3>
                <p className="text-[11px] text-slate-500">
                  Current business day evaluated against 7-day, 30-day, and weekday-matched historical benchmarks
                </p>
              </div>
            </div>
            <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              {histComparisons.length} Historical Windows
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-[11px] uppercase">
                  <th className="py-2.5 px-3">Metric</th>
                  <th className="py-2.5 px-3 text-right">Current Value</th>
                  <th className="py-2.5 px-3">Comparison Baseline Window</th>
                  <th className="py-2.5 px-3 text-right">Baseline Mean</th>
                  <th className="py-2.5 px-3 text-right">Difference (%)</th>
                  <th className="py-2.5 px-3 text-center">Deviation Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {histComparisons.map((hc: any, idx: number) => {
                  const isAnomaly = hc.isAnomaly;
                  const pctDiff = hc.percentageDifference;
                  return (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{formatMetricKey(hc.metricName)}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-800">
                        {hc.currentValue?.toLocaleString()} {hc.unit}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {hc.windowDays === 7 ? '7-Day Rolling Baseline' :
                         hc.windowDays === 30 ? '30-Day Rolling Baseline' :
                         hc.windowDays === 90 ? '90-Day Moving Baseline' :
                         'Weekday-Comparable Baseline'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-600">
                        {hc.baselineMean?.toLocaleString()} {hc.unit}
                      </td>
                      <td className={`py-2.5 px-3 text-right font-bold ${
                        pctDiff > 0 ? 'text-rose-600' : 'text-emerald-600'
                      }`}>
                        {pctDiff > 0 ? `+${pctDiff.toFixed(1)}%` : `${pctDiff.toFixed(1)}%`}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isAnomaly ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {isAnomaly ? 'ANOMALOUS (Z > 2.0)' : 'Normal Variance'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 5: AI Investigation Agent Findings */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-100 gap-2">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Section 5: AI Investigation Agent Analysis
              </h3>
              <p className="text-[11px] text-slate-500">
                Evidence-backed operational root-cause analysis
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 text-[11px]">
            {reportVersions.length > 1 && (
              <div className="flex items-center space-x-1 mr-2">
                <span className="text-slate-400 text-[10px]">Report Version:</span>
                <select
                  value={selectedReportIndex}
                  onChange={e => setSelectedReportIndex(Number(e.target.value))}
                  className="px-2 py-1 bg-white border border-slate-300 rounded text-xs font-bold text-slate-800"
                >
                  {reportVersions.map((rep: any, i: number) => (
                    <option key={rep.id} value={i}>
                      v{rep.version || (i + 1)} ({rep.evidenceCompleteness || 'Report'})
                    </option>
                  ))}
                </select>
              </div>
            )}
            {activeReport?.model && (
              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px] border border-slate-200">
                {activeReport.model}
              </span>
            )}
            <span className={`px-2 py-0.5 rounded font-bold border ${
              activeReport?.status === 'COMPLETED'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-indigo-50 text-indigo-700 border-indigo-200'
            }`}>
              {activeReport ? `Status: ${activeReport.status}` : 'AI Pending'}
            </span>
          </div>
        </div>

        {/* AI Investigation Readiness & Trigger Action Banner */}
        <div className="p-4 bg-slate-50/90 rounded-xl border border-slate-200 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  AI Investigation Launch & 3-Dataset Verification
                </span>
                <span
                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                    canTriggerAi
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}
                >
                  {canTriggerAi
                    ? '✓ All 3 Files Uploaded (Ready)'
                    : `⚠️ Locked: ${3 - missingFiles.length}/3 Files Uploaded`}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                AI investigation strictly requires all three files (Financial P&L, Daily Operations, and Daily Labor) to prevent ungrounded speculation.
              </p>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <button
                onClick={() => setIsInspectorOpen(true)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center transition-colors shadow-2xs"
                title="Review input payload and prompt fed to AI model"
              >
                <FileCode2 className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
                Inspect AI Input
              </button>

              <button
                onClick={handleTriggerAI}
                disabled={!canTriggerAi || isTriggeringAi}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-xs transition-all ${
                  canTriggerAi && !isTriggeringAi
                    ? 'bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 hover:from-indigo-700 hover:to-purple-700 text-white cursor-pointer active:scale-98'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                }`}
                title={
                  !canTriggerAi
                    ? `AI Investigation is locked until all 3 files are uploaded. Missing: ${missingFiles.join(', ')}`
                    : 'Trigger evidence-backed AI Investigation'
                }
              >
                {isTriggeringAi ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                    <span>Investigating with AI Agent...</span>
                  </>
                ) : (
                  <>
                    {canTriggerAi ? (
                      <Sparkles className="w-3.5 h-3.5 text-white" />
                    ) : (
                      <Lock className="w-3.5 h-3.5 text-slate-400" />
                    )}
                    <span>{activeReport ? 'Re-trigger AI Investigation' : 'Trigger AI Investigation'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 3 Files Mini Indicator Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
            <div
              className={`p-2.5 rounded-lg border flex items-center justify-between ${
                aiReadiness?.files?.pnl?.uploaded
                  ? 'bg-white border-emerald-200 text-slate-800'
                  : 'bg-white border-rose-200 text-slate-500'
              }`}
            >
              <div className="flex items-center space-x-2">
                <FileSpreadsheet
                  className={`w-4 h-4 ${
                    aiReadiness?.files?.pnl?.uploaded ? 'text-emerald-600' : 'text-slate-400'
                  }`}
                />
                <span className="font-semibold text-xs">1. Financial P&L</span>
              </div>
              {aiReadiness?.files?.pnl?.uploaded ? (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  Ready (v{aiReadiness.files.pnl.version || 1})
                </span>
              ) : (
                <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                  Missing
                </span>
              )}
            </div>

            <div
              className={`p-2.5 rounded-lg border flex items-center justify-between ${
                aiReadiness?.files?.operations?.uploaded
                  ? 'bg-white border-emerald-200 text-slate-800'
                  : 'bg-white border-rose-200 text-slate-500'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Boxes
                  className={`w-4 h-4 ${
                    aiReadiness?.files?.operations?.uploaded ? 'text-emerald-600' : 'text-slate-400'
                  }`}
                />
                <span className="font-semibold text-xs">2. Daily Operations</span>
              </div>
              {aiReadiness?.files?.operations?.uploaded ? (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  Ready (v{aiReadiness.files.operations.version || 1})
                </span>
              ) : (
                <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                  Missing
                </span>
              )}
            </div>

            <div
              className={`p-2.5 rounded-lg border flex items-center justify-between ${
                aiReadiness?.files?.labor?.uploaded
                  ? 'bg-white border-emerald-200 text-slate-800'
                  : 'bg-white border-rose-200 text-slate-500'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Users
                  className={`w-4 h-4 ${
                    aiReadiness?.files?.labor?.uploaded ? 'text-emerald-600' : 'text-slate-400'
                  }`}
                />
                <span className="font-semibold text-xs">3. Daily Labor</span>
              </div>
              {aiReadiness?.files?.labor?.uploaded ? (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  Ready (v{aiReadiness.files.labor.version || 1})
                </span>
              ) : (
                <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                  Missing
                </span>
              )}
            </div>
          </div>

          {/* Feedback Banners */}
          {aiErrorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{aiErrorMessage}</span>
            </div>
          )}

          {aiActionMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{aiActionMessage}</span>
            </div>
          )}
        </div>

        {investigation ? (
          <div className="space-y-4 text-xs">
            {/* Executive AI Summary Box */}
            <div className="p-4 bg-linear-to-r from-indigo-50/80 via-blue-50/40 to-slate-50 rounded-xl border border-indigo-100 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5 text-indigo-900 font-bold text-xs uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Executive Root Cause Summary:</span>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    investigation.diagnosticStatus === 'COMPLETE'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : investigation.diagnosticStatus === 'PARTIAL'
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-rose-50 text-rose-800 border-rose-200'
                  }`}
                >
                  Diagnostic Status: {investigation.diagnosticStatus}
                </span>
              </div>
              <p className="text-slate-800 leading-relaxed font-normal text-xs">
                {investigation.summary}
              </p>
            </div>

            {/* Evidence Completeness Disclosure */}
            {investigation.evidenceCompleteness && investigation.evidenceCompleteness !== 'COMPLETE' && (
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-amber-900 text-xs">
                <span className="font-bold">Investigation Evidence Caveat:</span> This analysis was conducted with <strong>{investigation.evidenceCompleteness}</strong> evidence.
                {investigation.missingDataPoints && investigation.missingDataPoints.length > 0 && (
                  <span className="ml-1">Missing inputs: {investigation.missingDataPoints.join(', ')}. Root cause conclusions remain subject to operational verification upon data arrival.</span>
                )}
              </div>
            )}

            {/* Corroborated Findings with Resolved Evidence Tables */}
            <div>
              <div className="font-bold text-slate-800 mb-2.5 uppercase text-[11px] tracking-wider flex items-center justify-between">
                <div className="flex items-center">
                  <Layers className="w-3.5 h-3.5 text-slate-500 mr-1.5" />
                  <span>Corroborated Findings & Evidence Classification ({investigation.findings.length} findings):</span>
                </div>
              </div>
              <div className="space-y-3">
                {(investigation.findings || []).map((f: any, idx: number) => {
                  const resolvedAnom = resolveAnomalyRef(f.anomalyId, allAnomaliesList);
                  const resolvedEvs = resolveEvidenceRefs(f.evidenceRefs, evidenceRegistry);
                  const isCurrentAnomaly =
                    resolvedAnom?.id === anomaly.id ||
                    (resolvedAnom && resolvedAnom.metricKey === anomaly.metricKey);
                  const findingTitle = f.title || (f.lineItem ? formatMetricKey(f.lineItem) : `Finding ${f.findingId || idx + 1}`);

                  return (
                    <div
                      key={idx}
                      className={`p-4 rounded-xl border space-y-2.5 transition-colors ${
                        isCurrentAnomaly
                          ? 'bg-indigo-50/30 border-indigo-200 shadow-2xs'
                          : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
                            {f.findingId || `F${idx + 1}`}
                          </span>
                          <span className="font-bold text-slate-900 text-xs">
                            {findingTitle}
                          </span>
                          {getEvidenceBadge(f.classification)}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {resolvedAnom && (
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex items-center space-x-1 ${
                                isCurrentAnomaly
                                  ? 'bg-amber-100 text-amber-900 border-amber-300 font-bold'
                                  : 'bg-rose-50 text-rose-800 border-rose-200'
                              }`}
                              title={`Target: ${resolvedAnom.targetMinPct} - ${resolvedAnom.targetMaxPct} | Actual: ${resolvedAnom.actualPct}`}
                            >
                              <span>Linked: {resolvedAnom.label}</span>
                              {resolvedAnom.breachBeyondTolerancePP && (
                                <span className="text-[9px] opacity-80 font-normal">
                                  ({resolvedAnom.breachBeyondTolerancePP})
                                </span>
                              )}
                              {isCurrentAnomaly && <span className="ml-0.5 font-bold">★ Primary</span>}
                            </span>
                          )}
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white text-slate-700 border border-slate-200">
                            Confidence: {f.confidence}
                          </span>
                        </div>
                      </div>

                      <p className="text-slate-700 leading-relaxed text-xs">
                        {f.explanation}
                      </p>

                      {/* Resolved Corroborating Evidence Registry Facts */}
                      {resolvedEvs.length > 0 && (
                        <div className="pt-2">
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                            Corroborating Evidence Facts ({resolvedEvs.length} verified citations):
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {resolvedEvs.map((ev, eIdx) => (
                              <div
                                key={eIdx}
                                className="p-2.5 bg-white rounded-lg border border-slate-200 text-xs space-y-1 hover:border-indigo-300 transition-colors shadow-2xs"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                                    {ev.id}
                                  </span>
                                  <span className="text-[9px] font-medium text-slate-400 uppercase">
                                    {ev.source}
                                  </span>
                                </div>
                                <div className="font-semibold text-slate-800 text-[11px] truncate" title={ev.label}>
                                  {ev.label}
                                </div>
                                <div className="font-bold text-slate-900 text-xs">
                                  {ev.formattedValue}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Legacy Evidence Table fallback */}
                      {(!resolvedEvs || resolvedEvs.length === 0) && f.evidence && f.evidence.length > 0 && (
                        <div className="pt-2">
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                            Corroborating Evidence:
                          </div>
                          <div className="overflow-x-auto bg-white rounded-lg border border-slate-200">
                            <table className="w-full text-left text-[11px] border-collapse">
                              <thead>
                                <tr className="bg-slate-50/80 text-slate-600 font-medium border-b border-slate-200">
                                  <th className="py-1.5 px-2.5">Metric</th>
                                  <th className="py-1.5 px-2.5 text-right">Current Value</th>
                                  <th className="py-1.5 px-2.5 text-right">Baseline Value</th>
                                  <th className="py-1.5 px-2.5 text-right">Delta</th>
                                  <th className="py-1.5 px-2.5">Source</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {f.evidence.map((ev: any, eIdx: number) => (
                                  <tr key={eIdx}>
                                    <td className="py-1.5 px-2.5 font-medium text-slate-800">{ev.metric}</td>
                                    <td className="py-1.5 px-2.5 text-right font-bold text-slate-900">
                                      {ev.currentValue !== undefined ? `${ev.currentValue} ${ev.unit || ''}` : 'N/A'}
                                    </td>
                                    <td className="py-1.5 px-2.5 text-right text-slate-600">
                                      {ev.baselineValue !== undefined ? `${ev.baselineValue} ${ev.unit || ''}` : 'N/A'}
                                    </td>
                                    <td className="py-1.5 px-2.5 text-right font-semibold text-rose-600">
                                      {ev.difference !== undefined ? `${ev.difference > 0 ? `+${ev.difference}` : ev.difference} ${ev.unit || ''}` : '—'}
                                    </td>
                                    <td className="py-1.5 px-2.5 text-slate-500 text-[10px]">{ev.source || 'Database'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Identified Evidence Gaps & Missing Telemetry */}
            {investigation.dataGaps && investigation.dataGaps.length > 0 && (
              <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl space-y-2">
                <div className="flex items-center space-x-2 text-amber-950 font-bold uppercase tracking-wider text-[11px]">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Identified Evidence Gaps & Missing Telemetry:</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-700 text-xs pl-1">
                  {investigation.dataGaps.map((gap: string, i: number) => (
                    <li key={i}>{gap}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Unresolved Operational Questions for FC Leadership */}
            {investigation.unresolvedQuestions && investigation.unresolvedQuestions.length > 0 && (
              <div className="p-3.5 bg-indigo-50/60 border border-indigo-100 rounded-xl space-y-2">
                <div className="flex items-center space-x-2 text-indigo-950 font-bold uppercase tracking-wider text-[11px]">
                  <HelpCircle className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span>Unresolved Operational Questions for FC Leadership:</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-700 text-xs pl-1">
                  {investigation.unresolvedQuestions.map((q: string, i: number) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Hypothesized Root Causes */}
            {investigation.possibleCauses && investigation.possibleCauses.length > 0 && (
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
          <div className="p-8 text-center bg-slate-50/80 rounded-xl border border-slate-200 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center mx-auto">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800">
                {canTriggerAi ? 'AI Investigation Ready to Run' : 'AI Investigation Locked'}
              </h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                {canTriggerAi
                  ? 'All 3 evidence files have been uploaded. Click below to inspect the input payload and launch the AI root-cause investigation agent.'
                  : `Waiting for all 3 required files to be uploaded. Currently missing: ${missingFiles.join(', ')}.`}
              </p>
            </div>
            <div className="flex items-center justify-center space-x-2 pt-2">
              <button
                onClick={() => setIsInspectorOpen(true)}
                className="px-3.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs flex items-center"
              >
                <FileCode2 className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
                Inspect AI Input
              </button>
              <button
                onClick={handleTriggerAI}
                disabled={!canTriggerAi || isTriggeringAi}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all ${
                  canTriggerAi && !isTriggeringAi
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 text-white shadow-xs cursor-pointer active:scale-98'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                }`}
                title={
                  !canTriggerAi
                    ? `AI Investigation is locked until all 3 files are uploaded. Missing: ${missingFiles.join(', ')}`
                    : 'Trigger AI Root-Cause Investigation'
                }
              >
                {isTriggeringAi ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                    <span>Investigating with AI Agent...</span>
                  </>
                ) : (
                  <>
                    {canTriggerAi ? (
                      <Sparkles className="w-3.5 h-3.5 text-white" />
                    ) : (
                      <Lock className="w-3.5 h-3.5 text-slate-400" />
                    )}
                    <span>Trigger AI Investigation</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 6: AI Recommendation Agent Action Items */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
              <CheckCircle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Section 6: Evidence-Backed Corrective Action Items
              </h3>
              <p className="text-[11px] text-slate-500">
                Action plan with assigned functional leadership, success criteria, and review intervals
              </p>
            </div>
          </div>

          {(recommendations?.priority || recommendations?.overallPriority) && (
            <span
              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                (recommendations.priority || recommendations.overallPriority) === 'CRITICAL'
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              Priority: {recommendations.priority || recommendations.overallPriority}
            </span>
          )}
        </div>

        {recommendations && recommendations.recommendations && recommendations.recommendations.length > 0 ? (
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

                    <div className="flex-1 space-y-1.5 text-xs">
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
                        {rec.requiresHumanApproval && (
                          <span className="font-bold px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 text-[10px]">
                            Requires Leadership Approval
                          </span>
                        )}
                        {rec.reviewAfterDays && (
                          <span className="text-[10px] text-slate-500 font-medium">
                            Review in {rec.reviewAfterDays} days
                          </span>
                        )}
                      </div>

                      <div
                        className={`text-sm font-bold mt-1 ${
                          isChecked ? 'line-through text-slate-500' : 'text-slate-900'
                        }`}
                      >
                        {rec.action}
                      </div>

                      <div className="text-slate-600 text-xs">
                        <strong className="text-slate-700">Rationale:</strong> {rec.rationale || rec.reason}
                      </div>

                      {rec.expectedOutcome && (
                        <div className="text-emerald-800 bg-emerald-50/70 p-2 rounded-lg border border-emerald-100 text-[11px]">
                          <strong>Expected Outcome:</strong> {rec.expectedOutcome}
                          {rec.successMetric && (
                            <span className="block mt-0.5 text-emerald-900">
                              <strong>Success Metric:</strong> {rec.successMetric}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Resolved Supporting Finding References */}
                      {(() => {
                        const supporting = resolveFindingRefs(
                          rec.supportingFindingIds || rec.relatedFindingIds || [],
                          investigation?.findings
                        );
                        if (supporting.length === 0) return null;
                        return (
                          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5 text-[11px]">
                            <span className="text-slate-400 font-medium">Addressed Findings:</span>
                            {supporting.map((sf, sfIdx) => (
                              <span
                                key={sfIdx}
                                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-medium"
                              >
                                <span className="font-mono font-bold">[{sf.findingId}]</span>
                                <span>{sf.title}</span>
                              </span>
                            ))}
                          </div>
                        );
                      })()}
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

      {/* SECTION 7: Manager Review Governance & Actions */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-6">
        <div>
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            Section 7: Manager Governance & Review Workflow
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

      {/* AI Investigation Input Inspector Modal */}
      <AIInputInspectorModal
        isOpen={isInspectorOpen}
        onClose={() => setIsInspectorOpen(false)}
        anomalyId={anomalyId}
        fcCode={fc?.code || 'FC'}
        fcName={fc?.name || 'Fulfilment Centre'}
        businessDate={dateStr || ''}
        aiReadiness={aiReadiness}
        inputPayload={aiInputPayload}
        promptPreview={aiPromptPreview}
        onTriggerSuccess={() => {
          refetch();
          setAiActionMessage('AI Investigation completed successfully!');
          setTimeout(() => setAiActionMessage(null), 5000);
        }}
      />
    </div>
  );
}
