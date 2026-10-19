// components/AdminPortal.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  PayBasis,
  PeriodFilter,
  WageConfig,
  DEFAULT_WAGE_CONFIG,
  convertWageRates,
  evaluateShiftLog,
  getDateRangeForPeriod,
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
  isRefreshing: boolean;
  onRefresh: () => void;
}

export default function AdminPortal({
  teamMembers,
  attendanceLogs,
  projectBriefs,
  wageProfiles,
  isRefreshing,
  onRefresh,
}: AdminPortalProps) {
  const todayStr = useMemo(
    () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date()),
    []
  );

  const [adminTab, setAdminTab] = useState<AdminTab>('attendance');
  const [attendanceSearch, setAttendanceSearch] = useState('');

  // Period & Worker Filter State (shared by Inspector & Payroll tabs)
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

  // Live preview of converted rates inside the Wage Edit Modal
  const modalConvertedPreview = useMemo(() => convertWageRates(wageForm), [wageForm]);

  // Active Date Window for Inspector & Payroll
  const dateWindow = useMemo(
    () => getDateRangeForPeriod(period, anchorDate, customStart, customEnd),
    [period, anchorDate, customStart, customEnd]
  );

  // Filtered logs for Inspector
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

  // Comprehensive Payroll & Time Matrix per Worker for the Selected Period
  const payrollMatrix = useMemo(() => {
    return teamMembers.map((member) => {
      const wid = String(member.user_id).trim();
      const profile = getProfile(wid);
      const rates = convertWageRates(profile);

      const workerLogs = attendanceLogs.filter((l) => {
        const d = String(l.date || '').slice(0, 10);
        return (
          String(l.worker_id).trim() === wid &&
          d >= dateWindow.startDate &&
          d <= dateWindow.endDate
        );
      });

      let expectedHours = 0;
      let givenHours = 0;
      let regularHours = 0;
      let otHours = 0;
      let shortfallHours = 0;
      let lateCount = 0;
      let lateMins = 0;
      let baseEarned = 0;
      let otEarned = 0;
      let lateDeduction = 0;
      let shortfallDeduction = 0;
      let netPay = 0;

      workerLogs.forEach((l) => {
        const ev = evaluateShiftLog(l.clock_in, l.clock_out, profile);
        if (l.clock_out) {
          expectedHours += ev.expectedHours;
          givenHours += ev.totalGivenHours;
          regularHours += ev.regularHours;
          otHours += ev.overtimeHours;
          shortfallHours += ev.shortfallHours;
          baseEarned += ev.baseEarned;
          otEarned += ev.otEarned;
          lateDeduction += ev.lateDeduction;
          shortfallDeduction += ev.shortfallDeduction;
          netPay += ev.netPay;
        }
        if (ev.isLate) {
          lateCount += 1;
          lateMins += ev.lateMinutes;
        }
      });

      return {
        member,
        profile,
        rates,
        shiftsCount: workerLogs.length,
        completedShifts: workerLogs.filter((l) => !!l.clock_out).length,
        expectedHours: Number(expectedHours.toFixed(1)),
        givenHours: Number(givenHours.toFixed(1)),
        regularHours: Number(regularHours.toFixed(1)),
        otHours: Number(otHours.toFixed(1)),
        shortfallHours: Number(shortfallHours.toFixed(1)),
        netVariance: Number((givenHours - expectedHours).toFixed(1)),
        lateCount,
        lateMins,
        baseEarned,
        otEarned,
        lateDeduction,
        shortfallDeduction,
        netPay,
      };
    });
  }, [teamMembers, attendanceLogs, wageProfiles, dateWindow]);

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

  // Admin Manual Sign-Out Handler
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
      if (res.ok) {
        onRefresh();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to sign out worker.');
      }
    } catch {
      alert('Network error.');
    }
  };

  // Admin Delete Shift Log Handler
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

  // Save Manual Shift Add/Edit
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
      const data = await res.json();
      if (res.ok) {
        setIsManualModalOpen(false);
        onRefresh();
      } else {
        alert(data.error || 'Failed to save record');
      }
    } catch {
      alert('Network error.');
    }
  };

  // Save Worker Shift & Wage Profile to MySQL
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
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to save wage configuration');
      }
    } catch {
      alert('Network error while saving wage configuration');
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
              .reduce((acc, r) => acc + r.netPay, 0)
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
            { id: 'attendance', label: '⚡ Live Punches & Sign-Out' },
            { id: 'inspector', label: '📅 Time & Shift Inspector' },
            { id: 'wages', label: '⚙️ Shift Timings & Salary Master' },
            { id: 'payroll', label: '💰 Payroll, Shortfall & OT' },
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

      {/* SHARED PERIOD FILTER BAR FOR INSPECTOR & PAYROLL */}
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

      {/* TAB 1: LIVE ATTENDANCE FEED */}
      {adminTab === 'attendance' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-black">
                Live Gate Punches & Active Shifts
              </h2>
              <p className="text-xs text-slate-400 font-semibold mt-0.5">
                Supports cross-midnight shifts (9:00 AM to 1:30 AM next day)
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
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="pb-3 pl-2">Worker</th>
                  <th className="pb-3">Shift Date</th>
                  <th className="pb-3">Tap In</th>
                  <th className="pb-3">Tap Out</th>
                  <th className="pb-3">Should Be</th>
                  <th className="pb-3">Given / OT</th>
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
                    const ev = evaluateShiftLog(log.clock_in, log.clock_out, profile);

                    return (
                      <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-4 pl-2">
                          <span className="font-bold text-black block">
                            {log.worker_name || 'Staff'}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">
                            ID: #{log.worker_id} • {log.designations}
                          </span>
                        </td>
                        <td className="py-4 font-mono text-slate-700">
                          {log.date}
                          {ev.crossedMidnight && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-sans">
                              🌙 Overnight
                            </span>
                          )}
                        </td>
                        <td className="py-4 font-mono font-bold text-emerald-600">
                          {log.clock_in}
                          {ev.isLate && (
                            <span className="block text-[9px] text-red-500">
                              Late {ev.lateMinutes}m
                            </span>
                          )}
                        </td>
                        <td className="py-4 font-mono font-bold text-blue-600">
                          {log.clock_out || <span className="text-[#FF6600]">On Floor</span>}
                        </td>
                        <td className="py-4 font-mono text-slate-500">{ev.expectedHours}h</td>
                        <td className="py-4 font-mono">
                          {log.clock_out ? (
                            <div>
                              <span className="font-bold text-black">{ev.totalGivenHours}h</span>
                              {ev.overtimeHours > 0 && (
                                <span className="text-emerald-600 ml-1">
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
                        <td className="py-4 font-mono font-black text-black">
                          {log.clock_out ? `Rs. ${ev.netPay.toLocaleString()}` : '—'}
                        </td>
                        <td className="py-4 pr-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {!log.clock_out && (
                              <button
                                onClick={() => handleAdminClockOut(log)}
                                className="bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-200 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all"
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
                              className="px-2.5 py-1 bg-slate-100 hover:bg-black hover:text-white rounded-lg text-[10px] font-bold uppercase transition-all"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteShift(log.id)}
                              className="px-2 py-1 text-slate-400 hover:text-red-600 text-xs font-bold"
                              title="Delete record"
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
              <h2 className="text-2xl font-black text-black">Detailed Shift Inspector</h2>
              <p className="text-xs text-slate-400 font-semibold">
                Showing {periodLogs.length} shift logs for {dateWindow.label}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {periodLogs.map((record) => {
              const profile = getProfile(record.worker_id);
              const ev = evaluateShiftLog(record.clock_in, record.clock_out, profile);

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
                        Date: {record.date} • Scheduled: {profile.shift_start}–{profile.shift_end} (
                        {ev.expectedHours}h)
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {ev.crossedMidnight && (
                        <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase bg-amber-50 text-amber-700 border border-amber-200">
                          🌙 Cross-Midnight
                        </span>
                      )}
                      {ev.isLate ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-red-50 text-red-600 border border-red-200">
                          Late {ev.lateMinutes}m
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                          On Schedule
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
                        Tap In
                      </span>
                      <strong className="text-emerald-600">{record.clock_in}</strong>
                    </div>
                    <div>
                      <span className="text-[9px] font-sans font-black uppercase text-slate-400 block">
                        Tap Out
                      </span>
                      <strong className="text-blue-600">{record.clock_out || 'Active'}</strong>
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
                        Variance
                      </span>
                      {ev.overtimeHours > 0 ? (
                        <strong className="text-emerald-600">+{ev.overtimeHours}h OT</strong>
                      ) : ev.shortfallHours > 0 ? (
                        <strong className="text-red-500">-{ev.shortfallHours}h Short</strong>
                      ) : (
                        <strong className="text-slate-500">0.0h</strong>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-100">
                    <div className="space-x-3 font-mono text-[11px]">
                      <span>Base: Rs.{ev.baseEarned}</span>
                      {ev.otEarned > 0 && (
                        <span className="text-emerald-600 font-bold">+OT: Rs.{ev.otEarned}</span>
                      )}
                      {ev.lateDeduction > 0 && (
                        <span className="text-red-500 font-bold">-Late: Rs.{ev.lateDeduction}</span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] font-black uppercase text-slate-400 block">
                        Net Shift Payout
                      </span>
                      <span className="font-mono font-black text-base text-black">
                        Rs. {ev.netPay.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: STAFF SHIFT TIMINGS & WAGE MASTER (WITH AUTO-CONVERSION) */}
      {adminTab === 'wages' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-black">
              Staff Shift Timings & Multi-Basis Wage Master
            </h2>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">
              Set any worker on Monthly, Weekly, Daily, or Hourly base pay — system automatically
              computes all equivalent rates from their scheduled shift hours
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[950px]">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="pb-3 pl-2">Employee</th>
                  <th className="pb-3">Scheduled Shift</th>
                  <th className="pb-3">Selected Base</th>
                  <th className="pb-3">Monthly Eq.</th>
                  <th className="pb-3">Weekly Eq.</th>
                  <th className="pb-3">Daily Eq.</th>
                  <th className="pb-3">Hourly / OT Rate</th>
                  <th className="pb-3 text-right pr-2">Configure</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-semibold">
                {teamMembers.map((member) => {
                  const profile = getProfile(member.user_id);
                  const rates = convertWageRates(profile);

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
                          {profile.shift_start} – {profile.shift_end}
                        </span>
                        <span className="block text-[10px] text-slate-400 mt-0.5">
                          {rates.shiftDurationHours} hrs/day • Grace: {profile.grace_period_mins}m
                        </span>
                      </td>
                      <td className="py-4">
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-orange-50 text-[#FF6600] border border-orange-200">
                          {profile.pay_type}: Rs. {Number(profile.base_rate).toLocaleString()}
                        </span>
                      </td>
                      <td className="py-4 font-mono font-bold text-black">
                        Rs. {rates.monthlyRate.toLocaleString()}
                        <span className="block text-[9px] text-slate-400">
                          ({profile.working_days_month}d/mo)
                        </span>
                      </td>
                      <td className="py-4 font-mono text-slate-700">
                        Rs. {rates.weeklyRate.toLocaleString()}
                        <span className="block text-[9px] text-slate-400">
                          ({profile.working_days_week}d/wk)
                        </span>
                      </td>
                      <td className="py-4 font-mono text-slate-700">
                        Rs. {rates.dailyRate.toLocaleString()}/day
                      </td>
                      <td className="py-4 font-mono">
                        <span className="font-bold text-black">Rs. {rates.hourlyRate}/hr</span>
                        <span className="block text-[10px] text-[#FF6600] font-bold">
                          OT ({profile.ot_multiplier}x): Rs. {rates.otHourlyRate}/hr
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
                          Configure Shift & Pay
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

      {/* TAB 4: PRECISION PAYROLL, SHORTFALL & OVERTIME */}
      {adminTab === 'payroll' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-black">
              Payroll, Shortfall & Overtime Ledger
            </h2>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">
              Period: <strong className="text-[#FF6600]">{dateWindow.label}</strong>
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[950px]">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="pb-3 pl-2">Employee</th>
                  <th className="pb-3">Shifts</th>
                  <th className="pb-3">Should Be Present</th>
                  <th className="pb-3">Actual Given</th>
                  <th className="pb-3">Shortfall / OT</th>
                  <th className="pb-3">Base Earned</th>
                  <th className="pb-3">Late Penalty</th>
                  <th className="pb-3">OT Bonus</th>
                  <th className="pb-3 text-right pr-2">Net Payout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-semibold">
                {payrollMatrix
                  .filter(
                    (row) =>
                      selectedWorkerFilter === 'ALL' ||
                      String(row.member.user_id).trim() === String(selectedWorkerFilter).trim()
                  )
                  .map((row) => (
                    <tr key={row.member.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-4 pl-2">
                        <span className="font-bold text-black block">{row.member.full_name}</span>
                        <span className="font-mono text-[10px] text-slate-400">
                          {row.profile.pay_type.toUpperCase()}: Rs.{' '}
                          {Number(row.profile.base_rate).toLocaleString()} (Rs.{row.rates.hourlyRate}
                          /h)
                        </span>
                      </td>
                      <td className="py-4 font-mono text-slate-600">{row.completedShifts}</td>
                      <td className="py-4 font-mono text-slate-600">{row.expectedHours}h</td>
                      <td className="py-4 font-mono font-bold text-black">{row.givenHours}h</td>
                      <td className="py-4 font-mono">
                        <span className="text-emerald-600 font-bold">+{row.otHours}h OT</span>
                        <span className="block text-[10px] text-red-500">
                          -{row.shortfallHours}h Short
                        </span>
                      </td>
                      <td className="py-4 font-mono text-slate-700">
                        Rs. {row.baseEarned.toLocaleString()}
                      </td>
                      <td className="py-4 font-mono text-red-500 font-bold">
                        {row.lateDeduction > 0
                          ? `-Rs. ${row.lateDeduction.toLocaleString()} (${row.lateCount}x)`
                          : 'Rs. 0'}
                      </td>
                      <td className="py-4 font-mono text-emerald-600 font-bold">
                        {row.otEarned > 0 ? `+Rs. ${row.otEarned.toLocaleString()}` : 'Rs. 0'}
                      </td>
                      <td className="py-4 pr-2 text-right font-mono font-black text-base text-black">
                        Rs. {row.netPay.toLocaleString()}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: NFC CARD PAIRING */}
      {adminTab === 'cards' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-black">
                NFC & RFID Card Enrollment
              </h2>
              <p className="text-xs text-slate-400 font-semibold mt-0.5">
                Link 10-digit RFID badges to workers for 24/7 Kiosk Gate check-in
              </p>
            </div>
          </div>

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
                  <tr key={member.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-4 pl-2 font-bold text-black">{member.full_name}</td>
                    <td className="py-4 font-mono text-slate-500">{member.user_id}</td>
                    <td className="py-4 text-slate-500">{member.designations || member.role}</td>
                    <td className="py-4">
                      {member.card_id ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-mono text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
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
                        className="bg-black hover:bg-[#FF6600] text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
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
          <h2 className="text-2xl font-black tracking-tight text-black">Client Project Inquiries</h2>
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
                    <td className="py-4">
                      <span className="px-2.5 py-1 rounded-lg text-[10px] uppercase font-bold bg-slate-100 text-slate-700">
                        {brief.service_type}
                      </span>
                    </td>
                    <td className="py-4 text-slate-600 max-w-md">{brief.description}</td>
                    <td className="py-4 pr-2 text-right space-x-2">
                      <a
                        href={`https://wa.me/923325327333?text=Salam%20${encodeURIComponent(
                          brief.client_name
                        )},%20regarding%20your%20${encodeURIComponent(
                          brief.service_type
                        )}%20inquiry%20at%20Al%20Fareed:`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block bg-[#25D366] text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase"
                      >
                        WhatsApp
                      </a>
                      <button
                        onClick={async () => {
                          if (!confirm('Delete this inquiry?')) return;
                          await fetch('/api/projects/delete', {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id: brief.id }),
                          });
                          onRefresh();
                        }}
                        className="px-2.5 py-1.5 bg-red-50 text-red-600 rounded-lg text-[10px] font-black uppercase"
                      >
                        Delete
                      </button>
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
          <p className="text-xs text-slate-400 font-semibold mt-0.5">
            Creates login credentials and initializes their shift timing & salary profile
          </p>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const payload = Object.fromEntries(formData);
              try {
                const res = await fetch('/api/users/register', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload),
                });
                const data = await res.json();
                if (res.ok) {
                  alert('Team member registered successfully!');
                  (e.target as HTMLFormElement).reset();
                  onRefresh();
                } else {
                  alert(data.error || 'Registration failed');
                }
              } catch {
                alert('Connection error');
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
                  placeholder="e.g. Chachu Abdullah"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-[#FF6600]"
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
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold outline-none focus:border-[#FF6600]"
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
                  placeholder="Pass-key"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-[#FF6600]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                  Designation
                </label>
                <input
                  name="designations"
                  placeholder="e.g. Computer Operator"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-[#FF6600]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                  Role
                </label>
                <select
                  name="role"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-[#FF6600]"
                >
                  <option value="worker">Worker</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                  Pay Basis
                </label>
                <select
                  name="pay_type"
                  className="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                >
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                  <option value="daily">Daily</option>
                  <option value="hourly">Hourly</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                  Base Salary (PKR)
                </label>
                <input
                  name="base_rate"
                  type="number"
                  defaultValue={35000}
                  className="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                  Shift Start
                </label>
                <input
                  name="shift_start"
                  type="time"
                  defaultValue="09:00"
                  className="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                  Shift End
                </label>
                <input
                  name="shift_end"
                  type="time"
                  defaultValue="21:00"
                  className="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-[#FF6600] hover:bg-black text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest transition-all"
            >
              Create Staff Account +
            </button>
          </form>
        </div>
      )}

      {/* MODAL 1: CONFIGURE SHIFT & MULTI-BASIS WAGES */}
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
              Configure Shift Timing & Salary Basis
            </h3>
            <p className="text-xs text-slate-400 font-semibold mt-1">
              Staff Member: <strong className="text-black">{editingWageWorker.full_name}</strong> (#
              {editingWageWorker.user_id})
            </p>

            <form onSubmit={handleSaveWageConfig} className="space-y-4 mt-6 text-xs">
              {/* Pay Basis Selector */}
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
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-[#FF6600]"
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
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold outline-none focus:border-[#FF6600]"
                  />
                </div>
              </div>

              {/* Scheduled Shift Start & End */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    Shift Start Time (e.g. 09:00)
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
                    Shift End Time (Supports Midnight 00:00)
                  </label>
                  <input
                    type="time"
                    value={wageForm.shift_end}
                    onChange={(e) => setWageForm({ ...wageForm, shift_end: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                  />
                </div>
              </div>

              {/* Working Days & Multipliers */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                    Days / Week
                  </label>
                  <input
                    type="number"
                    value={wageForm.working_days_week}
                    onChange={(e) =>
                      setWageForm({ ...wageForm, working_days_week: Number(e.target.value) })
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

              {/* Automatic Real-Time Breakdown Box */}
              <div className="bg-black text-white p-5 rounded-2xl space-y-3 font-mono text-xs">
                <div className="flex justify-between items-center border-b border-white/10 pb-2">
                  <span className="text-[10px] font-sans font-black uppercase tracking-widest text-[#FF6600]">
                    Auto-Calculated Rate Breakdown
                  </span>
                  <span className="text-slate-400">
                    Shift Length: <strong className="text-white">{modalConvertedPreview.shiftDurationHours} hrs</strong>
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
                <div className="flex justify-between text-[11px] text-slate-300 pt-2 border-t border-white/10">
                  <span>
                    Overtime Rate ({wageForm.ot_multiplier}x):{' '}
                    <strong className="text-[#FF6600]">Rs. {modalConvertedPreview.otHourlyRate}/hr</strong>
                  </span>
                  <span>
                    Late Penalty: <strong className="text-red-400">Rs. {modalConvertedPreview.minuteRate}/min</strong>
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSavingWage}
                className="w-full bg-[#FF6600] hover:bg-black text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest transition-all"
              >
                {isSavingWage ? 'Saving to Database...' : 'Save Shift & Wage Configuration'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: MANUAL ADD / EDIT SHIFT PUNCH */}
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
            <p className="text-xs text-slate-400 font-semibold mt-1">
              If Tap Out is earlier than Tap In (e.g. 09:00:00 to 01:30:00), it automatically
              calculates as a cross-midnight shift.
            </p>

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
                  Shift Start Date
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
                    placeholder="09:00:00"
                    value={manualForm.clock_in}
                    onChange={(e) => setManualForm({ ...manualForm, clock_in: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    Tap Out (Leave empty if Active)
                  </label>
                  <input
                    type="text"
                    placeholder="01:30:00"
                    value={manualForm.clock_out}
                    onChange={(e) => setManualForm({ ...manualForm, clock_out: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full bg-[#FF6600] hover:bg-black text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest transition-all"
              >
                Save Shift Record
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: NFC CARD PAIRING */}
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
            <div className="text-center mb-6">
              <h3 className="text-xl font-black text-black">Pair NFC / RFID Card</h3>
              <p className="text-xs text-slate-400 font-semibold mt-1">
                Employee: <strong className="text-black">{selectedCardWorker.full_name}</strong>
              </p>
            </div>
            <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center mb-6">
              <p className="text-xs font-bold text-slate-700">Tap Card on USB Reader Now</p>
              <p className="text-[11px] text-slate-400 mt-1">Or type the 10-digit UID below</p>
            </div>
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
                const data = await res.json();
                if (res.ok) {
                  onRefresh();
                  setIsNfcModalOpen(false);
                } else {
                  setNfcStatus({ message: data.error || 'Error', type: 'error' });
                }
              }}
              className="space-y-4"
            >
              <input
                type="text"
                value={nfcInput}
                onChange={(e) => setNfcInput(e.target.value)}
                placeholder="e.g. 0170112260"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm font-bold text-center"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-[#FF6600] hover:bg-black text-white py-3 rounded-xl font-black text-xs uppercase"
                >
                  Save Card
                </button>
                {selectedCardWorker.card_id && (
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch('/api/users/assign-card', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          userId: selectedCardWorker.user_id,
                          cardId: null,
                        }),
                      });
                      onRefresh();
                      setIsNfcModalOpen(false);
                    }}
                    className="px-4 py-3 bg-red-50 text-red-600 rounded-xl font-black text-xs uppercase"
                  >
                    Unpair
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}