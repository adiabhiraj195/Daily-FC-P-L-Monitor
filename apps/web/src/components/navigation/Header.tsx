'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../providers';
import { fetchApi } from '../../lib/api-client';
import { LogOut, User as UserIcon, Bell, Check, AlertTriangle, Info, CheckCheck } from 'lucide-react';
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

export function Header() {
  const { user, logout } = useAuth();
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchUnreadCount = async () => {
    if (!user) return;
    try {
      const data = await fetchApi<{ count: number }>('/notifications/unread-count');
      setUnreadCount(data.count);
    } catch {
      // ignore
    }
  };

  const fetchRecentNotifications = async () => {
    if (!user) return;
    try {
      const data = await fetchApi<NotificationItem[]>('/notifications?limit=8');
      setNotifications(data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (user) {
      fetchUnreadCount();
      const interval = setInterval(fetchUnreadCount, 15000); // 15s poll
      return () => clearInterval(interval);
    }
  }, [user]);

  const toggleDropdown = async () => {
    if (!isDropdownOpen) {
      await fetchRecentNotifications();
    }
    setIsDropdownOpen(prev => !prev);
  };

  const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetchApi(`/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {
      // ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await fetchApi('/notifications/mark-all-read', { method: 'POST' });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatTimeAgo = (dateStr: string) => {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0 z-20 relative">
      <div>
        <h1 className="text-base font-semibold text-slate-800">
          Prozo Fulfilment Network — Daily P&L & Margin Governance
        </h1>
      </div>

      <div className="flex items-center space-x-4">
        {user ? (
          <div className="flex items-center space-x-3">
            {/* Notification Bell Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={toggleDropdown}
                className="relative p-2 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors focus:outline-none"
                title="Notifications"
                aria-label="View notifications"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Dropdown Menu */}
              {isDropdownOpen && (
                <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-top-2">
                  <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-sm text-slate-900">Notifications</span>
                      {unreadCount > 0 && (
                        <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-semibold">
                          {unreadCount} new
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="text-xs text-blue-600 hover:text-blue-800 flex items-center font-medium"
                      >
                        <CheckCheck className="w-3.5 h-3.5 mr-1" />
                        Mark all read
                      </button>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400">
                        No notifications yet
                      </div>
                    ) : (
                      notifications.map(n => (
                        <div
                          key={n.id}
                          className={`p-3.5 hover:bg-slate-50 transition-colors flex items-start space-x-3 cursor-pointer ${
                            !n.isRead ? 'bg-blue-50/40' : ''
                          }`}
                          onClick={() => {
                            if (!n.isRead) {
                              fetchApi(`/notifications/${n.id}/read`, { method: 'PATCH' }).catch(() => {});
                              setNotifications(prev =>
                                prev.map(item => (item.id === n.id ? { ...item, isRead: true } : item))
                              );
                              setUnreadCount(prev => Math.max(0, prev - 1));
                            }
                            setIsDropdownOpen(false);
                            window.location.href = n.type === 'ANOMALY_DETECTED' ? '/anomalies' : '/submissions';
                          }}
                        >
                          <div className="shrink-0 mt-0.5">
                            {n.severity === 'CRITICAL' || n.severity === 'HIGH' ? (
                              <div className="w-7 h-7 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                                <AlertTriangle className="w-4 h-4" />
                              </div>
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                                <Info className="w-4 h-4" />
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className={`text-xs font-semibold truncate ${!n.isRead ? 'text-slate-900' : 'text-slate-700'}`}>
                                {n.title}
                              </p>
                              <span className="text-[10px] text-slate-400 whitespace-nowrap ml-2">
                                {formatTimeAgo(n.createdAt)}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-2">
                              {n.message}
                            </p>
                          </div>

                          {!n.isRead && (
                            <button
                              onClick={(e) => handleMarkAsRead(n.id, e)}
                              className="text-slate-400 hover:text-blue-600 p-1 shrink-0"
                              title="Mark as read"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  <div className="px-4 py-2 border-t border-slate-100 text-center">
                    <Link
                      href="/notifications"
                      onClick={() => setIsDropdownOpen(false)}
                      className="text-xs font-semibold text-blue-600 hover:underline"
                    >
                      View all notification alerts &rarr;
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* User Badge */}
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
