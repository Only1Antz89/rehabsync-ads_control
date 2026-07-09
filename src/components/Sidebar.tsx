'use client';

// Dark-navy sidebar shell adapted from the main RehabSync repo's (platform)/Sidebar.tsx so the
// internal tools read as part of the platform family.
import React, { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  PenSquare,
  CalendarDays,
  ListChecks,
  BarChart3,
  Mail,
  Users,
  Settings,
  Plug,
  CheckSquare,
  SlidersHorizontal,
  ScrollText,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { RehabSyncWordmark } from './ui';

const ICONS = {
  dashboard: LayoutDashboard,
  composer: PenSquare,
  calendar: CalendarDays,
  posts: ListChecks,
  analytics: BarChart3,
  newsletters: Mail,
  subscribers: Users,
  connections: Plug,
  admin: Settings,
  approvals: CheckSquare,
  settings: SlidersHorizontal,
  audit: ScrollText,
} as const;

interface NavItem {
  label: string;
  href: string;
  icon: keyof typeof ICONS;
}

interface NavGroup {
  groupName: string;
  items: NavItem[];
}

function buildNav(isAdmin: boolean): NavGroup[] {
  const groups: NavGroup[] = [
    { groupName: 'Overview', items: [{ label: 'Dashboard', href: '/dashboard', icon: 'dashboard' }] },
    {
      groupName: 'Publishing',
      items: [
        { label: 'Composer', href: '/composer', icon: 'composer' },
        { label: 'Calendar', href: '/calendar', icon: 'calendar' },
        { label: 'Posts', href: '/posts', icon: 'posts' },
      ],
    },
    {
      groupName: 'Audience',
      items: [
        { label: 'Newsletters', href: '/newsletters', icon: 'newsletters' },
        { label: 'Subscribers', href: '/subscribers', icon: 'subscribers' },
      ],
    },
    { groupName: 'Insights', items: [{ label: 'Analytics', href: '/analytics', icon: 'analytics' }] },
  ];
  if (isAdmin) {
    groups.push({
      groupName: 'Administration',
      items: [
        { label: 'Connections', href: '/admin/connections', icon: 'connections' },
        { label: 'Approvals', href: '/admin/approvals', icon: 'approvals' },
        { label: 'Users', href: '/admin/users', icon: 'admin' },
        { label: 'Settings', href: '/admin/settings', icon: 'settings' },
        { label: 'Audit log', href: '/admin/audit', icon: 'audit' },
      ],
    });
  }
  return groups;
}

export interface SidebarUser {
  name: string;
  email: string;
  role: string;
  kind: string;
}

function roleLabel(user: SidebarUser): string {
  if (user.role === 'super_admin') return 'Platform super-admin';
  if (user.role === 'admin') return 'Admin';
  return 'User';
}

export function Sidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const isAdmin = user.role === 'admin' || user.role === 'super_admin';
  const nav = buildNav(isAdmin);

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.push('/login');
    router.refresh();
  }

  const content = (
    <div
      className="flex flex-col h-full border-r"
      style={{
        backgroundColor: 'var(--brand-secondary)',
        borderColor: 'rgba(255,255,255,0.08)',
        backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0.15) 100%)',
      }}
    >
      <div
        className="flex items-center gap-3 px-5 h-16 border-b shrink-0"
        style={{ borderColor: 'rgba(255,255,255,0.08)' }}
      >
        <RehabSyncWordmark color="var(--brand-primary)" badge="Ads Centre" />
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-4 space-y-5 custom-scrollbar">
        {nav.map((group) => (
          <div key={group.groupName} className="space-y-1">
            <h3 className="px-3 text-[10px] font-semibold tracking-wider uppercase select-none opacity-45 text-white/70">
              {group.groupName}
            </h3>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = ICONS[item.icon];
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-all"
                    style={
                      active
                        ? { backgroundColor: 'var(--brand-primary)', color: '#ffffff' }
                        : { color: '#cbd5e1' }
                    }
                  >
                    <Icon size={16} className="shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t px-4 py-4 space-y-3" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-3 p-1.5">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {(user.name || user.email)[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{user.name || user.email}</p>
            <p className="text-[11px]" style={{ color: 'rgba(148,163,184,0.7)' }}>
              {roleLabel(user)}
            </p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-red-800 text-xs font-semibold text-white transition-all hover:bg-red-900 cursor-pointer"
        >
          <LogOut size={14} className="shrink-0" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <>
      <button
        className="fixed top-3 left-4 z-50 lg:hidden p-2 rounded-lg bg-white/5 text-slate-300 border border-white/10"
        onClick={() => setOpen((v) => !v)}
        aria-label="Toggle menu"
        style={{ backgroundColor: 'var(--brand-secondary)' }}
      >
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-40 w-64 lg:hidden">{content}</div>
        </>
      )}

      <div className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 z-20">{content}</div>
    </>
  );
}
