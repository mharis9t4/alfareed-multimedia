// src/lib/payroll.ts

export type PayBasis = 'monthly' | 'weekly' | 'daily' | 'hourly';
export type PeriodFilter = 'day' | 'week' | 'fortnightly' | 'month' | 'custom';
export type SundayMode = 'AUTO_SPLIT' | 'OVERTIME' | 'COVERAGE' | 'CUSTOM_SPLIT' | 'REGULAR';

export interface WageConfig {
  worker_id: string;
  pay_type: PayBasis;
  base_rate: number;
  shift_start: string; // "09:00"
  shift_end: string;   // "21:00"
  working_days_month: number; // 26 (4 Sun off), 28 (2 Sun regular, 2 Sun off), 30 (All Sun regular)
  working_days_week: number;
  ot_multiplier: number;
  grace_period_mins: number;
}

export interface OtPaymentRecord {
  id?: number;
  worker_id: string;
  period_key: string; // e.g., "ALL" or YYYY-MM
  paid_ot_hours: number;
  paid_ot_amount: number;
  notes?: string;
  updated_at?: string;
}

export interface ConvertedRates {
  shiftDurationHours: number;
  monthlyRate: number;
  weeklyRate: number;
  dailyRate: number;
  hourlyRate: number;
  minuteRate: number;
  otHourlyRate: number;
}

export const DEFAULT_WAGE_CONFIG: Omit<WageConfig, 'worker_id'> = {
  pay_type: 'monthly',
  base_rate: 35000,
  shift_start: '09:00',
  shift_end: '21:00',
  working_days_month: 26,
  working_days_week: 6,
  ot_multiplier: 1.5,
  grace_period_mins: 15,
};

export function parseTimeToMinutes(timeStr?: string | null): number | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const clean = timeStr.trim();
  const match = clean.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = match[3] ? parseInt(match[3], 10) : 0;
  const meridiem = match[4] ? match[4].toUpperCase() : null;

  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;

  return hours * 60 + minutes + seconds / 60;
}

export function calculateCrossMidnightHours(clockIn?: string | null, clockOut?: string | null): number {
  const inMins = parseTimeToMinutes(clockIn);
  const outMins = parseTimeToMinutes(clockOut);
  if (inMins === null || outMins === null) return 0;

  let diffMins = outMins - inMins;
  if (diffMins < 0) {
    diffMins += 24 * 60;
  }
  return Math.max(0, Number((diffMins / 60).toFixed(2)));
}

export function getScheduledShiftHours(shiftStart: string, shiftEnd: string): number {
  const startM = parseTimeToMinutes(shiftStart) ?? 540;
  const endM = parseTimeToMinutes(shiftEnd) ?? 1260;
  let diff = endM - startM;
  if (diff <= 0) diff += 24 * 60;
  return Number((diff / 60).toFixed(2));
}

export function isSundayDate(dateStr: string): boolean {
  if (!dateStr) return false;
  const clean = String(dateStr).slice(0, 10);
  const [y, m, d] = clean.split('-').map(Number);
  if (!y || !m || !d) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getDay() === 0;
}

/**
 * Determines how many Sundays in a month count as "Regular Scheduled Working Days"
 * based on working_days_month:
 * - 26 days => 0 regular Sundays (all 4 Sundays are off-days for OT / Coverage)
 * - 28 days => 2 regular Sundays + 2 off-day Sundays (for OT / Coverage)
 * - 30 days => 4+ regular Sundays (all Sundays count in expected monthly hours)
 */
export function getRegularSundayQuota(workingDaysMonth: number): number {
  if (workingDaysMonth >= 30) return 5; // All Sundays in month are regular
  if (workingDaysMonth <= 26) return 0; // 0 Sundays are regular (all are off-days)
  return Math.max(0, workingDaysMonth - 26); // e.g., 28 => 2 regular Sundays, 27 => 1 regular Sunday
}

