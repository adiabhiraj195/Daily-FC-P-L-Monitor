import React from 'react';
import { clsx } from 'clsx';

export type ColourType = 'RED' | 'YELLOW' | 'GREEN' | 'BLUE' | string;

export function ColourBadge({ colour }: { colour: ColourType | null }) {
  if (!colour) {
    return <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">N/A</span>;
  }

  const styles: Record<string, string> = {
    RED: 'bg-red-100 text-red-800 border-red-300',
    YELLOW: 'bg-amber-100 text-amber-800 border-amber-300',
    GREEN: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    BLUE: 'bg-blue-100 text-blue-800 border-blue-300'
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border',
        styles[colour] || 'bg-slate-100 text-slate-700 border-slate-300'
      )}
    >
      <span className={clsx('w-1.5 h-1.5 mr-1.5 rounded-full', {
        'bg-red-600': colour === 'RED',
        'bg-amber-600': colour === 'YELLOW',
        'bg-emerald-600': colour === 'GREEN',
        'bg-blue-600': colour === 'BLUE'
      })} />
      {colour}
    </span>
  );
}

export function SubmissionStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    MISSING: 'bg-red-50 text-red-700 border-red-200 font-bold',
    RECEIVED: 'bg-sky-50 text-sky-700 border-sky-200',
    VALIDATING: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    PROCESSING: 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse',
    COMPLETED: 'bg-slate-100 text-slate-700 border-slate-200',
    PARTIALLY_FAILED: 'bg-amber-50 text-amber-700 border-amber-200',
    INVALID: 'bg-rose-50 text-rose-700 border-rose-200 font-bold',
    FAILED: 'bg-red-100 text-red-800 border-red-300'
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
        styles[status] || 'bg-slate-100 text-slate-600 border-slate-200'
      )}
    >
      {status}
    </span>
  );
}

export function AnomalySeverityBadge({
  severity,
  pulse = true
}: {
  severity: string;
  pulse?: boolean;
}) {
  const isCritical = severity === 'CRITICAL';
  const isHigh = severity === 'HIGH';
  const isMedium = severity === 'MEDIUM';
  const isLow = severity === 'LOW';

  const styles: Record<string, string> = {
    CRITICAL: 'bg-red-50 text-red-700 border-red-200 shadow-sm shadow-red-100',
    HIGH: 'bg-orange-50 text-orange-700 border-orange-200',
    MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200',
    LOW: 'bg-slate-50 text-slate-700 border-slate-200'
  };

  const dotColors: Record<string, string> = {
    CRITICAL: 'bg-red-600',
    HIGH: 'bg-orange-500',
    MEDIUM: 'bg-amber-500',
    LOW: 'bg-slate-400'
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border gap-1.5 transition-all',
        styles[severity] || styles.LOW
      )}
    >
      <span className="relative flex h-2 w-2">
        {pulse && isCritical && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
        )}
        <span
          className={clsx(
            'relative inline-flex rounded-full h-2 w-2',
            dotColors[severity] || dotColors.LOW
          )}
        />
      </span>
      {severity}
    </span>
  );
}

export function ReviewStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDING: 'bg-amber-50 text-amber-800 border-amber-200 font-semibold',
    ACKNOWLEDGED: 'bg-blue-50 text-blue-800 border-blue-200 font-semibold',
    RESOLVED: 'bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold',
    DISMISSED: 'bg-slate-100 text-slate-600 border-slate-300 line-through font-medium',
    NEEDS_INVESTIGATION: 'bg-purple-50 text-purple-800 border-purple-200 font-semibold'
  };

  const labels: Record<string, string> = {
    PENDING: 'Pending Review',
    ACKNOWLEDGED: 'Acknowledged',
    RESOLVED: 'Resolved',
    DISMISSED: 'Dismissed',
    NEEDS_INVESTIGATION: 'Needs Investigation'
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] border shadow-2xs',
        styles[status] || 'bg-slate-100 text-slate-700 border-slate-200'
      )}
    >
      {labels[status] || status}
    </span>
  );
}

export function AnomalyTypeBadge({ type }: { type: string }) {
  const isAbove = type === 'COST_ABOVE_MAX';
  const isBelow = type === 'COST_BELOW_MIN';
  const isCm = type.includes('CM');
  const isSuspicious = type === 'SUSPICIOUS_HIGH_MARGIN';

  const labels: Record<string, string> = {
    COST_ABOVE_MAX: 'Cost Above Max Band',
    COST_BELOW_MIN: 'Cost Below Min Band',
    CM1_DEVIATION: 'CM1 Margin Breach',
    CM2_DEVIATION: 'CM2 Margin Breach',
    SUSPICIOUS_HIGH_MARGIN: 'Suspicious Margin Spike'
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border',
        isAbove
          ? 'bg-rose-50 text-rose-700 border-rose-200'
          : isBelow
          ? 'bg-sky-50 text-sky-700 border-sky-200'
          : isCm
          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
          : isSuspicious
          ? 'bg-amber-50 text-amber-700 border-amber-200'
          : 'bg-slate-100 text-slate-700 border-slate-200'
      )}
    >
      {labels[type] || type.replace(/_/g, ' ')}
    </span>
  );
}
