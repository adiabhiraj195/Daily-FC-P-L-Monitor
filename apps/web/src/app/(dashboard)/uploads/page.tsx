'use client';

import React, { useState, useEffect } from 'react';
import { fetchApi } from '../../../lib/api-client';
import { useAuth } from '../../../components/providers';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  Loader2,
  Building2,
  ShieldCheck,
  Lock,
  Download,
  Database,
  Users,
  Activity,
  Calendar,
  Layers,
  RefreshCw,
  Clock,
  Sparkles
} from 'lucide-react';
import { AIInputInspectorModal } from '../../../components/anomalies/AIInputInspectorModal';

interface FCItem {
  id: string;
  code: string;
  name: string;
  location?: string | null;
}

type DatasetTypeOption = 'PNL' | 'DAILY_OPERATIONS' | 'DAILY_LABOR' | 'COMBINED_OPERATIONS_LABOR';

export default function UploadPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'FC_MANAGER';

  const [activeTab, setActiveTab] = useState<'upload' | 'completeness' | 'history'>('upload');
  const [datasetType, setDatasetType] = useState<DatasetTypeOption>('DAILY_OPERATIONS');
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'CENTRALIZED' | 'SINGLE_FC'>('CENTRALIZED');
  const [fcId, setFcId] = useState('');
  const [availableFCs, setAvailableFCs] = useState<FCItem[]>([]);
  const [loadingFCs, setLoadingFCs] = useState(false);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [batchResult, setBatchResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Completeness state
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]!);
  const [completenessData, setCompletenessData] = useState<any[]>([]);
  const [loadingCompleteness, setLoadingCompleteness] = useState(false);

  // Upload history state
  const [historyBatches, setHistoryBatches] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // AI Inspector modal state
  const [inspectorModalRow, setInspectorModalRow] = useState<any | null>(null);
  const [inspectorInputData, setInspectorInputData] = useState<any | null>(null);
  const [loadingInspector, setLoadingInspector] = useState(false);

  const handleOpenInspectorForRow = async (row: any) => {
    setInspectorModalRow(row);
    setLoadingInspector(true);
    setInspectorInputData(null);
    try {
      if (row.anomalyId) {
        const data = await fetchApi<any>(`/anomalies/${row.anomalyId}/ai-input`);
        setInspectorInputData(data);
      }
    } catch (err) {
      console.error('Failed to load AI input:', err);
    } finally {
      setLoadingInspector(false);
    }
  };

  // Fetch FCs for selection
  useEffect(() => {
    const loadFCs = async () => {
      setLoadingFCs(true);
      try {
        const data = await fetchApi<FCItem[]>('/fcs');
        setAvailableFCs(data);
        if (data.length > 0) {
          setFcId(data[0]!.id);
        }
      } catch (err) {
        console.error('Failed to load FC list for upload:', err);
      } finally {
        setLoadingFCs(false);
      }
    };

    if (user) {
      loadFCs();
      if (user.role === 'FC_MANAGER') {
        setMode('SINGLE_FC');
      }
    }
  }, [user]);

  // Load completeness when tab opened or date changed
  useEffect(() => {
    if (activeTab === 'completeness') {
      loadCompleteness();
    } else if (activeTab === 'history') {
      loadHistory();
    }
  }, [activeTab, selectedDate]);

  const loadCompleteness = async () => {
    setLoadingCompleteness(true);
    try {
      const data = await fetchApi<any[]>(`/uploads/completeness?date=${selectedDate}`);
      setCompletenessData(data);
    } catch (err) {
      console.error('Failed to load data completeness:', err);
    } finally {
      setLoadingCompleteness(false);
    }
  };

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const data = await fetchApi<any[]>('/uploads');
      setHistoryBatches(data);
    } catch (err) {
      console.error('Failed to load upload history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setBatchResult(null);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file to upload');
      return;
    }

    if (mode === 'SINGLE_FC' && !fcId) {
      setError('Please select a Fulfilment Centre for this upload');
      return;
    }

    if (isManager && availableFCs.length === 0) {
      setError('You do not have any Fulfilment Centres assigned to your account. Please contact an Administrator.');
      return;
    }

    setIsUploading(true);
    setError(null);
    setUploadProgress('Initiating secure S3 upload session...');

    try {
      const effectiveMode = isManager ? 'SINGLE_FC' : mode;
      const effectiveFcId = effectiveMode === 'SINGLE_FC' ? fcId : undefined;

      const initData = await fetchApi<{
        batchId: string;
        uploadUrl: string;
        objectKey: string;
      }>('/uploads/initiate', {
        method: 'POST',
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          fileSize: file.size,
          mode: effectiveMode,
          datasetType,
          fcId: effectiveFcId
        })
      });

      setUploadProgress('Uploading file bytes directly to private S3 bucket...');
      
      const s3Response = await fetch(initData.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        },
        body: file
      });

      if (!s3Response.ok) {
        const errorText = await s3Response.text().catch(() => '');
        throw new Error(`S3 direct upload failed (${s3Response.status}): ${errorText || s3Response.statusText}`);
      }

      setUploadProgress('Verifying file metadata and queuing ingestion job...');
      await fetchApi<{ batchId: string; status: string }>(
        `/uploads/${initData.batchId}/complete`,
        { method: 'POST' }
      );

      setUploadProgress('Ingestion queued in PostgreSQL worker! Fetching batch status...');
      const batchData = await fetchApi<any>(`/uploads/${initData.batchId}`);
      setBatchResult(batchData);
      setFile(null);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setIsUploading(false);
      setUploadProgress('');
    }
  };

  const downloadTemplate = (type: 'OPERATIONS' | 'LABOR' | 'PNL') => {
    let csvContent = '';
    let filename = '';

    if (type === 'OPERATIONS') {
      filename = 'Daily_Operations_Template.csv';
      csvContent = 'fcId,businessDate,inboundShipments,outboundOrders,unitsProcessed,orderLinesProcessed,returnsProcessed,operatingHours,storageOccupancyPct\n' +
        'FC-DEL-01,2026-11-18,25,3200,6400,4800,120,16.0,82.5\n' +
        'FC-BLR-01,2026-11-18,18,2100,4100,3100,85,14.5,76.0\n';
    } else if (type === 'LABOR') {
      filename = 'Daily_Labor_Template.csv';
      csvContent = 'fcId,businessDate,plannedHeadcount,actualHeadcount,plannedLabourHours,actualPaidHours,productiveHours,overtimeHours,contractorHeadcount,contractorHours,contractorCost\n' +
        'FC-DEL-01,2026-11-18,40,38,320.0,335.0,290.0,35.0,10,80.0,32000.00\n' +
        'FC-BLR-01,2026-11-18,30,29,240.0,255.0,220.0,25.0,6,48.0,19200.00\n';
    } else {
      filename = 'Daily_PnL_Template.csv';
      csvContent = 'fcId,businessDate,revenue,manpowerCost,packagingCost,powerFuelCost,fcRent,equipmentRentals,overheads\n' +
        'FC-DEL-01,2026-11-18,150000.00,32000.00,12000.00,7500.00,18000.00,4500.00,6000.00\n';
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const selectedFCDetails = availableFCs.find(f => f.id === fcId);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Data Ingestion & Operational Intelligence</h2>
          <p className="text-xs text-slate-500 mt-1">
            Upload daily financial P&L, throughput operations, and workforce datasets for automated analysis
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center space-x-1 p-1 bg-slate-100 rounded-lg border border-slate-200 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('upload')}
            className={`px-3 py-1.5 rounded-md transition-all ${
              activeTab === 'upload'
                ? 'bg-white text-blue-700 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Upload Data
          </button>
          <button
            onClick={() => setActiveTab('completeness')}
            className={`px-3 py-1.5 rounded-md transition-all flex items-center ${
              activeTab === 'completeness'
                ? 'bg-white text-blue-700 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Activity className="w-3.5 h-3.5 mr-1" />
            Data Completeness
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1.5 rounded-md transition-all flex items-center ${
              activeTab === 'history'
                ? 'bg-white text-blue-700 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5 mr-1" />
            Upload History
          </button>
        </div>
      </div>

      {/* FC Manager RBAC Scope Alert Banner */}
      {isManager && (
        <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-start space-x-3">
          <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-sm text-blue-950">FC Manager Restricted Upload Scope</span>
            <p className="text-blue-800 leading-relaxed">
              In accordance with RBAC policies, FC Managers are strictly authorized to upload operational data exclusively for their assigned Fulfilment Centre.
              Consolidated multi-FC uploads are reserved for Finance Controllers and System Administrators.
            </p>
            {availableFCs.length > 0 ? (
              <div className="mt-2 flex items-center space-x-2 font-semibold text-blue-900">
                <span>Your Assigned FC:</span>
                <span className="px-2 py-0.5 rounded bg-blue-200/70 border border-blue-300 font-bold">
                  {availableFCs.map(f => `${f.name} (${f.code})`).join(', ')}
                </span>
              </div>
            ) : (
              <div className="mt-2 font-bold text-amber-700">
                Warning: No Fulfilment Centre assigned to your account. Contact Admin to provision assignment.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 1: UPLOAD FORM */}
      {activeTab === 'upload' && (
        <div className="space-y-6">
          {/* Dataset Type Selector Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-3">
              Select Dataset Category:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <button
                type="button"
                onClick={() => setDatasetType('DAILY_OPERATIONS')}
                className={`p-4 rounded-xl border text-left transition-all ${
                  datasetType === 'DAILY_OPERATIONS'
                    ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center mb-2">
                  <Database className="w-4 h-4" />
                </div>
                <div className="font-bold text-slate-900 text-xs">Daily Operations</div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Throughput, orders, units, order lines, returns, operating hours & occupancy
                </div>
              </button>

              <button
                type="button"
                onClick={() => setDatasetType('DAILY_LABOR')}
                className={`p-4 rounded-xl border text-left transition-all ${
                  datasetType === 'DAILY_LABOR'
                    ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center mb-2">
                  <Users className="w-4 h-4" />
                </div>
                <div className="font-bold text-slate-900 text-xs">Daily Labor</div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Headcount, paid hours, productive hours, overtime & contractor costs
                </div>
              </button>

              <button
                type="button"
                onClick={() => setDatasetType('COMBINED_OPERATIONS_LABOR')}
                className={`p-4 rounded-xl border text-left transition-all ${
                  datasetType === 'COMBINED_OPERATIONS_LABOR'
                    ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center mb-2">
                  <Layers className="w-4 h-4" />
                </div>
                <div className="font-bold text-slate-900 text-xs">Combined Workbook</div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Excel file containing sheets: Daily_Operations & Daily_Labor
                </div>
              </button>

              <button
                type="button"
                onClick={() => setDatasetType('PNL')}
                className={`p-4 rounded-xl border text-left transition-all ${
                  datasetType === 'PNL'
                    ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center mb-2">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div className="font-bold text-slate-900 text-xs">Financial P&L</div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Daily revenue, manpower, packaging, rent, power & fuel, overheads
                </div>
              </button>
            </div>

            {/* Template Download Bar */}
            <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-600">
              <span className="font-medium text-[11px] text-slate-500">Need standard headers? Download sample CSV templates:</span>
              <div className="flex items-center space-x-2 mt-2 sm:mt-0">
                <button
                  type="button"
                  onClick={() => downloadTemplate('OPERATIONS')}
                  className="px-2.5 py-1 rounded bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold flex items-center transition-colors text-[11px]"
                >
                  <Download className="w-3 h-3 mr-1 text-slate-400" />
                  Operations Template
                </button>
                <button
                  type="button"
                  onClick={() => downloadTemplate('LABOR')}
                  className="px-2.5 py-1 rounded bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold flex items-center transition-colors text-[11px]"
                >
                  <Download className="w-3 h-3 mr-1 text-slate-400" />
                  Labor Template
                </button>
                <button
                  type="button"
                  onClick={() => downloadTemplate('PNL')}
                  className="px-2.5 py-1 rounded bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold flex items-center transition-colors text-[11px]"
                >
                  <Download className="w-3 h-3 mr-1 text-slate-400" />
                  P&L Template
                </button>
              </div>
            </div>
          </div>

          {/* Main Upload Box */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-8">
            <form onSubmit={handleUpload} className="space-y-6">
              {/* Mode Selector */}
              <div className="border-b border-slate-100 pb-5">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">
                  Ingestion Mode:
                </span>
                <div className="flex items-center space-x-6">
                  {!isManager ? (
                    <>
                      <label className="flex items-center space-x-2 text-xs font-semibold text-slate-700 cursor-pointer">
                        <input
                          type="radio"
                          name="mode"
                          value="CENTRALIZED"
                          checked={mode === 'CENTRALIZED'}
                          onChange={() => setMode('CENTRALIZED')}
                          className="text-blue-600 focus:ring-blue-500"
                        />
                        <span>Centralized Multi-FC File (Admin / Finance)</span>
                      </label>

                      <label className="flex items-center space-x-2 text-xs font-semibold text-slate-700 cursor-pointer">
                        <input
                          type="radio"
                          name="mode"
                          value="SINGLE_FC"
                          checked={mode === 'SINGLE_FC'}
                          onChange={() => setMode('SINGLE_FC')}
                          className="text-blue-600 focus:ring-blue-500"
                        />
                        <span>Single FC Upload</span>
                      </label>
                    </>
                  ) : (
                    <div className="flex items-center space-x-2 text-xs font-bold text-slate-700 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                      <Lock className="w-3.5 h-3.5 text-slate-500" />
                      <span>Single FC Mode (Locked to Manager Role)</span>
                    </div>
                  )}
                </div>
              </div>

              {/* FC Selection Dropdown */}
              {(mode === 'SINGLE_FC' || isManager) && (
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    {isManager ? 'Your Assigned Fulfilment Centre:' : 'Target Fulfilment Centre:'}
                  </label>

                  {loadingFCs ? (
                    <div className="text-xs text-slate-400 flex items-center py-2">
                      <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Loading assigned FCs...
                    </div>
                  ) : availableFCs.length === 0 ? (
                    <div className="text-xs text-red-600 font-semibold py-2">
                      No Fulfilment Centre assigned. Please contact an Administrator.
                    </div>
                  ) : (
                    <div className="relative max-w-md">
                      <select
                        value={fcId}
                        onChange={e => setFcId(e.target.value)}
                        className="w-full text-xs font-semibold bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                      >
                        {availableFCs.map(fc => (
                          <option key={fc.id} value={fc.id}>
                            {fc.code} — {fc.name} {fc.location ? `(${fc.location})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* File Dropzone */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Select Spreadsheet File (.xlsx, .csv):
                </label>
                <div className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-xl p-8 text-center transition-colors bg-slate-50/50">
                  <input
                    type="file"
                    id="fileInput"
                    accept=".xlsx,.csv,.xls"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <label htmlFor="fileInput" className="cursor-pointer space-y-3 block">
                    <div className="w-12 h-12 rounded-full bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center mx-auto">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-blue-600 hover:underline">
                        Click to browse file
                      </span>
                      <span className="text-xs text-slate-500"> or drag and drop spreadsheet here</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Supports Excel Workbooks (.xlsx) and CSV files up to 25MB
                    </p>
                  </label>
                </div>

                {file && (
                  <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-lg flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2 text-slate-800">
                      <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                      <span className="font-semibold">{file.name}</span>
                      <span className="text-slate-400 font-mono">({(file.size / 1024).toFixed(1)} KB)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      className="text-slate-400 hover:text-red-500 font-bold"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>

              {/* Error Alert */}
              {error && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                  <div>
                    <strong className="block font-bold">Ingestion Error:</strong>
                    <span>{error}</span>
                  </div>
                </div>
              )}

              {/* Progress Indicator */}
              {isUploading && (
                <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 flex items-center space-x-3 text-xs text-blue-800">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  <span className="font-medium">{uploadProgress}</span>
                </div>
              )}

              {/* Submit Button */}
              <div>
                <button
                  type="submit"
                  disabled={isUploading || !file || (isManager && availableFCs.length === 0)}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-bold transition-colors flex items-center justify-center space-x-2 shadow-2xs"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Processing Upload...</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-4 h-4" />
                      <span>Upload & Process {datasetType.replace(/_/g, ' ')}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Upload Ingestion Result Card */}
          {batchResult && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                  <h3 className="text-sm font-bold text-slate-900">Upload Processed Successfully</h3>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                  batchResult.status === 'COMPLETED'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}>
                  Status: {batchResult.status}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 text-[11px]">Batch ID</span>
                  <div className="font-mono text-slate-800 truncate mt-0.5">{batchResult.id}</div>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px]">Category</span>
                  <div className="font-semibold text-slate-900 mt-0.5">{batchResult.datasetType || datasetType}</div>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px]">Total Rows</span>
                  <div className="font-bold text-slate-900 mt-0.5">{batchResult.rowCount ?? 'Processing'}</div>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px]">Valid / Invalid</span>
                  <div className="font-bold text-slate-900 mt-0.5">
                    <span className="text-emerald-600">{batchResult.validRowCount ?? 0}</span> /{' '}
                    <span className="text-red-600">{batchResult.invalidRowCount ?? 0}</span>
                  </div>
                </div>
              </div>

              {/* Row-Level Errors Table */}
              {batchResult.errorSummary && Array.isArray(batchResult.errorSummary) && batchResult.errorSummary.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <div className="text-xs font-bold text-red-700 mb-2 flex items-center">
                    <AlertCircle className="w-3.5 h-3.5 mr-1" />
                    Row Validation Errors ({batchResult.errorSummary.length}):
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-red-100 rounded-lg">
                    <table className="w-full text-[11px] text-left">
                      <thead className="bg-red-50/70 text-red-900">
                        <tr>
                          <th className="p-2 border-b border-red-100">Row #</th>
                          <th className="p-2 border-b border-red-100">FC Code</th>
                          <th className="p-2 border-b border-red-100">Field</th>
                          <th className="p-2 border-b border-red-100">Error Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-red-50">
                        {batchResult.errorSummary.map((err: any, idx: number) => (
                          <tr key={idx} className="hover:bg-red-50/30">
                            <td className="p-2 font-mono font-bold text-slate-700">{err.rowIndex}</td>
                            <td className="p-2 font-semibold text-slate-800">{err.fcId || 'N/A'}</td>
                            <td className="p-2 font-mono text-slate-600">{err.field || 'General'}</td>
                            <td className="p-2 text-red-600">{err.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: DATA COMPLETENESS GRID */}
      {activeTab === 'completeness' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Multi-Dataset Availability & Analysis Readiness</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Composite FC & business date readiness across P&L, Daily_Operations, and Daily_Labor
              </p>
            </div>

            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-1.5 text-xs text-slate-600">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-semibold">Date:</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="px-2.5 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                />
              </div>

              <button
                onClick={loadCompleteness}
                disabled={loadingCompleteness}
                className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center transition-colors"
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${loadingCompleteness ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Completeness Table */}
          {loadingCompleteness ? (
            <div className="p-12 text-center text-xs text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
              Loading multi-dataset readiness matrix...
            </div>
          ) : completenessData.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No Fulfilment Centres found for selected criteria.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Fulfilment Centre</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4 text-center">Financial P&L</th>
                    <th className="py-3 px-4 text-center">Daily Operations</th>
                    <th className="py-3 px-4 text-center">Daily Labor</th>
                    <th className="py-3 px-4 text-center">Completeness State</th>
                    <th className="py-3 px-4 text-center">Diagnostic Status</th>
                    <th className="py-3 px-4 text-center">AI Investigation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {completenessData.map((row: any) => {
                    const isComplete = row.completeness === 'COMPLETE';
                    const isFinancialOnly = row.completeness === 'FINANCIAL_ONLY';

                    return (
                      <tr key={row.fcId} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {row.fcCode} — <span className="text-slate-500 font-normal">{row.fcName}</span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">{row.businessDate}</td>
                        <td className="py-3 px-4 text-center">
                          {row.hasPnl ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Ready (v{row.pnlVersion || 1})
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500">
                              Missing
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {row.hasOperations ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Ready (v{row.operationsVersion || 1})
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500">
                              Missing
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {row.hasLabor ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Ready (v{row.laborVersion || 1})
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500">
                              Missing
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            isComplete
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                              : isFinancialOnly
                                ? 'bg-amber-50 text-amber-800 border border-amber-300'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}>
                            {row.completeness.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            row.diagnosticStatus === 'COMPLETE'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-purple-50 text-purple-700 border border-purple-200'
                          }`}>
                            {row.diagnosticStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {isComplete ? (
                            <button
                              onClick={() => handleOpenInspectorForRow(row)}
                              className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 inline-flex items-center space-x-1 transition-colors shadow-2xs"
                              title="Inspect AI input payload & trigger investigation"
                            >
                              <Sparkles className="w-3 h-3 text-indigo-600" />
                              <span>Trigger AI</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleOpenInspectorForRow(row)}
                              className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500 hover:bg-slate-200 border border-slate-200 inline-flex items-center space-x-1 transition-colors"
                              title={`Requires all 3 files. Uploaded: ${[row.hasPnl, row.hasOperations, row.hasLabor].filter(Boolean).length}/3`}
                            >
                              <Lock className="w-2.5 h-2.5 text-slate-400" />
                              <span>Locked ({[row.hasPnl, row.hasOperations, row.hasLabor].filter(Boolean).length}/3)</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: UPLOAD HISTORY */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Upload Batch Ingestion History</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Audit trail of past uploads, dataset versions, and processing outcomes
              </p>
            </div>
            <button
              onClick={loadHistory}
              disabled={loadingHistory}
              className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center transition-colors"
            >
              <RefreshCw className={`w-3 h-3 mr-1 ${loadingHistory ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {loadingHistory ? (
            <div className="p-8 text-center text-xs text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
              Loading history...
            </div>
          ) : historyBatches.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No previous upload batches found.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Date / Time</th>
                    <th className="py-2.5 px-3">Filename</th>
                    <th className="py-2.5 px-3">Dataset Type</th>
                    <th className="py-2.5 px-3">Mode</th>
                    <th className="py-2.5 px-3">Uploader</th>
                    <th className="py-2.5 px-3 text-center">Rows (Valid / Total)</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px]">
                  {historyBatches.map(b => (
                    <tr key={b.id} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-3 font-mono text-slate-500">
                        {new Date(b.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">{b.originalFileName}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-700">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                          {b.datasetType || 'PNL'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{b.mode}</td>
                      <td className="py-2.5 px-3 text-slate-700">{b.uploadedBy?.name || 'N/A'}</td>
                      <td className="py-2.5 px-3 text-center font-mono">
                        <span className="text-emerald-600 font-bold">{b.validRowCount ?? 0}</span> / {b.rowCount ?? 0}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          b.status === 'COMPLETED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : b.status === 'PROCESSING'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-red-50 text-red-700 border border-red-200'
                        }`}>
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* AI Investigation Input Inspector Modal */}
      {inspectorModalRow && (
        <AIInputInspectorModal
          isOpen={!!inspectorModalRow}
          onClose={() => setInspectorModalRow(null)}
          anomalyId={inspectorModalRow.anomalyId || undefined}
          submissionId={inspectorModalRow.submissionId || undefined}
          fcCode={inspectorModalRow.fcCode}
          fcName={inspectorModalRow.fcName}
          businessDate={inspectorModalRow.businessDate}
          aiReadiness={inspectorInputData?.aiReadiness ?? {
            canTrigger: inspectorModalRow.completeness === 'COMPLETE',
            hasAllThreeFiles: inspectorModalRow.completeness === 'COMPLETE',
            completeness: inspectorModalRow.completeness,
            diagnosticStatus: inspectorModalRow.diagnosticStatus,
            files: {
              pnl: { uploaded: inspectorModalRow.hasPnl, version: inspectorModalRow.pnlVersion, name: 'Financial P&L' },
              operations: { uploaded: inspectorModalRow.hasOperations, version: inspectorModalRow.operationsVersion, name: 'Daily Operations' },
              labor: { uploaded: inspectorModalRow.hasLabor, version: inspectorModalRow.laborVersion, name: 'Daily Labor' }
            },
            missingFiles: [
              !inspectorModalRow.hasPnl ? 'Financial P&L' : null,
              !inspectorModalRow.hasOperations ? 'Daily Operations' : null,
              !inspectorModalRow.hasLabor ? 'Daily Labor' : null
            ].filter(Boolean) as string[]
          }}
          inputPayload={inspectorInputData?.inputPayload ?? null}
          promptPreview={inspectorInputData?.promptPreview ?? null}
          onTriggerSuccess={() => {
            loadCompleteness();
          }}
        />
      )}
    </div>
  );
}