export function convertWageRates(config: Partial<WageConfig>): ConvertedRates {
  const payType = config.pay_type || DEFAULT_WAGE_CONFIG.pay_type;
  const baseRate = Number(config.base_rate ?? DEFAULT_WAGE_CONFIG.base_rate);
  const daysMonth = Math.max(1, Number(config.working_days_month ?? DEFAULT_WAGE_CONFIG.working_days_month));
  const daysWeek = Math.max(1, Number(config.working_days_week ?? DEFAULT_WAGE_CONFIG.working_days_week));
  const otMultiplier = Number(config.ot_multiplier ?? DEFAULT_WAGE_CONFIG.ot_multiplier);
  const shiftDurationHours = Math.max(
    1,
    getScheduledShiftHours(
      config.shift_start || DEFAULT_WAGE_CONFIG.shift_start,
      config.shift_end || DEFAULT_WAGE_CONFIG.shift_end
    )
  );

  let dailyRate = 0;
  let monthlyRate = 0;
  let weeklyRate = 0;
  let hourlyRate = 0;

  if (payType === 'monthly') {
    monthlyRate = baseRate;
    dailyRate = monthlyRate / daysMonth;
    weeklyRate = dailyRate * daysWeek;
    hourlyRate = dailyRate / shiftDurationHours;
  } else if (payType === 'weekly') {
    weeklyRate = baseRate;
    dailyRate = weeklyRate / daysWeek;
    monthlyRate = dailyRate * daysMonth;
    hourlyRate = dailyRate / shiftDurationHours;
  } else if (payType === 'daily') {
    dailyRate = baseRate;
    weeklyRate = dailyRate * daysWeek;
    monthlyRate = dailyRate * daysMonth;
    hourlyRate = dailyRate / shiftDurationHours;
  } else {
    hourlyRate = baseRate;
    dailyRate = hourlyRate * shiftDurationHours;
    weeklyRate = dailyRate * daysWeek;
    monthlyRate = dailyRate * daysMonth;
  }

  const minuteRate = hourlyRate / 60;
  const otHourlyRate = hourlyRate * otMultiplier;

  return {
    shiftDurationHours,
    monthlyRate: Math.round(monthlyRate),
    weeklyRate: Math.round(weeklyRate),
    dailyRate: Math.round(dailyRate),
    hourlyRate: Number(hourlyRate.toFixed(2)),
    minuteRate: Number(minuteRate.toFixed(2)),
    otHourlyRate: Number(otHourlyRate.toFixed(2)),
  };
}

/**
 * Evaluates a single shift log (used for quick row display)
 */
