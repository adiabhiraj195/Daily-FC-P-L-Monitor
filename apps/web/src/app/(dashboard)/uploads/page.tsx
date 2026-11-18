'use client';

import React, { useState } from 'react';
import { fetchApi } from '../../../lib/api-client';
import { useAuth } from '../../../components/providers';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  Loader2,
  RefreshCw
} from 'lucide-react';

export default function UploadPage() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'CENTRALIZED' | 'SINGLE_FC'>('CENTRALIZED');
  const [fcId, setFcId] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [batchResult, setBatchResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

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

    setIsUploading(true);
    setError(null);
    setUploadProgress('Initiating secure S3 upload session...');

    try {
      // 1. Call /api/v1/uploads/initiate to get batchId & presigned PUT URL
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
          mode,
          fcId: mode === 'SINGLE_FC' ? fcId : undefined
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
      const completeData = await fetchApi<{ batchId: string; status: string }>(
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

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Page Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Daily Financial Data Ingestion</h2>
        <p className="text-xs text-slate-500 mt-1">
          Upload consolidated daily revenue and cost reports (.xlsx or .csv) for automated P&L evaluation
        </p>
      </div>

      {/* Main Upload Box */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
        <form onSubmit={handleUpload} className="space-y-6">
          {/* Mode Selector */}
          <div className="flex items-center space-x-6 border-b border-slate-100 pb-5">
            <div>
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">
                Ingestion Mode:
              </span>
              <div className="flex items-center space-x-4">
                <label className="flex items-center space-x-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    value="CENTRALIZED"
                    checked={mode === 'CENTRALIZED'}
                    onChange={() => setMode('CENTRALIZED')}
                    disabled={user?.role === 'FC_MANAGER'}
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
              </div>
            </div>
          </div>

          {mode === 'SINGLE_FC' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Target FC Identifier:
              </label>
              <input
                type="text"
                required
                value={fcId}
                onChange={e => setFcId(e.target.value)}
                placeholder="e.g. FC-DEL-01"
                className="w-full max-w-xs px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
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
              disabled={!file || isUploading}
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
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
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
              <div className="font-bold text-amber-800 mb-1">Row Validation Notices:</div>
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
