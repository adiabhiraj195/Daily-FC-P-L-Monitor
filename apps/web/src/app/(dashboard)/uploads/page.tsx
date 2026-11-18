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
  Lock
} from 'lucide-react';

interface FCItem {
  id: string;
  code: string;
  name: string;
  location?: string | null;
}

export default function UploadPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'FC_MANAGER';

  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'CENTRALIZED' | 'SINGLE_FC'>('CENTRALIZED');
  const [fcId, setFcId] = useState('');
  const [availableFCs, setAvailableFCs] = useState<FCItem[]>([]);
  const [loadingFCs, setLoadingFCs] = useState(false);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [batchResult, setBatchResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

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
      // 1. Call /api/v1/uploads/initiate to get batchId & presigned PUT URL
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
          fcId: effectiveFcId
        })
      });

      // 2. Direct browser-to-S3 PUT upload
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

      // 3. Call /api/v1/uploads/:batchId/complete
      setUploadProgress('Verifying file metadata and queuing ingestion job...');
      await fetchApi<{ batchId: string; status: string }>(
        `/uploads/${initData.batchId}/complete`,
        { method: 'POST' }
      );

      // 4. Poll status
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

  const selectedFCDetails = availableFCs.find(f => f.id === fcId);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Page Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Daily Financial Data Ingestion</h2>
        <p className="text-xs text-slate-500 mt-1">
          Upload consolidated daily revenue and cost reports (.xlsx or .csv) for automated P&L evaluation
        </p>
      </div>

      {/* FC Manager RBAC Scope Alert Banner */}
      {isManager && (
        <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-start space-x-3">
          <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-sm text-blue-950">FC Manager Restricted Upload Scope</span>
            <p className="text-blue-800 leading-relaxed">
              In accordance with RBAC policies, FC Managers are strictly authorized to upload operational data exclusively for their assigned Fulfilment Centre.
              Centralized multi-FC uploads are reserved for Finance Controllers and System Administrators.
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

      {/* Main Upload Box */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
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

          {/* FC Selection Dropdown (Only for SINGLE_FC or Manager) */}
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
                    disabled={isManager && availableFCs.length === 1}
                    className="w-full px-3 py-2.5 text-xs font-medium border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-slate-50 disabled:text-slate-700"
                  >
                    {availableFCs.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.code}) {f.location ? `— ${f.location}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {selectedFCDetails && (
                <p className="text-[11px] text-slate-400 mt-1">
                  Upload file rows will be validated and mapped specifically to <span className="font-semibold text-slate-600">{selectedFCDetails.code}</span> ({selectedFCDetails.name}).
                </p>
              )}
            </div>
          )}

          {/* Drag & Drop File Area */}
          <div className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-10 text-center transition-colors bg-slate-50/50">
            <UploadCloud className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <div className="text-sm font-semibold text-slate-700">
              {file ? (
                <div className="flex items-center justify-center space-x-2 text-blue-600 font-bold">
                  <FileSpreadsheet className="w-5 h-5" />
                  <span>{file.name} ({(file.size / 1024).toFixed(1)} KB)</span>
                </div>
              ) : (
                <>
                  <span>Drag and drop your spreadsheet here, or </span>
                  <label className="text-blue-600 hover:underline cursor-pointer">
                    browse files
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                </>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Supports Microsoft Excel (.xlsx) and Comma-Separated Values (.csv) up to 25MB
            </p>
          </div>

          {error && (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center">
              <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isUploading && (
            <div className="p-4 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold flex items-center">
              <Loader2 className="w-4 h-4 mr-2 animate-spin shrink-0" />
              <span>{uploadProgress}</span>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!file || isUploading || (isManager && availableFCs.length === 0)}
              className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-md transition-colors disabled:opacity-50 flex items-center"
            >
              {isUploading ? 'Processing File...' : 'Upload & Process Ingestion'}
            </button>
          </div>
        </form>
      </div>

      {/* Batch Results Card */}
      {batchResult && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center space-x-2 text-emerald-600 font-bold text-sm">
              <CheckCircle className="w-5 h-5" />
              <span>Batch Ingestion Registered (Batch ID: {batchResult.id})</span>
            </div>
            <span className={`text-xs font-bold px-2.5 py-1 rounded border ${
              batchResult.status === 'COMPLETED'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : batchResult.status === 'FAILED'
                ? 'bg-red-50 text-red-700 border-red-200'
                : 'bg-blue-50 text-blue-700 border-blue-200'
            }`}>
              Status: {batchResult.status}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-4 text-xs">
            <div className="p-3 bg-slate-50 rounded-lg">
              <div className="text-slate-500 font-medium">Original File:</div>
              <div className="font-bold text-slate-800 truncate">{batchResult.originalFileName}</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <div className="text-slate-500 font-medium">Mode:</div>
              <div className="font-bold text-slate-800">{batchResult.mode}</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <div className="text-slate-500 font-medium">Submissions Created:</div>
              <div className="font-bold text-slate-800">{batchResult.submissions?.length || 0}</div>
            </div>
          </div>

          {batchResult.errorSummary && (
            <div className="mt-4 p-4 bg-amber-50 rounded-lg border border-amber-200 text-xs">
              <div className="font-bold text-amber-800 mb-1">Row Validation & Authorization Notices:</div>
              <pre className="text-[11px] text-amber-700 whitespace-pre-wrap font-mono">
                {JSON.stringify(batchResult.errorSummary, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