export function evaluateShiftLog(
  clockIn: string,
  clockOut: string | null,
  rawConfig?: Partial<WageConfig>,
  dateStr?: string,
  isOffDaySunday?: boolean,
  sundayMode?: SundayMode,
  sundayCovHoursAssigned?: number
) {
  const config: WageConfig = {
    worker_id: rawConfig?.worker_id || '',
    pay_type: rawConfig?.pay_type || DEFAULT_WAGE_CONFIG.pay_type,
    base_rate: Number(rawConfig?.base_rate ?? DEFAULT_WAGE_CONFIG.base_rate),
    shift_start: rawConfig?.shift_start || DEFAULT_WAGE_CONFIG.shift_start,
    shift_end: rawConfig?.shift_end || DEFAULT_WAGE_CONFIG.shift_end,
    working_days_month: Number(rawConfig?.working_days_month ?? DEFAULT_WAGE_CONFIG.working_days_month),
    working_days_week: Number(rawConfig?.working_days_week ?? DEFAULT_WAGE_CONFIG.working_days_week),
    ot_multiplier: Number(rawConfig?.ot_multiplier ?? DEFAULT_WAGE_CONFIG.ot_multiplier),
    grace_period_mins: Number(rawConfig?.grace_period_mins ?? DEFAULT_WAGE_CONFIG.grace_period_mins),
  };

  const rates = convertWageRates(config);
  const shiftHours = rates.shiftDurationHours;

  const isSun = dateStr ? isSundayDate(dateStr) : false;
  // An off-day Sunday does NOT add to expected "Should Be Present" hours
  const treatAsOffSunday = isOffDaySunday ?? (isSun && config.working_days_month <= 26 && sundayMode !== 'REGULAR');
  const expectedHours = treatAsOffSunday ? 0 : shiftHours;

  const schedStartMins = parseTimeToMinutes(config.shift_start) ?? 540;
  const actualStartMins = parseTimeToMinutes(clockIn) ?? schedStartMins;
  let latenessDiff = actualStartMins - schedStartMins;
  if (latenessDiff < -720) latenessDiff += 1440;

  // No late arrival penalty on an Off-Day Sunday
  const isLate = !treatAsOffSunday && latenessDiff > config.grace_period_mins;
  const lateMinutes = isLate ? Math.round(latenessDiff) : 0;

  const inMins = parseTimeToMinutes(clockIn);
  const outMins = parseTimeToMinutes(clockOut);
  const crossedMidnight = inMins !== null && outMins !== null && outMins < inMins;

  const totalGivenHours = clockOut ? calculateCrossMidnightHours(clockIn, clockOut) : 0;

  let regularHours = 0;
  let overtimeHours = 0;
  let coverageHours = 0;
  let shortfallHours = 0;

  if (clockOut) {
    if (treatAsOffSunday) {
      const mode: SundayMode = sundayMode || 'AUTO_SPLIT';
      if (mode === 'OVERTIME') {
        overtimeHours = totalGivenHours;
        coverageHours = 0;
      } else if (mode === 'COVERAGE') {
        coverageHours = totalGivenHours;
        overtimeHours = 0;
      } else {
        // CUSTOM_SPLIT or AUTO_SPLIT
        const cov = Math.min(totalGivenHours, Math.max(0, Number(sundayCovHoursAssigned || 0)));
        coverageHours = Number(cov.toFixed(2));
        overtimeHours = Number(Math.max(0, totalGivenHours - coverageHours).toFixed(2));
      }
    } else {
      regularHours = Number(Math.min(shiftHours, totalGivenHours).toFixed(2));
      overtimeHours = Number(Math.max(0, totalGivenHours - shiftHours).toFixed(2));
      shortfallHours = Number(Math.max(0, shiftHours - totalGivenHours).toFixed(2));
    }
  }

  // Coverage hours are paid at regular hourly rate (recovering shortfall deduction); OT hours at OT rate
  const baseEarned = clockOut ? Math.round((regularHours + coverageHours) * rates.hourlyRate) : 0;
  const otEarned = clockOut ? Math.round(overtimeHours * rates.otHourlyRate) : 0;
  const lateDeduction = isLate ? Math.round(lateMinutes * rates.minuteRate) : 0;
  const shortfallDeduction = clockOut ? Math.round(shortfallHours * rates.hourlyRate) : 0;
  const netPay = Math.max(0, baseEarned + otEarned - lateDeduction);

  return {
    config,
    rates,
    isSunday: isSun,
    treatAsOffSunday,
    sundayMode: sundayMode || 'AUTO_SPLIT',
    expectedHours,
    totalGivenHours,
    regularHours,
    coverageHours,
    overtimeHours,
    shortfallHours,
    isLate,
    lateMinutes,
    crossedMidnight,
    baseEarned,
    otEarned,
    lateDeduction,
    shortfallDeduction,
    netPay,
  };
}

/**
 * Full Period Evaluation for a Worker:
 * Automatically handles:
 * - 26 working days => 0 Sundays in expected time, all 4 Sundays used for Coverage/OT
 * - 28 working days => 2 Sundays as Regular days, remaining 2 Sundays for Coverage/OT
 * - 30 working days => All Sundays as Regular days
 * - Automatic or Manual Split of Sunday hours between Shortfall Coverage and Overtime!
 */
export function evaluateWorkerPeriodLogs<
  T extends {
    id: number;
    date: string;
    clock_in: string;
    clock_out: string | null;
    sunday_mode?: string | null;
    sunday_coverage_hours?: number | string | null;
  }
