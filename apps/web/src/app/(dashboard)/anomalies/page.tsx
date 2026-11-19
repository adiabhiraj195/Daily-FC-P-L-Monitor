'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '../../../lib/api-client';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Filter,
  Search,
  X,
  RotateCcw,
  Download,
  Calendar,
  Building2,
  TrendingDown,
  Clock,
  Sparkles,
  LayoutGrid,
  Table as TableIcon,
  ChevronRight,
  ShieldAlert,
  ArrowUpDown,
  FileSpreadsheet
} from 'lucide-react';
import {
  AnomalySeverityBadge,
  ReviewStatusBadge,
  AnomalyTypeBadge
} from '../../../components/common/Badge';
import { normalizeInvestigationOutput } from '@prozo/shared';

export default function AnomaliesListPage() {
  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFcId, setSelectedFcId] = useState('ALL');
  const [selectedType, setSelectedType] = useState('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'impact_desc' | 'deviation_desc' | 'severity_desc'>('date_desc');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Build query string for API
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedFcId !== 'ALL') params.set('fcId', selectedFcId);
    if (selectedType !== 'ALL') params.set('type', selectedType);
    if (selectedSeverity !== 'ALL') params.set('severity', selectedSeverity);
    if (selectedStatus !== 'ALL') params.set('reviewStatus', selectedStatus);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    return params.toString();
  }, [selectedFcId, selectedType, selectedSeverity, selectedStatus, startDate, endDate]);

  // Fetch anomalies with server-side filters
  const { data: anomalies, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['anomalies-list', queryParams],
    queryFn: () => fetchApi<any[]>(`/anomalies${queryParams ? `?${queryParams}` : ''}`)
  });

  // Fetch all Fulfilment Centres for filter dropdown
  const { data: fcs } = useQuery({
    queryKey: ['fcs-list'],
    queryFn: () => fetchApi<any[]>('/fcs')
  });

  // Metric key human-readable formatting
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

  // Quick date presets
  const applyDatePreset = (preset: 'today' | '7days' | '30days' | 'all') => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]!;

    if (preset === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === '7days') {
      const past = new Date(Date.now() - 7 * 86400000);
      setStartDate(past.toISOString().split('T')[0]!);
      setEndDate(todayStr);
    } else if (preset === '30days') {
      const past = new Date(Date.now() - 30 * 86400000);
      setStartDate(past.toISOString().split('T')[0]!);
      setEndDate(todayStr);
    } else {
      setStartDate('');
      setEndDate('');
    }
    setCurrentPage(1);
  };

  // Count active filters
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedFcId !== 'ALL') count++;
    if (selectedType !== 'ALL') count++;
    if (selectedSeverity !== 'ALL') count++;
    if (selectedStatus !== 'ALL') count++;
    if (startDate) count++;
    if (endDate) count++;
    if (searchQuery.trim()) count++;
    return count;
  }, [selectedFcId, selectedType, selectedSeverity, selectedStatus, startDate, endDate, searchQuery]);

  const resetAllFilters = () => {
    setSearchQuery('');
    setSelectedFcId('ALL');
    setSelectedType('ALL');
    setSelectedSeverity('ALL');
    setSelectedStatus('ALL');
    setStartDate('');
    setEndDate('');
    setSortBy('date_desc');
    setCurrentPage(1);
  };

  // Client-side filtering & sorting for search text and instant responsiveness
  const filteredAnomalies = useMemo(() => {
    if (!anomalies) return [];

    let list = [...anomalies];

    // Client-side text search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      list = list.filter(anom => {
        const fcCode = anom.dailyPnl?.submission?.fc?.code?.toLowerCase() || '';
        const fcName = anom.dailyPnl?.submission?.fc?.name?.toLowerCase() || '';
        const metric = anom.metricKey?.toLowerCase() || '';
        const type = anom.type?.toLowerCase() || '';
        const desc = anom.description?.toLowerCase() || '';
        return (
          fcCode.includes(query) ||
          fcName.includes(query) ||
          metric.includes(query) ||
          type.includes(query) ||
          desc.includes(query)
        );
      });
    }

    // Client-side fallback filter for date/fc/type/severity if server already filtered or for instant typing
    if (selectedFcId !== 'ALL') {
      list = list.filter(a => a.dailyPnl?.submission?.fc?.id === selectedFcId);
    }
    if (selectedType !== 'ALL') {
      list = list.filter(a => a.type === selectedType);
    }
    if (selectedSeverity !== 'ALL') {
      list = list.filter(a => a.severity === selectedSeverity);
    }
    if (selectedStatus !== 'ALL') {
      list = list.filter(a => a.reviewStatus === selectedStatus);
    }

    // Sorting
    list.sort((a, b) => {
      const dateA = new Date(a.dailyPnl?.submission?.businessDate || a.createdAt).getTime();
      const dateB = new Date(b.dailyPnl?.submission?.businessDate || b.createdAt).getTime();
      const impactA = Number(a.impactAmount || 0);
      const impactB = Number(b.impactAmount || 0);
      const devA = Number(a.deviationPP || 0);
      const devB = Number(b.deviationPP || 0);

      const severityWeight: Record<string, number> = {
        CRITICAL: 4,
        HIGH: 3,
        MEDIUM: 2,
        LOW: 1
      };

      if (sortBy === 'date_desc') return dateB - dateA;
      if (sortBy === 'date_asc') return dateA - dateB;
      if (sortBy === 'impact_desc') return impactB - impactA;
      if (sortBy === 'deviation_desc') return devB - devA;
      if (sortBy === 'severity_desc') {
        const diff = (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0);
        return diff !== 0 ? diff : impactB - impactA;
      }
      return 0;
    });

    return list;
  }, [anomalies, searchQuery, selectedFcId, selectedType, selectedSeverity, selectedStatus, sortBy]);

  // Executive KPI summary calculations
  const kpis = useMemo(() => {
    const total = filteredAnomalies.length;
    const critical = filteredAnomalies.filter(a => a.severity === 'CRITICAL').length;
    const high = filteredAnomalies.filter(a => a.severity === 'HIGH').length;
    const pending = filteredAnomalies.filter(a => a.reviewStatus === 'PENDING').length;
    const resolved = filteredAnomalies.filter(a => a.reviewStatus === 'RESOLVED').length;
    const totalImpact = filteredAnomalies.reduce((sum, a) => sum + Number(a.impactAmount || 0), 0);

    return { total, critical, high, pending, resolved, totalImpact };
  }, [filteredAnomalies]);

  // Pagination slice
  const paginatedAnomalies = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAnomalies.slice(start, start + pageSize);
  }, [filteredAnomalies, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredAnomalies.length / pageSize) || 1;

  // CSV Export
  const exportToCsv = () => {
    if (!filteredAnomalies.length) return;

    const headers = [
      'Business Date',
      'FC Code',
      'FC Name',
      'Anomaly Type',
      'Metric Key',
      'Actual Pct (%)',
      'Target Min Pct (%)',
      'Target Max Pct (%)',
      'Deviation PP',
      'Financial Impact (INR)',
      'Severity',
      'Review Status',
      'Description'
    ];

    const rows = filteredAnomalies.map(a => {
      const date = a.dailyPnl?.submission?.businessDate?.split('T')[0] || '';
      const fcCode = a.dailyPnl?.submission?.fc?.code || '';
      const fcName = `"${(a.dailyPnl?.submission?.fc?.name || '').replace(/"/g, '""')}"`;
      const desc = `"${(a.description || '').replace(/"/g, '""')}"`;

      return [
        date,
        fcCode,
        fcName,
        a.type,
        a.metricKey,
        a.actualPct,
        a.targetMinPct || '',
        a.targetMaxPct || '',
        a.deviationPP || '',
        a.impactAmount || '',
        a.severity,
        a.reviewStatus,
        desc
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `prozo_anomalies_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              Anomalies & AI Investigations
            </h2>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
              {filteredAnomalies.length} Recorded
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time financial threshold breaches, automated AI root cause investigations, and managerial review workflow
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center transition-all shadow-xs"
            title="Refresh anomalies list"
          >
            <RotateCcw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
            Refresh
          </button>
          <button
            onClick={exportToCsv}
            disabled={filteredAnomalies.length === 0}
            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center transition-all shadow-xs"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Executive KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
            <span>Total Anomalies</span>
            <ShieldAlert className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{kpis.total}</div>
          <div className="text-[11px] text-slate-500 mt-1">Across all FC facilities</div>
        </div>

        <div
          onClick={() => {
            setSelectedSeverity(selectedSeverity === 'CRITICAL' ? 'ALL' : 'CRITICAL');
            setCurrentPage(1);
          }}
          className={`p-4 rounded-xl border cursor-pointer transition-all ${
            selectedSeverity === 'CRITICAL'
              ? 'bg-red-50 border-red-300 shadow-xs ring-2 ring-red-400/30'
              : 'bg-white border-slate-200 hover:border-red-200 hover:bg-red-50/30'
          }`}
        >
          <div className="flex items-center justify-between text-red-700 text-[11px] font-bold uppercase tracking-wider">
            <span>Critical Breaches</span>
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600" />
            </span>
          </div>
          <div className="text-2xl font-bold text-red-600 mt-1">{kpis.critical}</div>
          <div className="text-[11px] text-red-700/80 mt-1 font-medium">Click to filter critical</div>
        </div>

        <div
          onClick={() => {
            setSelectedSeverity(selectedSeverity === 'HIGH' ? 'ALL' : 'HIGH');
            setCurrentPage(1);
          }}
          className={`p-4 rounded-xl border cursor-pointer transition-all ${
            selectedSeverity === 'HIGH'
              ? 'bg-orange-50 border-orange-300 shadow-xs ring-2 ring-orange-400/30'
              : 'bg-white border-slate-200 hover:border-orange-200 hover:bg-orange-50/30'
          }`}
        >
          <div className="flex items-center justify-between text-orange-700 text-[11px] font-bold uppercase tracking-wider">
            <span>High Severity</span>
            <AlertTriangle className="w-4 h-4 text-orange-500" />
          </div>
          <div className="text-2xl font-bold text-orange-600 mt-1">{kpis.high}</div>
          <div className="text-[11px] text-orange-700/80 mt-1 font-medium">Click to filter high</div>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
            <span>Overrun Impact</span>
            <TrendingDown className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-red-600 mt-1">
            ₹{kpis.totalImpact.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Cumulative financial impact</div>
        </div>

        <div
          onClick={() => {
            setSelectedStatus(selectedStatus === 'PENDING' ? 'ALL' : 'PENDING');
            setCurrentPage(1);
          }}
          className={`p-4 rounded-xl border cursor-pointer transition-all ${
            selectedStatus === 'PENDING'
              ? 'bg-amber-50 border-amber-300 shadow-xs ring-2 ring-amber-400/30'
              : 'bg-white border-slate-200 hover:border-amber-200 hover:bg-amber-50/30'
          }`}
        >
          <div className="flex items-center justify-between text-amber-800 text-[11px] font-bold uppercase tracking-wider">
            <span>Pending Review</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-600 mt-1">{kpis.pending}</div>
          <div className="text-[11px] text-amber-700/80 mt-1 font-medium">
            {kpis.resolved} resolved ({kpis.total > 0 ? Math.round((kpis.resolved / kpis.total) * 100) : 0}%)
          </div>
        </div>
      </div>

      {/* Main Filter & Control Panel */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
        {/* Top search & quick preset row */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Search box */}
          <div className="relative flex-1 max-w-lg">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search by FC Code, Name, Metric (e.g. manpowerCost), or description..."
              className="w-full pl-9 pr-9 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-slate-50/50 hover:bg-white focus:bg-white"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Date Presets */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 lg:pb-0 text-xs">
            <span className="text-[11px] font-semibold text-slate-500 mr-1 flex items-center">
              <Calendar className="w-3.5 h-3.5 mr-1" />
              Presets:
            </span>
            <button
              onClick={() => applyDatePreset('all')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                !startDate && !endDate
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Time
            </button>
            <button
              onClick={() => applyDatePreset('today')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                startDate && startDate === endDate
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => applyDatePreset('7days')}
              className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
            >
              Last 7 Days
            </button>
            <button
              onClick={() => applyDatePreset('30days')}
              className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
            >
              Last 30 Days
            </button>
          </div>
        </div>

        {/* Detailed Dropdown Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 pt-3 border-t border-slate-100">
          {/* FC Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              Fulfilment Centre
            </label>
            <select
              value={selectedFcId}
              onChange={e => {
                setSelectedFcId(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full py-1.5 px-2.5 text-xs font-medium border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800"
            >
              <option value="ALL">All Fulfilment Centres</option>
              {(fcs || []).map(fc => (
                <option key={fc.id} value={fc.id}>
                  {fc.code} — {fc.name}
                </option>
              ))}
            </select>
          </div>

          {/* Anomaly Type Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              Anomaly Type
            </label>
            <select
              value={selectedType}
              onChange={e => {
                setSelectedType(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full py-1.5 px-2.5 text-xs font-medium border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800"
            >
              <option value="ALL">All Anomaly Types</option>
              <option value="COST_ABOVE_MAX">Cost Above Max Band</option>
              <option value="COST_BELOW_MIN">Cost Below Min Band</option>
              <option value="CM1_DEVIATION">CM1 Margin Deviation</option>
              <option value="CM2_DEVIATION">CM2 Margin Deviation</option>
              <option value="SUSPICIOUS_HIGH_MARGIN">Suspicious Margin</option>
            </select>
          </div>

          {/* Severity Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              Severity
            </label>
            <select
              value={selectedSeverity}
              onChange={e => {
                setSelectedSeverity(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full py-1.5 px-2.5 text-xs font-medium border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800"
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>

          {/* Review Status Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              Review Status
            </label>
            <select
              value={selectedStatus}
              onChange={e => {
                setSelectedStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full py-1.5 px-2.5 text-xs font-medium border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending Review</option>
              <option value="ACKNOWLEDGED">Acknowledged</option>
              <option value="RESOLVED">Resolved</option>
              <option value="DISMISSED">Dismissed</option>
              <option value="NEEDS_INVESTIGATION">Needs Investigation</option>
            </select>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              From Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={e => {
                setStartDate(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full py-1.5 px-2.5 text-xs font-medium border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              To Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={e => {
                setEndDate(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full py-1.5 px-2.5 text-xs font-medium border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800"
            />
          </div>
        </div>

        {/* Filter Action & Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
          {/* Active filter chips & reset */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-500 font-medium">
              Showing <strong className="text-slate-800">{filteredAnomalies.length}</strong> anomalies
            </span>

            {activeFiltersCount > 0 && (
              <button
                onClick={resetAllFilters}
                className="inline-flex items-center px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
              >
                <RotateCcw className="w-3 h-3 mr-1 text-slate-500" />
                Clear all filters ({activeFiltersCount})
              </button>
            )}

            {selectedFcId !== 'ALL' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-medium">
                FC: {(fcs || []).find(f => f.id === selectedFcId)?.code || selectedFcId}
                <button onClick={() => setSelectedFcId('ALL')} className="ml-1 hover:text-blue-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {selectedType !== 'ALL' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-medium">
                Type: {selectedType.replace(/_/g, ' ')}
                <button onClick={() => setSelectedType('ALL')} className="ml-1 hover:text-indigo-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {selectedSeverity !== 'ALL' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700 text-[11px] font-medium">
                Severity: {selectedSeverity}
                <button onClick={() => setSelectedSeverity('ALL')} className="ml-1 hover:text-red-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {selectedStatus !== 'ALL' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-medium">
                Status: {selectedStatus}
                <button onClick={() => setSelectedStatus('ALL')} className="ml-1 hover:text-amber-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {(startDate || endDate) && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-medium">
                Date: {startDate || '...'} to {endDate || '...'}
                <button
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                  }}
                  className="ml-1 hover:text-emerald-900"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>

          {/* View Mode & Sort Controls */}
          <div className="flex items-center space-x-3 ml-auto">
            {/* Sort by dropdown */}
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-500 text-[11px] font-semibold">Sort by:</span>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="py-1 px-2 text-xs font-semibold border border-slate-200 rounded-md bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="date_desc">Date (Newest first)</option>
                <option value="date_asc">Date (Oldest first)</option>
                <option value="impact_desc">Overrun Impact (High to Low)</option>
                <option value="severity_desc">Severity (Critical first)</option>
                <option value="deviation_desc">Deviation Margin (High to Low)</option>
              </select>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center border border-slate-200 rounded-lg p-0.5 bg-slate-50">
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-md transition-all ${
                  viewMode === 'table'
                    ? 'bg-white text-blue-600 shadow-2xs font-semibold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Table View"
              >
                <TableIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`p-1.5 rounded-md transition-all ${
                  viewMode === 'cards'
                    ? 'bg-white text-blue-600 shadow-2xs font-semibold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Card Grid View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content: Table or Cards View */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-3">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="text-xs text-slate-500 font-medium">Loading anomalies and financial investigations...</p>
        </div>
      ) : filteredAnomalies.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
            <Search className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">No anomalies match your filter criteria</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Try adjusting your dates, fulfilment centre, severity, or search keyword to expand the results.
          </p>
          {activeFiltersCount > 0 && (
            <button
              onClick={resetAllFilters}
              className="mt-2 inline-flex items-center px-3.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors shadow-xs"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Reset All Filters
            </button>
          )}
        </div>
      ) : viewMode === 'table' ? (
        /* TABLE VIEW */
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[11px] tracking-wider">
                  <th className="py-3 px-4">Business Date</th>
                  <th className="py-3 px-4">Fulfilment Centre</th>
                  <th className="py-3 px-4">Metric & Anomaly</th>
                  <th className="py-3 px-4 text-right">Actual vs Target</th>
                  <th className="py-3 px-4 text-right">Deviation</th>
                  <th className="py-3 px-4 text-right">Overrun Impact</th>
                  <th className="py-3 px-4 text-center">Severity</th>
                  <th className="py-3 px-4 text-center">Review Status</th>
                  <th className="py-3 px-4 text-center">AI Report</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedAnomalies.map(anom => {
                  const fc = anom.dailyPnl?.submission?.fc;
                  const date = anom.dailyPnl?.submission?.businessDate?.split('T')[0];
                  const hasAi = !!anom.dailyPnl?.aiReport;
                  const aiStatus = anom.dailyPnl?.aiReport?.status;

                  return (
                    <tr key={anom.id} className="hover:bg-slate-50/80 transition-colors group">
                      {/* Date */}
                      <td className="py-3.5 px-4 font-medium text-slate-700 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">{date}</div>
                        <div className="text-[10px] text-slate-400">
                          {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      </td>

                      {/* FC */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {fc ? (
                          <div>
                            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold text-xs border border-blue-200">
                              {fc.code}
                            </span>
                            <div className="text-[11px] text-slate-600 mt-1 max-w-[160px] truncate" title={fc.name}>
                              {fc.name}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Metric & Anomaly Type */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 text-xs">
                          {formatMetricKey(anom.metricKey)}
                        </div>
                        <div className="mt-1">
                          <AnomalyTypeBadge type={anom.type} />
                        </div>
                      </td>

                      {/* Actual vs Target */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="font-bold text-slate-900">
                          {Number(anom.actualPct).toFixed(2)}%
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Target: {anom.targetMinPct ? `${Number(anom.targetMinPct).toFixed(1)}%–${Number(anom.targetMaxPct).toFixed(1)}%` : 'N/A'}
                        </div>
                      </td>

                      {/* Deviation */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <span className="font-bold text-amber-700 px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200">
                          +{Number(anom.deviationPP || 0).toFixed(2)} pp
                        </span>
                      </td>

                      {/* Overrun Impact */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <span className="font-bold text-sm text-red-600">
                          {anom.impactAmount ? `₹${Number(anom.impactAmount).toLocaleString('en-IN')}` : '—'}
                        </span>
                      </td>

                      {/* Severity */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <AnomalySeverityBadge severity={anom.severity} />
                      </td>

                      {/* Review Status */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <ReviewStatusBadge status={anom.reviewStatus} />
                      </td>

                      {/* AI Report Indicator */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {hasAi ? (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200"
                            title={`AI Investigation: ${aiStatus}`}
                          >
                            <Sparkles className="w-3 h-3 mr-1 text-indigo-500" />
                            {aiStatus === 'COMPLETED' ? 'Analyzed' : aiStatus}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Pending</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <Link
                          href={`/anomalies/${anom.id}`}
                          className="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white font-semibold text-xs transition-colors group-hover:bg-blue-600 group-hover:text-white shadow-2xs"
                        >
                          Inspect
                          <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Bar */}
          {totalPages > 1 && (
            <div className="px-6 py-3 bg-slate-50/80 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <div>
                Showing <strong>{(currentPage - 1) * pageSize + 1}</strong> to{' '}
                <strong>{Math.min(currentPage * pageSize, filteredAnomalies.length)}</strong> of{' '}
                <strong>{filteredAnomalies.length}</strong> anomalies
              </div>

              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1 rounded border border-slate-300 bg-white disabled:opacity-40 font-medium hover:bg-slate-50"
                >
                  Previous
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => setCurrentPage(p)}
                    className={`w-7 h-7 rounded text-xs font-semibold ${
                      currentPage === p
                        ? 'bg-blue-600 text-white'
                        : 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1 rounded border border-slate-300 bg-white disabled:opacity-40 font-medium hover:bg-slate-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* CARDS GRID VIEW */
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedAnomalies.map(anom => {
              const fc = anom.dailyPnl?.submission?.fc;
              const date = anom.dailyPnl?.submission?.businessDate?.split('T')[0];
              const aiReport = anom.dailyPnl?.aiReport;
              const normalizedInv = normalizeInvestigationOutput(aiReport?.investigation);
              const investigationSummary = normalizedInv?.summary;

              return (
                <div
                  key={anom.id}
                  className="bg-white rounded-xl border border-slate-200 shadow-2xs hover:border-blue-400 hover:shadow-xs transition-all flex flex-col justify-between p-5 group"
                >
                  <div className="space-y-3">
                    {/* Header Row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                          {fc?.code || 'FC'}
                        </span>
                        <span className="text-xs font-medium text-slate-500">{date}</span>
                      </div>
                      <AnomalySeverityBadge severity={anom.severity} />
                    </div>

                    {/* Metric & Anomaly Type */}
                    <div>
                      <h4 className="text-base font-bold text-slate-900">
                        {formatMetricKey(anom.metricKey)}
                      </h4>
                      <div className="mt-1">
                        <AnomalyTypeBadge type={anom.type} />
                      </div>
                    </div>

                    {/* Numerical Stats Grid */}
                    <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-lg text-xs">
                      <div>
                        <span className="text-slate-500 text-[10px] uppercase font-semibold">Actual / Target</span>
                        <div className="font-bold text-slate-900 mt-0.5">
                          {Number(anom.actualPct).toFixed(2)}%
                          <span className="text-slate-500 font-normal text-[11px] ml-1">
                            (max {Number(anom.targetMaxPct || 0).toFixed(1)}%)
                          </span>
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] uppercase font-semibold">Financial Overrun</span>
                        <div className="font-bold text-red-600 mt-0.5">
                          {anom.impactAmount ? `₹${Number(anom.impactAmount).toLocaleString('en-IN')}` : '—'}
                        </div>
                      </div>
                    </div>

                    {/* AI Excerpt if available */}
                    {investigationSummary ? (
                      <div className="p-2.5 bg-indigo-50/50 rounded-lg border border-indigo-100 text-[11px] text-slate-700 line-clamp-2">
                        <span className="font-bold text-indigo-700 mr-1 flex items-center inline">
                          <Sparkles className="w-3 h-3 inline mr-0.5" /> AI Finding:
                        </span>
                        {investigationSummary}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-500 italic line-clamp-2">
                        {anom.description}
                      </div>
                    )}
                  </div>

                  {/* Footer Row */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <ReviewStatusBadge status={anom.reviewStatus} />
                    <Link
                      href={`/anomalies/${anom.id}`}
                      className="inline-flex items-center text-xs font-bold text-blue-600 hover:text-blue-800"
                    >
                      Inspect Report
                      <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Bar for Card View */}
          {totalPages > 1 && (
            <div className="p-4 bg-white rounded-xl border border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <div>
                Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
              </div>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1 rounded border border-slate-300 bg-white disabled:opacity-40 font-medium hover:bg-slate-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1 rounded border border-slate-300 bg-white disabled:opacity-40 font-medium hover:bg-slate-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
