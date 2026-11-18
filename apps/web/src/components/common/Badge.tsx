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