>(logs: T[], rawConfig?: Partial<WageConfig>) {
  const config: WageConfig = {
    worker_id: rawConfig?.worker_id || '',
    pay_type: rawConfig?.pay_type || DEFAULT_WAGE_CONFIG.pay_type,
    base_rate: Number(rawConfig?.base_rate ?? DEFAULT_WAGE_CONFIG.base_rate),
    shift_start: rawConfig?.shift_start || DEFAULT_WAGE_CONFIG.shift_start,
    shift_end: rawConfig?.shift_end || DEFAULT_WAGE_CONFIG.shift_end,
    working_days_month: Number(rawConfig?.working_days_month ?? DEFAULT_WAGE_CONFIG.working_days_month),
    working_days_week: Number(rawConfig?.working_days_week ?? DEFAULT_WAGE_CONFIG.working_days_week),
    ot_multiplier: Number(rawConfig?.ot_multiplier ?? DEFAULT_WAGE_CONFIG.ot_multiplier),
    grace_period_mins: Number(rawConfig?.grace_period_mins ?? DEFAULT_WAGE_CONFIG.grace_period_mins),
  };

  const rates = convertWageRates(config);
  const regularSundayQuotaPerMonth = getRegularSundayQuota(config.working_days_month);

  // Sort chronological ascending so the first N Sundays in a month are assigned to regular quota (for 28-day workers)
  const sortedAsc = [...logs].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

  // Track how many Sundays have been counted as Regular per YYYY-MM
  const monthSundayCounter: Record<string, number> = {};
  const offDaySundayIds = new Set<number>();

  sortedAsc.forEach((log) => {
    if (!isSundayDate(log.date)) return;
    const monthKey = String(log.date).slice(0, 7); // YYYY-MM
    monthSundayCounter[monthKey] = (monthSundayCounter[monthKey] || 0) + 1;
    const sundayIndexInMonth = monthSundayCounter[monthKey];

    const explicitMode = (log.sunday_mode || 'AUTO_SPLIT') as SundayMode;
    if (explicitMode === 'REGULAR') {
      // Admin explicitly forced this Sunday to be a Regular working day
      return;
    }
    if (
      explicitMode === 'OVERTIME' ||
      explicitMode === 'COVERAGE' ||
      explicitMode === 'CUSTOM_SPLIT'
    ) {
      offDaySundayIds.add(log.id);
      return;
    }

    // Default quota rule based on working_days_month (26 => 0 regular, 28 => 2 regular, 30 => all regular)
    if (sundayIndexInMonth > regularSundayQuotaPerMonth) {
      offDaySundayIds.add(log.id);
    }
  });

  // Pass 1: Evaluate all Regular Working Days (Mon-Sat + any quota-regular Sundays)
  let regularDaysExpectedHours = 0;
  let regularDaysGivenHours = 0;
  let regularDaysRegularHours = 0;
  let regularDaysOtHours = 0;
  let grossShortfallHours = 0;
  let lateCount = 0;
  let totalLateMinutes = 0;
  let totalLateDeduction = 0;

  sortedAsc.forEach((log) => {
    if (offDaySundayIds.has(log.id)) return;
    const ev = evaluateShiftLog(log.clock_in, log.clock_out, config, log.date, false, 'REGULAR', 0);
    if (log.clock_out) {
      regularDaysExpectedHours += ev.expectedHours;
      regularDaysGivenHours += ev.totalGivenHours;
      regularDaysRegularHours += ev.regularHours;
      regularDaysOtHours += ev.overtimeHours;
      grossShortfallHours += ev.shortfallHours;
    }
    if (ev.isLate) {
      lateCount += 1;
      totalLateMinutes += ev.lateMinutes;
      totalLateDeduction += ev.lateDeduction;
    }
  });

  // Net uncovered shortfall on regular days before applying off-day Sunday coverage
  // (Note: we allow Sunday coverage to offset grossShortfallHours)
  let remainingShortfallToCover = grossShortfallHours;

  // Pass 2: Evaluate Off-Day Sundays (apply OVERTIME, COVERAGE, CUSTOM_SPLIT, or AUTO_SPLIT)
  let sundayTotalWorkedHours = 0;
  let sundayCoverageHoursUsed = 0;
  let sundayOvertimeHours = 0;

  const evaluatedMap = new Map<number, ReturnType<typeof evaluateShiftLog>>();

  sortedAsc.forEach((log) => {
    if (!offDaySundayIds.has(log.id)) {
      const ev = evaluateShiftLog(log.clock_in, log.clock_out, config, log.date, false, 'REGULAR', 0);
      evaluatedMap.set(log.id, ev);
      return;
    }

    const worked = log.clock_out ? calculateCrossMidnightHours(log.clock_in, log.clock_out) : 0;
    const mode = ((log.sunday_mode as SundayMode) || 'AUTO_SPLIT') as SundayMode;
    let assignedCoverage = 0;

    if (log.clock_out) {
      if (mode === 'OVERTIME') {
        assignedCoverage = 0;
      } else if (mode === 'COVERAGE') {
        assignedCoverage = worked;
      } else if (mode === 'CUSTOM_SPLIT') {
        const requestedCov = Math.max(0, Number(log.sunday_coverage_hours || 0));
        assignedCoverage = Math.min(worked, requestedCov);
      } else {
        // AUTO_SPLIT: automatically uses whatever hours are needed to cover remaining shortfall, rest goes to OT
        assignedCoverage = Math.min(worked, remainingShortfallToCover);
      }
      remainingShortfallToCover = Math.max(0, remainingShortfallToCover - assignedCoverage);
    }

    const ev = evaluateShiftLog(
      log.clock_in,
      log.clock_out,
      config,
      log.date,
      true,
      mode,
      assignedCoverage
    );

    if (log.clock_out) {
      sundayTotalWorkedHours += ev.totalGivenHours;
      sundayCoverageHoursUsed += ev.coverageHours;
      sundayOvertimeHours += ev.overtimeHours;
    }

    evaluatedMap.set(log.id, ev);
  });

  const netUncoveredShortfallHours = Number(
    Math.max(0, grossShortfallHours - sundayCoverageHoursUsed).toFixed(2)
  );
  const totalExpectedHours = Number(regularDaysExpectedHours.toFixed(2));
  const totalGivenHoursAll = Number((regularDaysGivenHours + sundayTotalWorkedHours).toFixed(2));
  const totalEffectiveRegularHours = Number(
    (regularDaysRegularHours + sundayCoverageHoursUsed).toFixed(2)
  );
  const totalOvertimeHours = Number((regularDaysOtHours + sundayOvertimeHours).toFixed(2));

  // Financial Summary
  const baseSalaryEarned = Math.round(totalEffectiveRegularHours * rates.hourlyRate);
  const totalOvertimePay = Math.round(totalOvertimeHours * rates.otHourlyRate);
  const uncoveredShortfallDeduction = Math.round(netUncoveredShortfallHours * rates.hourlyRate);
  const netPayout = Math.max(0, baseSalaryEarned + totalOvertimePay - totalLateDeduction);

  // Return rows in original order (newest first)
  const evaluatedRows = logs.map((log) => ({
    log,
    ev: evaluatedMap.get(log.id)!,
  }));

  return {
    config,
    rates,
    regularSundayQuotaPerMonth,
    shiftsCount: logs.length,
    completedShifts: logs.filter((l) => !!l.clock_out).length,
    offDaySundaysWorked: offDaySundayIds.size,
    expectedPresentHours: totalExpectedHours,
    regularDaysGivenHours: Number(regularDaysGivenHours.toFixed(2)),
    sundayTotalWorkedHours: Number(sundayTotalWorkedHours.toFixed(2)),
    sundayCoverageHoursUsed: Number(sundayCoverageHoursUsed.toFixed(2)),
    sundayOvertimeHours: Number(sundayOvertimeHours.toFixed(2)),
    totalGivenHours: totalGivenHoursAll,
    totalRegularHours: totalEffectiveRegularHours,
    totalOvertimeHours,
    grossShortfallHours: Number(grossShortfallHours.toFixed(2)),
    netShortfallHours: netUncoveredShortfallHours,
    netTimeVariance: Number((totalGivenHoursAll - totalExpectedHours).toFixed(2)),
    lateCount,
    totalLateMinutes,
    baseSalaryEarned,
    totalOvertimePay,
    totalLateDeduction,
    uncoveredShortfallDeduction,
    netPayout,
    evaluatedRows,
  };
}

