// components/WorkerPortal.tsx
'use client';

import { useState, useMemo } from 'react';
import {
  PeriodFilter,
  WageConfig,
  convertWageRates,
  evaluateShiftLog,
  getDateRangeForPeriod,
} from '@/lib/payroll';

interface AttendanceRecord {
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

interface WorkerPortalProps {
  userData: {
    id?: number;
    user_id?: string;
    full_name: string;
    designation?: string;
  };
  attendanceLogs: AttendanceRecord[];
  wageConfig?: Partial<WageConfig>;
}

export default function WorkerPortal({
  userData,
  attendanceLogs,
  wageConfig,
}: WorkerPortalProps) {
  const todayStr = useMemo(
    () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date()),
    []
  );

  // Period Filter State (Day, Week, Fortnightly, Month, Custom)
  const [period, setPeriod] = useState<PeriodFilter>('month');
  const [anchorDate, setAnchorDate] = useState<string>(todayStr);
  const [customStart, setCustomStart] = useState<string>(todayStr.slice(0, 8) + '01');
  const [customEnd, setCustomEnd] = useState<string>(todayStr);

  const myWorkerId = String(userData?.user_id || '').trim();
  const convertedRates = useMemo(() => convertWageRates(wageConfig || {}), [wageConfig]);

  // Compute active date window
  const dateWindow = useMemo(
    () => getDateRangeForPeriod(period, anchorDate, customStart, customEnd),
    [period, anchorDate, customStart, customEnd]
  );

  // Filter logs belonging to this worker inside the selected date window
  const filteredLogs = useMemo(() => {
    return attendanceLogs.filter((log) => {
      if (String(log.worker_id).trim() !== myWorkerId) return false;
      const logDate = String(log.date || '').slice(0, 10);
      return logDate >= dateWindow.startDate && logDate <= dateWindow.endDate;
    });
  }, [attendanceLogs, myWorkerId, dateWindow]);

