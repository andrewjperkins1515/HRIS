import clsx from 'clsx';
import {
  Bell,
  Building2,
  CalendarDays,
  ChevronDown,
  Clock,
  FileBarChart2,
  FileCheck2,
  FlaskConical,
  Home,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  RotateCcw,
  Settings,
  Timer,
  User,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import logo from '../assets/poise-logo.png';
import { can, homePath, ROLE_DESCRIPTION, ROLE_LABEL, type Permission } from '../domain/permissions';
import { fmtDate, fmtTime, tzAbbrev } from '../domain/time';
import type { RoleKey } from '../domain/types';
import { DEMO_USERS } from '../data/seed';
import { useFacilitiesById, useScopedFacilities, useUser } from '../store/hooks';
import { actionItems, useInsights } from '../store/insights';
import { usePoise } from '../store/store';
import { Avatar, Badge, ConfirmDialog, Toaster } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  perm: Permission;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, perm: 'overview.view', end: true },
  { to: '/people', label: 'People', icon: Users, perm: 'people.view' },
  { to: '/scheduling', label: 'Scheduling', icon: CalendarDays, perm: 'schedule.view' },
  { to: '/time', label: 'Time & Attendance', icon: Clock, perm: 'time.view_all' },
  { to: '/pbj', label: 'PBJ', icon: FileCheck2, perm: 'pbj.view' },
  { to: '/reports', label: 'Reports', icon: FileBarChart2, perm: 'reports.view' },
  { to: '/settings', label: 'Settings', icon: Settings, perm: 'settings.view' },
];

const SELF_NAV: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/me', label: 'Home', icon: Home, end: true },
  { to: '/me/schedule', label: 'Schedule', icon: CalendarDays },
  { to: '/me/time', label: 'Timecards', icon: Timer },
  { to: '/me/requests', label: 'Requests', icon: ListChecks },
];

export function Wordmark({ compact }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <img src={logo} alt="" className={compact ? 'h-6 w-auto' : 'h-7 w-auto'} width={880} height={612} />
      <span className="text-[19px] font-semibold tracking-[-0.01em] text-brand-800">Poise</span>
    </span>
  );
}

function PrototypeBar() {
  const nowIso = usePoise((s) => s.demoNowIso);
  const facilities = useScopedFacilities();
  const reset = usePoise((s) => s.resetDemo);
  const [confirm, setConfirm] = useState(false);
  const tz = facilities[0]?.timeZone ?? 'America/New_York';
  const dateLocal = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(Date.parse(nowIso));
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-brand-900 px-4 py-1.5 text-[12px] text-brand-50">
      <div className="flex min-w-0 items-center gap-2">
        <FlaskConical className="size-3.5 shrink-0 text-mint-400" aria-hidden />
        <span className="font-semibold">Prototype</span>
        <span className="hidden text-brand-200 sm:inline">Fictional demo data · Simulated sign-in & permissions (not production security)</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="tabular" title="Demo clock — all screens use this date and time">
          <span className="hidden sm:inline">Demo date {fmtDate(dateLocal, { weekday: true, year: true })} · </span>
          <span className="sm:hidden">{fmtDate(dateLocal, { weekday: true })} · </span>
          {fmtTime(nowIso, tz)} {tzAbbrev(nowIso, tz)}
        </span>
        <button onClick={() => setConfirm(true)} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium whitespace-nowrap text-white hover:bg-white/10">
          <RotateCcw className="size-3.5" aria-hidden /> Reset<span className="hidden sm:inline"> demo</span>
        </button>
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          reset();
          setConfirm(false);
        }}
        title="Reset the demo?"
        body="All changes made in this browser (new employees, punches, assignments, PBJ decisions) will be discarded and the fictional seed data restored."
        confirmLabel="Reset demo"
        tone="danger"
      />
    </div>
  );
}

function FacilitySelector() {
  const user = useUser();
  const facilities = usePoise((s) => s.facilities);
  const scope = usePoise((s) => s.facilityScope);
  const setScope = usePoise((s) => s.setFacilityScope);
  const allowed = facilities.filter((f) => !user.facilityIds || user.facilityIds.includes(f.id));
  return (
    <label className="flex min-w-0 items-center gap-2">
      <Building2 className="size-4 shrink-0 text-muted" aria-hidden />
      <span className="sr-only">Facility</span>
      <select
        value={scope}
        onChange={(e) => setScope(e.target.value)}
        className="input h-8 max-w-[230px] min-w-0 py-0 pr-7 text-[13px] font-medium"
        disabled={allowed.length === 1 && !!user.facilityIds}
        title={user.facilityIds ? 'Your demo role is limited to this facility' : 'Filter all screens by facility'}
      >
        {!user.facilityIds && <option value="all">All facilities ({allowed.length})</option>}
        {allowed.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function RoleSelector({ compact }: { compact?: boolean }) {
  const role = usePoise((s) => s.role);
  const setRole = usePoise((s) => s.setRole);
  const navigate = useNavigate();
  return (
    <label className="flex items-center gap-2">
      <span className={clsx('text-[12px] font-medium text-muted', compact && 'sr-only')}>Demo role</span>
      <select
        value={role}
        onChange={(e) => {
          const r = e.target.value as RoleKey;
          setRole(r);
          navigate(homePath(r));
        }}
        className="input h-8 max-w-[220px] py-0 pr-7 text-[13px]"
        aria-label="Demo role"
      >
        {DEMO_USERS.map((u) => (
          <option key={u.role} value={u.role}>
            {ROLE_LABEL[u.role]}
          </option>
        ))}
      </select>
    </label>
  );
}

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('keydown', k);
    };
  }, [open]);
  return { open, setOpen, ref };
}

