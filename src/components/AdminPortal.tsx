// src/components/AdminPortal.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  PayBasis,
  PeriodFilter,
  SundayMode,
  WageConfig,
  OtPaymentRecord,
  DEFAULT_WAGE_CONFIG,
  convertWageRates,
  evaluateWorkerPeriodLogs,
  getDateRangeForPeriod,
  getRegularSundayQuota,
} from '@/lib/payroll';

export interface TeamMember {
  id: number;
  user_id: string;
  full_name: string;
  role: string;
  designations?: string;
  card_id?: string | null;
}

export interface AttendanceRecord {
  id: number;
  worker_id: string;
  worker_name?: string;
  designations?: string;
  date: string;
  clock_in: string;
  clock_out: string | null;
  status: string;
  regular_hours?: string | number;
  overtime_hours?: string | number;
  sunday_mode?: SundayMode | null;
  sunday_coverage_hours?: number | string | null;
}

export interface ProjectBrief {
  id: number;
  client_name: string;
  service_type: string;
  deadline?: string;
  description: string;
  phone?: string;
  status?: string;
}

type AdminTab =
  | 'attendance'
  | 'inspector'
  | 'wages'
  | 'payroll'
  | 'cards'
  | 'leads'
  | 'register';

interface AdminPortalProps {
  teamMembers: TeamMember[];
  attendanceLogs: AttendanceRecord[];
  projectBriefs: ProjectBrief[];
  wageProfiles: Record<string, WageConfig>;
  otPayments: Record<string, OtPaymentRecord>;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export default function AdminPortal({
  teamMembers,
  attendanceLogs,
  projectBriefs,
  wageProfiles,
  otPayments,
  isRefreshing,
  onRefresh,
}: AdminPortalProps) {
  const todayStr = useMemo(
    () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date()),
    []
  );

  const [adminTab, setAdminTab] = useState<AdminTab>('attendance');
  const [attendanceSearch, setAttendanceSearch] = useState('');

  // Period & Worker Filter State
  const [period, setPeriod] = useState<PeriodFilter>('month');
  const [anchorDate, setAnchorDate] = useState<string>(todayStr);
  const [customStart, setCustomStart] = useState<string>(todayStr.slice(0, 8) + '01');
  const [customEnd, setCustomEnd] = useState<string>(todayStr);
  const [selectedWorkerFilter, setSelectedWorkerFilter] = useState<string>('ALL');

