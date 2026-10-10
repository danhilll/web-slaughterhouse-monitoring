import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Eye,
  FileText,
  Gauge,
  Menu,
  Moon,
  Pencil,
  PiggyBank,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Trash2,
  TrendingUp,
  Users,
  X
} from 'lucide-react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { jsPDF } from 'jspdf';
import type { DashboardData, FeeConfig, Invoice, NotificationItem, SlaughterRecord, Vendor } from './types';
import type { WebSession } from './AuthGate';
import { apiFetch } from './api';
import { AmbientBackdrop, LedgerArtwork, WorkspaceBrand } from './WorkspaceIdentity';
import { MotionToggle, useWorkspaceMotion } from './WorkspaceMotion';

const COLORS = ['#a3b92e', '#9d92c6', '#dda771', '#6d9386'];

// Themed Recharts tooltip (U3). Set `money` to format values as PHP.
const ChartTooltip = ({ active, payload, label, money }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      {label != null && <p className="mb-1 font-bold text-slate-800 dark:text-slate-100">{label}</p>}
      {payload.map((entry: any, i: number) => (
        <p key={i} className="tnum flex items-center gap-2 text-slate-600 dark:text-slate-300">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: entry.color || entry.payload?.fill || entry.fill }} />
          {entry.name}: <strong className="text-slate-900 dark:text-white">{money ? formatCurrency(Number(entry.value)) : entry.value}</strong>
        </p>
      ))}
    </div>
  );
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2
  }).format(value || 0);

// Design-only presentational helpers (no business logic).
// Centralizes status colors so pills look consistent like enterprise suites.
function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'Paid' || status === 'Completed' || status === 'Active'
      ? 'status-pill-success'
      : status === 'Overdue' || status === 'Cancelled'
        ? 'status-pill-danger'
        : status === 'Pending' || status === 'Unpaid'
          ? 'status-pill-warning'
          : 'status-pill-neutral';
  return (
    <span className={`status-pill ${tone}`}>
      <span className="status-dot" aria-hidden="true" />
      {status}
    </span>
  );
}

function DensityToggle({ value, onChange }: { value: 'comfortable' | 'compact'; onChange: (v: 'comfortable' | 'compact') => void }) {
  return (
    <div className="table-density-toggle" role="group" aria-label="Table density">
      <button type="button" className={value === 'comfortable' ? 'is-active' : ''} onClick={() => onChange('comfortable')}>Comfortable</button>
      <button type="button" className={value === 'compact' ? 'is-active' : ''} onClick={() => onChange('compact')}>Compact</button>
    </div>
  );
}

function ConfirmDialog({ title, message, confirmLabel = 'Delete', onConfirm, onCancel, busy }: {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="flex items-start gap-4">
        <span className="confirm-dialog-icon"><Trash2 size={20} /></span>
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{message}</p>
        </div>
      </div>
      <div className="modal-sticky-footer mt-6 flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="button" onClick={onConfirm} disabled={busy} className="btn-danger">{busy ? 'Working…' : confirmLabel}</button>
      </div>
    </Modal>
  );
}

const formatDate = (value: string) => {
  if (!value) return '--';
  // Business dates are YYYY-MM-DD strings; parse as LOCAL midnight so the
  // displayed day never shifts with browser timezone (B22). Full ISO
  // timestamps keep instant semantics.
  const local = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
  const date = new Date(local);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
};

// YYYY-MM-DD for <input type="date"> defaults, from the viewer's wall clock
// (B22) — never the UTC day, which differs near midnight.
const todayLocal = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

// Month-bucket helpers (B22): YYYY-MM string keys bucket business dates
// without getMonth()/getFullYear(), which shift by browser timezone.
const currentMonthKey = () => todayLocal().slice(0, 7);
const monthKeyOf = (dateStr: string) => (dateStr || '').slice(0, 7);
const shiftMonthKey = (yearMonth: string, offset: number) => {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const monthLabelForKey = (yearMonth: string) =>
  new Date(`${yearMonth}-01T00:00:00`).toLocaleString('en-US', { month: 'short' });

// Client-side mirrors of the backend validators (B23): field errors before
// the request instead of a round-trip 400. Backend remains authoritative.
const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value || '').trim());
const isValidDateString = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
const isNonNegativeInput = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return true;
  const num = Number(value);
  return Number.isFinite(num) && num >= 0;
};

const parseErrorResponse = async (response: Response, fallback: string): Promise<Error> => {
  try {
    const data = (await response.json()) as { message?: unknown };
    if (typeof data.message === 'string' && data.message) return new Error(data.message);
  } catch {
    // Non-JSON error body (proxy/empty) — fall through to status fallback.
  }
  return new Error(`${fallback} (HTTP ${response.status})`);
};