function TasksIndicator() {
  const insights = useInsights();
  const user = useUser();
  const items = actionItems(insights, (p) => can(user, p));
  const { open, setOpen, ref } = usePopover();
  const urgent = items.filter((i) => i.tone === 'danger').length;
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`${items.length} action items`}
        className="relative inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-silver-100 hover:text-ink"
      >
        <Bell className="size-[18px]" aria-hidden />
        {items.length > 0 && (
          <span className={clsx('absolute -top-0.5 -right-0.5 min-w-4 rounded-full px-1 text-[10px] leading-4 font-semibold text-white tabular', urgent ? 'bg-danger-600' : 'bg-brand-600')}>{items.length}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(92vw,360px)] rounded-lg border border-line bg-white shadow-pop">
          <div className="border-b border-line px-3.5 py-2.5">
            <p className="text-[13.5px] font-semibold">Needs attention</p>
            <p className="text-xs text-muted">Calculated from demo records for your role and facility scope. No real notifications are sent.</p>
          </div>
          <ul className="max-h-[60vh] overflow-y-auto py-1">
            {items.length === 0 && <li className="px-3.5 py-6 text-center text-[13px] text-muted">Nothing needs attention right now.</li>}
            {items.map((i) => (
              <li key={i.id}>
                <Link to={i.to} onClick={() => setOpen(false)} className="flex gap-2.5 px-3.5 py-2 hover:bg-canvas">
                  <span className={clsx('mt-1.5 size-2 shrink-0 rounded-full', i.tone === 'danger' ? 'bg-danger-600' : i.tone === 'warning' ? 'bg-warn-600' : 'bg-brand-500')} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-ink">{i.title}</span>
                    <span className="block truncate text-xs text-muted">{i.detail}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ProfileMenu() {
  const user = useUser();
  const role = usePoise((s) => s.role);
  const setRole = usePoise((s) => s.setRole);
  const navigate = useNavigate();
  const { open, setOpen, ref } = usePopover();
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-2 rounded-md py-1 pr-1.5 pl-1 hover:bg-silver-100">
        <Avatar name={user.name} size="sm" tone="brand" />
        <span className="hidden text-left leading-tight lg:block">
          <span className="block text-[13px] font-medium text-ink">{user.name}</span>
          <span className="block text-[11.5px] text-muted">{ROLE_LABEL[role]}</span>
        </span>
        <ChevronDown className="size-3.5 text-muted" aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-72 rounded-lg border border-line bg-white p-1 shadow-pop">
          <div className="px-3 py-2.5">
            <p className="text-[13.5px] font-semibold">{user.name}</p>
            <p className="text-xs text-muted">{user.title}</p>
            <p className="mt-2 text-xs text-muted">{ROLE_DESCRIPTION[role]}</p>
            <Badge tone="warning" className="mt-2">
              Simulated sign-in
            </Badge>
          </div>
          <div className="my-1 border-t border-line" />
          <p className="px-3 pt-1 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">Switch demo role</p>
          {DEMO_USERS.map((u) => (
            <button
              key={u.role}
              onClick={() => {
                setRole(u.role);
                setOpen(false);
                navigate(homePath(u.role));
              }}
              className={clsx('flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-[13px] hover:bg-canvas', u.role === role && 'bg-brand-50 text-brand-800')}
            >
              <span>{ROLE_LABEL[u.role]}</span>
              <span className="text-xs text-muted">{u.name}</span>
            </button>
          ))}
          <div className="my-1 border-t border-line" />
          <button onClick={() => { setOpen(false); navigate('/settings?tab=about'); }} className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-[13px] hover:bg-canvas">
            <FlaskConical className="size-4 text-muted" aria-hidden /> About this prototype
          </button>
          <button disabled className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-[13px] text-subtle" title="Planned: production single sign-on">
            <LogOut className="size-4" aria-hidden /> Sign out <span className="ml-auto text-[11px]">Planned (SSO)</span>
          </button>
        </div>
      )}
    </div>
  );
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const user = useUser();
  const items = NAV.filter((n) => can(user, n.perm));
  return (
    <nav aria-label="Primary" className="flex flex-col gap-0.5 px-2">
      {items.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] font-medium transition-colors',
              isActive ? 'bg-brand-50 text-brand-800 shadow-[inset_2px_0_0_var(--color-brand-600)]' : 'text-muted hover:bg-silver-100 hover:text-ink',
            )
          }
        >
          <n.icon className="size-[18px]" aria-hidden />
          {n.label}
        </NavLink>
      ))}
      <div className="mt-3 border-t border-line pt-3">
        <NavLink
          to="/time/clock"
          onClick={onNavigate}
          className={({ isActive }) => clsx('flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium', isActive ? 'bg-brand-50 text-brand-800' : 'text-muted hover:bg-silver-100 hover:text-ink')}
        >
          <Timer className="size-[18px]" aria-hidden />
          Timeclock kiosk
        </NavLink>
      </div>
    </nav>
  );
}

