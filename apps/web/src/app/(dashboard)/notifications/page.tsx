'use client';

import React, { useState, useEffect } from 'react';
import { fetchApi } from '../../../lib/api-client';
import { useAuth } from '../../../components/providers';
import {
  Bell,
  AlertTriangle,
  Info,
  Check,
  CheckCheck,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import Link from 'next/link';

interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  entityType?: string;
  entityId?: string;
  metadata?: any;
  isRead: boolean;
  createdAt: string;
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL');

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const url = filter === 'UNREAD' ? '/notifications?unreadOnly=true' : '/notifications';
      const data = await fetchApi<NotificationItem[]>(url);
      setNotifications(data);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [filter]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await fetchApi(`/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, isRead: true } : n))
      );
    } catch {
      // ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await fetchApi('/notifications/mark-all-read', { method: 'POST' });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch {
      // ignore
    }
  };

  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.toLocaleDateString()} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <Bell className="w-5 h-5 text-blue-600" />
            <span>Operational & Anomaly Notifications</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Automated alerts dispatched to responsible FC Managers and Administrators when margin anomalies occur
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchNotifications}
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold flex items-center"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </button>

          <button
            onClick={handleMarkAllRead}
            className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center shadow-sm"
          >
            <CheckCheck className="w-3.5 h-3.5 mr-1.5" />
            Mark all read
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setFilter('ALL')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            filter === 'ALL'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          All Notifications ({notifications.length})
        </button>
        <button
          onClick={() => setFilter('UNREAD')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            filter === 'UNREAD'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Unread Only ({notifications.filter(n => !n.isRead).length})
        </button>
      </div>

      {/* Notifications List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading alerts...</div>
        ) : notifications.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-semibold">No notifications</p>
            <p className="text-xs text-slate-400 mt-1">
              You are all caught up! When margin breaches or anomalies are detected, notifications will appear here.
            </p>
          </div>
        ) : (
          notifications.map(n => (
            <div
              key={n.id}
              className={`p-5 transition-colors flex items-start space-x-4 ${
                !n.isRead ? 'bg-blue-50/30' : 'hover:bg-slate-50/60'
              }`}
            >
              <div className="shrink-0 mt-0.5">
                {n.severity === 'CRITICAL' || n.severity === 'HIGH' ? (
                  <div className="w-9 h-9 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shadow-xs">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shadow-xs">
                    <Info className="w-5 h-5" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <h3 className={`text-sm font-bold ${!n.isRead ? 'text-slate-900' : 'text-slate-700'}`}>
                    {n.title}
                  </h3>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                    n.severity === 'CRITICAL'
                      ? 'bg-red-100 text-red-700'
                      : n.severity === 'HIGH'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    {n.severity}
                  </span>
                  {!n.isRead && (
                    <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                  )}
                </div>

                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  {n.message}
                </p>

                {n.metadata?.anomalies && n.metadata.anomalies.length > 0 && (
                  <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200 max-w-xl text-xs">
                    <div className="font-semibold text-slate-700 mb-1">Anomaly Breakdown:</div>
                    <ul className="space-y-1 text-slate-600">
                      {n.metadata.anomalies.map((anom: any, idx: number) => (
                        <li key={idx} className="flex items-center space-x-2">
                          <span className="font-mono text-red-600 font-semibold">• [{anom.type}]</span>
                          <span>{anom.metricKey}: {anom.actualPct}%</span>
                          <span className="text-slate-400">({anom.description})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-3 flex items-center space-x-4 text-[11px] text-slate-400">
                  <span>{formatDateTime(n.createdAt)}</span>
                  <Link
                    href={n.type === 'ANOMALY_DETECTED' ? '/anomalies' : '/submissions'}
                    className="text-blue-600 font-semibold hover:underline flex items-center"
                  >
                    View in Dashboard <ExternalLink className="w-3 h-3 ml-1" />
                  </Link>
                </div>
              </div>

              {!n.isRead && (
                <button
                  onClick={() => handleMarkAsRead(n.id)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold flex items-center shrink-0"
                  title="Mark as read"
                >
                  <Check className="w-3.5 h-3.5 mr-1" />
                  Read
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
