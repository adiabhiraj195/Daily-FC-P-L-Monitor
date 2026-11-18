'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../providers';
import {
  LayoutDashboard,
  UploadCloud,
  Building2,
  AlertTriangle,
  Sliders,
  CalendarCheck2,
  Users,
  Bell
} from 'lucide-react';
import { clsx } from 'clsx';

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  const navItems = [
    { label: 'Dashboard', href: '/', icon: LayoutDashboard },
    { label: 'Upload Data', href: '/uploads', icon: UploadCloud, roles: ['ADMIN', 'FINANCE', 'FC_MANAGER'] },
    { label: 'Daily Monitor', href: '/submissions', icon: CalendarCheck2 },
    { label: 'Fulfilment Centres', href: '/fcs', icon: Building2 },
    { label: 'Anomalies & AI', href: '/anomalies', icon: AlertTriangle },
    { label: 'Notifications', href: '/notifications', icon: Bell },
    { label: 'Target Rules', href: '/targets', icon: Sliders, roles: ['ADMIN'] },
    { label: 'User Management', href: '/users', icon: Users, roles: ['ADMIN'] }
  ];

  const allowedItems = navItems.filter(item => {
    if (!item.roles) return true;
    return user && item.roles.includes(user.role);
  });

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 min-h-screen">
      {/* Brand Header */}
      <div className="h-16 flex items-center px-6 border-b border-slate-800 bg-slate-950/40">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-inner">
            P
          </div>
          <div>
            <div className="font-bold text-white text-base tracking-tight leading-tight">Prozo</div>
            <div className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Margin Monitor</div>
          </div>
        </div>
      </div>

      {/* Nav Menu */}
      <nav className="flex-1 px-3 py-6 space-y-1.5 overflow-y-auto">
        <div className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Navigation
        </div>
        {allowedItems.map(item => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex items-center px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
              )}
            >
              <Icon className="w-4 h-4 mr-3 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User Info / Role Footer */}
      {user && (
        <div className="p-4 border-t border-slate-800 bg-slate-950/40">
          <div className="text-xs font-semibold text-white truncate">{user.name}</div>
          <div className="text-[11px] text-slate-400 truncate">{user.email}</div>
          <div className="mt-2 inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-slate-800 text-blue-400 border border-slate-700">
            {user.role}
          </div>
        </div>
      )}
    </aside>
  );
}
