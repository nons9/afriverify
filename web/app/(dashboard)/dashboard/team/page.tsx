'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import {
  Users,
  UserPlus,
  Mail,
  Shield,
  Trash2,
  Crown,
  CheckCircle2,
  Clock,
  XCircle,
  ChevronDown,
} from 'lucide-react';

type Role = 'owner' | 'admin' | 'developer' | 'viewer';

interface TeamMember {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  status: 'active' | 'pending' | 'suspended';
  joined_at: string | null;
  invited_at: string;
}

const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  developer: 'Developer',
  viewer: 'Viewer',
};

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: 'Full access including billing and team management',
  admin: 'Full access except billing and ownership transfer',
  developer: 'Can manage API keys, flows, and view verifications',
  viewer: 'Read-only access to dashboard data',
};

const ROLE_ORDER: Role[] = ['owner', 'admin', 'developer', 'viewer'];

function RoleBadge({ role }: { role: Role }) {
  const colors: Record<Role, string> = {
    owner: 'text-amber-400 bg-amber-400/10',
    admin: 'text-indigo-400 bg-indigo-400/10',
    developer: 'text-emerald-400 bg-emerald-400/10',
    viewer: 'text-slate-400 bg-slate-400/10',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${colors[role]}`}>
      {role === 'owner' && <Crown className="w-3 h-3" />}
      {ROLE_LABELS[role]}
    </span>
  );
}

function StatusBadge({ status }: { status: TeamMember['status'] }) {
  if (status === 'active') return (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
      <CheckCircle2 className="w-3 h-3" /> Active
    </span>
  );
  if (status === 'pending') return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-400">
      <Clock className="w-3 h-3" /> Pending
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-red-400">
      <XCircle className="w-3 h-3" /> Suspended
    </span>
  );
}

function RoleDropdown({
  current,
  memberId,
  memberRole,
  onUpdate,
}: {
  current: Role;
  memberId: string;
  memberRole: Role;
  onUpdate: (id: string, role: Role) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  if (memberRole === 'owner') return <RoleBadge role="owner" />;

  async function pick(role: Role) {
    setOpen(false);
    if (role === current) return;
    setSaving(true);
    try {
      await onUpdate(memberId, role);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        disabled={saving}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-slate-300 bg-slate-700/50 hover:bg-slate-700 transition-colors disabled:opacity-50"
      >
        {saving ? (
          <span className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <RoleBadge role={current} />
        )}
        <ChevronDown className="w-3 h-3 text-slate-500" />
      </button>
      {open && (
        <div className="absolute z-10 left-0 mt-1 w-52 bg-slate-800 border border-white/10 rounded-lg shadow-xl py-1">
          {ROLE_ORDER.filter(r => r !== 'owner').map(role => (
            <button
              key={role}
              onClick={() => pick(role)}
              className={`w-full text-left px-3 py-2 hover:bg-white/5 transition-colors ${role === current ? 'bg-indigo-500/10' : ''}`}
            >
              <div className="flex items-center justify-between">
                <RoleBadge role={role} />
                {role === current && <CheckCircle2 className="w-3 h-3 text-indigo-400" />}
              </div>
              <p className="text-xs text-slate-500 mt-0.5 pl-0.5">{ROLE_DESCRIPTIONS[role]}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('developer');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.get<{ members: TeamMember[] }>('/developer/team/members')
      .then(data => setMembers(data.members ?? []))
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError('');
    setInviteSuccess('');
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await api.post('/developer/team/invite', { email: inviteEmail.trim(), role: inviteRole });
      setInviteSuccess(`Invitation sent to ${inviteEmail.trim()}`);
      setInviteEmail('');
      const data = await api.get<{ members: TeamMember[] }>('/developer/team/members');
      setMembers(data.members ?? []);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setInviteError(e?.message ?? 'Failed to send invitation');
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleUpdate(memberId: string, role: Role) {
    await api.patch(`/developer/team/members/${memberId}`, { role });
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role } : m));
  }

  async function handleRemove(memberId: string) {
    setRemovingId(memberId);
    try {
      await api.post(`/developer/team/members/${memberId}/remove`, {});
      setMembers(prev => prev.filter(m => m.id !== memberId));
    } finally {
      setRemovingId(null);
    }
  }

  const activeCount = members.filter(m => m.status === 'active').length;
  const pendingCount = members.filter(m => m.status === 'pending').length;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-white">Team</h1>
        <p className="text-sm text-slate-400 mt-0.5">Manage team members and their access levels</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 mb-2">
        {[
          { label: 'Total members', value: members.length },
          { label: 'Active', value: activeCount },
          { label: 'Pending', value: pendingCount },
          { label: 'Roles', value: ROLE_ORDER.length },
        ].map(({ label, value }) => (
          <div key={label}>
            <div className="text-2xl font-bold text-white">{loading ? '—' : value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Invite form */}
      <div className="py-6 border-t border-white/[0.06]">
        <div className="flex items-center gap-2 mb-4">
          <UserPlus className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-white">Invite member</h2>
        </div>
        <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            <input
              type="email"
              placeholder="colleague@company.com"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 bg-slate-800 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <select
            value={inviteRole}
            onChange={e => setInviteRole(e.target.value as Role)}
            className="px-3 py-2.5 bg-slate-800 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
          >
            {ROLE_ORDER.filter(r => r !== 'owner').map(role => (
              <option key={role} value={role}>{ROLE_LABELS[role]}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={inviting || !inviteEmail.trim()}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            {inviting && <span className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />}
            Send invite
          </button>
        </form>
        {inviteError && <p className="text-xs text-red-400 mt-2">{inviteError}</p>}
        {inviteSuccess && <p className="text-xs text-emerald-400 mt-2">{inviteSuccess}</p>}
      </div>

      {/* Roles reference */}
      <div className="py-6 border-t border-white/[0.06]">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-white">Roles &amp; permissions</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {ROLE_ORDER.map(role => (
            <div key={role} className="flex items-start gap-3">
              <RoleBadge role={role} />
              <p className="text-xs text-slate-400 leading-relaxed">{ROLE_DESCRIPTIONS[role]}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Members list */}
      <div className="py-6 border-t border-white/[0.06]">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-white">Members</h2>
          {!loading && <span className="ml-auto text-xs text-slate-500">{members.length} total</span>}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-20">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-8">
            <Users className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No members yet — invite someone to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {members.map(member => (
              <div key={member.id} className="flex items-center gap-4 py-4">
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-400 shrink-0">
                  {(member.full_name ?? member.email)[0].toUpperCase()}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white truncate">
                      {member.full_name ?? member.email}
                    </span>
                    <StatusBadge status={member.status} />
                  </div>
                  <p className="text-xs text-slate-500 truncate">{member.email}</p>
                </div>
                {/* Role */}
                <div className="shrink-0">
                  <RoleDropdown
                    current={member.role}
                    memberId={member.id}
                    memberRole={member.role}
                    onUpdate={handleRoleUpdate}
                  />
                </div>
                {/* Remove */}
                {member.role !== 'owner' && (
                  <button
                    onClick={() => handleRemove(member.id)}
                    disabled={removingId === member.id}
                    className="shrink-0 p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                    title="Remove member"
                  >
                    {removingId === member.id
                      ? <span className="w-4 h-4 border border-red-400 border-t-transparent rounded-full animate-spin inline-block" />
                      : <Trash2 className="w-4 h-4" />}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