  // Manual Add / Edit Shift Modal
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualForm, setManualForm] = useState<{
    record_id: number | null;
    worker_id: string;
    date: string;
    clock_in: string;
    clock_out: string;
    status: string;
  }>({
    record_id: null,
    worker_id: '',
    date: todayStr,
    clock_in: '09:00:00',
    clock_out: '21:00:00',
    status: 'Completed',
  });

  // Shift & Wage Config Modal State
  const [editingWageWorker, setEditingWageWorker] = useState<TeamMember | null>(null);
  const [isSavingWage, setIsSavingWage] = useState(false);
  const [wageForm, setWageForm] = useState<WageConfig>({
    worker_id: '',
    ...DEFAULT_WAGE_CONFIG,
  });

  // Paid Overtime Modal State
  const [editingOtWorker, setEditingOtWorker] = useState<{
    member: TeamMember;
    totalOtHours: number;
    totalOtEarned: number;
    otHourlyRate: number;
  } | null>(null);
  const [otPaymentForm, setOtPaymentForm] = useState<{
    paid_ot_hours: number;
    paid_ot_amount: number;
    notes: string;
  }>({
    paid_ot_hours: 0,
    paid_ot_amount: 0,
    notes: '',
  });

  // NFC Card Pairing Modal State
  const [selectedCardWorker, setSelectedCardWorker] = useState<TeamMember | null>(null);
  const [isNfcModalOpen, setIsNfcModalOpen] = useState(false);
  const [nfcInput, setNfcInput] = useState('');
  const [nfcStatus, setNfcStatus] = useState<{
    message: string;
    type: 'idle' | 'loading' | 'success' | 'error';
  }>({ message: '', type: 'idle' });

  const getProfile = (workerId: string): WageConfig => {
    const clean = String(workerId || '').trim();
    return (
      wageProfiles[clean] || {
        worker_id: clean,
        ...DEFAULT_WAGE_CONFIG,
      }
    );
  };

  const modalConvertedPreview = useMemo(() => convertWageRates(wageForm), [wageForm]);

  const dateWindow = useMemo(
    () => getDateRangeForPeriod(period, anchorDate, customStart, customEnd),
    [period, anchorDate, customStart, customEnd]
  );

  // Evaluate each worker across the selected period using the full Sunday Quota & Coverage/OT engine
  const payrollMatrix = useMemo(() => {
    return teamMembers.map((member) => {
      const wid = String(member.user_id).trim();
      const profile = getProfile(wid);

      const workerLogs = attendanceLogs.filter((l) => {
        const d = String(l.date || '').slice(0, 10);
        return (
          String(l.worker_id).trim() === wid &&
          d >= dateWindow.startDate &&
          d <= dateWindow.endDate
        );
      });

      const report = evaluateWorkerPeriodLogs(workerLogs, profile);
      const paidRecord = otPayments[wid] || {
        worker_id: wid,
        period_key: 'CURRENT',
        paid_ot_hours: 0,
        paid_ot_amount: 0,
        notes: '',
      };

      const unpaidOtHours = Number(
        Math.max(0, report.totalOvertimeHours - Number(paidRecord.paid_ot_hours || 0)).toFixed(2)
      );
      const unpaidOtAmount = Math.max(
        0,
        report.totalOvertimePay - Math.round(Number(paidRecord.paid_ot_amount || 0))
      );

      return {
        member,
        profile,
        report,
        paidRecord,
        unpaidOtHours,
        unpaidOtAmount,
        balancePayableAfterOtPaid: Math.max(
          0,
          report.netPayout - Math.round(Number(paidRecord.paid_ot_amount || 0))
        ),
      };
    });
  }, [teamMembers, attendanceLogs, wageProfiles, otPayments, dateWindow]);

  // Lookup map of evaluated shift logs by attendance record ID so all tables show exact Sunday Coverage/OT split
  const evaluatedLogById = useMemo(() => {
    const map = new Map<number, any>();
    payrollMatrix.forEach((item) => {
      item.report.evaluatedRows.forEach(({ log, ev }) => {
        map.set(log.id, ev);
      });
    });
    return map;
  }, [payrollMatrix]);

  const periodLogs = useMemo(() => {
    return attendanceLogs.filter((log) => {
      const logDate = String(log.date || '').slice(0, 10);
      const inDateRange = logDate >= dateWindow.startDate && logDate <= dateWindow.endDate;
      const matchesWorker =
        selectedWorkerFilter === 'ALL' ||
        String(log.worker_id).trim() === String(selectedWorkerFilter).trim();
      return inDateRange && matchesWorker;
    });
  }, [attendanceLogs, dateWindow, selectedWorkerFilter]);

  // Handler to change a Sunday shift's allocation mode (OVERTIME, COVERAGE, AUTO_SPLIT, CUSTOM_SPLIT, REGULAR)
  const handleUpdateSundayMode = async (
    record: AttendanceRecord,
    mode: SundayMode,
    askCustomHours?: boolean
  ) => {
    let covHours = Number(record.sunday_coverage_hours || 0);
    if (mode === 'CUSTOM_SPLIT' || askCustomHours) {
      const input = prompt(
        `Enter how many hours from this Sunday shift (${record.date}) should be used to COVER SHORT HOURS.\nAny remaining worked hours on this Sunday will be paid as OVERTIME:`,
        String(covHours || 3)
      );
      if (input === null) return;
      covHours = Math.max(0, parseFloat(input) || 0);
    }

    try {
      const res = await fetch('/api/attendance/sunday-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          record_id: record.id,
          sunday_mode: mode,
          sunday_coverage_hours: covHours,
        }),
      });
      if (res.ok) {
        onRefresh();
      } else {
        alert('Failed to update Sunday mode');
      }
    } catch {
      alert('Network error');
    }
  };

  // Save Paid Overtime record
  const handleSaveOtPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOtWorker) return;
    try {
      const res = await fetch('/api/admin/ot-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_id: editingOtWorker.member.user_id,
          period_key: 'CURRENT',
          paid_ot_hours: otPaymentForm.paid_ot_hours,
          paid_ot_amount: otPaymentForm.paid_ot_amount,
          notes: otPaymentForm.notes,
        }),
      });
      if (res.ok) {
        setEditingOtWorker(null);
        onRefresh();
      } else {
        alert('Failed to save OT payment');
      }
    } catch {
      alert('Network error');
    }
  };

  // NFC Enrollment Listener when Card Modal is open
  useEffect(() => {
    if (!isNfcModalOpen || !selectedCardWorker) return;

    let buffer = '';
    let flushTimer: NodeJS.Timeout;

    const pairScannedCard = async (rawId: string) => {
      const clean = rawId.replace(/\D/g, '').trim();
      if (clean.length < 4) return;
      setNfcInput(clean);
      setNfcStatus({ message: `Card ${clean} detected. Pairing...`, type: 'loading' });

      try {
        const res = await fetch('/api/users/assign-card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: selectedCardWorker.user_id, cardId: clean }),
        });
        const data = await res.json();
        if (res.ok) {
          setNfcStatus({
            message: `Card ${clean} paired with ${selectedCardWorker.full_name}!`,
            type: 'success',
          });
          onRefresh();
          setTimeout(() => {
            setIsNfcModalOpen(false);
            setSelectedCardWorker(null);
          }, 1000);
        } else {
          setNfcStatus({ message: data.error || 'Failed to pair card', type: 'error' });
        }
      } catch {
        setNfcStatus({ message: 'Network error while pairing card', type: 'error' });
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (buffer.length >= 4) pairScannedCard(buffer);
        buffer = '';
        clearTimeout(flushTimer);
        return;
      }
      if (/^\d$/.test(e.key)) {
        buffer += e.key;
        clearTimeout(flushTimer);
        flushTimer = setTimeout(() => {
          if (buffer.length >= 4) pairScannedCard(buffer);
          buffer = '';
        }, 150);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(flushTimer);
    };
  }, [isNfcModalOpen, selectedCardWorker, onRefresh]);

  const handleAdminClockOut = async (record: AttendanceRecord) => {
    const defaultNow = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Karachi',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date());

    const outTimeInput = prompt(
      `Sign Out ${record.worker_name || record.worker_id}\n(Supports cross-midnight e.g. 01:30:00):`,
      defaultNow
    );
    if (!outTimeInput) return;

    try {
      const res = await fetch('/api/attendance/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CLOCK_OUT',
          record_id: record.id,
          worker_id: record.worker_id,
          clock_in: record.clock_in,
          clock_out: outTimeInput.trim(),
        }),
      });
      if (res.ok) onRefresh();
    } catch {}
  };

  const handleDeleteShift = async (id: number) => {
    if (!confirm('Delete this attendance record permanently?')) return;
    try {
      const res = await fetch('/api/attendance/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'DELETE_ENTRY', record_id: id }),
      });
      if (res.ok) onRefresh();
    } catch {}
  };

  const handleSaveManualRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/attendance/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SAVE_ENTRY',
          ...manualForm,
        }),
      });
      if (res.ok) {
        setIsManualModalOpen(false);
        onRefresh();
      }
    } catch {}
  };

  const handleSaveWageConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWageWorker) return;
    setIsSavingWage(true);
    try {
      const res = await fetch('/api/users/wage-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...wageForm,
          worker_id: editingWageWorker.user_id,
        }),
      });
      if (res.ok) {
        setEditingWageWorker(null);
        onRefresh();
      }
    } finally {
      setIsSavingWage(false);
    }
  };

  const activeFloorCount = useMemo(
    () => attendanceLogs.filter((l) => !l.clock_out).length,
    [attendanceLogs]
  );

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* TOP KPI STRIP */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Active on Floor
            </p>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <p className="text-4xl font-black text-emerald-600 mt-2">{activeFloorCount}</p>
          <p className="text-[11px] text-slate-400 font-semibold mt-1">
            Currently signed in (includes overnight)
          </p>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Total Registered Crew
          </p>
          <p className="text-4xl font-black text-[#FF6600] mt-2">{teamMembers.length}</p>
          <p className="text-[11px] text-slate-400 font-semibold mt-1">
            {teamMembers.filter((m) => m.card_id).length} NFC cards paired
          </p>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Period Net Payroll
          </p>
          <p className="text-3xl font-black font-mono text-black mt-2">
            Rs.{' '}
            {payrollMatrix
              .reduce((acc, r) => acc + r.report.netPayout, 0)
              .toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-400 font-semibold mt-1 truncate">
            Window: {dateWindow.label}
          </p>
        </div>

        <div className="bg-black text-white p-6 rounded-3xl shadow-xl flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-[#FF6600]">
              Johar Mor Gate
            </span>
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="text-xs text-slate-300 hover:text-white font-mono underline"
            >
              {isRefreshing ? 'Syncing...' : 'Sync Now ↻'}
            </button>
          </div>
          <div>
            <button
              onClick={() => {
                setManualForm({
                  record_id: null,
                  worker_id: teamMembers[0]?.user_id || '',
                  date: todayStr,
                  clock_in: '09:00:00',
                  clock_out: '21:00:00',
                  status: 'Completed',
                });
                setIsManualModalOpen(true);
              }}
              className="w-full mt-2 bg-[#FF6600] hover:bg-white hover:text-black text-white py-2.5 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all"
            >
              + Manual Shift Entry
            </button>
          </div>
        </div>
      </div>

      {/* NAVIGATION TABS */}
      <div className="flex border-b border-slate-200 space-x-2 overflow-x-auto no-scrollbar">
        {(
          [
            { id: 'attendance', label: '⚡ Live Punches & Sunday Toggle' },
            { id: 'inspector', label: '📅 Shift & Sunday Inspector' },
            { id: 'wages', label: '⚙️ Shift Timings & 26/28/30d Master' },
            { id: 'payroll', label: '💰 Payroll, Coverage & Paid OT' },
            { id: 'cards', label: '🪪 NFC Card Pairing' },
            { id: 'leads', label: `📬 Client Inquiries (${projectBriefs.length})` },
            { id: 'register', label: '➕ Register Staff' },
          ] as { id: AdminTab; label: string }[]
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setAdminTab(tab.id)}
            className={`pb-4 px-4 font-black text-xs uppercase tracking-wider whitespace-nowrap transition-all border-b-2 ${
              adminTab === tab.id
                ? 'border-[#FF6600] text-[#FF6600]'
                : 'border-transparent text-slate-400 hover:text-black'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* SHARED PERIOD FILTER BAR */}
      {(adminTab === 'inspector' || adminTab === 'payroll') && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-black">
                Period & Staff Filter
              </h3>
              <p className="text-xs text-slate-400 font-semibold">
                Analyzing: <strong className="text-[#FF6600]">{dateWindow.label}</strong>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { id: 'day', label: 'Daily' },
                  { id: 'week', label: 'Weekly' },
                  { id: 'fortnightly', label: 'Fortnightly (15d)' },
                  { id: 'month', label: 'Monthly' },
                  { id: 'custom', label: 'Custom Range' },
                ] as { id: PeriodFilter; label: string }[]
              ).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setPeriod(t.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                    period === t.id
                      ? 'bg-[#FF6600] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-3">
              {period !== 'custom' ? (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase text-slate-400">Date:</span>
                  <input
                    type="date"
                    value={anchorDate}
                    onChange={(e) => setAnchorDate(e.target.value)}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold"
                  />
                  <button
                    onClick={() => setAnchorDate(todayStr)}
                    className="px-3 py-2 bg-orange-50 text-[#FF6600] border border-orange-200 rounded-xl text-xs font-bold"
                  >
                    Today
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase text-slate-400">From:</span>
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase text-slate-400">To:</span>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold"
                    />
                  </div>
                </div>
              )}

              <select
                value={selectedWorkerFilter}
                onChange={(e) => setSelectedWorkerFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-[#FF6600]"
              >
                <option value="ALL">All Staff Members ({teamMembers.length})</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={String(m.user_id).trim()}>
                    {m.full_name} (#{m.user_id})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: LIVE ATTENDANCE FEED + SUNDAY ALLOCATION TOGGLE */}
      {adminTab === 'attendance' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-black">
                Live Gate Punches & Sunday Coverage/OT Controls
              </h2>
              <p className="text-xs text-slate-400 font-semibold mt-0.5">
                Any Sunday shift shows interactive buttons to toggle between Overtime, Shortfall
                Coverage, or Split (Both)
              </p>
            </div>
            <input
              type="text"
              value={attendanceSearch}
              onChange={(e) => setAttendanceSearch(e.target.value)}
              placeholder="Search by worker name, ID, or date..."
              className="w-full sm:w-80 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-[#FF6600]"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[980px]">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="pb-3 pl-2">Worker</th>
                  <th className="pb-3">Shift Date</th>
                  <th className="pb-3">Tap In / Out</th>
                  <th className="pb-3">Should Be</th>
                  <th className="pb-3">Given / Allocation</th>
                  <th className="pb-3">Sunday Usage Toggle</th>
                  <th className="pb-3">Day Pay</th>
                  <th className="pb-3 text-right pr-2">Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-semibold">
                {attendanceLogs
                  .filter(
                    (l) =>
                      l.worker_name?.toLowerCase().includes(attendanceSearch.toLowerCase()) ||
                      l.worker_id.includes(attendanceSearch) ||
                      l.date.includes(attendanceSearch)
                  )
                  .slice(0, 100)
                  .map((log) => {
                    const profile = getProfile(log.worker_id);
                    const ev =
                      evaluatedLogById.get(log.id) ||
                      evaluateWorkerPeriodLogs([log], profile).evaluatedRows[0].ev;

                    return (
                      <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-4 pl-2">
                          <span className="font-bold text-black block">
                            {log.worker_name || 'Staff'}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">
                            ID: #{log.worker_id} ({profile.working_days_month}d/mo)
                          </span>
                        </td>
                        <td className="py-4 font-mono text-slate-700">
                          {log.date}
                          {ev.isSunday && (
                            <span
                              className={`ml-1.5 px-2 py-0.5 rounded text-[9px] font-sans font-black uppercase ${
                                ev.treatAsOffSunday
                                  ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                  : 'bg-blue-50 text-blue-700 border border-blue-200'
                              }`}
                            >
                              {ev.treatAsOffSunday ? '☀️ Off-Sunday' : '📅 Reg-Sunday'}
                            </span>
                          )}
                          {ev.crossedMidnight && (
                            <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-sans">
                              🌙 +1d
                            </span>
                          )}
                        </td>
                        <td className="py-4 font-mono">
                          <span className="text-emerald-600 font-bold">{log.clock_in}</span>
                          <span className="text-slate-400 mx-1">→</span>
                          <span className="text-blue-600 font-bold">
                            {log.clock_out || 'Active'}
                          </span>
                        </td>
                        <td className="py-4 font-mono text-slate-500">
                          {ev.expectedHours}h
                          {ev.treatAsOffSunday && (
                            <span className="block text-[9px] text-purple-600">
                              (Not in 26d quota)
                            </span>
                          )}
                        </td>
                        <td className="py-4 font-mono">
                          {log.clock_out ? (
                            <div>
                              <span className="font-bold text-black">{ev.totalGivenHours}h</span>
                              {ev.coverageHours > 0 && (
                                <span className="text-blue-600 font-bold ml-1">
                                  ({ev.coverageHours}h Cover)
                                </span>
                              )}
                              {ev.overtimeHours > 0 && (
                                <span className="text-emerald-600 font-bold ml-1">
                                  (+{ev.overtimeHours}h OT)
                                </span>
                              )}
                              {ev.shortfallHours > 0 && (
                                <span className="text-red-500 ml-1">
                                  (-{ev.shortfallHours}h Short)
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[#FF6600] font-bold">In Progress</span>
                          )}
                        </td>
                        <td className="py-4">
                          {ev.isSunday ? (
                            <div className="flex flex-wrap gap-1">
                              {(
                                [
                                  { id: 'AUTO_SPLIT', label: 'Auto Cover+OT' },
                                  { id: 'OVERTIME', label: '100% OT' },
                                  { id: 'COVERAGE', label: '100% Cover' },
                                  { id: 'CUSTOM_SPLIT', label: 'Split Hrs' },
                                  { id: 'REGULAR', label: 'Reg Day' },
                                ] as { id: SundayMode; label: string }[]
                              ).map((btn) => (
                                <button
                                  key={btn.id}
                                  onClick={() =>
                                    handleUpdateSundayMode(
                                      log,
                                      btn.id,
                                      btn.id === 'CUSTOM_SPLIT'
                                    )
                                  }
                                  className={`px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all ${
                                    (log.sunday_mode || 'AUTO_SPLIT') === btn.id
                                      ? 'bg-[#FF6600] text-white'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                  }`}
                                >
                                  {btn.label}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400">Standard Shift</span>
                          )}
                        </td>
                        <td className="py-4 font-mono font-black text-black">
                          {log.clock_out ? `Rs. ${ev.netPay.toLocaleString()}` : '—'}
                        </td>
                        <td className="py-4 pr-2 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {!log.clock_out && (
                              <button
                                onClick={() => handleAdminClockOut(log)}
                                className="bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-200 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase"
                              >
                                Sign Out
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setManualForm({
                                  record_id: log.id,
                                  worker_id: log.worker_id,
                                  date: log.date,
                                  clock_in: log.clock_in,
                                  clock_out: log.clock_out || '',
                                  status: log.status || 'Completed',
                                });
                                setIsManualModalOpen(true);
                              }}
                              className="px-2 py-1 bg-slate-100 hover:bg-black hover:text-white rounded-lg text-[10px] font-bold uppercase"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteShift(log.id)}
                              className="px-1.5 py-1 text-slate-400 hover:text-red-600 text-xs font-bold"
                            >
                              🗑
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: TIME & SHIFT INSPECTOR */}
      {adminTab === 'inspector' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-black text-black">
                Shift & Sunday Allocation Inspector
              </h2>
              <p className="text-xs text-slate-400 font-semibold">
                Showing {periodLogs.length} shift logs for {dateWindow.label}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {periodLogs.map((record) => {
              const profile = getProfile(record.worker_id);
              const ev =
                evaluatedLogById.get(record.id) ||
                evaluateWorkerPeriodLogs([record], profile).evaluatedRows[0].ev;

              return (
                <div
                  key={record.id}
                  className="p-6 rounded-3xl border border-slate-200 hover:border-[#FF6600] bg-white shadow-sm transition-all space-y-4"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-black text-base text-black">
                        {record.worker_name || `Worker #${record.worker_id}`}
                      </h4>
                      <p className="text-[10px] font-mono text-slate-400">
                        Date: {record.date} • Schedule: {profile.working_days_month}d/mo
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {ev.isSunday && (
                        <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase bg-purple-50 text-purple-700 border border-purple-200">
                          {ev.treatAsOffSunday ? '☀️ Off-Day Sunday' : '📅 Regular Sunday'}
                        </span>
                      )}
                      <button
                        onClick={() => {
                          setManualForm({
                            record_id: record.id,
                            worker_id: record.worker_id,
                            date: record.date,
                            clock_in: record.clock_in,
                            clock_out: record.clock_out || '',
                            status: record.status || 'Completed',
                          });
                          setIsManualModalOpen(true);
                        }}
                        className="text-xs font-bold text-slate-400 hover:text-black px-2"
                      >
                        ✎ Edit
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-100 font-mono">
                    <div>
                      <span className="text-[9px] font-sans font-black uppercase text-slate-400 block">
                        Tap In / Out
                      </span>
                      <strong className="text-black">
                        {record.clock_in.slice(0, 5)}–{record.clock_out?.slice(0, 5) || 'Active'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[9px] font-sans font-black uppercase text-slate-400 block">
                        Should / Given
                      </span>
                      <strong className="text-black">
                        {ev.expectedHours}h / {ev.totalGivenHours}h
                      </strong>
                    </div>
                    <div>
                      <span className="text-[9px] font-sans font-black uppercase text-slate-400 block">
                        Cover Used
                      </span>
                      <strong className="text-blue-600">{ev.coverageHours}h</strong>
                    </div>
                    <div>
                      <span className="text-[9px] font-sans font-black uppercase text-slate-400 block">
                        OT / Short
                      </span>
                      {ev.overtimeHours > 0 ? (
                        <strong className="text-emerald-600">+{ev.overtimeHours}h OT</strong>
                      ) : ev.shortfallHours > 0 ? (
                        <strong className="text-red-500">-{ev.shortfallHours}h Short</strong>
                      ) : (
                        <strong className="text-slate-400">0.0h</strong>
                      )}
                    </div>
                  </div>

                  {/* Sunday Allocation Quick Toggle inside Inspector Card */}
                  {ev.isSunday && (
                    <div className="bg-purple-50/60 border border-purple-200/80 p-3 rounded-2xl flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase text-purple-800">
                        Sunday Mode:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {(
                          [
                            { id: 'AUTO_SPLIT', label: 'Auto Cover+OT' },
                            { id: 'OVERTIME', label: 'Full OT' },
                            { id: 'COVERAGE', label: 'Full Coverage' },
                            { id: 'CUSTOM_SPLIT', label: 'Custom Split (e.g. 3h)' },
                            { id: 'REGULAR', label: 'Count as Regular' },
                          ] as { id: SundayMode; label: string }[]
                        ).map((m) => (
                          <button
                            key={m.id}
                            onClick={() =>
                              handleUpdateSundayMode(record, m.id, m.id === 'CUSTOM_SPLIT')
                            }
                            className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase ${
                              (record.sunday_mode || 'AUTO_SPLIT') === m.id
                                ? 'bg-purple-700 text-white'
                                : 'bg-white text-purple-700 border border-purple-200'
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: STAFF SHIFT TIMINGS & 26/28/30 WORKING DAYS MASTER */}
      {adminTab === 'wages' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-black">
              Staff Shift Timings & 26 / 28 / 30 Working Days Master
            </h2>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">
              • 26 Days = 4 Sundays Off (Sundays excluded from expected hours, used for OT/Coverage)
              • 28 Days = 2 Sundays Regular + 2 Sundays OT/Coverage • 30 Days = All Sundays Regular
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[980px]">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="pb-3 pl-2">Employee</th>
                  <th className="pb-3">Shift & Sunday Rule</th>
                  <th className="pb-3">Selected Base</th>
                  <th className="pb-3">Monthly Eq.</th>
                  <th className="pb-3">Weekly Eq.</th>
                  <th className="pb-3">Daily Eq.</th>
                  <th className="pb-3">Hourly / OT</th>
                  <th className="pb-3 text-right pr-2">Configure</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-semibold">
                {teamMembers.map((member) => {
                  const profile = getProfile(member.user_id);
                  const rates = convertWageRates(profile);
                  const regSunQuota = getRegularSundayQuota(profile.working_days_month);

                  return (
                    <tr key={member.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-4 pl-2">
                        <span className="font-bold text-black block">{member.full_name}</span>
                        <span className="font-mono text-[10px] text-slate-400">
                          ID: #{member.user_id} • {member.designations}
                        </span>
                      </td>
                      <td className="py-4 font-mono">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 font-bold text-black">
                          {profile.shift_start} – {profile.shift_end} ({rates.shiftDurationHours}h)
                        </span>
                        <span className="block text-[10px] text-purple-700 font-sans font-bold mt-1">
                          {profile.working_days_month}d/mo:{' '}
                          {regSunQuota === 0
                            ? 'All 4 Sundays Off (OT/Cover)'
                            : regSunQuota >= 4
                            ? 'All Sundays Regular'
                            : `${regSunQuota} Sun Regular + ${4 - regSunQuota} Sun OT/Cover`}
                        </span>
                      </td>
                      <td className="py-4">
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-orange-50 text-[#FF6600] border border-orange-200">
                          {profile.pay_type}: Rs. {Number(profile.base_rate).toLocaleString()}
                        </span>
                      </td>
                      <td className="py-4 font-mono font-bold text-black">
                        Rs. {rates.monthlyRate.toLocaleString()}
                      </td>
                      <td className="py-4 font-mono text-slate-700">
                        Rs. {rates.weeklyRate.toLocaleString()}
                      </td>
                      <td className="py-4 font-mono text-slate-700">
                        Rs. {rates.dailyRate.toLocaleString()}/d
                      </td>
                      <td className="py-4 font-mono">
                        <span className="font-bold text-black">Rs. {rates.hourlyRate}/h</span>
                        <span className="block text-[10px] text-[#FF6600] font-bold">
                          OT: Rs. {rates.otHourlyRate}/h
                        </span>
                      </td>
                      <td className="py-4 pr-2 text-right">
                        <button
                          onClick={() => {
                            setEditingWageWorker(member);
                            setWageForm(profile);
                          }}
                          className="bg-black hover:bg-[#FF6600] text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
                        >
                          Configure
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: PAYROLL, SUNDAY COVERAGE & PAID OVERTIME LEDGER */}
      {adminTab === 'payroll' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-black">
              Payroll, Sunday Coverage & Paid Overtime Ledger
            </h2>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">
              Tracks Regular Expected Hours (excluding off-Sundays for 26d workers), Sunday
              Coverage applied to Shortfall, Earned Overtime, and Paid Overtime status
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1050px]">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="pb-3 pl-2">Employee</th>
                  <th className="pb-3">Should Be (Reg)</th>
                  <th className="pb-3">Given (Reg + Sun)</th>
                  <th className="pb-3">Shortfall & Sun Cover</th>
                  <th className="pb-3">Total OT Earned</th>
                  <th className="pb-3">OT Paid Out</th>
                  <th className="pb-3">Unpaid OT Balance</th>
                  <th className="pb-3 text-right pr-2">Total Net Salary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-semibold">
                {payrollMatrix
                  .filter(
                    (row) =>
                      selectedWorkerFilter === 'ALL' ||
                      String(row.member.user_id).trim() === String(selectedWorkerFilter).trim()
                  )
                  .map((row) => {
                    const r = row.report;
                    return (
                      <tr key={row.member.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-4 pl-2">
                          <span className="font-bold text-black block">{row.member.full_name}</span>
                          <span className="font-mono text-[10px] text-slate-400">
                            {row.profile.working_days_month}d/mo • Rs.{r.rates.hourlyRate}/h (OT Rs.
                            {r.rates.otHourlyRate}/h)
                          </span>
                        </td>
                        <td className="py-4 font-mono text-slate-700">
                          <strong>{r.expectedPresentHours}h</strong>
                          <span className="block text-[9px] text-slate-400">
                            ({r.completedShifts - r.offDaySundaysWorked} reg shifts)
                          </span>
                        </td>
                        <td className="py-4 font-mono">
                          <strong className="text-black">{r.totalGivenHours}h total</strong>
                          {r.sundayTotalWorkedHours > 0 && (
                            <span className="block text-[10px] text-purple-700 font-bold">
                              ☀️ Off-Sun Worked: {r.sundayTotalWorkedHours}h
                            </span>
                          )}
                        </td>
                        <td className="py-4 font-mono">
                          <span className="text-slate-500 block text-[10px]">
                            Gross Short: -{r.grossShortfallHours}h
                          </span>
                          {r.sundayCoverageHoursUsed > 0 && (
                            <span className="text-blue-600 font-bold block text-[10px]">
                              ✓ Covered by Sun: +{r.sundayCoverageHoursUsed}h
                            </span>
                          )}
                          <span
                            className={`font-bold ${
                              r.netShortfallHours > 0 ? 'text-red-500' : 'text-emerald-600'
                            }`}
                          >
                            Net Short: -{r.netShortfallHours}h
                          </span>
                        </td>
                        <td className="py-4 font-mono">
                          <strong className="text-emerald-600">+{r.totalOvertimeHours}h OT</strong>
                          <span className="block text-[10px] font-bold text-black">
                            Rs. {r.totalOvertimePay.toLocaleString()}
                          </span>
                        </td>
                        <td className="py-4 font-mono">
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold block w-fit">
                            Paid: {row.paidRecord.paid_ot_hours}h (Rs.{' '}
                            {Number(row.paidRecord.paid_ot_amount).toLocaleString()})
                          </span>
                          <button
                            onClick={() => {
                              setEditingOtWorker({
                                member: row.member,
                                totalOtHours: r.totalOvertimeHours,
                                totalOtEarned: r.totalOvertimePay,
                                otHourlyRate: r.rates.otHourlyRate,
                              });
                              setOtPaymentForm({
                                paid_ot_hours: Number(row.paidRecord.paid_ot_hours || 0),
                                paid_ot_amount: Number(row.paidRecord.paid_ot_amount || 0),
                                notes: row.paidRecord.notes || '',
                              });
                            }}
                            className="mt-1 text-[10px] font-black uppercase text-[#FF6600] hover:underline"
                          >
                            ✎ Record OT Payout
                          </button>
                        </td>
                        <td className="py-4 font-mono">
                          <strong
                            className={
                              row.unpaidOtAmount > 0 ? 'text-[#FF6600]' : 'text-slate-400'
                            }
                          >
                            {row.unpaidOtHours}h (Rs. {row.unpaidOtAmount.toLocaleString()})
                          </strong>
                        </td>
                        <td className="py-4 pr-2 text-right font-mono">
                          <strong className="text-base font-black text-black block">
                            Rs. {r.netPayout.toLocaleString()}
                          </strong>
                          {Number(row.paidRecord.paid_ot_amount) > 0 && (
                            <span className="text-[10px] text-slate-500 block">
                              Rem. After OT Paid: Rs.{' '}
                              {row.balancePayableAfterOtPaid.toLocaleString()}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: NFC CARD PAIRING */}
      {adminTab === 'cards' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
          <h2 className="text-2xl font-black tracking-tight text-black">
            NFC & RFID Card Enrollment
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="pb-3 pl-2">Employee</th>
                  <th className="pb-3">Worker User ID</th>
                  <th className="pb-3">Designation</th>
                  <th className="pb-3">Assigned Card UID</th>
                  <th className="pb-3 text-right pr-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-semibold">
                {teamMembers.map((member) => (
                  <tr key={member.id} className="hover:bg-slate-50/70">
                    <td className="py-4 pl-2 font-bold text-black">{member.full_name}</td>
                    <td className="py-4 font-mono text-slate-500">{member.user_id}</td>
                    <td className="py-4 text-slate-500">{member.designations || member.role}</td>
                    <td className="py-4">
                      {member.card_id ? (
                        <span className="px-3 py-1 rounded-full font-mono text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {member.card_id}
                        </span>
                      ) : (
                        <span className="px-3 py-1 rounded-full font-mono text-[10px] font-bold bg-slate-100 text-slate-400">
                          Unassigned
                        </span>
                      )}
                    </td>
                    <td className="py-4 pr-2 text-right">
                      <button
                        onClick={() => {
                          setSelectedCardWorker(member);
                          setNfcInput(member.card_id || '');
                          setNfcStatus({ message: '', type: 'idle' });
                          setIsNfcModalOpen(true);
                        }}
                        className="bg-black hover:bg-[#FF6600] text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase"
                      >
                        {member.card_id ? 'Change Card' : 'Pair Card +'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: CLIENT INQUIRIES */}
      {adminTab === 'leads' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
          <h2 className="text-2xl font-black tracking-tight text-black">
            Client Project Inquiries
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="pb-3 pl-2">Client</th>
                  <th className="pb-3">Service</th>
                  <th className="pb-3">Specifications</th>
                  <th className="pb-3 text-right pr-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-semibold">
                {projectBriefs.map((brief) => (
                  <tr key={brief.id} className="hover:bg-slate-50/70">
                    <td className="py-4 pl-2 font-bold text-black">
                      {brief.client_name}
                      {brief.phone && (
                        <span className="block text-[10px] text-slate-400 font-mono">
                          {brief.phone}
                        </span>
                      )}
                    </td>
                    <td className="py-4">{brief.service_type}</td>
                    <td className="py-4 text-slate-600 max-w-md">{brief.description}</td>
                    <td className="py-4 pr-2 text-right space-x-2">
                      <a
                        href={`https://wa.me/923325327333?text=Salam%20${encodeURIComponent(
                          brief.client_name
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block bg-[#25D366] text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase"
                      >
                        WhatsApp
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 7: REGISTER NEW STAFF */}
      {adminTab === 'register' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 max-w-3xl">
          <h2 className="text-2xl font-black tracking-tight text-black">
            Register New Staff Member
          </h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const payload = Object.fromEntries(formData);
              const res = await fetch('/api/users/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });
              if (res.ok) {
                alert('Registered successfully!');
                (e.target as HTMLFormElement).reset();
                onRefresh();
              }
            }}
            className="space-y-4 mt-6 text-xs"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                  Full Name
                </label>
                <input
                  name="full_name"
                  required
                  placeholder="e.g. Abdullah"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                  Worker Login User ID
                </label>
                <input
                  name="user_id"
                  required
                  placeholder="e.g. 3086049240"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                  Password
                </label>
                <input
                  name="password"
                  type="password"
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                  Designation
                </label>
                <input
                  name="designations"
                  placeholder="Computer Operator"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                  Role
                </label>
                <select
                  name="role"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                >
                  <option value="worker">Worker</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              className="w-full bg-[#FF6600] hover:bg-black text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest"
            >
              Create Staff Account +
            </button>
          </form>
        </div>
      )}

      {/* MODAL 1: CONFIGURE SHIFT & 26 / 28 / 30 WORKING DAYS */}
      {editingWageWorker && (
        <div className="fixed inset-0 z-[7500] flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-8 shadow-2xl relative border border-slate-200 max-h-[92vh] overflow-y-auto">
            <button
              onClick={() => setEditingWageWorker(null)}
              className="absolute top-6 right-6 text-slate-400 hover:text-black font-bold text-lg"
            >
              ✕
            </button>
            <h3 className="text-xl font-black text-black">
              Configure Shift Timing, Working Days & Salary
            </h3>
            <p className="text-xs text-slate-400 font-semibold mt-1">
              Staff Member: <strong className="text-black">{editingWageWorker.full_name}</strong>
            </p>

            <form onSubmit={handleSaveWageConfig} className="space-y-4 mt-6 text-xs">
              {/* Working Days Preset Buttons (26d, 28d, 30d) */}
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-2">
                  Monthly Working Days & Sunday Rule
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    {
                      days: 26,
                      title: '26 Days (4 Sun Off)',
                      desc: '0 Sun in expected; all 4 Sun for OT/Cover',
                    },
                    {
                      days: 28,
                      title: '28 Days (2 Sun Reg)',
                      desc: '2 Sun regular + 2 Sun for OT/Cover',
                    },
                    {
                      days: 30,
                      title: '30 Days (All Sun Reg)',
                      desc: 'All Sundays counted in regular month',
                    },
                  ].map((preset) => (
                    <button
                      type="button"
                      key={preset.days}
                      onClick={() =>
                        setWageForm({ ...wageForm, working_days_month: preset.days })
                      }
                      className={`p-3 rounded-2xl border text-left transition-all ${
                        wageForm.working_days_month === preset.days
                          ? 'bg-orange-50 border-[#FF6600] text-black'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <span className="font-black block text-xs">{preset.title}</span>
                      <span className="text-[9px] text-slate-500 block mt-0.5">{preset.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    Salary Basis Type
                  </label>
                  <select
                    value={wageForm.pay_type}
                    onChange={(e) =>
                      setWageForm({ ...wageForm, pay_type: e.target.value as PayBasis })
                    }
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  >
                    <option value="monthly">Monthly Fixed Base</option>
                    <option value="weekly">Weekly Base</option>
                    <option value="daily">Daily Wage Base</option>
                    <option value="hourly">Hourly Rate Base</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    {wageForm.pay_type.toUpperCase()} Amount (PKR)
                  </label>
                  <input
                    type="number"
                    required
                    value={wageForm.base_rate}
                    onChange={(e) =>
                      setWageForm({ ...wageForm, base_rate: Number(e.target.value) })
                    }
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    Shift Start Time
                  </label>
                  <input
                    type="time"
                    value={wageForm.shift_start}
                    onChange={(e) => setWageForm({ ...wageForm, shift_start: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    Shift End Time
                  </label>
                  <input
                    type="time"
                    value={wageForm.shift_end}
                    onChange={(e) => setWageForm({ ...wageForm, shift_end: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    Days / Month
                  </label>
                  <input
                    type="number"
                    value={wageForm.working_days_month}
                    onChange={(e) =>
                      setWageForm({ ...wageForm, working_days_month: Number(e.target.value) })
                    }
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    OT Multiplier
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={wageForm.ot_multiplier}
                    onChange={(e) =>
                      setWageForm({ ...wageForm, ot_multiplier: Number(e.target.value) })
                    }
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    Grace (Mins)
                  </label>
                  <input
                    type="number"
                    value={wageForm.grace_period_mins}
                    onChange={(e) =>
                      setWageForm({ ...wageForm, grace_period_mins: Number(e.target.value) })
                    }
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                  />
                </div>
              </div>

              <div className="bg-black text-white p-5 rounded-2xl space-y-3 font-mono text-xs">
                <div className="flex justify-between items-center border-b border-white/10 pb-2">
                  <span className="text-[10px] font-sans font-black uppercase tracking-widest text-[#FF6600]">
                    Auto-Converted Salary Breakdown
                  </span>
                  <span className="text-slate-400">
                    Shift: <strong className="text-white">{modalConvertedPreview.shiftDurationHours}h</strong>
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <span className="text-[9px] text-slate-400 uppercase block">Monthly</span>
                    <strong className="text-sm text-white">
                      Rs. {modalConvertedPreview.monthlyRate.toLocaleString()}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 uppercase block">Weekly</span>
                    <strong className="text-sm text-white">
                      Rs. {modalConvertedPreview.weeklyRate.toLocaleString()}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 uppercase block">Daily</span>
                    <strong className="text-sm text-white">
                      Rs. {modalConvertedPreview.dailyRate.toLocaleString()}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 uppercase block">Hourly</span>
                    <strong className="text-sm text-emerald-400">
                      Rs. {modalConvertedPreview.hourlyRate}/hr
                    </strong>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSavingWage}
                className="w-full bg-[#FF6600] hover:bg-black text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest"
              >
                {isSavingWage ? 'Saving...' : 'Save Configuration'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: RECORD PAID OVERTIME HOURS & AMOUNT */}
      {editingOtWorker && (
        <div className="fixed inset-0 z-[7500] flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl relative border border-slate-200">
            <button
              onClick={() => setEditingOtWorker(null)}
              className="absolute top-6 right-6 text-slate-400 hover:text-black font-bold text-lg"
            >
              ✕
            </button>
            <h3 className="text-xl font-black text-black">Record Paid Overtime</h3>
            <p className="text-xs text-slate-400 font-semibold mt-1">
              Worker: <strong className="text-black">{editingOtWorker.member.full_name}</strong> •
              Total Earned OT: <strong>{editingOtWorker.totalOtHours}h</strong> (Rs.{' '}
              {editingOtWorker.totalOtEarned.toLocaleString()})
            </p>

            <form onSubmit={handleSaveOtPayment} className="space-y-4 mt-6 text-xs">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                  Overtime Hours Paid
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={otPaymentForm.paid_ot_hours}
                  onChange={(e) => {
                    const hrs = Number(e.target.value);
                    setOtPaymentForm({
                      ...otPaymentForm,
                      paid_ot_hours: hrs,
                      paid_ot_amount: Math.round(hrs * editingOtWorker.otHourlyRate),
                    });
                  }}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                  Overtime Amount Paid (PKR)
                </label>
                <input
                  type="number"
                  value={otPaymentForm.paid_ot_amount}
                  onChange={(e) =>
                    setOtPaymentForm({ ...otPaymentForm, paid_ot_amount: Number(e.target.value) })
                  }
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setOtPaymentForm({
                      ...otPaymentForm,
                      paid_ot_hours: editingOtWorker.totalOtHours,
                      paid_ot_amount: editingOtWorker.totalOtEarned,
                    })
                  }
                  className="w-full py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl font-black text-[10px] uppercase"
                >
                  Mark 100% OT as Paid ({editingOtWorker.totalOtHours}h = Rs.{' '}
                  {editingOtWorker.totalOtEarned})
                </button>
              </div>

              <button
                type="submit"
                className="w-full bg-[#FF6600] hover:bg-black text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest"
              >
                Save OT Payment Status
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: MANUAL ADD / EDIT SHIFT PUNCH */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-[7500] flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl relative border border-slate-200">
            <button
              onClick={() => setIsManualModalOpen(false)}
              className="absolute top-6 right-6 text-slate-400 hover:text-black font-bold text-lg"
            >
              ✕
            </button>
            <h3 className="text-xl font-black text-black">
              {manualForm.record_id ? 'Adjust Shift Timing' : 'Manual Shift Entry'}
            </h3>
            <form onSubmit={handleSaveManualRecord} className="space-y-4 mt-6 text-xs">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                  Employee
                </label>
                <select
                  value={manualForm.worker_id}
                  onChange={(e) => setManualForm({ ...manualForm, worker_id: e.target.value })}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                >
                  {teamMembers.map((m) => (
                    <option key={m.id} value={String(m.user_id).trim()}>
                      {m.full_name} (#{m.user_id})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                  Shift Date
                </label>
                <input
                  type="date"
                  value={manualForm.date}
                  onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    Tap In (HH:MM:SS)
                  </label>
                  <input
                    type="text"
                    value={manualForm.clock_in}
                    onChange={(e) => setManualForm({ ...manualForm, clock_in: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    Tap Out
                  </label>
                  <input
                    type="text"
                    value={manualForm.clock_out}
                    onChange={(e) => setManualForm({ ...manualForm, clock_out: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full bg-[#FF6600] hover:bg-black text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest"
              >
                Save Shift Record
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: NFC CARD PAIRING */}
      {isNfcModalOpen && selectedCardWorker && (
        <div className="fixed inset-0 z-[7500] flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl relative border border-slate-200">
            <button
              onClick={() => {
                setIsNfcModalOpen(false);
                setSelectedCardWorker(null);
              }}
              className="absolute top-6 right-6 text-slate-400 hover:text-black font-bold text-lg"
            >
              ✕
            </button>
            <h3 className="text-xl font-black text-black text-center mb-4">
              Pair Card: {selectedCardWorker.full_name}
            </h3>
            {nfcStatus.message && (
              <div className="p-3 rounded-xl text-xs font-bold text-center mb-4 bg-orange-50 text-[#FF6600]">
                {nfcStatus.message}
              </div>
            )}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!nfcInput.trim()) return;
                const res = await fetch('/api/users/assign-card', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    userId: selectedCardWorker.user_id,
                    cardId: nfcInput.trim(),
                  }),
                });
                if (res.ok) {
                  onRefresh();
                  setIsNfcModalOpen(false);
                }
              }}
              className="space-y-4"
            >
              <input
                type="text"
                value={nfcInput}
                onChange={(e) => setNfcInput(e.target.value)}
                placeholder="10-Digit Card UID"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm font-bold text-center"
              />
              <button
                type="submit"
                className="w-full bg-[#FF6600] hover:bg-black text-white py-3 rounded-xl font-black text-xs uppercase"
              >
                Save Card
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}