const fetchJson = async <T,>(url: string): Promise<T> => {
  const response = await apiFetch(url);
  if (!response.ok) {
    throw await parseErrorResponse(response, `Request to ${url} failed`);
  }
  return response.json() as Promise<T>;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

const getFeeAmount = (feeConfig: FeeConfig[], id: string, fallback: number) => {
  const entry = feeConfig.find((f) => f.id === id);
  const val = entry ? Number(entry.amount) : fallback;
  return Number.isFinite(val) && val >= 0 ? val : fallback;
};

// Single source of truth for the fee round-trip (B19): form field <->
// backend fee id <-> fallback. Both fee consumers below AND the backend
// (server/index.js getFeeAmounts/parseFeeInput) must use these same ids
// and fallbacks; adding a fee means adding one row here + backend.
const FEE_TYPES = [
  { formKey: 'corralFee', id: 'corral_casket_fee', fallback: 15 },
  { formKey: 'deliveryFee', id: 'delivery_fee', fallback: 25 },
  { formKey: 'antiMortemFee', id: 'anti_mortem_fee', fallback: 10 },
  { formKey: 'facilityFee', id: 'facility_fee', fallback: 45 }
] as const;

type FeeForm = {
  corralFee: number;
  deliveryFee: number;
  antiMortemFee: number;
  facilityFee: number;
};

const feesFromConfig = (config: FeeConfig[]): FeeForm =>
  Object.fromEntries(FEE_TYPES.map((t) => [t.formKey, getFeeAmount(config, t.id, t.fallback)])) as FeeForm;

const splitBothHeads = (total: number) => ({
  cow: Math.ceil(total / 2),
  pig: Math.floor(total / 2)
});

function App({ session, onLogout }: { session: WebSession; onLogout: () => Promise<void> }) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [slaughterRecords, setSlaughterRecords] = useState<SlaughterRecord[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [feeConfig, setFeeConfig] = useState<FeeConfig[]>([]);
  const [feesConfigured, setFeesConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  // B20: per-section load errors. One failing endpoint no longer discards the
  // other five responses; failed sections keep prior data and report here.
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({});

  const loadData = async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      fetchJson<Vendor[]>('/api/vendors'),
      fetchJson<SlaughterRecord[]>('/api/slaughter-records'),
      fetchJson<Invoice[]>('/api/invoices'),
      fetchJson<NotificationItem[]>('/api/notifications'),
      fetchJson<DashboardData>('/api/dashboard'),
      fetchJson<{ fee_config: FeeConfig[]; configured: boolean }>('/api/service-fees')
    ]);
    const names = ['vendors', 'slaughter records', 'invoices', 'notifications', 'dashboard', 'service fees'] as const;
    const errors: Record<string, string> = {};
    const [vendorsRes, recordsRes, invoicesRes, notificationsRes, dashboardRes, feeRes] = results;

    if (vendorsRes.status === 'fulfilled') setVendors(vendorsRes.value);
    else errors.vendors = getErrorMessage(vendorsRes.reason, 'Unable to load vendors.');
    if (recordsRes.status === 'fulfilled') setSlaughterRecords(recordsRes.value);
    else errors.records = getErrorMessage(recordsRes.reason, 'Unable to load slaughter records.');
    if (invoicesRes.status === 'fulfilled') setInvoices(invoicesRes.value);
    else errors.invoices = getErrorMessage(invoicesRes.reason, 'Unable to load invoices.');
    if (notificationsRes.status === 'fulfilled') setNotifications(notificationsRes.value);
    else errors.notifications = getErrorMessage(notificationsRes.reason, 'Unable to load notifications.');
    if (dashboardRes.status === 'fulfilled') setDashboard(dashboardRes.value);
    else errors.dashboard = getErrorMessage(dashboardRes.reason, 'Unable to load dashboard.');
    if (feeRes.status === 'fulfilled') {
      setFeeConfig(feeRes.value.fee_config);
      setFeesConfigured(feeRes.value.configured);
    } else {
      setFeesConfigured(null);
      errors.fees = getErrorMessage(feeRes.reason, 'Unable to load service fees.');
    }

    setLoadErrors(errors);
    const failed = Object.keys(errors);
    if (failed.length > 0) {
      const labels = failed.map((key) => names[['vendors', 'records', 'invoices', 'notifications', 'dashboard', 'fees'].indexOf(key)] ?? key);
      setToast({ type: 'error', message: `Could not load: ${labels.join(', ')}. Showing available data.` });
    }
    setLoading(false);
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem('slaughterhouse-dark-mode');
      if (saved === '1') setDarkMode(true);
    } catch {
      // ignore storage errors
    }
    void loadData();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('slaughterhouse-dark-mode', darkMode ? '1' : '0');
    } catch {
      // ignore
    }
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  };

  const parseError = async (response: Response, fallback: string) => parseErrorResponse(response, fallback);

  const addVendor = async (payload: Partial<Vendor>) => {
    const response = await apiFetch('/api/vendors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw await parseError(response, 'Unable to add vendor');
    }

    await loadData();
    showToast('Vendor added successfully.');
  };

  const updateVendor = async (id: string, payload: Partial<Vendor>) => {
    const response = await apiFetch(`/api/vendors/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw await parseError(response, 'Unable to update vendor');
    }
    await loadData();
    showToast('Vendor updated.');
  };

  const addRecord = async (payload: any) => {
    // B17: persist the cow/pig split for 'Both' records. Previously the split
    // was stripped here, so the stored record (and later Dashboard/Statistics
    // volume) fell back to an even ceil/floor split instead of the real one.
    const { auto_generate_invoice, number_of_heads_cow, number_of_heads_pig, ...rest } = payload;
    const recordFields =
      payload.animal_type === 'Both'
        ? { ...rest, number_of_heads_cow, number_of_heads_pig }
        : rest;
    const response = await apiFetch('/api/slaughter-records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recordFields)
    });

    if (!response.ok) {
      throw await parseError(response, 'Unable to add slaughter record');
    }

    const createdRecord = await response.json();
    if (auto_generate_invoice) {
      let cowHeads = 0;
      let pigHeads = 0;
      if (createdRecord.animal_type === 'Cow') {
        cowHeads = Number(createdRecord.number_of_heads || 0);
      } else if (createdRecord.animal_type === 'Pig') {
        pigHeads = Number(createdRecord.number_of_heads || 0);
      } else if (createdRecord.animal_type === 'Both') {
        // Prefer explicit split from the form; fall back to even split to avoid double-billing.
        const explicitCow = Number(number_of_heads_cow);
        const explicitPig = Number(number_of_heads_pig);
        if (Number.isFinite(explicitCow) && Number.isFinite(explicitPig) && explicitCow + explicitPig > 0) {
          cowHeads = explicitCow;
          pigHeads = explicitPig;
        } else {
          const split = splitBothHeads(Number(createdRecord.number_of_heads || 0));
          cowHeads = split.cow;
          pigHeads = split.pig;
        }
      }

      const invoicePayload = {
        vendor_id: createdRecord.vendor_id,
        slaughter_record_id: createdRecord.id,
        date_issued: createdRecord.date,
        number_of_heads_cow: cowHeads,
        number_of_heads_pig: pigHeads,
        payment_status: 'Unpaid',
        notes: 'Auto-generated from slaughter record.'
      };

      const invRes = await apiFetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoicePayload)
      });
      if (!invRes.ok) {
        throw await parseError(invRes, 'Record saved but auto-invoice failed');
      }
    }

    await loadData();
    showToast(auto_generate_invoice ? 'Slaughter record and invoice saved.' : 'Slaughter record saved.');
  };

  const updateRecord = async (id: string, payload: any) => {
    const { auto_generate_invoice: _ignored, ...clean } = payload;
    const response = await apiFetch(`/api/slaughter-records/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clean)
    });

    if (!response.ok) {
      throw await parseError(response, 'Unable to update slaughter record');
    }

    await loadData();
    showToast('Slaughter record updated.');
  };

  const addInvoice = async (payload: any) => {
    const response = await apiFetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw await parseError(response, 'Unable to create invoice');
    }

    await loadData();
    showToast('Invoice created successfully.');
  };

  const updateInvoice = async (id: string, payload: any) => {
    const response = await apiFetch(`/api/invoices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw await parseError(response, 'Unable to update invoice');
    }
    await loadData();
    showToast('Invoice updated.');
  };

  const deleteInvoice = async (id: string) => {
    const response = await apiFetch(`/api/invoices/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      throw await parseError(response, 'Unable to delete invoice');
    }
    await loadData();
    showToast('Invoice deleted.');
  };

  const deleteRecord = async (id: string) => {
    const response = await apiFetch(`/api/slaughter-records/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      throw await parseError(response, 'Unable to delete record');
    }
    await loadData();
    showToast('Record removed.');
  };

  const deleteVendor = async (id: string) => {
    const response = await apiFetch(`/api/vendors/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      throw await parseError(response, 'Unable to deactivate vendor');
    }
    await loadData();
    showToast('Vendor marked inactive.');
  };

  const markNotificationRead = async (id: string) => {
    const response = await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
    if (!response.ok) return;
    const next = notifications.map((item) => (item.id === id ? { ...item, is_read: true } : item));
    setNotifications(next);
  };

  const markAllNotificationsRead = async () => {
    const response = await apiFetch('/api/notifications/mark-all-read', { method: 'PATCH' });
    if (!response.ok) {
      showToast('Unable to update notifications.', 'error');
      return;
    }
    setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
    showToast('All notifications marked as read.');
  };

  const deleteNotification = async (id: string) => {
    const response = await apiFetch(`/api/notifications/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      showToast('Unable to delete notification.', 'error');
      return;
    }
    setNotifications((current) => current.filter((item) => item.id !== id));
    showToast('Notification deleted.');
  };

  const updateFees = async (payload: { corralFee: number; deliveryFee: number; antiMortemFee: number; facilityFee: number }) => {
    const response = await apiFetch('/api/service-fees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw await parseError(response, 'Unable to update service fees');
    }

    const data = await response.json();
    setFeeConfig(data.fee_config);
    setFeesConfigured(true);
    showToast('Service fees updated.');
  };

  const appRootClass = `workspace ${darkMode ? 'dark' : ''}`;

  return (
    <div className={appRootClass}>
      <div className="min-h-screen">
        <Routes>
          <Route
            path="/*"
            element={
              <DashboardLayout
                session={session}
                onLogout={onLogout}
                loading={loading}
                darkMode={darkMode}
                setDarkMode={setDarkMode}
                vendors={vendors}
                slaughterRecords={slaughterRecords}
                invoices={invoices}
                notifications={notifications}
                dashboard={dashboard}
                feeConfig={feeConfig}
                feesConfigured={feesConfigured}
                addVendor={addVendor}
                updateVendor={updateVendor}
                addRecord={addRecord}
                updateRecord={updateRecord}
                addInvoice={addInvoice}
                updateInvoice={updateInvoice}
                deleteInvoice={deleteInvoice}
                deleteRecord={deleteRecord}
                deleteVendor={deleteVendor}
                markNotificationRead={markNotificationRead}
                markAllNotificationsRead={markAllNotificationsRead}
                deleteNotification={deleteNotification}
                updateFees={updateFees}
                showToast={showToast}
                loadErrors={loadErrors}
                reloadData={loadData}
              />
            }
          />
        </Routes>
      </div>

      {toast && (
        <div className="animate-fade-up fixed bottom-5 right-5 z-[60] rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-lift dark:border-slate-700 dark:bg-slate-900" role="status">
          <div className={`flex items-center gap-3 ${toast.type === 'error' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${toast.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`} />
            <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardLayout({
  session,
  onLogout,
  loading,
  darkMode,
  setDarkMode,
  vendors,
  slaughterRecords,
  invoices,
  notifications,
  dashboard,
  feeConfig,
  feesConfigured,
  addVendor,
  updateVendor,
  addRecord,
  updateRecord,
  addInvoice,
  updateInvoice,
  deleteInvoice,
  deleteRecord,
  deleteVendor,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  updateFees,
  showToast,
  loadErrors,
  reloadData
}: any) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement | null>(null);
  const location = useLocation();

  const unreadCount = notifications.filter((n: NotificationItem) => !n.is_read).length;

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
    { label: 'Dashboard', to: '/', icon: Gauge },
    { label: 'Slaughter Records', to: '/records', icon: ClipboardList },
    { label: 'Invoices', to: '/invoices', icon: FileText },
    { label: 'Statistics', to: '/statistics', icon: TrendingUp },
    { label: 'Vendors', to: '/vendors', icon: Users },
    { label: 'Notifications', to: '/notifications', icon: Bell, badge: unreadCount },
    { label: 'Service Computation', to: '/service-computation', icon: PiggyBank }
  ];

  const pageTitles: Record<string, string> = {
    '/': 'Dashboard',
    '/records': 'Slaughter Records',
    '/invoices': 'Invoices',
    '/statistics': 'Statistics',
    '/vendors': 'Vendors',
    '/notifications': 'Notifications',
    '/service-computation': 'Service Computation'
  };
  const currentTitle = pageTitles[location.pathname] || 'Dashboard';
  const pageDescriptions: Record<string, string> = {
    '/': 'A complete picture of your municipal operations.',
    '/records': 'Track livestock intake and daily slaughter activity.',
    '/invoices': 'Keep billing, payments, and outstanding balances in view.',
    '/statistics': 'Explore the numbers behind your operations.',
    '/vendors': 'Your vendor directory, organized in one place.',
    '/notifications': 'Stay up to date with billing and operational activity.',
    '/service-computation': 'Review service rates and estimate charges.'
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
                <MotionToggle />
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
            <div className="page-heading"><div><p className="eyebrow">Municipal operations</p><h1>{currentTitle}<span className="heading-dot">.</span></h1><p>{pageDescriptions[location.pathname]}</p></div><span className="mode-label"><span />{session.writesEnabled ? 'Workspace active' : 'View-only workspace'}</span></div>
            {(!session.writesEnabled || feesConfigured === false) && (
              <div role="status" className="workspace-notice">
                <ShieldCheck size={18} className="shrink-0" />
                <div>{!session.writesEnabled && <p><strong>Viewing mode.</strong> Changes are paused while mobile and web records are connected.</p>}
                {feesConfigured === false && <p>Fees shown are sample defaults. An approved fee schedule is required before billing.</p>}</div>
              </div>
            )}
            <Routes>
              <Route path="/" element={<DashboardPage loading={loading} dashboard={dashboard} loadError={loadErrors?.dashboard} onRetry={() => void reloadData()} />} />
              <Route path="/records" element={<SlaughterRecordsPage vendors={vendors} records={slaughterRecords} loading={loading} addRecord={addRecord} updateRecord={updateRecord} deleteRecord={deleteRecord} showToast={showToast} />} />
              <Route path="/invoices" element={<InvoicesPage vendors={vendors} invoices={invoices} slaughterRecords={slaughterRecords} feeConfig={feeConfig} loading={loading} addInvoice={addInvoice} updateInvoice={updateInvoice} deleteInvoice={deleteInvoice} showToast={showToast} municipality={dashboard?.municipality} />} />
              <Route path="/statistics" element={<StatisticsPage dashboard={dashboard} recordings={slaughterRecords} invoices={invoices} />} />
              <Route path="/vendors" element={<VendorsPage vendors={vendors} records={slaughterRecords} loading={loading} addVendor={addVendor} updateVendor={updateVendor} deleteVendor={deleteVendor} showToast={showToast} />} />
              <Route path="/notifications" element={<NotificationsPage notifications={notifications} markNotificationRead={markNotificationRead} markAllNotificationsRead={markAllNotificationsRead} deleteNotification={deleteNotification} />} />
              <Route path="/service-computation" element={<ServiceComputationPage feeConfig={feeConfig} updateFees={updateFees} showToast={showToast} />} />
            </Routes>
          </main>
        </div>
      </div>
    </div>
  );
}

function DashboardPage({ loading, dashboard, loadError, onRetry }: { loading: boolean; dashboard: DashboardData | null; loadError?: string; onRetry?: () => void }) {
  const { motionEnabled } = useWorkspaceMotion();
  if (loading && !dashboard) {
    return <LoadingDashboard />;
  }
  if (!dashboard) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h3 className="text-lg font-bold">Dashboard unavailable</h3>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{loadError || 'Could not load dashboard data.'}</p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="btn-primary mt-4">
            Retry
          </button>
        )}
      </div>
    );
  }

  const statCards = [
    { title: 'Total vendors', value: dashboard.summary.totalVendors, detail: 'In your vendor directory', icon: Users, to: '/vendors', tone: 'neutral' },
    { title: 'Records today', value: dashboard.summary.totalRecordsToday, detail: `${dashboard.summary.totalRecordsThisMonth} records this month`, icon: ClipboardList, to: '/records', tone: 'neutral' },
    { title: 'Monthly revenue', value: formatCurrency(dashboard.summary.totalRevenueThisMonth), detail: 'Collected this month', icon: CreditCard, to: '/statistics', tone: 'accent' },
    { title: 'Unpaid invoices', value: dashboard.summary.unpaidInvoicesCount, detail: 'Awaiting payment', icon: FileText, to: '/invoices', tone: 'neutral' }
  ];
  const hasVolume = dashboard.monthlySlaughterVolume.some((month) => month.Cow > 0 || month.Pig > 0);
  const hasFees = dashboard.feeBreakdown.some((fee) => fee.value > 0);

  return (
    <div className="page-enter dashboard-composition space-y-6">
      <section className="overview-hero" aria-label="Operations overview">
        <AmbientBackdrop />
        <div className="overview-hero-copy">
          <span className="hero-kicker"><span /> {dashboard.municipality || 'Municipal'} office</span>
          <h2>Your operations.<br /><span>One clear view.</span></h2>
          <p>Keep track of daily activity, manage records, and stay on top of municipal billing.</p>
          <Link to="/records" className="hero-link">Explore records <span><ArrowUpRight size={18} /></span></Link>
        </div>
        <LedgerArtwork />
        <span className="hero-caption">CLARITY IN EVERY RECORD <ArrowDownRight size={15} /></span>
      </section>
      <div className="section-heading"><h2>At a glance</h2><span>Current activity <span className="small-dot" /></span></div>
      <div className="metrics-grid">
        {statCards.map((item) => (
          <Link key={item.title} to={item.to} className={`metric-card metric-${item.tone}`}>
            <div className="metric-label">
              <span>{item.title}</span>
              <span className={`metric-icon-wrap ${item.tone === 'accent' ? 'bg-[#293019]/10 text-[#293019]' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'}`}>
                <item.icon size={18} strokeWidth={1.6} />
              </span>
            </div>
            <h3 className="tnum">{item.value}</h3>
            <div className="metric-footer">
              <span className="metric-delta"><TrendingUp size={13} />{item.detail}</span>
              <ArrowUpRight size={17} />
            </div>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="card p-4 md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-extrabold tracking-tight">Monthly slaughter volume</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Headcount per month, last 6 months</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              <BarChart3 size={18} />
            </div>
          </div>
          <div className="h-72">
            {!hasVolume ? <ChartEmptyState title="Your activity will take shape here" message="Monthly livestock volume appears as slaughter records are added." /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dashboard.monthlySlaughterVolume} barCategoryGap="28%">
                <defs>
                  <linearGradient id="barCow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d5ed48" />
                    <stop offset="100%" stopColor="#a3b92e" />
                  </linearGradient>
                  <linearGradient id="barPig" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#bab0d9" />
                    <stop offset="100%" stopColor="#9d92c6" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 5" stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(163,185,46,0.08)' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Cow" fill="url(#barCow)" radius={[8, 8, 2, 2]} isAnimationActive={motionEnabled} animationDuration={650} />
                <Bar dataKey="Pig" fill="url(#barPig)" radius={[8, 8, 2, 2]} isAnimationActive={motionEnabled} animationDuration={650} />
              </BarChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card p-4 md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-extrabold tracking-tight">Fee type breakdown</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Collected per fee type</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              <PiggyBank size={18} />
            </div>
          </div>
          <div className="h-72">
            {!hasFees ? <ChartEmptyState title="A clear view of collections" message="Your fee breakdown will appear once payments are recorded." /> : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={dashboard.feeBreakdown} dataKey="value" nameKey="name" innerRadius={54} outerRadius={82} paddingAngle={3} strokeWidth={2} className="outline-none" isAnimationActive={motionEnabled} animationDuration={650}>
                  {dashboard.feeBreakdown.map((entry, index) => (
                    <Cell key={`${entry.name}-${index}`} fill={COLORS[index % COLORS.length]} stroke="#ffffff" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip money />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="card p-4 md:p-6">
          <h3 className="text-lg font-extrabold tracking-tight">Recent slaughter records</h3>
          <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">Latest entries across vendors</p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="pb-3 pr-4 font-bold">Date</th>
                  <th className="pb-3 pr-4 font-bold">Vendor</th>
                  <th className="pb-3 pr-4 font-bold">Animal</th>
                  <th className="pb-3 font-bold">Heads</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.recentSlaughterRecords.length === 0 ? (
                  <tr><td colSpan={4} className="py-6 text-center text-sm text-slate-500">No recent records.</td></tr>
                ) : dashboard.recentSlaughterRecords.map((record) => (
                  <tr key={record.id} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-emerald-50/50 dark:border-slate-800 dark:hover:bg-emerald-950/20">
                    <td className="tnum py-3 pr-4">{formatDate(record.date)}</td>
                    <td className="py-3 pr-4 font-medium">{record.vendor_name || 'N/A'}</td>
                    <td className="py-3 pr-4">{record.animal_type}</td>
                    <td className="tnum py-3 font-semibold">{record.number_of_heads}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card p-4 md:p-6">
          <h3 className="text-lg font-extrabold tracking-tight">Recent invoices</h3>
          <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">Latest billing activity</p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="pb-3 pr-4 font-bold">Invoice</th>
                  <th className="pb-3 pr-4 font-bold">Vendor</th>
                  <th className="pb-3 pr-4 font-bold">Amount</th>
                  <th className="pb-3 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.recentInvoices.length === 0 ? (
                  <tr><td colSpan={4} className="py-6 text-center text-sm text-slate-500">No recent invoices.</td></tr>
                ) : dashboard.recentInvoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-emerald-50/50 dark:border-slate-800 dark:hover:bg-emerald-950/20">
                    <td className="tnum py-3 pr-4 font-medium">{invoice.id}</td>
                    <td className="py-3 pr-4">{invoice.vendor_name || 'N/A'}</td>
                    <td className="tnum py-3 pr-4 font-semibold">{formatCurrency(invoice.total_amount)}</td>
                    <td className="py-3">
                      <StatusPill status={invoice.payment_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function SlaughterRecordsPage({ vendors, records, loading, addRecord, updateRecord, deleteRecord, showToast }: { vendors: Vendor[]; records: SlaughterRecord[]; loading: boolean; addRecord: (payload: any) => Promise<void>; updateRecord: (id: string, payload: any) => Promise<void>; deleteRecord: (id: string) => Promise<void>; showToast: (msg: string, type?: 'success' | 'error') => void }) {
  type RecordForm = {
    vendor_id: string;
    date: string;
    animal_type: 'Cow' | 'Pig' | 'Both';
    number_of_heads: number;
    number_of_heads_cow: number;
    number_of_heads_pig: number;
    livestock_type: string;
    meat_type_to_deliver: string;
    kilograms_cow: string;
    kilograms_pig: string;
    status: 'Pending' | 'Completed' | 'Cancelled';
    auto_generate_invoice: boolean;
  };

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ vendor: 'All', animal: 'All', status: 'All' });
  const [page, setPage] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const pageSize = 10;
  const [form, setForm] = useState<RecordForm>({
    vendor_id: '',
    date: todayLocal(),
    animal_type: 'Cow',
    number_of_heads: 1,
    number_of_heads_cow: 1,
    number_of_heads_pig: 1,
    livestock_type: 'Native',
    meat_type_to_deliver: 'Dressed',
    kilograms_cow: '',
    kilograms_pig: '',
    status: 'Pending',
    auto_generate_invoice: true
  });

  const openEditRecord = (record: SlaughterRecord) => {
    setEditingRecordId(record.id);
    const total = Number(record.number_of_heads || 0);
    const cowSplit = (record as any).number_of_heads_cow != null ? Number((record as any).number_of_heads_cow) : splitBothHeads(total).cow;
    const pigSplit = (record as any).number_of_heads_pig != null ? Number((record as any).number_of_heads_pig) : splitBothHeads(total).pig;
    setForm({
      vendor_id: record.vendor_id,
      date: record.date,
      animal_type: record.animal_type,
      number_of_heads: total,
      number_of_heads_cow: record.animal_type === 'Both' ? cowSplit : total,
      number_of_heads_pig: record.animal_type === 'Both' ? pigSplit : total,
      livestock_type: record.livestock_type,
      meat_type_to_deliver: record.meat_type_to_deliver,
      kilograms_cow: record.kilograms_cow == null ? '' : String(record.kilograms_cow),
      kilograms_pig: record.kilograms_pig == null ? '' : String(record.kilograms_pig),
      status: record.status,
      auto_generate_invoice: false
    });
    setIsAddOpen(true);
  };

  const closeRecordModal = () => {
    setIsAddOpen(false);
    setEditingRecordId(null);
    setForm({
      vendor_id: '',
      date: todayLocal(),
      animal_type: 'Cow',
      number_of_heads: 1,
      number_of_heads_cow: 1,
      number_of_heads_pig: 1,
      livestock_type: 'Native',
      meat_type_to_deliver: 'Dressed',
      kilograms_cow: '',
      kilograms_pig: '',
      status: 'Pending',
      auto_generate_invoice: true
    });
  };

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const query = search.trim().toLowerCase();
      const bySearch = !query || `${record.vendor_name || ''} ${record.animal_type} ${record.status} ${record.id}`.toLowerCase().includes(query);
      const byVendor = filters.vendor === 'All' || record.vendor_id === filters.vendor;
      const byAnimal = filters.animal === 'All' || record.animal_type === filters.animal;
      const byStatus = filters.status === 'All' || record.status === filters.status;
      return bySearch && byVendor && byAnimal && byStatus;
    });
  }, [records, search, filters]);

  useEffect(() => {
    setPage(1);
  }, [search, filters]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRecords = filteredRecords.slice((safePage - 1) * pageSize, safePage * pageSize);

  const hasActiveFilters = search.trim() !== '' || filters.vendor !== 'All' || filters.animal !== 'All' || filters.status !== 'All';
  const clearFilters = () => {
    setSearch('');
    setFilters({ vendor: 'All', animal: 'All', status: 'All' });
    setPage(1);
  };

  const handleAnimalChange = (value: 'Cow' | 'Pig' | 'Both') => {
    if (value === 'Both') {
      const split = splitBothHeads(Number(form.number_of_heads || 0));
      setForm({ ...form, animal_type: value, number_of_heads_cow: split.cow, number_of_heads_pig: split.pig });
    } else {
      setForm({ ...form, animal_type: value });
    }
  };

  const submitRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const isBoth = form.animal_type === 'Both';
      const totalHeads = isBoth
        ? Number(form.number_of_heads_cow || 0) + Number(form.number_of_heads_pig || 0)
        : Number(form.number_of_heads || 0);
      if (!form.vendor_id) throw new Error('Please select a vendor.');
      if (!isValidDateString(form.date)) throw new Error('Date must be YYYY-MM-DD.');
      if (isBoth && (!isNonNegativeInput(form.number_of_heads_cow) || !isNonNegativeInput(form.number_of_heads_pig))) {
        throw new Error('Cow and pig heads must be valid non-negative numbers.');
      }
      if (totalHeads <= 0) throw new Error('Number of heads must be greater than zero.');
      if (!isNonNegativeInput(form.kilograms_cow) || !isNonNegativeInput(form.kilograms_pig)) {
        throw new Error('Kilograms must be valid non-negative numbers.');
      }

      const payload = {
        vendor_id: form.vendor_id,
        date: form.date,
        animal_type: form.animal_type,
        number_of_heads: totalHeads,
        number_of_heads_cow: isBoth ? Number(form.number_of_heads_cow || 0) : undefined,
        number_of_heads_pig: isBoth ? Number(form.number_of_heads_pig || 0) : undefined,
        livestock_type: form.livestock_type,
        meat_type_to_deliver: form.meat_type_to_deliver,
        kilograms_cow: form.kilograms_cow ? Number(form.kilograms_cow) : null,
        kilograms_pig: form.kilograms_pig ? Number(form.kilograms_pig) : null,
        status: form.status,
        auto_generate_invoice: form.auto_generate_invoice
      };

      if (editingRecordId) {
        await updateRecord(editingRecordId, payload);
      } else {
        await addRecord(payload);
      }
      closeRecordModal();
    } catch (error) {
      showToast(getErrorMessage(error, 'Unable to save record.'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = (id: string) => {
    setPendingDeleteId(id);
  };

  const executeDelete = async () => {
    if (!pendingDeleteId) return;
    setIsDeleting(true);
    try {
      await deleteRecord(pendingDeleteId);
      setPendingDeleteId(null);
    } catch (error) {
      showToast(getErrorMessage(error, 'Unable to delete record.'), 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="page-enter space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Slaughter Records</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Monitor live slaughter entries and billing readiness.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <DensityToggle value={density} onChange={setDensity} />
          <button type="button" onClick={() => setIsAddOpen(true)} className="btn-primary">
            Add Record
          </button>
        </div>
      </div>

      <div className="card p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="xl:col-span-2">
            <label className="label">Search</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 text-slate-400" size={16} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} className="input pl-9" placeholder="Search vendor, status, or ID" />
            </div>
          </div>
          <div>
            <label className="label">Animal Type</label>
            <select value={filters.animal} onChange={(e) => setFilters({ ...filters, animal: e.target.value })} className="input">
              <option value="All">All</option>
              <option value="Cow">Cow</option>
              <option value="Pig">Pig</option>
              <option value="Both">Both</option>
            </select>
          </div>
          <div>
            <label className="label">Vendor</label>
            <select value={filters.vendor} onChange={(e) => setFilters({ ...filters, vendor: e.target.value })} className="input">
              <option value="All">All vendors</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="input">
              <option value="All">All</option>
              <option value="Pending">Pending</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
        </div>
        {hasActiveFilters && (
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-slate-500 dark:text-slate-400">{filteredRecords.length} result(s)</span>
            <button type="button" onClick={clearFilters} className="btn-ghost btn-sm">Clear filters</button>
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <TableSkeleton />
        ) : filteredRecords.length === 0 ? (
          <EmptyState title="No slaughter records found" message="Adjust your filters or add a new slaughter record." />
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className={`min-w-full text-left text-sm ${density === 'compact' ? 'table-compact' : 'table-comfortable'}`}>
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Vendor</th>
                  <th className="px-4 py-3 font-medium">Animal Type</th>
                  <th className="px-4 py-3 font-medium">No. Heads</th>
                  <th className="px-4 py-3 font-medium">Livestock Type</th>
                  <th className="px-4 py-3 font-medium">Meat Type</th>
                  <th className="px-4 py-3 font-medium">Kgs Cow</th>
                  <th className="px-4 py-3 font-medium">Kgs Pig</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedRecords.map((record) => (
                  <tr key={record.id} className="table-row">
                    <td className="tnum px-4 py-3">{formatDate(record.date)}</td>
                    <td className="px-4 py-3 font-medium">{record.vendor_name || 'N/A'}</td>
                    <td className="px-4 py-3">{record.animal_type}</td>
                    <td className="tnum px-4 py-3 font-semibold">{record.number_of_heads}</td>
                    <td className="px-4 py-3">{record.livestock_type}</td>
                    <td className="px-4 py-3">{record.meat_type_to_deliver}</td>
                    <td className="tnum px-4 py-3">{record.kilograms_cow ?? '--'}</td>
                    <td className="tnum px-4 py-3">{record.kilograms_pig ?? '--'}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={record.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button type="button" onClick={() => openEditRecord(record)} className="icon-action" aria-label={`Edit record ${record.id}`}><Pencil size={14} />Edit</button>
                        <button type="button" onClick={() => confirmDelete(record.id)} className="icon-action icon-action-danger" aria-label={`Delete record ${record.id}`}><Trash2 size={14} />Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={safePage} totalPages={totalPages} total={filteredRecords.length} pageSize={pageSize} onChange={setPage} />
          </>
        )}
      </div>

      {pendingDeleteId && (
        <ConfirmDialog
          title="Delete slaughter record"
          message={`Delete record ${pendingDeleteId}? This cannot be undone. Linked invoices are kept.`}
          confirmLabel="Delete record"
          busy={isDeleting}
          onCancel={() => { if (!isDeleting) setPendingDeleteId(null); }}
          onConfirm={() => void executeDelete()}
        />
      )}

      {isAddOpen && (
        <Modal title={editingRecordId ? 'Edit Slaughter Record' : 'Add Slaughter Record'} onClose={closeRecordModal}>
          <form onSubmit={submitRecord} className="space-y-4">
            <div className="form-section">
              <p className="form-section-title">Intake</p>
              <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="label">Vendor</label>
                <select value={form.vendor_id} onChange={(e) => setForm({ ...form, vendor_id: e.target.value })} className="input" required>
                  <option value="">Select vendor</option>
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Date</label>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" required />
              </div>
              <div>
                <label className="label">Animal Type</label>
                <select value={form.animal_type} onChange={(e) => handleAnimalChange(e.target.value as 'Cow' | 'Pig' | 'Both')} className="input">
                  <option value="Cow">Cow</option>
                  <option value="Pig">Pig</option>
                  <option value="Both">Both</option>
                </select>
              </div>
              {form.animal_type === 'Both' ? (
                <>
                  <div>
                    <label className="label">Cow Heads</label>
                    <input type="number" min={0} value={form.number_of_heads_cow} onChange={(e) => setForm({ ...form, number_of_heads_cow: Number(e.target.value) })} className="input" required />
                  </div>
                  <div>
                    <label className="label">Pig Heads</label>
                    <input type="number" min={0} value={form.number_of_heads_pig} onChange={(e) => setForm({ ...form, number_of_heads_pig: Number(e.target.value) })} className="input" required />
                  </div>
                  <div>
                    <label className="label">Total Heads</label>
                    <input value={Number(form.number_of_heads_cow || 0) + Number(form.number_of_heads_pig || 0)} className="input bg-slate-50 dark:bg-slate-800" readOnly />
                  </div>
                </>
              ) : (
              <div>
                <label className="label">Number of Heads</label>
                <input type="number" min={1} value={form.number_of_heads} onChange={(e) => setForm({ ...form, number_of_heads: Number(e.target.value) })} className="input" required />
              </div>
              )}
              </div>
            </div>
            <div className="form-section">
              <p className="form-section-title">Details & outcome</p>
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">Weights are optional — status controls billing readiness.</p>
              <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="label">Livestock Type</label>
                <select value={form.livestock_type} onChange={(e) => setForm({ ...form, livestock_type: e.target.value })} className="input">
                  <option value="Native">Native</option>
                  <option value="Imported">Imported</option>
                  <option value="Local Bred">Local Bred</option>
                </select>
              </div>
              <div>
                <label className="label">Meat Type to Deliver</label>
                <select value={form.meat_type_to_deliver} onChange={(e) => setForm({ ...form, meat_type_to_deliver: e.target.value })} className="input">
                  <option value="Dressed">Dressed</option>
                  <option value="Cuts">Cuts</option>
                  <option value="Whole">Whole</option>
                </select>
              </div>
              <div>
                <label className="label">Kilograms - Cow</label>
                <input type="number" step="0.1" min={0} value={form.kilograms_cow} onChange={(e) => setForm({ ...form, kilograms_cow: e.target.value })} className="input" placeholder="Optional" />
              </div>
              <div>
                <label className="label">Kilograms - Pig</label>
                <input type="number" step="0.1" min={0} value={form.kilograms_pig} onChange={(e) => setForm({ ...form, kilograms_pig: e.target.value })} className="input" placeholder="Optional" />
              </div>
              <div>
                <label className="label">Status</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'Pending' | 'Completed' | 'Cancelled' })} className="input">
                  <option value="Pending">Pending</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
              {!editingRecordId && (
              <div className="flex items-end">
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200">
                  <input type="checkbox" checked={form.auto_generate_invoice} onChange={(e) => setForm({ ...form, auto_generate_invoice: e.target.checked })} />
                  Auto-generate invoice
                </label>
              </div>
              )}
              </div>
            </div>

            <div className="modal-footer flex justify-end gap-3">
              <button type="button" onClick={closeRecordModal} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="btn-primary">{isSubmitting ? 'Saving…' : editingRecordId ? 'Update Record' : 'Save Record'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function InvoicesPage({ vendors, invoices, slaughterRecords, feeConfig, loading, addInvoice, updateInvoice, deleteInvoice, showToast, municipality }: { vendors: Vendor[]; invoices: Invoice[]; slaughterRecords: SlaughterRecord[]; feeConfig: FeeConfig[]; loading: boolean; addInvoice: (payload: any) => Promise<void>; updateInvoice: (id: string, payload: any) => Promise<void>; deleteInvoice: (id: string) => Promise<void>; showToast: (msg: string, type?: 'success' | 'error') => void; municipality?: string }) {
  const municipalityName = municipality || 'San Fernando';
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ status: 'All', vendor: 'All' });
  const [page, setPage] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [pendingDelete, setPendingDelete] = useState<Invoice | null>(null);
  const pageSize = 10;
  const [form, setForm] = useState({
    vendor_id: '',
    slaughter_record_id: '',
    date_issued: todayLocal(),
    number_of_heads_cow: 0,
    number_of_heads_pig: 0,
    payment_status: 'Unpaid',
    notes: ''
  });

  const filteredInvoices = useMemo(() => {
    const sorted = [...invoices].sort((a, b) => b.date_issued.localeCompare(a.date_issued));
    return sorted.filter((invoice) => {
      const query = search.trim().toLowerCase();
      const byStatus = filters.status === 'All' || invoice.payment_status === filters.status;
      const byVendor = filters.vendor === 'All' || invoice.vendor_id === filters.vendor;
      const bySearch = !query || `${invoice.id} ${invoice.vendor_name || ''} ${invoice.payment_status}`.toLowerCase().includes(query);
      return byStatus && byVendor && bySearch;
    });
  }, [invoices, filters, search]);

  useEffect(() => {
    setPage(1);
  }, [search, filters]);

  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedInvoices = filteredInvoices.slice((safePage - 1) * pageSize, safePage * pageSize);

  const feeBreakdown = useMemo(() => {
    const totalHeads = Number(form.number_of_heads_cow || 0) + Number(form.number_of_heads_pig || 0);
    const [corralRate, deliveryRate, antiRate, facilityRate] = FEE_TYPES.map((t) => getFeeAmount(feeConfig, t.id, t.fallback));
    const corralFee = totalHeads * corralRate;
    const deliveryFee = totalHeads * deliveryRate;
    const antiMortemFee = totalHeads * antiRate;
    const facilityFee = totalHeads * facilityRate;
    const total = corralFee + deliveryFee + antiMortemFee + facilityFee;
    return { corralFee, deliveryFee, antiMortemFee, facilityFee, total, totalHeads };
  }, [form.number_of_heads_cow, form.number_of_heads_pig, feeConfig]);

  const submitInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const cow = Number(form.number_of_heads_cow || 0);
      const pig = Number(form.number_of_heads_pig || 0);
      if (!form.vendor_id) throw new Error('Please select a vendor.');
      if (cow + pig <= 0) throw new Error('At least one head is required.');
      await addInvoice({
        ...form,
        number_of_heads_cow: cow,
        number_of_heads_pig: pig
      });
      setIsAddOpen(false);
      setForm({
        vendor_id: '',
        slaughter_record_id: '',
        date_issued: todayLocal(),
        number_of_heads_cow: 0,
        number_of_heads_pig: 0,
        payment_status: 'Unpaid',
        notes: ''
      });
    } catch (error) {
      showToast(getErrorMessage(error, 'Unable to create invoice.'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (invoice: Invoice, status: string) => {
    if (invoice.payment_status === status) return;
    setActioningId(invoice.id);
    try {
      await updateInvoice(invoice.id, { payment_status: status });
      if (selectedInvoice?.id === invoice.id) {
        setSelectedInvoice({ ...selectedInvoice, payment_status: status as Invoice['payment_status'] });
      }
    } catch (error) {
      showToast(getErrorMessage(error, 'Unable to update status.'), 'error');
    } finally {
      setActioningId(null);
    }
  };

  const handleDelete = (invoice: Invoice) => {
    setPendingDelete(invoice);
  };

  const executeInvoiceDelete = async () => {
    if (!pendingDelete) return;
    const invoice = pendingDelete;
    setActioningId(invoice.id);
    try {
      await deleteInvoice(invoice.id);
      if (selectedInvoice?.id === invoice.id) setSelectedInvoice(null);
      setPendingDelete(null);
    } catch (error) {
      showToast(getErrorMessage(error, 'Unable to delete invoice.'), 'error');
    } finally {
      setActioningId(null);
    }
  };

  const exportPdf = (invoice: Invoice) => {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const margin = 15;
    let y = 20;
    pdf.setFontSize(12);
    pdf.text(`Municipal Government of ${municipalityName}`, margin, y);
    y += 8;
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Official Receipt - Slaughterhouse Service Fees', margin, y, { maxWidth: 180 });
    y += 12;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.text(`Vendor: ${invoice.vendor_name || 'N/A'}`, margin, y);
    y += 7;
    pdf.text(`Date Issued: ${formatDate(invoice.date_issued)}   Due: ${formatDate(invoice.due_date)}`, margin, y);
    y += 7;
    pdf.text(`Invoice #: ${invoice.id}`, margin, y);
    y += 7;
    pdf.text(`Heads - Cow: ${invoice.number_of_heads_cow}   Pig: ${invoice.number_of_heads_pig}`, margin, y);
    y += 10;
    pdf.text(`Corral/Casket Fee: ${formatCurrency(invoice.corral_fee)}`, margin, y);
    y += 7;
    pdf.text(`Delivery Fee: ${formatCurrency(invoice.delivery_fee)}`, margin, y);
    y += 7;
    pdf.text(`Anti/Post Mortem Fee: ${formatCurrency(invoice.anti_mortem_fee)}`, margin, y);
    y += 7;
    pdf.text(`Facility Fee: ${formatCurrency(invoice.facility_fee)}`, margin, y);
    y += 10;
    pdf.setFont('helvetica', 'bold');
    pdf.text(`TOTAL: ${formatCurrency(invoice.total_amount)}   [${invoice.payment_status}]`, margin, y);
    pdf.setFont('helvetica', 'normal');
    y += 10;
    pdf.setFontSize(10);
    pdf.text('SAME-DAY PAYMENT REQUIRED. Payment must be settled on the date of slaughter. No advance payment accepted.', margin, y, { maxWidth: 180 });
    y += 20;
    pdf.text('Vendor Signature: ___________________', margin, y);
    pdf.text('Treasurer Signature: ___________________', 110, y);
    pdf.save(`${invoice.id}.pdf`);
  };

  const printReceipt = () => {
    window.print();
  };

  return (
    <div className="page-enter space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Invoices</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Track service billing, due dates, and payment status.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <DensityToggle value={density} onChange={setDensity} />
          <button type="button" onClick={() => setIsAddOpen(true)} className="btn-primary">
            Add Invoice
          </button>
        </div>
      </div>

      <div className="card p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="label">Search</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 text-slate-400" size={16} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} className="input pl-9" placeholder="Invoice no or vendor" />
            </div>
          </div>
          <div>
            <label className="label">Payment Status</label>
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="input">
              <option value="All">All statuses</option>
              <option value="Paid">Paid</option>
              <option value="Unpaid">Unpaid</option>
              <option value="Overdue">Overdue</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label">Vendor</label>
            <select value={filters.vendor} onChange={(e) => setFilters({ ...filters, vendor: e.target.value })} className="input">
              <option value="All">All vendors</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button type="button" onClick={() => { setSearch(''); setFilters({ status: 'All', vendor: 'All' }); }} className="btn-secondary w-full">Clear</button>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <TableSkeleton />
        ) : filteredInvoices.length === 0 ? (
          <EmptyState title="No invoices available" message="Create a new invoice for an existing slaughter record." />
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className={`min-w-full text-left text-sm ${density === 'compact' ? 'table-compact' : 'table-comfortable'}`}>
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-3 font-medium">Invoice #</th>
                  <th className="px-4 py-3 font-medium">Vendor</th>
                  <th className="px-4 py-3 font-medium">Date Issued</th>
                  <th className="px-4 py-3 font-medium">No. Heads</th>
                  <th className="px-4 py-3 font-medium">Total Amount</th>
                  <th className="px-4 py-3 font-medium">Payment Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedInvoices.map((invoice) => (
                  <tr key={invoice.id} className="table-row">
                    <td className="tnum max-w-32 truncate px-4 py-3 font-medium" title={invoice.id}>{invoice.id}</td>
                    <td className="px-4 py-3 font-medium">{invoice.vendor_name || 'N/A'}</td>
                    <td className="tnum px-4 py-3">{formatDate(invoice.date_issued)}</td>
                    <td className="tnum px-4 py-3">{Number(invoice.number_of_heads_cow || 0) + Number(invoice.number_of_heads_pig || 0)}</td>
                    <td className="tnum px-4 py-3 font-semibold">{formatCurrency(invoice.total_amount)}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={invoice.payment_status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setSelectedInvoice(invoice)} className="icon-action" aria-label={`View invoice ${invoice.id}`}><Eye size={14} />View</button>
                        {invoice.payment_status !== 'Paid' ? (
                          <button type="button" disabled={actioningId === invoice.id} onClick={() => void handleStatusChange(invoice, 'Paid')} className="icon-action" aria-label={`Mark invoice ${invoice.id} paid`}>Mark Paid</button>
                        ) : (
                          <button type="button" disabled={actioningId === invoice.id} onClick={() => void handleStatusChange(invoice, 'Unpaid')} className="icon-action" aria-label={`Mark invoice ${invoice.id} unpaid`}>Mark Unpaid</button>
                        )}
                        <button type="button" disabled={actioningId === invoice.id} onClick={() => handleDelete(invoice)} className="icon-action icon-action-danger" aria-label={`Delete invoice ${invoice.id}`}><Trash2 size={14} />Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={safePage} totalPages={totalPages} total={filteredInvoices.length} pageSize={pageSize} onChange={setPage} />
          </>
        )}
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete invoice"
          message={`Delete invoice ${pendingDelete.id}? This cannot be undone.`}
          confirmLabel="Delete invoice"
          busy={actioningId === pendingDelete.id}
          onCancel={() => { if (!actioningId) setPendingDelete(null); }}
          onConfirm={() => void executeInvoiceDelete()}
        />
      )}

      {isAddOpen && (
        <Modal title="Add Invoice" onClose={() => setIsAddOpen(false)}>
          <form onSubmit={submitInvoice} className="space-y-4">
            <div className="form-section">
              <p className="form-section-title">Billing source</p>
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">Pick a vendor first — linking a slaughter record auto-fills vendor, date, and headcounts.</p>
              <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="label">Vendor</label>
                <select value={form.vendor_id} onChange={(e) => setForm({ ...form, vendor_id: e.target.value })} className="input" required>
                  <option value="">Select vendor</option>
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Linked Slaughter Record</label>
                <select value={form.slaughter_record_id} onChange={(e) => {
                  const recId = e.target.value;
                  const rec = slaughterRecords.find((r) => r.id === recId);
                  if (rec) {
                    const cow = (rec as any).number_of_heads_cow;
                    const pig = (rec as any).number_of_heads_pig;
                    if (rec.animal_type === 'Cow') {
                      setForm({ ...form, slaughter_record_id: recId, vendor_id: rec.vendor_id, date_issued: rec.date, number_of_heads_cow: Number(rec.number_of_heads || 0), number_of_heads_pig: 0 });
                    } else if (rec.animal_type === 'Pig') {
                      setForm({ ...form, slaughter_record_id: recId, vendor_id: rec.vendor_id, date_issued: rec.date, number_of_heads_cow: 0, number_of_heads_pig: Number(rec.number_of_heads || 0) });
                    } else {
                      // B24: a stored 0/0 (or non-numeric) split is NOT a real
                      // split — fall back to the even split so the form never
                      // prefills 0/0, which the backend would reject.
                      const cowNum = Number(cow);
                      const pigNum = Number(pig);
                      const hasSplit =
                        Number.isFinite(cowNum) && Number.isFinite(pigNum) && cowNum >= 0 && pigNum >= 0 && cowNum + pigNum > 0;
                      const split = hasSplit ? { cow: cowNum, pig: pigNum } : splitBothHeads(Number(rec.number_of_heads || 0));
                      setForm({ ...form, slaughter_record_id: recId, vendor_id: rec.vendor_id, date_issued: rec.date, number_of_heads_cow: split.cow, number_of_heads_pig: split.pig });
                    }
                  } else {
                    setForm({ ...form, slaughter_record_id: recId });
                  }
                }} className="input">
                  <option value="">Optional</option>
                  {slaughterRecords.map((record) => (
                    <option key={record.id} value={record.id}>{record.id} — {record.vendor_name || record.vendor_id} — {formatDate(record.date)} ({record.number_of_heads} heads)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Date Issued</label>
                <input type="date" value={form.date_issued} onChange={(e) => setForm({ ...form, date_issued: e.target.value })} className="input" required />
              </div>
              <div>
                <label className="label">Payment Status</label>
                <select value={form.payment_status} onChange={(e) => setForm({ ...form, payment_status: e.target.value })} className="input">
                  <option value="Paid">Paid</option>
                  <option value="Unpaid">Unpaid</option>
                  <option value="Overdue">Overdue</option>
                </select>
              </div>
              <div>
                <label className="label">Headcount - Cow</label>
                <input type="number" min={0} value={form.number_of_heads_cow} onChange={(e) => setForm({ ...form, number_of_heads_cow: Number(e.target.value) })} className="input" required />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">At least one head total is required.</p>
              </div>
              <div>
                <label className="label">Headcount - Pig</label>
                <input type="number" min={0} value={form.number_of_heads_pig} onChange={(e) => setForm({ ...form, number_of_heads_pig: Number(e.target.value) })} className="input" required />
              </div>
              </div>
            </div>

            <div className="form-section">
              <p className="form-section-title">Charges & notes</p>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
              <h4 className="mb-3 font-semibold">Fee breakdown ({feeBreakdown.totalHeads} head(s))</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>Corral/Casket Fee</span><strong className="tnum">{formatCurrency(feeBreakdown.corralFee)}</strong></div>
                <div className="flex justify-between"><span>Delivery Fee</span><strong className="tnum">{formatCurrency(feeBreakdown.deliveryFee)}</strong></div>
                <div className="flex justify-between"><span>Anti/Post Mortem Fee</span><strong className="tnum">{formatCurrency(feeBreakdown.antiMortemFee)}</strong></div>
                <div className="flex justify-between"><span>Facility Fee</span><strong className="tnum">{formatCurrency(feeBreakdown.facilityFee)}</strong></div>
                <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold dark:border-slate-700"><span>TOTAL</span><span className="tnum">{formatCurrency(feeBreakdown.total)}</span></div>
              </div>
              </div>

              <div className="mt-4">
              <label className="label">Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input min-h-24" placeholder="e.g. Paid in cash at treasury counter" />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Optional — shown on the receipt.</p>
              </div>
            </div>

            <div className="modal-footer flex justify-end gap-3">
              <button type="button" onClick={() => setIsAddOpen(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="btn-primary">{isSubmitting ? 'Creating…' : 'Create Invoice'}</button>
            </div>
          </form>
        </Modal>
      )}

      {selectedInvoice && (
        <Modal title="Invoice Receipt" onClose={() => setSelectedInvoice(null)}>
          <div className="space-y-4">
            <div className="print-area rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800">
              <div className="text-center">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Municipal Government of {municipalityName}</p>
                <h3 className="mt-2 text-xl font-bold">Official Receipt — Slaughterhouse Service Fees</h3>
              </div>
              <div className="mt-6 grid gap-3 text-sm md:grid-cols-2">
                <div><span className="text-slate-500 dark:text-slate-400">Vendor:</span> <strong>{selectedInvoice.vendor_name || 'N/A'}</strong></div>
                <div><span className="text-slate-500 dark:text-slate-400">Invoice No.:</span> <strong>{selectedInvoice.id}</strong></div>
                <div><span className="text-slate-500 dark:text-slate-400">Date:</span> <strong>{formatDate(selectedInvoice.date_issued)}</strong></div>
                <div><span className="text-slate-500 dark:text-slate-400">Due Date:</span> <strong>{formatDate(selectedInvoice.due_date)}</strong></div>
                <div><span className="text-slate-500 dark:text-slate-400">Cow Heads:</span> <strong>{selectedInvoice.number_of_heads_cow}</strong></div>
                <div><span className="text-slate-500 dark:text-slate-400">Pig Heads:</span> <strong>{selectedInvoice.number_of_heads_pig}</strong></div>
              </div>
              <div className="mt-6 space-y-2 text-sm">
                <div className="flex justify-between"><span>Corral/Casket Fee</span><strong>{formatCurrency(selectedInvoice.corral_fee)}</strong></div>
                <div className="flex justify-between"><span>Delivery Fee</span><strong>{formatCurrency(selectedInvoice.delivery_fee)}</strong></div>
                <div className="flex justify-between"><span>Anti/Post Mortem Fee</span><strong>{formatCurrency(selectedInvoice.anti_mortem_fee)}</strong></div>
                <div className="flex justify-between"><span>Facility Fee</span><strong>{formatCurrency(selectedInvoice.facility_fee)}</strong></div>
                <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold dark:border-slate-700"><span>Grand Total</span><span>{formatCurrency(selectedInvoice.total_amount)}</span></div>
              </div>
              <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800">
                SAME-DAY PAYMENT REQUIRED. Payment must be settled on the date of slaughter. No advance payment accepted.
              </div>
              <div className="mt-8 flex justify-between gap-6 border-t border-slate-200 pt-4 text-sm dark:border-slate-700">
                <div className="flex-1">
                  <p className="text-slate-500 dark:text-slate-400">Vendor Signature</p>
                  <div className="mt-8 border-b border-slate-400 pb-1" />
                </div>
                <div className="flex-1">
                  <p className="text-slate-500 dark:text-slate-400">Treasurer Signature</p>
                  <div className="mt-8 border-b border-slate-400 pb-1" />
                </div>
              </div>
              {selectedInvoice.notes && (
                <p className="text-sm text-slate-600 dark:text-slate-300"><span className="font-medium">Notes:</span> {selectedInvoice.notes}</p>
              )}
            </div>

            <div className="modal-sticky-footer no-print flex flex-wrap justify-end gap-3">
              <button type="button" onClick={() => void handleStatusChange(selectedInvoice, selectedInvoice.payment_status === 'Paid' ? 'Unpaid' : 'Paid')} disabled={actioningId === selectedInvoice.id} className="btn-secondary">
                {selectedInvoice.payment_status === 'Paid' ? 'Mark Unpaid' : 'Mark Paid'}
              </button>
              <button type="button" onClick={printReceipt} className="btn-secondary">Print</button>
              <button type="button" onClick={() => exportPdf(selectedInvoice)} className="btn-primary">Download PDF</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function StatisticsPage({ dashboard, recordings, invoices }: { dashboard: DashboardData | null; recordings: SlaughterRecord[]; invoices: Invoice[] }) {
  const { motionEnabled } = useWorkspaceMotion();
  if (!dashboard) return <LoadingDashboard />;

  const revenueTrend = useMemo(() => {
    const base = currentMonthKey();
    return Array.from({ length: 6 }, (_, index) => {
      const key = shiftMonthKey(base, index - 5);
      const monthlyTotal = invoices
        .filter((invoice) => monthKeyOf(invoice.date_issued) === key)
        .reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
      return { month: monthLabelForKey(key), revenue: monthlyTotal };
    });
  }, [invoices]);

  const volumeComparison = useMemo(() => {
    const base = currentMonthKey();
    return Array.from({ length: 6 }, (_, index) => {
      const key = shiftMonthKey(base, index - 5);
      let cow = 0;
      let pig = 0;
      recordings.forEach((record) => {
        if (monthKeyOf(record.date) !== key) return;
        const heads = Number(record.number_of_heads || 0);
        const cowSplit = Number((record as any).number_of_heads_cow ?? NaN);
        const pigSplit = Number((record as any).number_of_heads_pig ?? NaN);
        if (record.animal_type === 'Cow') cow += heads;
        else if (record.animal_type === 'Pig') pig += heads;
        else if (Number.isFinite(cowSplit) && Number.isFinite(pigSplit)) {
          cow += cowSplit;
          pig += pigSplit;
        } else {
          const split = splitBothHeads(heads);
          cow += split.cow;
          pig += split.pig;
        }
      });
      return { month: monthLabelForKey(key), Cow: cow, Pig: pig };
    });
  }, [recordings]);

  const topVendors = useMemo(() => {
    const map = new Map<string, number>();
    recordings.forEach((record) => {
      map.set(record.vendor_name || 'Unknown', (map.get(record.vendor_name || 'Unknown') || 0) + Number(record.number_of_heads || 0));
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, value]) => ({ name, volume: value }));
  }, [recordings]);

  return (
    <div className="page-enter space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="card p-4 md:p-6">
          <h3 className="mb-4 text-lg font-bold">Monthly revenue</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueTrend}>
                <CartesianGrid strokeDasharray="3 5" stroke="var(--chart-grid)" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Line type="monotone" dataKey="revenue" stroke="#8b9f2f" strokeWidth={3} isAnimationActive={motionEnabled} animationDuration={650} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-4 md:p-6">
          <h3 className="mb-4 text-lg font-bold">Cow vs Pig slaughter volume</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volumeComparison}>
                <CartesianGrid strokeDasharray="3 5" stroke="var(--chart-grid)" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="Cow" fill="#a3b92e" radius={[8, 8, 0, 0]} isAnimationActive={motionEnabled} animationDuration={650} />
                <Bar dataKey="Pig" fill="#9d92c6" radius={[8, 8, 0, 0]} isAnimationActive={motionEnabled} animationDuration={650} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="card p-4 md:p-6">
          <h3 className="mb-4 text-lg font-bold">Fee type breakdown</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={dashboard.feeBreakdown} dataKey="value" innerRadius={52} outerRadius={90} isAnimationActive={motionEnabled} animationDuration={650}>
                  {dashboard.feeBreakdown.map((entry, index) => (
                    <Cell key={`${entry.name}-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-4 md:p-6">
          <h3 className="mb-4 text-lg font-bold">Top 5 vendors by volume</h3>
          {topVendors.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No vendor volume yet.</p>
          ) : (
          <div className="space-y-3">
            {topVendors.map((vendor, index) => (
              <div key={vendor.name} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">{index + 1}</span>
                  <span>{vendor.name}</span>
                </div>
                <strong>{vendor.volume} heads</strong>
              </div>
            ))}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

function VendorsPage({ vendors, records, loading, addVendor, updateVendor, deleteVendor, showToast }: { vendors: Vendor[]; records: SlaughterRecord[]; loading: boolean; addVendor: (payload: Partial<Vendor>) => Promise<void>; updateVendor: (id: string, payload: Partial<Vendor>) => Promise<void>; deleteVendor: (id: string) => Promise<void>; showToast: (msg: string, type?: 'success' | 'error') => void }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [pendingDeactivate, setPendingDeactivate] = useState<Vendor | null>(null);
  const pageSize = 10;
  const [form, setForm] = useState({
    name: '',
    address: '',
    contact_number: '',
    email: '',
    animal_type: 'Both'
  });

  const filteredVendors = useMemo(() => {
    const query = search.trim().toLowerCase();
    return vendors.filter((vendor) => {
      const byQuery = !query || `${vendor.name} ${vendor.contact_number} ${vendor.email} ${vendor.status}`.toLowerCase().includes(query);
      const byStatus = statusFilter === 'All' || vendor.status === statusFilter;
      return byQuery && byStatus;
    });
  }, [vendors, search, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredVendors.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedVendors = filteredVendors.slice((safePage - 1) * pageSize, safePage * pageSize);

  const vendorRecordCount = (vendorId: string) => records.filter((record) => record.vendor_id === vendorId).length;

  const openAdd = () => {
    setEditingVendor(null);
    setForm({ name: '', address: '', contact_number: '', email: '', animal_type: 'Both' });
    setIsAddOpen(true);
  };

  const openEdit = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setForm({ name: vendor.name, address: vendor.address || '', contact_number: vendor.contact_number, email: vendor.email, animal_type: vendor.animal_type });
    setIsAddOpen(true);
  };

  const submitVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (!form.name.trim()) throw new Error('Vendor name is required.');
      if (!form.contact_number.trim()) throw new Error('Contact number is required.');
      if (!form.email.trim()) throw new Error('Email is required.');
      if (!isValidEmail(form.email)) throw new Error('Email must be a valid email address.');
      const payload = { ...form, animal_type: form.animal_type as Vendor['animal_type'] };
      if (editingVendor) {
        await updateVendor(editingVendor.id, payload);
      } else {
        await addVendor(payload);
      }
      setIsAddOpen(false);
      setEditingVendor(null);
      setForm({ name: '', address: '', contact_number: '', email: '', animal_type: 'Both' });
    } catch (error) {
      showToast(getErrorMessage(error, 'Unable to save vendor.'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = (vendor: Vendor) => {
    setPendingDeactivate(vendor);
  };

  const executeDeactivate = async () => {
    if (!pendingDeactivate) return;
    const vendor = pendingDeactivate;
    try {
      await deleteVendor(vendor.id);
      setPendingDeactivate(null);
    } catch (error) {
      showToast(getErrorMessage(error, 'Unable to deactivate vendor.'), 'error');
    }
  };

  const handleReactivate = async (vendor: Vendor) => {
    try {
      await updateVendor(vendor.id, { status: 'Active' });
    } catch (error) {
      showToast(getErrorMessage(error, 'Unable to reactivate vendor.'), 'error');
    }
  };

  return (
    <div className="page-enter space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Vendors</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Vendor records and active slaughter partnerships.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <DensityToggle value={density} onChange={setDensity} />
          <button type="button" onClick={openAdd} className="btn-primary">
            Add Vendor
          </button>
        </div>
      </div>

      <div className="card p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="label">Search</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 text-slate-400" size={16} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} className="input pl-9" placeholder="Search vendor name, contact, or email" />
            </div>
          </div>
          <div>
            <label className="label">Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input">
              <option value="All">All</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card p-4"><TableSkeleton /></div>
      ) : filteredVendors.length === 0 ? (
        <EmptyState title="No vendors found" message="Add a vendor or adjust your search filters." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className={`min-w-full text-left text-sm ${density === 'compact' ? 'table-compact' : 'table-comfortable'}`}>
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-3 font-medium">Vendor Name</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Animal Type</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Date Added</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedVendors.map((vendor) => (
                  <tr key={vendor.id} className="table-row">
                    <td className="px-4 py-3 font-medium">{vendor.name}</td>
                    <td className="tnum px-4 py-3">{vendor.contact_number}</td>
                    <td className="px-4 py-3">{vendor.animal_type}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={vendor.status} />
                    </td>
                    <td className="tnum px-4 py-3">{formatDate(vendor.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setSelectedVendor(vendor)} className="icon-action" aria-label={`View vendor ${vendor.name}`}><Eye size={14} />View</button>
                        <button type="button" onClick={() => openEdit(vendor)} className="icon-action" aria-label={`Edit vendor ${vendor.name}`}><Pencil size={14} />Edit</button>
                        {vendor.status === 'Active' ? (
                          <button type="button" onClick={() => handleDeactivate(vendor)} className="icon-action icon-action-danger">Deactivate</button>
                        ) : (
                          <button type="button" onClick={() => void handleReactivate(vendor)} className="icon-action">Reactivate</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={safePage} totalPages={totalPages} total={filteredVendors.length} pageSize={pageSize} onChange={setPage} />
        </div>
      )}

      {pendingDeactivate && (
        <ConfirmDialog
          title="Deactivate vendor"
          message={`Mark ${pendingDeactivate.name} as inactive? They will stay in history but cannot take new records.`}
          confirmLabel="Deactivate"
          onCancel={() => setPendingDeactivate(null)}
          onConfirm={() => void executeDeactivate()}
        />
      )}

      {selectedVendor && (
        <Modal title="Vendor Details" onClose={() => setSelectedVendor(null)}>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Vendor Name</p>
                <h4 className="mt-2 text-lg font-bold">{selectedVendor.name}</h4>
              </div>
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Status</p>
                <span className="mt-2 inline-flex"><StatusPill status={selectedVendor.status} /></span>
              </div>
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Contact Number</p>
                <p className="mt-2 font-medium">{selectedVendor.contact_number}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Email</p>
                <p className="mt-2 break-all font-medium">{selectedVendor.email}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-4 md:col-span-2 dark:border-slate-700">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Address</p>
                <p className="mt-2 font-medium">{selectedVendor.address || 'No address provided.'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Animal Type</p>
                <p className="mt-2 font-medium">{selectedVendor.animal_type}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Slaughter Records</p>
                <p className="mt-2 font-medium">{vendorRecordCount(selectedVendor.id)}</p>
              </div>
            </div>
            <div className="modal-sticky-footer flex justify-end gap-3">
              <button type="button" onClick={() => { openEdit(selectedVendor); setSelectedVendor(null); }} className="btn-secondary">Edit</button>
              <button type="button" onClick={() => setSelectedVendor(null)} className="btn-primary">Close</button>
            </div>
          </div>
        </Modal>
      )}

      {isAddOpen && (
        <Modal title={editingVendor ? 'Edit Vendor' : 'Add Vendor'} onClose={() => { setIsAddOpen(false); setEditingVendor(null); }}>
          <form onSubmit={submitVendor} className="space-y-4">
            <div className="form-section">
              <p className="form-section-title">Business identity</p>
              <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="label">Vendor Name</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="e.g. Nayon Meat Trading" required />
              </div>
              <div>
                <label className="label">Animal Type</label>
                <select value={form.animal_type} onChange={(e) => setForm({ ...form, animal_type: e.target.value as 'Cow' | 'Pig' | 'Both' })} className="input">
                  <option value="Cow">Cow</option>
                  <option value="Pig">Pig</option>
                  <option value="Both">Both</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="label">Address</label>
                <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="input" placeholder="Street, barangay" />
              </div>
              </div>
            </div>
            <div className="form-section">
              <p className="form-section-title">Contact</p>
              <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="label">Contact Number</label>
                <input value={form.contact_number} onChange={(e) => setForm({ ...form, contact_number: e.target.value })} className="input" placeholder="09xx-xxx-xxxx" required />
              </div>
              <div>
<label className="label">Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" placeholder="vendor@example.com" required />
              </div>
            </div>
            </div>

            <div className="modal-footer flex justify-end gap-3">
              <button type="button" onClick={() => { setIsAddOpen(false); setEditingVendor(null); }} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="btn-primary">{isSubmitting ? 'Saving…' : editingVendor ? 'Update Vendor' : 'Save Vendor'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function NotificationsPage({ notifications, markNotificationRead, markAllNotificationsRead, deleteNotification }: { notifications: NotificationItem[]; markNotificationRead: (id: string) => Promise<void>; markAllNotificationsRead: () => Promise<void>; deleteNotification: (id: string) => Promise<void> }) {
  const [filter, setFilter] = useState<'All' | 'Unread' | 'Read'>('All');
  const unread = notifications.filter((n) => !n.is_read).length;
  const visible = notifications.filter((n) => {
    if (filter === 'Unread') return !n.is_read;
    if (filter === 'Read') return n.is_read;
    return true;
  });

  return (
    <div className="page-enter space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Notifications {unread > 0 && <span className="pill ml-2 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{unread} unread</span>}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Operational alerts and billing reminders.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={filter} onChange={(e) => setFilter(e.target.value as 'All' | 'Unread' | 'Read')} className="input w-auto" aria-label="Filter notifications">
            <option value="All">All</option>
            <option value="Unread">Unread</option>
            <option value="Read">Read</option>
          </select>
          <button type="button" onClick={() => void markAllNotificationsRead()} disabled={unread === 0} className="btn-secondary">Mark all as read</button>
        </div>
      </div>

      <div className="space-y-3">
        {visible.length === 0 ? (
          <EmptyState title={notifications.length === 0 ? 'No notifications' : 'No matching notifications'} message={notifications.length === 0 ? 'You are up to date.' : 'Try a different filter.'} />
        ) : (
          visible.map((notification) => (
            <div key={notification.id} className={`flex items-start justify-between gap-4 rounded-2xl border p-4 ${notification.is_read ? 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900' : 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'}`}>
              <div className="flex min-w-0 gap-3">
                <div className={`mt-1 h-3 w-3 shrink-0 rounded-full ${notification.type === 'info' ? 'bg-sky-500' : notification.type === 'warning' ? 'bg-amber-500' : 'bg-red-500'}`} />
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{notification.type}</span>
                    {!notification.is_read && <span className="pill bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">Unread</span>}
                  </div>
                  <p className="break-words font-medium">{notification.message}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatDate(notification.created_at)}</p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                {!notification.is_read && (
                  <button type="button" onClick={() => void markNotificationRead(notification.id)} className="btn-secondary btn-sm">Mark as read</button>
                )}
                <button type="button" onClick={() => void deleteNotification(notification.id)} className="btn-danger btn-sm">Delete</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ServiceComputationPage({ feeConfig, updateFees, showToast }: { feeConfig: FeeConfig[]; updateFees: (payload: { corralFee: number; deliveryFee: number; antiMortemFee: number; facilityFee: number }) => Promise<void>; showToast: (msg: string, type?: 'success' | 'error') => void }) {
  // B18: look fees up by stable id, never by array position — a backend
  // reorder must not silently misprice the calculator or the reset button.
  // (Rates come from the module-level feesFromConfig/FEE_TYPES in B19.)
  const [form, setForm] = useState({
    ...feesFromConfig(feeConfig),
    cowHeads: 0,
    pigHeads: 0
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      ...feesFromConfig(feeConfig)
    }));
  }, [feeConfig]);

  const safeNum = (v: number) => (Number.isFinite(v) && v >= 0 ? v : 0);
  const totalHeads = safeNum(Number(form.cowHeads || 0)) + safeNum(Number(form.pigHeads || 0));
  const breakdown = {
    corralFee: totalHeads * safeNum(Number(form.corralFee)),
    deliveryFee: totalHeads * safeNum(Number(form.deliveryFee)),
    antiMortemFee: totalHeads * safeNum(Number(form.antiMortemFee)),
    facilityFee: totalHeads * safeNum(Number(form.facilityFee)),
    total: totalHeads * (safeNum(Number(form.corralFee)) + safeNum(Number(form.deliveryFee)) + safeNum(Number(form.antiMortemFee)) + safeNum(Number(form.facilityFee)))
  };

  return (
    <div className="page-enter space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Service Computation</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Fixed fee schedule for slaughterhouse service charges.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="card p-5">
          <h3 className="mb-4 text-lg font-bold">Fixed fee table</h3>
          <div className="space-y-3">
            {feeConfig.length > 0 ? feeConfig.map((fee) => (
              <div key={fee.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <span>{fee.label}</span>
                <strong>{formatCurrency(fee.amount)}</strong>
              </div>
            )) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">Loading fees…</p>
            )}
            <div className="flex items-center justify-between rounded-xl bg-emerald-50 p-3 font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              <span>Total per head</span>
              <span>{formatCurrency(feeConfig.reduce((sum, fee) => sum + Number(fee.amount || 0), 0))}</span>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="mb-4 text-lg font-bold">Fee calculator</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Cow heads</label>
              <input type="number" min={0} value={form.cowHeads} onChange={(e) => setForm({ ...form, cowHeads: Number(e.target.value) })} className="input" />
            </div>
            <div>
              <label className="label">Pig heads</label>
              <input type="number" min={0} value={form.pigHeads} onChange={(e) => setForm({ ...form, pigHeads: Number(e.target.value) })} className="input" />
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Total heads: <strong className="text-slate-800 dark:text-slate-100">{totalHeads}</strong></p>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Corral/Casket Fee</span><strong>{formatCurrency(breakdown.corralFee)}</strong></div>
              <div className="flex justify-between"><span>Delivery Fee</span><strong>{formatCurrency(breakdown.deliveryFee)}</strong></div>
              <div className="flex justify-between"><span>Anti/Post Mortem Fee</span><strong>{formatCurrency(breakdown.antiMortemFee)}</strong></div>
              <div className="flex justify-between"><span>Facility Fee</span><strong>{formatCurrency(breakdown.facilityFee)}</strong></div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold dark:border-slate-700"><span>Total</span><span>{formatCurrency(breakdown.total)}</span></div>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button type="button" onClick={() => setForm((c) => ({ ...c, cowHeads: 0, pigHeads: 0 }))} className="btn-ghost btn-sm">Reset calculator</button>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="mb-4 text-lg font-bold">Update fixed fees</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (isSaving) return;
            setIsSaving(true);
            updateFees({
              corralFee: Number(form.corralFee),
              deliveryFee: Number(form.deliveryFee),
              antiMortemFee: Number(form.antiMortemFee),
              facilityFee: Number(form.facilityFee)
            }).then(() => {
              // success toast handled in parent
            }).catch((err) => {
              showToast(getErrorMessage(err, 'Unable to update fees.'), 'error');
            }).finally(() => setIsSaving(false));
          }}
          className="grid gap-4 md:grid-cols-4"
        >
          <div>
            <label className="label">Corral/Casket Fee</label>
            <input type="number" step="0.01" min={0} value={form.corralFee} onChange={(e) => setForm({ ...form, corralFee: Number(e.target.value) })} className="input" required />
          </div>
          <div>
            <label className="label">Delivery Fee</label>
            <input type="number" step="0.01" min={0} value={form.deliveryFee} onChange={(e) => setForm({ ...form, deliveryFee: Number(e.target.value) })} className="input" required />
          </div>
          <div>
            <label className="label">Anti/Post Mortem Fee</label>
            <input type="number" step="0.01" min={0} value={form.antiMortemFee} onChange={(e) => setForm({ ...form, antiMortemFee: Number(e.target.value) })} className="input" required />
          </div>
          <div>
            <label className="label">Facility Fee</label>
            <input type="number" step="0.01" min={0} value={form.facilityFee} onChange={(e) => setForm({ ...form, facilityFee: Number(e.target.value) })} className="input" required />
          </div>
          <div className="md:col-span-4 flex flex-wrap justify-end gap-3">
            <button type="button" onClick={() => {
              setForm((current) => ({
                ...current,
                ...feesFromConfig(feeConfig)
              }));
            }} className="btn-secondary">Reset</button>
            <button type="submit" disabled={isSaving} className="btn-primary">{isSaving ? 'Saving…' : 'Save Fee Settings'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Pagination({ page, totalPages, total, pageSize, onChange }: { page: number; totalPages: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  if (total <= pageSize && totalPages <= 1) {
    return (
      <div className="tnum border-t border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
        Showing {total} of {total} record(s)
      </div>
    );
  }
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/60 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-800/40">
      <span className="tnum text-slate-500 dark:text-slate-400">Showing {from}–{to} of {total}</span>
      <div className="flex items-center gap-2">
        <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} className="btn-secondary btn-sm">Prev</button>
        <span className="tnum rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">Page {page} / {totalPages}</span>
        <button type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)} className="btn-secondary btn-sm">Next</button>
      </div>
    </div>
  );
}

function LoadingDashboard() {
  return (
    <div className="page-enter space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card h-28 overflow-hidden p-4">
            <div className="shimmer h-4 w-2/3 rounded-lg" />
            <div className="shimmer mt-3 h-8 w-1/2 rounded-lg" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="card h-80 overflow-hidden p-5">
          <div className="shimmer h-5 w-1/3 rounded-lg" />
          <div className="shimmer mt-4 h-56 rounded-xl" />
        </div>
        <div className="card h-80 overflow-hidden p-5">
          <div className="shimmer h-5 w-1/3 rounded-lg" />
          <div className="shimmer mt-4 h-56 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="shimmer h-12 rounded-xl" />
      ))}
    </div>
  );
}

function ChartEmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="chart-empty">
      <span className="chart-empty-symbol"><BarChart3 size={24} strokeWidth={1.3} /></span>
      <strong>{title}</strong>
      <p>{message}</p>
    </div>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center gap-2 p-8 text-center">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-emerald-700 dark:border-slate-700 dark:bg-slate-800 dark:text-emerald-300">
        <BarChart3 size={22} strokeWidth={1.4} />
      </div>
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">{message}</p>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto p-4">
      <button type="button" aria-label="Close dialog" onClick={onClose} className="overlay-enter fixed inset-0 bg-slate-950/55 backdrop-blur-sm" />
      <div className="relative flex min-h-full items-center justify-center">
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} className="modal-panel-enter relative flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-lift dark:border-slate-700 dark:bg-slate-900">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200/70 px-5 pb-4 pt-5 dark:border-slate-700/70 md:px-6 md:pt-6">
          <div className="flex items-center gap-3">
            <div className="h-8 w-1.5 rounded-full bg-gradient-to-b from-emerald-400 to-emerald-700" />
            <h3 className="text-xl font-extrabold tracking-tight">{title}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="btn-secondary btn-sm">
            <X size={14} /> Close
          </button>
        </div>
        <div className="modal-body-scroll px-5 pb-5 pt-5 md:px-6 md:pb-6">{children}</div>
      </div>
      </div>
    </div>
  );
}

export default App;
