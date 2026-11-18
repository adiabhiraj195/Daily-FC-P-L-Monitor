'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../components/providers';
import { fetchApi } from '../../../lib/api-client';
import { Lock, Mail, ArrowRight, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const data = await fetchApi<{ user: any }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      login(data.user);
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickDemo = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('Password@123');
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Top Header */}
        <div className="bg-slate-900 px-8 py-8 text-center text-white">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center font-bold text-2xl mx-auto shadow-md">
            P
          </div>
          <h2 className="mt-4 text-2xl font-bold tracking-tight">Prozo FC Margin Monitor</h2>
          <p className="mt-1 text-xs text-slate-400">
            Enterprise Contribution Margin Governance & AI Analytics
          </p>
        </div>

        {/* Form Body */}
        <div className="px-8 py-8">
          {error && (
            <div className="mb-6 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@prozo.com"
                  className="w-full pl-10 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-md transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Authenticating...' : 'Sign in to Dashboard'}
              <ArrowRight className="w-4 h-4 ml-2" />
            </button>
          </form>

          {/* Quick Demo Logins */}
          <div className="mt-8 pt-6 border-t border-slate-200">
            <div className="flex items-center text-xs font-semibold text-slate-500 mb-3">
              <ShieldCheck className="w-3.5 h-3.5 mr-1 text-slate-400" />
              Quick Demo Logins (Click to autofill):
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => handleQuickDemo('admin@prozo.com')}
                className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-left transition-colors"
              >
                <div className="font-bold text-slate-800">Admin User</div>
                <div className="text-[10px] text-slate-500">admin@prozo.com</div>
              </button>
              <button
                type="button"
                onClick={() => handleQuickDemo('finance@prozo.com')}
                className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-left transition-colors"
              >
                <div className="font-bold text-slate-800">Finance Controller</div>
                <div className="text-[10px] text-slate-500">finance@prozo.com</div>
              </button>
              <button
                type="button"
                onClick={() => handleQuickDemo('manager.delhi@prozo.com')}
                className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-left transition-colors"
              >
                <div className="font-bold text-slate-800">Delhi FC Mgr</div>
                <div className="text-[10px] text-slate-500">manager.delhi@...</div>
              </button>
              <button
                type="button"
                onClick={() => handleQuickDemo('manager.blr@prozo.com')}
                className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-left transition-colors"
              >
                <div className="font-bold text-slate-800">Bangalore FC Mgr</div>
                <div className="text-[10px] text-slate-500">manager.blr@...</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