function ScopeSummary() {
  const facilities = useScopedFacilities();
  const user = useUser();
  return (
    <div className="mx-3 rounded-md border border-line bg-canvas px-3 py-2 text-xs text-muted">
      <p className="font-medium text-ink">{facilities.length > 1 ? 'Corporate view' : 'Facility view'}</p>
      <p className="mt-0.5">{facilities.map((f) => f.shortName).join(', ')}</p>
      {user.departmentIds && <p className="mt-0.5">Department scope: Nursing</p>}
    </div>
  );
}

/** Manager / administrator shell. */
export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setMobileOpen(false), [loc.pathname]);
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[70] focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <PrototypeBar />
      <div className="flex min-h-0 flex-1">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-white lg:flex">
          <div className="flex h-14 items-center px-4">
            <Link to="/" aria-label="Poise home">
              <Wordmark />
            </Link>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            <SideNav />
          </div>
          <div className="pb-4">
            <ScopeSummary />
          </div>
        </aside>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-ink/30" onClick={() => setMobileOpen(false)} aria-hidden />
            <div className="relative flex h-full w-72 flex-col bg-white shadow-pop">
              <div className="flex h-14 items-center justify-between px-4">
                <Wordmark />
                <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="rounded p-1.5 text-muted hover:bg-silver-100">
                  <X className="size-5" />
                </button>
              </div>
              <div className="space-y-3 border-b border-line px-4 pb-3">
                <FacilitySelector />
                <RoleSelector />
              </div>
              <div className="flex-1 overflow-y-auto py-2">
                <SideNav onNavigate={() => setMobileOpen(false)} />
              </div>
            </div>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white/95 px-3 backdrop-blur sm:px-5">
            <button onClick={() => setMobileOpen(true)} className="rounded p-1.5 text-muted hover:bg-silver-100 lg:hidden" aria-label="Open menu">
              <Menu className="size-5" />
            </button>
            <Link to="/" className="lg:hidden" aria-label="Poise home">
              <Wordmark compact />
            </Link>
            <div className="hidden min-w-0 items-center gap-4 md:flex">
              <FacilitySelector />
            </div>
            <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
              <div className="hidden md:block">
                <RoleSelector />
              </div>
              <TasksIndicator />
              <ProfileMenu />
            </div>
          </header>
          <main id="main" className="mx-auto w-full max-w-[1500px] flex-1 px-3 py-5 sm:px-6 sm:py-6">
            {children}
          </main>
        </div>
      </div>
      <Toaster />
    </div>
  );
}

/** Simpler, responsive employee self-service shell. */
export function SelfServiceShell({ children }: { children: ReactNode }) {
  const user = useUser();
  const facs = useFacilitiesById();
  const emp = usePoise((s) => s.employees.find((e) => e.id === user.employeeId));
  return (
    <div className="flex min-h-screen flex-col">
      <PrototypeBar />
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <Link to="/me" aria-label="Poise home">
            <Wordmark compact />
          </Link>
          <nav aria-label="Self-service" className="ml-4 hidden gap-1 sm:flex">
            {SELF_NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => clsx('rounded-md px-2.5 py-1.5 text-[13.5px] font-medium', isActive ? 'bg-brand-50 text-brand-800' : 'text-muted hover:text-ink')}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <RoleSelector compact />
            <span className="hidden items-center gap-2 sm:flex">
              <Avatar name={user.name} size="sm" tone="mint" />
            </span>
          </div>
        </div>
        {emp && (
          <div className="mx-auto max-w-3xl px-4 pb-2 text-xs text-muted">
            <User className="mr-1 inline size-3.5" aria-hidden />
            {user.name} · {facs[emp.primaryFacilityId]?.shortName}
          </div>
        )}
      </header>
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-5 pb-24 sm:pb-8">
        {children}
      </main>
      <nav aria-label="Self-service" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-white sm:hidden">
        {SELF_NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => clsx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-brand-700' : 'text-muted')}>
            <n.icon className="size-5" aria-hidden />
            {n.label}
          </NavLink>
        ))}
      </nav>
      <Toaster />
    </div>
  );
}
