import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Bell, CalendarDays, ClipboardList, FileText, Gauge, Menu, Moon, PiggyBank, Settings, ShieldCheck, Sun, Users, X } from 'lucide-react';
import { Link, NavLink, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import type { WebSession } from './AuthGate';
import { UsersPage } from './UsersPage';
import { AnimalsPage } from './AnimalsPage';
import { OperationsPage } from './OperationsPage';
import { WorkspaceBrand } from './WorkspaceIdentity';
import { MonitoringHome, MonitoringDirectory, FeeSummary, HelpPage, SettingsPage } from './MonitoringPages';

type Props = { session: WebSession; onLogout: () => Promise<void> };
export default function App({session, onLogout}: Props) {
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem('slaughterhouse-dark-mode') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('slaughterhouse-dark-mode', darkMode ? '1' : '0'); } catch { /* Session preference still works. */ }
    document.documentElement.classList.toggle('dark', darkMode);
    return () => document.documentElement.classList.remove('dark');
  }, [darkMode]);
  return <div className={`workspace ${darkMode ? 'dark' : ''}`}><div className="min-h-screen"><DashboardLayout session={session} onLogout={onLogout} darkMode={darkMode} setDarkMode={setDarkMode}/></div></div>;
}

function DashboardLayout({session,onLogout,darkMode,setDarkMode}: Props & {darkMode:boolean;setDarkMode:(value:boolean)=>void}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement | null>(null);
  const location = useLocation();

  const unreadCount = 0;

  useEffect(() => {
    setMobileNavOpen(false);
    setProfileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setProfileMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [profileMenuOpen]);

  const navItems = [
    { label: 'Overview', to: '/', icon: Gauge },
    { label: 'Animals', to: '/animals', icon: ClipboardList },
    { label: 'Vendors', to: '/vendors', icon: Users },
    { label: 'Invoices & payments', to: '/billing', icon: FileText },
    { label: 'Deliveries', to: '/delivery', icon: ClipboardList },
    { label: 'Mobile users', to: '/users', icon: ShieldCheck },
    { label: 'Notifications', to: '/notifications', icon: Bell },
    { label: 'Fee summary', to: '/service-computation', icon: PiggyBank },
    { label: 'Settings', to: '/settings', icon: Settings },
    { label: 'FAQ', to: '/faq', icon: FileText }
  ];

  const pageTitles: Record<string, string> = {
    '/': 'Overview',
    '/records': 'Slaughter Records',
    '/invoices': 'Invoices',
    '/statistics': 'Statistics',
    '/vendors': 'Vendors',
    '/users': 'Mobile Users',
    '/animals': 'Animal Register',
    '/animal-records': 'Animal Records (Read-only)',
    '/operations': 'Billing and Delivery Workspaces',
    '/billing': 'Invoices & payments',
    '/delivery': 'Deliveries',
    '/notifications': 'Notifications',
    '/invoice-history': 'All invoice records', '/settings': 'Settings', '/faq': 'FAQ', '/service-computation': 'Fee summary'
  };
  const currentTitle = pageTitles[location.pathname] || 'Dashboard';
  const pageDescriptions: Record<string, string> = {
    '/': 'A complete picture of your municipal operations.',
    '/records': 'Track livestock intake and daily slaughter activity.',
    '/animal-records': 'Read animal records without registration, correction or carcass controls.',
    '/billing': 'Review invoices, recorded payments and balances.',
    '/delivery': 'Review authorized assignments, destinations and meat details.',
    '/operations': 'Open the separate Billing and Delivery workspaces.',
    '/invoices': 'Keep billing, payments, and outstanding balances in view.',
    '/statistics': 'Explore the numbers behind your operations.',
    '/vendors': 'Your vendor directory, organized in one place.',
    '/notifications': 'Stay up to date with billing and operational activity.',
    '/service-computation': 'View approved fees. Earlier invoices keep their recorded charges.'
  };
  const displayDate = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }).format(new Date());

  useEffect(() => {
    if (!mobileNavOpen) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false);
    };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [mobileNavOpen]);

  // B27: no dark class here — App already applies `dark` on the outer root,
  // so a second toggle would be redundant.
  return (
    <div className="workspace-frame">
      <a href="#workspace-content" className="skip-link">Skip to content</a>
      {mobileNavOpen && <button type="button" aria-label="Close mobile navigation" onClick={() => setMobileNavOpen(false)} className="nav-scrim lg:hidden" />}
      <div className="workspace-shell">
        <aside id="workspace-navigation" className={`workspace-sidebar ${mobileNavOpen ? 'is-open' : ''}`}>
          <Link to="/" className="sidebar-brand" aria-label="Slaughterhouse dashboard"><WorkspaceBrand /></Link>
          <button type="button" onClick={() => setMobileNavOpen(false)} className="sidebar-close lg:hidden" aria-label="Close navigation"><X size={20} /></button>
          <div className="sidebar-workspace"><span className="workspace-dot" /> Municipal office <span>01</span></div>
          <nav className="sidebar-nav" aria-label="Primary">
            <p className="nav-section-label">Workspace</p>
            {navItems.map(({ label, to, icon: Icon, badge }: any, index: number) => (
              <div key={to}>
              {index === 5 && <p className="nav-section-label nav-section-secondary">Manage</p>}
              <NavLink
                key={label}
                to={to}
                end={to === '/'}
                onClick={() => setMobileNavOpen(false)}
                className={({ isActive }) =>
                  `sidebar-link ${isActive ? 'is-active' : ''}`
                }
              >
                <Icon size={18} strokeWidth={1.7} className="shrink-0" />
                <span className="flex-1">{label}</span>
                {typeof badge === 'number' && badge > 0 && (
                  <span className="nav-badge">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </NavLink>
              </div>
            ))}
          </nav>

          <div className="sidebar-footer">
            <div className="sidebar-footer-icon"><ShieldCheck size={21} strokeWidth={1.5} /><ArrowUpRight size={16} /></div>
            <p>Everything in its place.</p>
            <span>Records, billing, and insights.<br />One municipal workspace.</span>
            <div className="sidebar-session"><span className="workspace-dot" /> Administrator session</div>
          </div>
        </aside>

        <div className="workspace-surface">
          <header className="workspace-header">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button type="button" aria-label="Toggle navigation" aria-expanded={mobileNavOpen} aria-controls="workspace-navigation" onClick={() => setMobileNavOpen((current) => !current)} className="icon-button lg:hidden">
                  <Menu size={18} />
                </button>
                <div>
                  <p className="header-breadcrumb">Workspace <span>/</span> <strong>{currentTitle}</strong></p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="header-date"><CalendarDays size={14} />{displayDate}</span>

                <button
                  type="button"
                  aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                  onClick={() => setDarkMode(!darkMode)}
                  className="icon-button"
                >
                  {darkMode ? <Sun size={18} /> : <Moon size={18} />}
                </button>
                <Link to="/notifications" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`} className="icon-button relative"><Bell size={18} />{unreadCount > 0 && <span className="notification-dot" />}</Link>
                <div className="header-account">
                  <div className="relative" ref={profileRef}>
                    <button type="button" aria-label="Profile menu" aria-expanded={profileMenuOpen} onClick={() => setProfileMenuOpen((current) => !current)} className="account-avatar">
                      {(session.email || 'A')[0].toUpperCase()}
                    </button>
                    {profileMenuOpen && (
                      <div className="absolute right-0 top-12 z-30 min-w-44 rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                        <div className="rounded-lg px-3 py-2 text-left text-sm">
                          <p className="font-medium">Signed in</p>
                          <p className="mt-1 break-all text-xs text-slate-500 dark:text-slate-400">{session.email || session.uid}</p>
                          <button type="button" onClick={() => void onLogout()} className="btn-ghost mt-2 w-full">Sign out</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </header>

          <main id="workspace-content" tabIndex={-1} className="workspace-content">
            <div className="page-heading"><div><p className="eyebrow">Municipal operations</p><h1>{currentTitle}</h1><p>{pageDescriptions[location.pathname]}</p></div><span className="mode-label"><span />Monitoring workspace</span></div>
            <div role="status" className="workspace-notice"><ShieldCheck size={18} /><p>Monitor records here. Record daily work in the mobile app.</p></div>
            <div>
            <Routes>
              <Route path="/" element={<MonitoringHome />} />
              <Route path="/statistics" element={<Navigate to="/" replace />} />
              <Route path="/records" element={<MonitoringDirectory kind="records" />} />
              <Route path="/invoices" element={<Navigate to="/billing" replace />} />
              <Route path="/invoice-history" element={<MonitoringDirectory kind="invoices" />} />
              <Route path="/vendors" element={<MonitoringDirectory kind="vendors" />} />
              <Route path="/notifications" element={<MonitoringDirectory kind="notifications" />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/animals" element={<AnimalsPage readOnly />} />
              <Route path="/animal-records" element={<Navigate to="/animals" replace />} />
              <Route path="/operations" element={<Navigate to="/billing" replace />} />
              <Route path="/billing" element={<OperationsPage key="billing" workspace="billing" />} />
              <Route path="/delivery" element={<OperationsPage key="delivery" workspace="delivery" />} />
              <Route path="/service-computation" element={<FeeSummary />} />
              <Route path="/settings" element={<SettingsPage dark={darkMode} toggle={() => setDarkMode(!darkMode)} email={session.email || 'Administrator'} logout={onLogout} />} />
              <Route path="/faq" element={<HelpPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
