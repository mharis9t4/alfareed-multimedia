// src/components/WorkerPortal.tsx
'use client';

import { useState, useMemo } from 'react';
import {
  PeriodFilter,
  WageConfig,
  OtPaymentRecord,
  convertWageRates,
  evaluateWorkerPeriodLogs,
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
  sunday_mode?: string | null;
  sunday_coverage_hours?: number | string | null;
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
  otPayment?: OtPaymentRecord;
}

export default function WorkerPortal({
  userData,
  attendanceLogs,
  wageConfig,
  otPayment,
}: WorkerPortalProps) {
  const todayStr = useMemo(
    () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date()),
    []
  );

  const [period, setPeriod] = useState<PeriodFilter>('month');
  const [anchorDate, setAnchorDate] = useState<string>(todayStr);
  const [customStart, setCustomStart] = useState<string>(todayStr.slice(0, 8) + '01');
  const [customEnd, setCustomEnd] = useState<string>(todayStr);

  const myWorkerId = String(userData?.user_id || '').trim();
  const convertedRates = useMemo(() => convertWageRates(wageConfig || {}), [wageConfig]);

  const dateWindow = useMemo(
    () => getDateRangeForPeriod(period, anchorDate, customStart, customEnd),
    [period, anchorDate, customStart, customEnd]
  );

  const filteredLogs = useMemo(() => {
    return attendanceLogs.filter((log) => {
      if (String(log.worker_id).trim() !== myWorkerId) return false;
      const logDate = String(log.date || '').slice(0, 10);
      return logDate >= dateWindow.startDate && logDate <= dateWindow.endDate;
    });
  }, [attendanceLogs, myWorkerId, dateWindow]);

  const periodReport = useMemo(
    () => evaluateWorkerPeriodLogs(filteredLogs, wageConfig),
    [filteredLogs, wageConfig]
  );

  const paidOtHours = Number(otPayment?.paid_ot_hours || 0);
  const paidOtAmount = Math.round(Number(otPayment?.paid_ot_amount || 0));

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* 1. Member Header */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-[#FF6600] text-white rounded-2xl flex items-center justify-center text-xl font-black shadow-lg shadow-orange-500/20">
            {userData.full_name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl font-black text-black">{userData.full_name}</h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-orange-50 text-[#FF6600] border border-orange-200">
                ID: #{myWorkerId}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-purple-50 text-purple-700 border border-purple-200">
                {periodReport.config.working_days_month} Working Days / Month
              </span>
            </div>
            <p className="text-xs text-slate-500 font-semibold mt-1">
              Shift: {periodReport.config.shift_start}–{periodReport.config.shift_end} (
              {convertedRates.shiftDurationHours}h/day)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full lg:w-auto bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs font-mono">
          <div className="px-3 py-1">
            <span className="text-[9px] font-sans font-black uppercase text-slate-400 block">
              Monthly
            </span>
            <strong className="text-black">Rs. {convertedRates.monthlyRate.toLocaleString()}</strong>
          </div>
          <div className="px-3 py-1 border-l border-slate-200">
            <span className="text-[9px] font-sans font-black uppercase text-slate-400 block">
              Weekly
            </span>
            <strong className="text-black">Rs. {convertedRates.weeklyRate.toLocaleString()}</strong>
          </div>
          <div className="px-3 py-1 border-l border-slate-200">
            <span className="text-[9px] font-sans font-black uppercase text-slate-400 block">
              Daily
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

      {/* 2. Period Filter Bar */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h3 className="text-base font-black uppercase text-black">
              Check Tap-In, Tap-Out & Salary by Period
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
                { id: 'custom', label: 'Custom Date' },
              ] as { id: PeriodFilter; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setPeriod(tab.id)}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                  period === tab.id
                    ? 'bg-[#FF6600] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100">
          {period !== 'custom' ? (
            <input
              type="date"
              value={anchorDate}
              onChange={(e) => setAnchorDate(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold"
            />
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold"
              />
              <span>to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold"
              />
            </div>
          )}
        </div>
      </div>

      {/* 3. Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Should Be Present (Regular)
          </p>
          <p className="text-3xl font-black font-mono text-black mt-2">
            {periodReport.expectedPresentHours} hrs
          </p>
          <p className="text-[11px] text-slate-400 font-semibold mt-1">
            Off-Sundays excluded for 26d schedule
          </p>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Total Time Given
          </p>
          <p className="text-3xl font-black font-mono text-emerald-600 mt-2">
            {periodReport.totalGivenHours} hrs
          </p>
          <p className="text-[11px] text-slate-500 font-semibold mt-1">
            Reg Days: {periodReport.regularDaysGivenHours}h • Off-Sun:{' '}
            {periodReport.sundayTotalWorkedHours}h
          </p>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Shortfall & Sunday Coverage
          </p>
          <p className="text-2xl font-black font-mono text-black mt-2">
            Net Short: -{periodReport.netShortfallHours}h / OT: +{periodReport.totalOvertimeHours}h
          </p>
          <p className="text-[11px] text-blue-600 font-bold mt-1">
            Sunday Hours Used for Coverage: {periodReport.sundayCoverageHoursUsed}h
          </p>
        </div>

        <div className="bg-black text-white p-6 rounded-3xl shadow-xl flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#FF6600]">
              Total Net Salary
            </p>
            <p className="text-3xl font-black font-mono text-white mt-2">
              Rs. {periodReport.netPayout.toLocaleString()}
            </p>
          </div>
          <div className="text-[11px] font-mono text-slate-300 mt-2 space-y-0.5">
            <div className="flex justify-between">
              <span>Earned OT ({periodReport.totalOvertimeHours}h):</span>
              <span className="text-emerald-400">
                +Rs. {periodReport.totalOvertimePay.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span>OT Already Paid ({paidOtHours}h):</span>
              <span className="text-amber-300">Rs. {paidOtAmount.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Tap-In & Tap-Out Table */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
        <h3 className="text-xl font-black text-black">Tap-In & Tap-Out Shift Logs</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[850px]">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="pb-3 pl-2">Date</th>
                <th className="pb-3">Tap In</th>
                <th className="pb-3">Tap Out</th>
                <th className="pb-3">Should Be</th>
                <th className="pb-3">Given Time</th>
                <th className="pb-3">Coverage / OT / Short</th>
                <th className="pb-3 text-right pr-2">Day Net Pay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-semibold">
              {periodReport.evaluatedRows.map(({ log, ev }) => (
                <tr key={log.id} className="hover:bg-slate-50/80">
                  <td className="py-4 pl-2 font-mono font-bold text-black">
                    {log.date}
                    {ev.isSunday && (
                      <span className="ml-1.5 px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 text-[9px] font-sans uppercase">
                        {ev.treatAsOffSunday ? '☀️ Off-Sun' : 'Reg-Sun'}
                      </span>
                    )}
                  </td>
                  <td className="py-4 font-mono text-emerald-600 font-bold">{log.clock_in}</td>
                  <td className="py-4 font-mono text-blue-600 font-bold">
                    {log.clock_out || 'Active'}
                  </td>
                  <td className="py-4 font-mono text-slate-500">{ev.expectedHours}h</td>
                  <td className="py-4 font-mono font-bold text-black">
                    {log.clock_out ? `${ev.totalGivenHours}h` : '—'}
                  </td>
                  <td className="py-4 font-mono space-x-1">
                    {ev.coverageHours > 0 && (
                      <span className="text-blue-600 font-bold">{ev.coverageHours}h Cover</span>
                    )}
                    {ev.overtimeHours > 0 && (
                      <span className="text-emerald-600 font-bold">+{ev.overtimeHours}h OT</span>
                    )}
                    {ev.shortfallHours > 0 && (
                      <span className="text-red-500 font-bold">-{ev.shortfallHours}h Short</span>
                    )}
                  </td>
                  <td className="py-4 pr-2 text-right font-mono font-black text-black">
                    {log.clock_out ? `Rs. ${ev.netPay.toLocaleString()}` : 'In Progress'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}