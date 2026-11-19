'use client';

import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Bot,
  Copy,
  Check,
  FileSpreadsheet,
  Boxes,
  Users,
  CheckCircle2,
  AlertCircle,
  Lock,
  Layers,
  ArrowRight,
  TrendingDown,
  Activity,
  Calendar,
  Building2,
  Clock,
  ChevronDown,
  ChevronUp,
  FileCode2,
  Loader2,
  ShieldAlert,
  UserCheck
} from 'lucide-react';
import { fetchApi } from '../../lib/api-client';
import { formatMetricName, resolveEvidenceRefs } from '@prozo/shared';

export interface AIInputInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  anomalyId?: string;
  submissionId?: string;
  fcCode: string;
  fcName: string;
  businessDate: string;
  aiReadiness?: {
    canTrigger: boolean;
    hasAllThreeFiles: boolean;
    completeness: string;
    diagnosticStatus: string;
    files: {
      pnl: { uploaded: boolean; version: number | null; name: string };
      operations: { uploaded: boolean; version: number | null; name: string };
      labor: { uploaded: boolean; version: number | null; name: string };
    };
    missingFiles: string[];
  };
  inputPayload?: Record<string, any> | null;
  promptPreview?: {
    systemPrompt: string;
    userPrompt: string;
    model: string;
  } | null;
  onTriggerSuccess?: (result: any) => void;
}

