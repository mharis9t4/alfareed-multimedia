// lib/payroll.ts

export type PayBasis = 'monthly' | 'weekly' | 'daily' | 'hourly';
export type PeriodFilter = 'day' | 'week' | 'fortnightly' | 'month' | 'custom';

export interface WageConfig {
  worker_id: string;
  pay_type: PayBasis;
  base_rate: number;
  shift_start: string; // "09:00" (24h format)
  shift_end: string;   // "21:00" or "00:00" (supports overnight shifts)
  working_days_month: number; // e.g., 26
  working_days_week: number;  // e.g., 6
  ot_multiplier: number;      // e.g., 1.5
  grace_period_mins: number;  // e.g., 15
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

/**
 * Parses "09:00", "09:30:00", "01:30:00 AM", or "08:00:00 PM" into minutes from 00:00
 */
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

/**
 * Calculates duration in hours between two times, automatically handling cross-midnight
 * (e.g., 09:00 AM to 01:30 AM next day = 16.5 hours)
 */
export function calculateCrossMidnightHours(clockIn?: string | null, clockOut?: string | null): number {
  const inMins = parseTimeToMinutes(clockIn);
  const outMins = parseTimeToMinutes(clockOut);
  if (inMins === null || outMins === null) return 0;

  let diffMins = outMins - inMins;
  // If clock_out time of day is earlier than clock_in, the shift crossed midnight
  if (diffMins < 0) {
    diffMins += 24 * 60;
  }
  return Math.max(0, Number((diffMins / 60).toFixed(2)));
}

/**
 * Calculates scheduled shift duration in hours (handles overnight schedules like 09:00 to 00:00)
 */
export function getScheduledShiftHours(shiftStart: string, shiftEnd: string): number {
  const startM = parseTimeToMinutes(shiftStart) ?? 540; // default 09:00
  const endM = parseTimeToMinutes(shiftEnd) ?? 1260;    // default 21:00
  let diff = endM - startM;
  if (diff <= 0) diff += 24 * 60;
  return Number((diff / 60).toFixed(2));
}

/**
 * Automatically converts any selected base pay (Monthly, Weekly, Daily, or Hourly)
 * into all equivalent tiers based on the worker's scheduled shift hours.
 */
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
    // hourly
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
 * Evaluates a single shift log against the worker's wage & shift profile
 */
export function evaluateShiftLog(
  clockIn: string,
  clockOut: string | null,
  rawConfig?: Partial<WageConfig>
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
  const expectedHours = rates.shiftDurationHours;

  // 1. Late Arrival Check
  const schedStartMins = parseTimeToMinutes(config.shift_start) ?? 540;
  const actualStartMins = parseTimeToMinutes(clockIn) ?? schedStartMins;

  let latenessDiff = actualStartMins - schedStartMins;
  // Handle edge case if someone clocks in slightly before midnight for a morning shift
  if (latenessDiff < -720) latenessDiff += 1440;

  const isLate = latenessDiff > config.grace_period_mins;
  const lateMinutes = isLate ? Math.round(latenessDiff) : 0;

  // 2. Worked Duration & Cross-Midnight Detection
  const inMins = parseTimeToMinutes(clockIn);
  const outMins = parseTimeToMinutes(clockOut);
  const crossedMidnight = inMins !== null && outMins !== null && outMins < inMins;

  const totalGivenHours = clockOut ? calculateCrossMidnightHours(clockIn, clockOut) : 0;
  const regularHours = clockOut ? Number(Math.min(expectedHours, totalGivenHours).toFixed(2)) : 0;
  const overtimeHours = clockOut ? Number(Math.max(0, totalGivenHours - expectedHours).toFixed(2)) : 0;
  const shortfallHours = clockOut ? Number(Math.max(0, expectedHours - totalGivenHours).toFixed(2)) : 0;

  // 3. Financial Calculations
  const baseEarned = clockOut ? Math.round(regularHours * rates.hourlyRate) : 0;
  const otEarned = clockOut ? Math.round(overtimeHours * rates.otHourlyRate) : 0;
  const lateDeduction = isLate ? Math.round(lateMinutes * rates.minuteRate) : 0;
  const shortfallDeduction = clockOut ? Math.round(shortfallHours * rates.hourlyRate) : 0;
  const netPay = Math.max(0, baseEarned + otEarned - lateDeduction);

  return {
    config,
    rates,
    expectedHours,
    totalGivenHours,
    regularHours,
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
 * Generates [startDate, endDate] in YYYY-MM-DD (Karachi Time) for Period Filters
 */
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
    // 7-day window ending on anchorDate (or starting Monday of that week)
    const dayOfWeek = base.getDay(); // 0 Sun .. 6 Sat
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
    return { startDate: fmt(start), endDate: fmt(base), label: `Fortnightly 15-Day (${fmt(start)} — ${fmt(base)})` };
  }

  // Default: 'month'
  const start = new Date(base.getFullYear(), base.getMonth(), 1);
  const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  return {
    startDate: fmt(start),
    endDate: fmt(end),
    label: `Monthly (${start.toLocaleString('en-US', { month: 'short', year: 'numeric' })})`,
  };
}