  // Evaluate every shift in the selected period
  const periodReport = useMemo(() => {
    let expectedPresentHours = 0;
    let totalGivenHours = 0;
    let totalRegularHours = 0;
    let totalOvertimeHours = 0;
    let totalShortfallHours = 0;
    let lateCount = 0;
    let totalLateMinutes = 0;

    let baseSalaryEarned = 0;
    let totalLateDeduction = 0;
    let totalShortfallDeduction = 0;
    let totalOvertimePay = 0;
    let netPayout = 0;

    const evaluatedRows = filteredLogs.map((log) => {
      const ev = evaluateShiftLog(log.clock_in, log.clock_out, wageConfig);
      if (log.clock_out) {
        expectedPresentHours += ev.expectedHours;
        totalGivenHours += ev.totalGivenHours;
        totalRegularHours += ev.regularHours;
        totalOvertimeHours += ev.overtimeHours;
        totalShortfallHours += ev.shortfallHours;
        baseSalaryEarned += ev.baseEarned;
        totalOvertimePay += ev.otEarned;
        totalLateDeduction += ev.lateDeduction;
        totalShortfallDeduction += ev.shortfallDeduction;
        netPayout += ev.netPay;
      }
      if (ev.isLate) {
        lateCount += 1;
        totalLateMinutes += ev.lateMinutes;
      }
      return { log, ev };
    });

    // Net variance: positive = net overtime, negative = net shortfall
    const netTimeVariance = Number((totalGivenHours - expectedPresentHours).toFixed(2));
    const totalDeductions = totalLateDeduction + totalShortfallDeduction;

    return {
      shiftsCount: filteredLogs.length,
      completedShifts: filteredLogs.filter((l) => !!l.clock_out).length,
      expectedPresentHours: Number(expectedPresentHours.toFixed(2)),
      totalGivenHours: Number(totalGivenHours.toFixed(2)),
      totalRegularHours: Number(totalRegularHours.toFixed(2)),
      totalOvertimeHours: Number(totalOvertimeHours.toFixed(2)),
      totalShortfallHours: Number(totalShortfallHours.toFixed(2)),
      netTimeVariance,
      lateCount,
      totalLateMinutes,
      baseSalaryEarned,
      totalOvertimePay,
      totalLateDeduction,
      totalShortfallDeduction,
      totalDeductions,
      netPayout,
      evaluatedRows,
    };
  }, [filteredLogs, wageConfig]);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* 1. Member Header & Shift Schedule Banner */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-[#FF6600] text-white rounded-2xl flex items-center justify-center text-xl font-black shadow-lg shadow-orange-500/20">
            {userData.full_name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl font-black text-black">{userData.full_name}</h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-50 text-[#FF6600] border border-orange-200">
                ID: #{myWorkerId}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-semibold mt-1">
              {userData.designation || 'Production Specialist'} • Scheduled Shift:{' '}
              <strong className="text-black font-mono">
                {wageConfig?.shift_start || '09:00'} to {wageConfig?.shift_end || '21:00'} (
                {convertedRates.shiftDurationHours} hrs/day)
              </strong>
            </p>
          </div>
        </div>

        {/* Converted Salary Rate Pill Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full lg:w-auto bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs font-mono">
          <div className="px-3 py-1">
            <span className="text-[9px] font-sans font-black uppercase text-slate-400 block">
              Monthly Eq.
            </span>
            <strong className="text-black">Rs. {convertedRates.monthlyRate.toLocaleString()}</strong>
          </div>
          <div className="px-3 py-1 border-l border-slate-200">
            <span className="text-[9px] font-sans font-black uppercase text-slate-400 block">
              Weekly Eq.
            </span>
            <strong className="text-black">Rs. {convertedRates.weeklyRate.toLocaleString()}</strong>
          </div>
          <div className="px-3 py-1 border-l border-slate-200">
            <span className="text-[9px] font-sans font-black uppercase text-slate-400 block">
              Daily Eq.
            </span>
            <strong className="text-black">Rs. {convertedRates.dailyRate.toLocaleString()}</strong>
          </div>
          <div className="px-3 py-1 border-l border-slate-200">
            <span className="text-[9px] font-sans font-black uppercase text-slate-400 block">
              Hourly / OT
            </span>
            <strong className="text-[#FF6600]">
              Rs. {convertedRates.hourlyRate} / {convertedRates.otHourlyRate}
            </strong>
          </div>
        </div>
      </div>

      {/* 2. Period Filter Controls (Day, Week, Fortnightly, Month, Custom Date) */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h3 className="text-base font-black uppercase tracking-tight text-black">
              Attendance & Salary Period Filter
            </h3>
            <p className="text-xs text-slate-400 font-semibold">
              Active Window: <strong className="text-[#FF6600]">{dateWindow.label}</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { id: 'day', label: 'Day' },
                { id: 'week', label: 'Week' },
                { id: 'fortnightly', label: 'Fortnightly (15d)' },
                { id: 'month', label: 'Monthly' },
                { id: 'custom', label: 'Custom Date Range' },
              ] as { id: PeriodFilter; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setPeriod(tab.id)}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                  period === tab.id
                    ? 'bg-[#FF6600] text-white shadow-md shadow-orange-500/20'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Date Pickers based on Period */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100">
          {period !== 'custom' ? (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Reference Date:
              </span>
              <input
                type="date"
                value={anchorDate}
                onChange={(e) => setAnchorDate(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold outline-none focus:border-[#FF6600]"
              />
              <button
                onClick={() => setAnchorDate(todayStr)}
                className="px-3 py-2 bg-orange-50 text-[#FF6600] rounded-xl text-xs font-bold border border-orange-200"
              >
                Jump to Today
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  From:
                </span>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold outline-none focus:border-[#FF6600]"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  To:
                </span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold outline-none focus:border-[#FF6600]"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. TIME & SALARY ANALYTICS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Should Be Present (Expected Time) */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Time Should Be Present
          </p>
          <p className="text-3xl font-black font-mono text-black mt-2">
            {periodReport.expectedPresentHours} <span className="text-sm font-sans">hrs</span>
          </p>
          <p className="text-[11px] text-slate-400 font-semibold mt-1">
            Across {periodReport.completedShifts} completed shifts ({convertedRates.shiftDurationHours}
            h/shift)
          </p>
        </div>

        {/* Card 2: Total Time Given */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Total Time Given
          </p>
          <p className="text-3xl font-black font-mono text-emerald-600 mt-2">
            {periodReport.totalGivenHours} <span className="text-sm font-sans">hrs</span>
          </p>
          <p className="text-[11px] text-slate-400 font-semibold mt-1">
            Regular: {periodReport.totalRegularHours}h • Overtime: +{periodReport.totalOvertimeHours}h
          </p>
        </div>

        {/* Card 3: Shortfall vs Overtime Balance */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Shortfall / Overtime
          </p>
          <div className="flex items-baseline gap-3 mt-2">
            <p
              className={`text-3xl font-black font-mono ${
                periodReport.netTimeVariance >= 0 ? 'text-[#FF6600]' : 'text-red-600'
              }`}
            >
              {periodReport.netTimeVariance >= 0
                ? `+${periodReport.netTimeVariance}h`
                : `${periodReport.netTimeVariance}h`}
            </p>
          </div>
          <p className="text-[11px] text-slate-500 font-semibold mt-1">
            OT: <span className="text-emerald-600">+{periodReport.totalOvertimeHours}h</span> •
            Shortfall: <span className="text-red-500">-{periodReport.totalShortfallHours}h</span>
          </p>
        </div>

        {/* Card 4: Net Payable Salary */}
        <div className="bg-black text-white p-6 rounded-3xl shadow-xl flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#FF6600]">
              Net Period Salary
            </p>
            <p className="text-3xl font-black font-mono text-white mt-2">
              Rs. {periodReport.netPayout.toLocaleString()}
            </p>
          </div>
          <div className="text-[11px] font-mono text-slate-300 mt-2 space-y-0.5">
            <div className="flex justify-between">
              <span>Base + OT:</span>
              <span className="text-emerald-400">
                +Rs. {(periodReport.baseSalaryEarned + periodReport.totalOvertimePay).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Late Deductions ({periodReport.lateCount}x):</span>
              <span className="text-red-400">-Rs. {periodReport.totalLateDeduction.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Tap-In & Tap-Out Ledger Table */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-xl font-black text-black">Tap-In & Tap-Out Shift Logs</h3>
            <p className="text-xs text-slate-400 font-semibold">
              Showing {periodReport.evaluatedRows.length} records for {dateWindow.label}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[850px]">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="pb-3 pl-2">Date</th>
                <th className="pb-3">Tap In</th>
                <th className="pb-3">Tap Out</th>
                <th className="pb-3">Should Be</th>
                <th className="pb-3">Given Time</th>
                <th className="pb-3">Shortfall / OT</th>
                <th className="pb-3">Punctuality</th>
                <th className="pb-3 text-right pr-2">Day Net Earned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-semibold">
              {periodReport.evaluatedRows.map(({ log, ev }) => (
                <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-4 pl-2 font-mono font-bold text-black">
                    {log.date}
                    {ev.crossedMidnight && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-sans">
                        🌙 +1d
                      </span>
                    )}
                  </td>
                  <td className="py-4 font-mono text-emerald-600 font-bold">{log.clock_in}</td>
                  <td className="py-4 font-mono text-blue-600 font-bold">
                    {log.clock_out || <span className="text-[#FF6600]">Active Shift</span>}
                  </td>
                  <td className="py-4 font-mono text-slate-500">{ev.expectedHours}h</td>
                  <td className="py-4 font-mono font-bold text-black">
                    {log.clock_out ? `${ev.totalGivenHours}h` : '—'}
                  </td>
                  <td className="py-4 font-mono">
                    {!log.clock_out ? (
                      '—'
                    ) : ev.overtimeHours > 0 ? (
                      <span className="text-emerald-600 font-bold">+{ev.overtimeHours}h OT</span>
                    ) : ev.shortfallHours > 0 ? (
                      <span className="text-red-500 font-bold">-{ev.shortfallHours}h Short</span>
                    ) : (
                      <span className="text-slate-400">Exact</span>
                    )}
                  </td>
                  <td className="py-4">
                    {ev.isLate ? (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-red-50 text-red-600 border border-red-200">
                        Late {ev.lateMinutes}m (-Rs.{ev.lateDeduction})
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                        On Time
                      </span>
                    )}
                  </td>
                  <td className="py-4 pr-2 text-right font-mono font-black text-black">
                    {log.clock_out ? `Rs. ${ev.netPay.toLocaleString()}` : 'In Progress'}
                  </td>
                </tr>
              ))}
              {periodReport.evaluatedRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 italic">
                    No attendance logs recorded in this date window.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}