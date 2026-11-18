'use client';

import React, { useState, useEffect } from 'react';
import { fetchApi } from '../../../lib/api-client';
import { useAuth } from '../../../components/providers';
import {
  Users,
  UserPlus,
  Building2,
  Shield,
  CheckCircle,
  AlertCircle,
  Loader2,
  X,
  Mail,
  KeyRound,
  MapPin,
  RefreshCw
} from 'lucide-react';

interface UserListItem {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'FINANCE' | 'FC_MANAGER';
  isActive: boolean;
  createdAt: string;
  assignedFCs: {
    fc: {
      id: string;
      code: string;
      name: string;
      location?: string | null;
    };
  }[];
}

interface FCItem {
  id: string;
  code: string;
  name: string;
  location?: string | null;
}

export default function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [fcs, setFcs] = useState<FCItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'FC_MANAGER' | 'FINANCE' | 'ADMIN'>('FC_MANAGER');
  const [fcMode, setFcMode] = useState<'EXISTING' | 'NEW'>('NEW');
  const [selectedFcId, setSelectedFcId] = useState('');
  const [newFcCode, setNewFcCode] = useState('');
  const [newFcName, setNewFcName] = useState('');
  const [newFcLocation, setNewFcLocation] = useState('');

  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersData, fcsData] = await Promise.all([
        fetchApi<UserListItem[]>('/users'),
        fetchApi<FCItem[]>('/fcs')
      ]);
      setUsers(usersData);
      setFcs(fcsData);
      if (fcsData.length > 0 && !selectedFcId) {
        setSelectedFcId(fcsData[0]!.id);
      }
    } catch (err: any) {
      console.error('Failed to load user management data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'ADMIN' || user?.role === 'FINANCE') {
      fetchData();
    }
  }, [user]);

  const resetForm = () => {
    setName('');
    setEmail('');
    setPassword('');
    setRole('FC_MANAGER');
    setFcMode('NEW');
    setNewFcCode('');
    setNewFcName('');
    setNewFcLocation('');
    setFormError(null);
  };

  const handleCreateManager = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError(null);
    setSuccessMessage(null);

    try {
      const payload: any = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        role
      };

      if (role === 'FC_MANAGER') {
        if (fcMode === 'EXISTING') {
          if (!selectedFcId) {
            throw new Error('Please select an existing Fulfilment Centre');
          }
          payload.fcId = selectedFcId;
        } else {
          if (!newFcCode.trim() || !newFcName.trim()) {
            throw new Error('New FC Code and Name are required');
          }
          payload.newFC = {
            code: newFcCode.trim().toUpperCase(),
            name: newFcName.trim(),
            location: newFcLocation.trim() || undefined,
            currency: 'INR'
          };
        }
      }

      await fetchApi('/users', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      setSuccessMessage(`Manager ID successfully created for ${email}!`);
      setIsModalOpen(false);
      resetForm();
      await fetchData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create user ID');
    } finally {
      setFormLoading(false);
    }
  };

  if (user?.role !== 'ADMIN') {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center bg-white rounded-xl border border-slate-200">
        <Shield className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-800">Administrator Access Required</h2>
        <p className="text-xs text-slate-500 mt-1">
          Only System Administrators are permitted to manage user accounts and assign FC Manager roles.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <Users className="w-5 h-5 text-blue-600" />
            <span>User Management & RBAC Administration</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Provision manager identities for new Fulfilment Centres, configure access permissions, and audit FC scoping
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchData}
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold flex items-center"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Refresh
          </button>

          <button
            onClick={() => {
              resetForm();
              setIsModalOpen(true);
            }}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center shadow-md transition-colors"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Provision New FC Manager ID
          </button>
        </div>
      </div>

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-800">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <span className="font-bold text-sm text-slate-800">System Users ({users.length})</span>
          <span className="text-xs text-slate-400">Scoped RBAC Model active</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                <th className="py-3 px-6">Name & Email</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Assigned Fulfilment Centre(s)</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">Loading user accounts...</td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">No users found</td>
                </tr>
              ) : (
                users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3.5 px-6">
                      <div className="font-semibold text-slate-800">{u.name}</div>
                      <div className="text-slate-400 text-[11px] font-mono">{u.email}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-block px-2.5 py-1 rounded text-[10px] font-bold tracking-wide uppercase ${
                        u.role === 'ADMIN'
                          ? 'bg-purple-50 text-purple-700 border border-purple-200'
                          : u.role === 'FINANCE'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      {u.role === 'ADMIN' || u.role === 'FINANCE' ? (
                        <span className="text-slate-400 italic">All Network FCs (Global)</span>
                      ) : u.assignedFCs.length === 0 ? (
                        <span className="text-amber-600 font-semibold">None (Unassigned)</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {u.assignedFCs.map(a => (
                            <span
                              key={a.fc.id}
                              className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 font-medium text-[11px] flex items-center"
                            >
                              <Building2 className="w-3 h-3 mr-1 text-slate-400" />
                              {a.fc.name} ({a.fc.code})
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        u.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${u.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right text-slate-400 font-mono text-[11px]">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create User & Manager Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center space-x-2">
                <UserPlus className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-base">Provision New Manager ID</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateManager} className="p-6 space-y-4 text-xs">
              {formError && (
                <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-700 font-medium flex items-center">
                  <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Personal Details */}
              <div className="space-y-3">
                <div className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                  1. Manager Credentials
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Rajesh Kumar"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Email Address *</label>
                    <div className="relative">
                      <Mail className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="manager.pune@prozo.com"
                        className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Password *</label>
                    <div className="relative">
                      <KeyRound className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Min 6 characters"
                        className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Account Role</label>
                  <select
                    value={role}
                    onChange={e => setRole(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-medium"
                  >
                    <option value="FC_MANAGER">FC Manager (Scoped to assigned Fulfilment Centre)</option>
                    <option value="FINANCE">Finance Controller (Centralized upload & analysis)</option>
                    <option value="ADMIN">System Administrator (Full access)</option>
                  </select>
                </div>
              </div>

              {/* FC Assignment Section */}
              {role === 'FC_MANAGER' && (
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <div className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                    2. Fulfilment Centre Assignment
                  </div>

                  <div className="flex items-center space-x-4 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <label className="flex items-center space-x-2 cursor-pointer font-semibold text-slate-700">
                      <input
                        type="radio"
                        name="fcMode"
                        value="NEW"
                        checked={fcMode === 'NEW'}
                        onChange={() => setFcMode('NEW')}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span>Register New FC</span>
                    </label>

                    <label className="flex items-center space-x-2 cursor-pointer font-semibold text-slate-700">
                      <input
                        type="radio"
                        name="fcMode"
                        value="EXISTING"
                        checked={fcMode === 'EXISTING'}
                        onChange={() => setFcMode('EXISTING')}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span>Assign Existing FC</span>
                    </label>
                  </div>

                  {fcMode === 'EXISTING' ? (
                    <div>
                      <label className="block text-slate-600 font-semibold mb-1">Select Fulfilment Centre *</label>
                      <select
                        value={selectedFcId}
                        onChange={e => setSelectedFcId(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                      >
                        {fcs.map(f => (
                          <option key={f.id} value={f.id}>
                            {f.name} ({f.code}) {f.location ? `— ${f.location}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="space-y-2.5 bg-blue-50/40 p-3.5 rounded-xl border border-blue-100">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-slate-700 font-semibold mb-1">New FC Code *</label>
                          <input
                            type="text"
                            required
                            value={newFcCode}
                            onChange={e => setNewFcCode(e.target.value)}
                            placeholder="e.g. FC-PUN-01"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs uppercase font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                          />
                        </div>

                        <div>
                          <label className="block text-slate-700 font-semibold mb-1">Location City</label>
                          <div className="relative">
                            <MapPin className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                            <input
                              type="text"
                              value={newFcLocation}
                              onChange={e => setNewFcLocation(e.target.value)}
                              placeholder="e.g. Pune (Chakan)"
                              className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-slate-700 font-semibold mb-1">FC Display Name *</label>
                        <input
                          type="text"
                          required
                          value={newFcName}
                          onChange={e => setNewFcName(e.target.value)}
                          placeholder="e.g. Pune Fulfilment Centre"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center shadow-md disabled:opacity-50"
                >
                  {formLoading && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
                  {role === 'FC_MANAGER' && fcMode === 'NEW'
                    ? 'Register FC & Create Manager ID'
                    : 'Create Manager ID'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