export function getDateRangeForPeriod(
  period: PeriodFilter,
  anchorDate: string,
  customStart?: string,
  customEnd?: string
): { startDate: string; endDate: string; label: string } {
  if (period === 'custom' && customStart && customEnd) {
    return {
      startDate: customStart <= customEnd ? customStart : customEnd,
      endDate: customStart <= customEnd ? customEnd : customStart,
      label: `${customStart} to ${customEnd}`,
    };
  }

  const [y, m, d] = anchorDate.split('-').map(Number);
  const base = new Date(y, (m || 1) - 1, d || 1);

  const fmt = (dt: Date) => {
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  };

  if (period === 'day') {
    const s = fmt(base);
    return { startDate: s, endDate: s, label: `Daily (${s})` };
  }

  if (period === 'week') {
    const dayOfWeek = base.getDay();
    const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const start = new Date(base);
    start.setDate(base.getDate() + diffToMon);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { startDate: fmt(start), endDate: fmt(end), label: `Weekly (${fmt(start)} — ${fmt(end)})` };
  }

  if (period === 'fortnightly') {
    const start = new Date(base);
    start.setDate(base.getDate() - 14);
    return {
      startDate: fmt(start),
      endDate: fmt(base),
      label: `Fortnightly 15-Day (${fmt(start)} — ${fmt(base)})`,
    };
  }

  const start = new Date(base.getFullYear(), base.getMonth(), 1);
  const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  return {
    startDate: fmt(start),
    endDate: fmt(end),
    label: `Monthly (${start.toLocaleString('en-US', { month: 'short', year: 'numeric' })})`,
  };
}