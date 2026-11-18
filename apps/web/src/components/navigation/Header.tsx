'use client';

import React from 'react';
import { useAuth } from '../providers';
import { LogOut, User as UserIcon } from 'lucide-react';

export function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0 z-10">
      <div>
        <h1 className="text-base font-semibold text-slate-800">
          Prozo Fulfilment Network — Daily P&L & Margin Governance
        </h1>
      </div>

      <div className="flex items-center space-x-4">
        {user ? (
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 text-sm text-slate-600 bg-slate-50 py-1.5 px-3 rounded-full border border-slate-200">
              <UserIcon className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-medium text-slate-700">{user.name}</span>
              <span className="text-xs text-slate-400">({user.role})</span>
            </div>

            <button
              onClick={logout}
              className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-red-600 hover:bg-red-50 border border-slate-200 transition-colors"
              title="Logout"
            >
              <LogOut className="w-3.5 h-3.5 mr-1" />
              Sign out
            </button>
          </div>
        ) : (
          <a
            href="/login"
            className="text-xs font-semibold text-blue-600 hover:underline"
          >
            Sign in
          </a>
        )}
      </div>
    </header>
  );
}