export function AIInputInspectorModal({
  isOpen,
  onClose,
  anomalyId,
  submissionId,
  fcCode,
  fcName,
  businessDate,
  aiReadiness,
  inputPayload,
  promptPreview,
  onTriggerSuccess
}: AIInputInspectorModalProps) {
  const [activeTab, setActiveTab] = useState<'structured' | 'raw'>('structured');
  const [copied, setCopied] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);

  if (!isOpen) return null;

  const canTrigger = aiReadiness ? aiReadiness.canTrigger : false;
  const missingFiles = aiReadiness?.missingFiles || [];

  const copyPayloadToClipboard = () => {
    const textToCopy = promptPreview?.userPrompt || JSON.stringify(inputPayload, null, 2);
    if (!textToCopy) return;

    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleTriggerAI = async () => {
    if (!canTrigger) return;
    setIsTriggering(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      let endpoint = '';
      if (anomalyId) {
        endpoint = `/anomalies/${anomalyId}/trigger-ai`;
      } else if (submissionId) {
        endpoint = `/submissions/${submissionId}/trigger-ai`;
      } else {
        throw new Error('No anomalyId or submissionId provided for triggering AI');
      }

      const res = await fetchApi<any>(endpoint, { method: 'POST' });
      setSuccessMsg('AI Investigation completed successfully! Refreshed report data.');
      if (onTriggerSuccess) {
        onTriggerSuccess(res);
      }
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to trigger AI investigation');
    } finally {
      setIsTriggering(false);
    }
  };

  const fin = inputPayload?.financial || inputPayload?.financialFacts;
  const ops = inputPayload?.operations || inputPayload?.operationsData;
  const lab = inputPayload?.labor || inputPayload?.laborData;
  const derived = inputPayload?.metrics || inputPayload?.derivedMetrics;
  const hist = inputPayload?.history || inputPayload?.historicalContext;
  const anoms: any[] = inputPayload?.anomalies || [];
  const costLines: any[] = fin?.costs || fin?.costLines || [];
  const manpowerCost = fin?.manpowerCost || costLines.find((c: any) => c.lineItem === 'MANPOWER')?.amount || 0;
  const breachedCosts = costLines.filter((c: any) => c.status === 'ABOVE_MAX' || c.status === 'BELOW_MIN');
  const activeBreached = breachedCosts.length > 0 ? breachedCosts : (fin?.costContributors || []);
  const evRegistry: any[] = inputPayload?.evidenceRegistry || inputPayload?.context?.evidenceRegistry || [];
  const resolvedEvs = resolveEvidenceRefs(
    Array.isArray(evRegistry)
      ? evRegistry.map((item: any) => (typeof item === 'string' ? item.split(':')[0] : item.id || item.metric))
      : [],
    evRegistry
  );
  const recon = inputPayload?.reconciliation || derived?.reconciliation;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  AI Investigation Input Inspector
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-200 border border-indigo-400/30">
                  LangGraph 2-Agent
                </span>
              </div>
              <p className="text-xs text-slate-300 flex items-center space-x-2 mt-0.5">
                <span className="font-semibold text-white">{fcCode}</span>
                <span>•</span>
                <span>{fcName}</span>
                <span>•</span>
                <span className="flex items-center">
                  <Calendar className="w-3 h-3 mr-1 opacity-70" />
                  {businessDate}
                </span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* 3-File Upload Readiness Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center">
                <Layers className="w-3.5 h-3.5 mr-1 text-slate-500" />
                Required 3 Evidence Files Status:
              </span>
              <span
                className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                  canTrigger
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}
              >
                {canTrigger
                  ? '✓ All 3 Files Uploaded (Ready)'
                  : `⚠️ Locked: ${3 - missingFiles.length}/3 Files Uploaded`}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* File 1: Financial P&L */}
              <div
                className={`p-3 rounded-xl border flex items-center justify-between ${
                  aiReadiness?.files?.pnl?.uploaded
                    ? 'bg-emerald-50/50 border-emerald-200 text-emerald-950'
                    : 'bg-rose-50/50 border-rose-200 text-rose-950'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                      aiReadiness?.files?.pnl?.uploaded
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900">1. Financial P&L</div>
                    <div className="text-[11px] text-slate-500">Revenue, Costs & CM1/2</div>
                  </div>
                </div>
                {aiReadiness?.files?.pnl?.uploaded ? (
                  <span className="flex items-center text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Ready (v{aiReadiness.files.pnl.version || 1})
                  </span>
                ) : (
                  <span className="flex items-center text-[11px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Missing
                  </span>
                )}
              </div>

              {/* File 2: Daily Operations */}
              <div
                className={`p-3 rounded-xl border flex items-center justify-between ${
                  aiReadiness?.files?.operations?.uploaded
                    ? 'bg-emerald-50/50 border-emerald-200 text-emerald-950'
                    : 'bg-rose-50/50 border-rose-200 text-rose-950'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                      aiReadiness?.files?.operations?.uploaded
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    <Boxes className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900">2. Daily Operations</div>
                    <div className="text-[11px] text-slate-500">Orders, Units, Hours</div>
                  </div>
                </div>
                {aiReadiness?.files?.operations?.uploaded ? (
                  <span className="flex items-center text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Ready (v{aiReadiness.files.operations.version || 1})
                  </span>
                ) : (
                  <span className="flex items-center text-[11px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Missing
                  </span>
                )}
              </div>

              {/* File 3: Daily Labor */}
              <div
                className={`p-3 rounded-xl border flex items-center justify-between ${
                  aiReadiness?.files?.labor?.uploaded
                    ? 'bg-emerald-50/50 border-emerald-200 text-emerald-950'
                    : 'bg-rose-50/50 border-rose-200 text-rose-950'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                      aiReadiness?.files?.labor?.uploaded
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900">3. Daily Labor</div>
                    <div className="text-[11px] text-slate-500">Hours, Overtime, Costs</div>
                  </div>
                </div>
                {aiReadiness?.files?.labor?.uploaded ? (
                  <span className="flex items-center text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Ready (v{aiReadiness.files.labor.version || 1})
                  </span>
                ) : (
                  <span className="flex items-center text-[11px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Missing
                  </span>
                )}
              </div>
            </div>

            {/* Locked Warning Message if missing files */}
            {!canTrigger && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <span className="font-bold">AI Investigation Locked:</span> Triggering is only
                  allowed once <strong>all three files</strong> (Financial P&L, Daily Operations, and
                  Daily Labor) are uploaded. Missing files:{' '}
                  <strong className="text-rose-700">{missingFiles.join(', ')}</strong>. Please upload
                  the missing datasets to unlock AI investigation.
                </div>
              </div>
            )}
          </div>

          {/* Success / Error Banners */}
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Tab Navigation */}
          <div className="flex items-center justify-between border-b border-slate-200 pt-1">
            <div className="flex space-x-1">
              <button
                onClick={() => setActiveTab('structured')}
                className={`px-3.5 py-2 text-xs font-bold border-b-2 transition-colors flex items-center space-x-1.5 ${
                  activeTab === 'structured'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Structured Input Evidence Overview</span>
              </button>

              <button
                onClick={() => setActiveTab('raw')}
                className={`px-3.5 py-2 text-xs font-bold border-b-2 transition-colors flex items-center space-x-1.5 ${
                  activeTab === 'raw'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <FileCode2 className="w-3.5 h-3.5" />
                <span>Exact Prompt & JSON Payload</span>
              </button>
            </div>

            <button
              onClick={copyPayloadToClipboard}
              className="text-xs font-semibold px-2.5 py-1 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center transition-colors mb-1"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                  Copied JSON
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 mr-1 text-slate-400" />
                  Copy Input JSON
                </>
              )}
            </button>
          </div>

          {/* TAB 1: Structured Input Overview */}
          {activeTab === 'structured' && (
            <div className="space-y-4">
              {/* Section A: Financial Performance Facts */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center space-x-2">
                    <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                      1. Financial Facts Fed into AI
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                      fin?.colour === 'RED'
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : fin?.colour === 'YELLOW'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : fin?.colour === 'BLUE'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}
                  >
                    Colour: {fin?.colour || 'N/A'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-medium">Daily Revenue</span>
                    <div className="text-sm font-bold text-slate-900">
                      ₹{Number(fin?.revenue || 0).toLocaleString('en-IN')}
                    </div>
                  </div>

                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-medium">CM1 Margin</span>
                    <div className="text-sm font-bold text-slate-900">
                      {fin?.cm1Pct ? `${Number(fin.cm1Pct).toFixed(2)}%` : '—'}
                    </div>
                  </div>

                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-medium">CM2 Margin</span>
                    <div className="text-sm font-bold text-slate-900">
                      {fin?.cm2Pct ? `${Number(fin.cm2Pct).toFixed(2)}%` : '—'}
                    </div>
                  </div>

                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-medium">Manpower Cost</span>
                    <div className="text-sm font-bold text-slate-900">
                      ₹{Number(manpowerCost || 0).toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>

                {/* Breached cost lines list */}
                {activeBreached.length > 0 && (
                  <div className="pt-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                      Cost Contributors Flagged as Breaching Target Range:
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {activeBreached.map((c: any, i: number) => (
                        <div
                          key={i}
                          className="px-2.5 py-1 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900 flex items-center space-x-1.5"
                        >
                          <span className="font-bold">{c.lineItem}:</span>
                          <span>{Number(c.actualPct || c.percentage || 0).toFixed(2)}% of Rev</span>
                          {c.excessAmount && (
                            <span className="text-[10px] font-semibold text-rose-700">
                              (₹{Number(c.excessAmount).toLocaleString('en-IN')} excess)
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Section B: Operational Throughput Data */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center space-x-2">
                    <Boxes className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                      2. Daily Operations Evidence
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {ops ? 'Source: Daily_Operations' : 'Missing'}
                  </span>
                </div>

                {ops ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-medium">Outbound Orders</span>
                      <div className="text-sm font-bold text-slate-900">{ops.outboundOrders}</div>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-medium">Units Processed</span>
                      <div className="text-sm font-bold text-slate-900">{ops.unitsProcessed}</div>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-medium">Operating Hours</span>
                      <div className="text-sm font-bold text-slate-900">{ops.operatingHours} hrs</div>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-medium">Storage Occupancy</span>
                      <div className="text-sm font-bold text-slate-900">
                        {ops.storageOccupancyPct ? `${ops.storageOccupancyPct}%` : '—'}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-white rounded-lg border border-dashed border-slate-300 text-xs text-slate-500 italic text-center">
                    No Daily Operations data uploaded for this business date.
                  </div>
                )}
              </div>

              {/* Section C: Workforce & Labor Data */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center space-x-2">
                    <Users className="w-4 h-4 text-purple-600" />
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                      3. Daily Labor & Workforce Evidence
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {lab ? 'Source: Daily_Labor' : 'Missing'}
                  </span>
                </div>

                {lab ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-medium">Headcount (Plan / Act)</span>
                      <div className="text-sm font-bold text-slate-900">
                        {lab.plannedHeadcount} / {lab.actualHeadcount}
                      </div>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-medium">Actual Paid Hours</span>
                      <div className="text-sm font-bold text-slate-900">{lab.actualPaidHours} hrs</div>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-medium">Overtime Hours</span>
                      <div className="text-sm font-bold text-rose-600">{lab.overtimeHours} hrs</div>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-medium">Contractor Cost</span>
                      <div className="text-sm font-bold text-slate-900">
                        ₹{Number(lab.contractorCost || 0).toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-white rounded-lg border border-dashed border-slate-300 text-xs text-slate-500 italic text-center">
                    No Daily Labor data uploaded for this business date.
                  </div>
                )}
              </div>

              {/* Section D: Derived Ratios & Historical Baseline Comparisons */}
              {derived && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <div className="flex items-center space-x-2">
                      <Activity className="w-4 h-4 text-indigo-600" />
                      <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                        4. Deterministic Ratios & Baseline Deviations Fed to AI
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-medium">Labour Utilization</span>
                      <div className="text-sm font-bold text-indigo-700">
                        {derived.workforce?.labourUtilization !== undefined
                          ? `${derived.workforce.labourUtilization}%`
                          : '—'}
                      </div>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-medium">Overtime Ratio</span>
                      <div className="text-sm font-bold text-rose-600">
                        {derived.workforce?.overtimeRatio !== undefined
                          ? `${derived.workforce.overtimeRatio}%`
                          : '—'}
                      </div>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-medium">Cost Per Order</span>
                      <div className="text-sm font-bold text-slate-900">
                        {derived.productivity?.costPerOrder !== undefined
                          ? `₹${derived.productivity.costPerOrder}`
                          : '—'}
                      </div>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-medium">Units / Paid Hour</span>
                      <div className="text-sm font-bold text-slate-900">
                        {derived.productivity?.unitsPerPaidHour !== undefined
                          ? `${derived.productivity.unitsPerPaidHour}`
                          : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Section 5: Authoritative Detected Anomalies Fed into AI */}
              {anoms && anoms.length > 0 && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <div className="flex items-center space-x-2">
                      <ShieldAlert className="w-4 h-4 text-rose-600" />
                      <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                        5. Authoritative Detected Anomalies ({anoms.length} breaches)
                      </span>
                    </div>
                  </div>

                  <div className="overflow-x-auto bg-white rounded-lg border border-slate-200">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100/80 text-slate-700 font-semibold border-b border-slate-200 text-[11px]">
                          <th className="py-2 px-3">Anomaly ID</th>
                          <th className="py-2 px-3">Metric Key</th>
                          <th className="py-2 px-3">Severity</th>
                          <th className="py-2 px-3 text-right">Target Deviation</th>
                          <th className="py-2 px-3 text-right">Tolerance Breach</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[11px]">
                        {anoms.map((a: any, i: number) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="py-1.5 px-3 font-mono font-bold text-indigo-700">{a.id || `anom-${i + 1}`}</td>
                            <td className="py-1.5 px-3 font-semibold text-slate-900">{formatMetricName(a.metricKey)}</td>
                            <td className="py-1.5 px-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                a.severity === 'CRITICAL' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                              }`}>
                                {a.severity}
                              </span>
                            </td>
                            <td className="py-1.5 px-3 text-right font-medium text-slate-700">
                              {a.deviationFromTargetPP ? `${a.deviationFromTargetPP} pp` : '—'}
                            </td>
                            <td className="py-1.5 px-3 text-right font-bold text-rose-600">
                              {a.breachBeyondTolerancePP ? `${a.breachBeyondTolerancePP} pp` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Section 6: Deterministic Evidence Registry */}
              {resolvedEvs.length > 0 && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <div className="flex items-center space-x-2">
                      <Layers className="w-4 h-4 text-indigo-600" />
                      <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                        6. Deterministic Evidence Registry ({resolvedEvs.length} stable facts)
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {resolvedEvs.map((ev, i) => (
                      <div key={i} className="p-2.5 bg-white rounded-lg border border-slate-200 space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                            {ev.id}
                          </span>
                          <span className="text-[9px] font-semibold text-slate-400 uppercase">{ev.source}</span>
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

              {/* Section 7: Contractor Cost Reconciliation */}
              {recon && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <div className="flex items-center space-x-2">
                      <UserCheck className="w-4 h-4 text-indigo-600" />
                      <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                        7. Contractor Cost & Hour Allocation Review
                      </span>
                    </div>
                    {recon.signal && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                        Signal: {recon.signal}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-medium">Contractor Cost Share</span>
                      <div className="text-sm font-bold text-slate-900">
                        {recon.contractorCostSharePct ? `${recon.contractorCostSharePct}%` : '—'}
                      </div>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-medium">Contractor Hour Share</span>
                      <div className="text-sm font-bold text-slate-900">
                        {recon.contractorHourSharePct ? `${recon.contractorHourSharePct}%` : '—'}
                      </div>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-medium">Contractor Hourly Rate</span>
                      <div className="text-sm font-bold text-indigo-700">
                        {recon.contractorCostPerHour ? `₹${recon.contractorCostPerHour}/hr` : '—'}
                      </div>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-medium">Non-Contractor Rate</span>
                      <div className="text-sm font-bold text-slate-700">
                        {recon.nonContractorCostPerHour ? `₹${recon.nonContractorCostPerHour}/hr` : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Raw Prompt & JSON Payload */}
          {activeTab === 'raw' && (
            <div className="space-y-4">
              {/* System Prompt Collapsible */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowSystemPrompt(!showSystemPrompt)}
                  className="w-full px-4 py-2.5 bg-slate-100 flex items-center justify-between text-xs font-bold text-slate-700 hover:bg-slate-200/80 transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <Bot className="w-3.5 h-3.5 text-indigo-600" />
                    <span>System Prompt (Instructions to LLM)</span>
                  </div>
                  {showSystemPrompt ? (
                    <ChevronUp className="w-4 h-4 text-slate-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-500" />
                  )}
                </button>

                {showSystemPrompt && (
                  <div className="p-4 bg-slate-50 text-slate-700 font-mono text-[11px] leading-relaxed border-t border-slate-200 whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {promptPreview?.systemPrompt || 'System instructions for Investigation Agent'}
                  </div>
                )}
              </div>

              {/* Exact JSON Payload */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                    User Prompt Payload (JSON Object):
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">
                    Model: {promptPreview?.model || 'openai/gpt-oss-120b'} | Temp: 0.1
                  </span>
                </div>

                <div className="bg-slate-900 text-slate-100 rounded-xl p-4 font-mono text-xs overflow-x-auto max-h-[380px] shadow-inner border border-slate-800">
                  <pre className="text-[11px] leading-relaxed">
                    {JSON.stringify(inputPayload, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500">
            {canTrigger ? (
              <span className="text-emerald-700 font-semibold flex items-center">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                All 3 files present. Ready to trigger AI agent investigation.
              </span>
            ) : (
              <span className="text-rose-600 font-semibold flex items-center">
                <Lock className="w-3.5 h-3.5 mr-1" />
                Triggering disabled: missing {missingFiles.join(', ')}.
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              disabled={isTriggering}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              Close
            </button>

            <button
              onClick={handleTriggerAI}
              disabled={!canTrigger || isTriggering}
              className={`px-5 py-2 rounded-xl text-xs font-bold flex items-center space-x-2 shadow-sm transition-all ${
                canTrigger && !isTriggering
                  ? 'bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 hover:from-indigo-700 hover:to-purple-700 text-white cursor-pointer active:scale-98'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
              }`}
              title={
                !canTrigger
                  ? `Requires all 3 files. Missing: ${missingFiles.join(', ')}`
                  : 'Trigger evidence-backed AI Investigation'
              }
            >
              {isTriggering ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Investigating with AI Agent...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-white" />
                  <span>Trigger AI Investigation</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
