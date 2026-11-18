'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '../../../lib/api-client';
import { useAuth } from '../../../components/providers';
import Link from 'next/link';
import { Building2, MapPin, User, ArrowRight, UserPlus } from 'lucide-react';

export default function FCListPage() {
  const { user } = useAuth();
  const { data: fcs, isLoading } = useQuery({
    queryKey: ['fcs-list'],
    queryFn: () => fetchApi<any[]>('/fcs')
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Fulfilment Centres</h2>
          <p className="text-xs text-slate-500 mt-1">
            Network directory of operational fulfilment centres and assigned facility leadership
          </p>
        </div>

        {user?.role === 'ADMIN' && (
          <Link
            href="/users"
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center shadow-sm"
          >
            <UserPlus className="w-3.5 h-3.5 mr-1.5" />
            Provision New FC & Manager ID
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {(fcs || []).map(fc => (
          <div
            key={fc.id}
            className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between hover:border-blue-400 transition-colors"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
                  {fc.code}
                </span>
                <span className="text-xs font-semibold text-emerald-600">Active</span>
              </div>

              <h3 className="text-base font-bold text-slate-900 mt-3">{fc.name}</h3>

              <div className="mt-4 space-y-2 text-xs text-slate-600">
                <div className="flex items-center">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
                  <span>{fc.location || 'Location unconfigured'}</span>
                </div>
                <div className="flex items-center">
                  <User className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
                  <span>
                    Manager: {fc.managers && fc.managers[0] ? fc.managers[0].user.name : 'Unassigned'}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
              <Link
                href={`/fcs/${fc.id}`}
                className="inline-flex items-center text-xs font-semibold text-blue-600 hover:text-blue-800"
              >
                Open FC Performance Dashboard
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
