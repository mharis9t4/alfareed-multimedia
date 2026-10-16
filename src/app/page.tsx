'use client';
import { useState, useRef, useEffect, useMemo } from 'react';

type UserRole = 'admin' | 'worker' | 'customer' | null;
type AdminTab = 'attendance' | 'calendar' | 'wages' | 'cards' | 'payroll' | 'leads' | 'register';

interface TeamMember {
  id: number;
  user_id: string;
  full_name: string;
  role: string;
  designations?: string;
  card_id?: string | null;
  is_online?: number;
}

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
  created_at?: string;
}

interface ProjectBrief {
  id: number;
  client_name: string;
  service_type: string;
  deadline?: string;
  description: string;
  phone?: string;
  status?: string;
  created_at?: string;
}

interface WorkerWageConfig {
  pay_basis: 'monthly' | 'daily' | 'hourly';
  shift_start: string; // e.g. "10:00"
  shift_end: string;   // e.g. "20:00"
  monthly_salary: number; // in PKR
  daily_wage: number;
  hourly_rate: number;
  working_days: number;   // default 26
  ot_multiplier: number;  // default 1.5x
  grace_period_mins: number; // default 15
}

// Helper to normalize any date string to YYYY-MM-DD for calendar comparison
function normalizeDate(dateStr: string): string {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return dateStr.substring(0, 10);
}

export default function Home() {
  // Session & Auth State
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [userData, setUserData] = useState<{ full_name: string; designation?: string; id?: number; user_id?: string } | null>(null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [loginInput, setLoginInput] = useState('');
  const [loginError, setLoginError] = useState('');

  // Admin Dashboard State
  const [adminTab, setAdminTab] = useState<AdminTab>('attendance');
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceRecord[]>([]);
  const [projectBriefs, setProjectBriefs] = useState<ProjectBrief[]>([]);
  const [attendanceSearch, setAttendanceSearch] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Manual Punch Modal State for Admin
  const [isManualPunchOpen, setIsManualPunchOpen] = useState(false);
  const [manualWorkerId, setManualWorkerId] = useState('');
  const [manualAction, setManualAction] = useState<'in' | 'out'>('in');

  // Calendar View State
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [selectedWorkerFilter, setSelectedWorkerFilter] = useState<string>('ALL');

  // Worker Wage Profiles Map (worker_id -> Config)
  const [wageProfiles, setWageProfiles] = useState<Record<string, WorkerWageConfig>>({});
  const [editingWageWorker, setEditingWageWorker] = useState<TeamMember | null>(null);
  const [wageFormState, setWageFormState] = useState<WorkerWageConfig>({
    pay_basis: 'monthly',
    shift_start: '10:00',
    shift_end: '20:00',
    monthly_salary: 35000,
    daily_wage: 1346,
    hourly_rate: 135,
    working_days: 26,
    ot_multiplier: 1.5,
    grace_period_mins: 15
  });

  // NFC Card Assignment Modal
  const [selectedWorker, setSelectedWorker] = useState<TeamMember | null>(null);
  const [isNfcModalOpen, setIsNfcModalOpen] = useState(false);
  const [nfcInput, setNfcInput] = useState('');
  const [nfcStatus, setNfcStatus] = useState<{ message: string; type: 'idle' | 'loading' | 'success' | 'error' }>({
    message: '',
    type: 'idle'
  });

  // Worker Dashboard Filtering State
  const [workerHistoryRange, setWorkerHistoryRange] = useState<'all' | 'month' | 'custom'>('all');
  const [workerCustomStart, setWorkerCustomStart] = useState('');
  const [workerCustomEnd, setWorkerCustomEnd] = useState('');

  // Public Landing Page Modals & Calculator
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [calcService, setCalcService] = useState<'bw_copy' | 'color_print' | 'pvc_card' | 'composing' | 'spiral_binding' | 'hard_binding' | 'panaflex'>('color_print');
  const [calcQuantity, setCalcQuantity] = useState<number>(50);

  // -------------------------------------------------------------
  // SESSION & WAGE PROFILE PERSISTENCE
  // -------------------------------------------------------------
  useEffect(() => {
    const saved = localStorage.getItem('alfareed_session');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        setUserRole(data.role);
        setUserData(data);
      } catch (err) {
        localStorage.removeItem('alfareed_session');
      }
    }

    const savedWages = localStorage.getItem('alfareed_wage_profiles');
    if (savedWages) {
      try {
        setWageProfiles(JSON.parse(savedWages));
      } catch (e) {}
    }
  }, []);

  // -------------------------------------------------------------
  // DATA FETCHING & 15-SECOND POLLING
  // -------------------------------------------------------------
  const fetchAllData = async () => {
    setIsRefreshing(true);
    try {
      const [teamRes, attRes, projRes] = await Promise.all([
        fetch('/api/users/list'),
        fetch('/api/attendance/list'),
        fetch('/api/projects/list').catch(() => null)
      ]);

      if (teamRes.ok) {
        const teamData = await teamRes.json();
        if (Array.isArray(teamData)) setTeamMembers(teamData);
      }
      if (attRes.ok) {
        const attData = await attRes.json();
        if (Array.isArray(attData)) setAttendanceLogs(attData);
      }
      if (projRes && projRes.ok) {
        const projData = await projRes.json();
        if (Array.isArray(projData)) setProjectBriefs(projData);
      }
    } catch (err) {
      console.error('Data sync failed:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (userRole) {
      fetchAllData();
      const interval = setInterval(fetchAllData, 15000);
      return () => clearInterval(interval);
    }
  }, [userRole]);

  // -------------------------------------------------------------
  // WAGE COMPUTATION HELPERS
  // -------------------------------------------------------------
  const getWorkerProfile = (workerId: string): WorkerWageConfig => {
    return wageProfiles[workerId] || {
      pay_basis: 'monthly',
      shift_start: '10:00',
      shift_end: '20:00',
      monthly_salary: 35000,
      daily_wage: 1346,
      hourly_rate: 135,
      working_days: 26,
      ot_multiplier: 1.5,
      grace_period_mins: 15
    };
  };

  const updateWageForm = (updatedFields: Partial<WorkerWageConfig>) => {
    const current = { ...wageFormState, ...updatedFields };
    const workingDays = current.working_days || 26;

    if (updatedFields.pay_basis === 'monthly' || ('monthly_salary' in updatedFields && current.pay_basis === 'monthly')) {
      const daily = Math.round(current.monthly_salary / workingDays);
      const hourly = Math.round(daily / 10);
      current.daily_wage = daily;
      current.hourly_rate = hourly;
    } else if (updatedFields.pay_basis === 'daily' || ('daily_wage' in updatedFields && current.pay_basis === 'daily')) {
      const monthly = Math.round(current.daily_wage * workingDays);
      const hourly = Math.round(current.daily_wage / 10);
      current.monthly_salary = monthly;
      current.hourly_rate = hourly;
    } else if (updatedFields.pay_basis === 'hourly' || ('hourly_rate' in updatedFields && current.pay_basis === 'hourly')) {
      const daily = Math.round(current.hourly_rate * 10);
      const monthly = Math.round(daily * workingDays);
      current.daily_wage = daily;
      current.monthly_salary = monthly;
    }
    setWageFormState(current);
  };

  const calculateShiftMetrics = (workerId: string, clockInStr: string, regHours: number, otHours: number) => {
    const profile = getWorkerProfile(workerId);
    const [schedH, schedM] = profile.shift_start.split(':').map(Number);
    
    let actualMinutes = 0;
    const timeMatch = clockInStr.match(/(\d+):(\d+)(?::(\d+))?\s*(AM|PM)?/i);
    if (timeMatch) {
      let h = parseInt(timeMatch[1], 10);
      const m = parseInt(timeMatch[2], 10);
      const mer = timeMatch[4] ? timeMatch[4].toUpperCase() : null;
      if (mer === 'PM' && h < 12) h += 12;
      if (mer === 'AM' && h === 12) h = 0;
      actualMinutes = h * 60 + m;
    }

    const scheduledMinutes = schedH * 60 + schedM;
    const diffMinutes = actualMinutes > 0 ? actualMinutes - scheduledMinutes : 0;
    const isLate = diffMinutes > profile.grace_period_mins;
    const lateMins = isLate ? diffMinutes : 0;

    const hourlyRate = profile.hourly_rate || Math.round((profile.monthly_salary / profile.working_days) / 10);
    const minuteRate = hourlyRate / 60;
    
    const lateDeduction = isLate ? Math.round(lateMins * minuteRate) : 0;
    const otRate = Math.round(hourlyRate * profile.ot_multiplier);
    const otEarned = Math.round(otHours * otRate);
    const regEarned = Math.round(regHours * hourlyRate);
    const netDayPay = Math.max(0, regEarned + otEarned - lateDeduction);

    return {
      profile,
      isLate,
      lateMins,
      hourlyRate,
      otRate,
      lateDeduction,
      otEarned,
      netDayPay
    };
  };

  // -------------------------------------------------------------
  // DYNAMIC STATS & DERIVED DATA
  // -------------------------------------------------------------
  const activeStaffCount = useMemo(() => {
    return attendanceLogs.filter(log => !log.clock_out).length;
  }, [attendanceLogs]);

  const totalOTLogged = useMemo(() => {
    return attendanceLogs.reduce((acc, log) => acc + parseFloat(String(log.overtime_hours || 0)), 0).toFixed(1);
  }, [attendanceLogs]);

  const calculatedEstimate = useMemo(() => {
    const rates: Record<string, number> = {
      bw_copy: 6,
      color_print: 25,
      pvc_card: 150,
      composing: 120,
      spiral_binding: 90,
      hard_binding: 450,
      panaflex: 38
    };
    return (rates[calcService] || 10) * Math.max(1, calcQuantity);
  }, [calcService, calcQuantity]);

  // Calendar filtered records using normalized date
  const calendarRecords = useMemo(() => {
    return attendanceLogs.filter(log => {
      const normDate = normalizeDate(log.date);
      const matchesDate = normDate === selectedCalendarDate;
      const matchesWorker = selectedWorkerFilter === 'ALL' || log.worker_id === selectedWorkerFilter;
      return matchesDate && matchesWorker;
    });
  }, [attendanceLogs, selectedCalendarDate, selectedWorkerFilter]);

  // Overall Payroll Summary
  const payrollSummary = useMemo(() => {
    return teamMembers.map(member => {
      const logs = attendanceLogs.filter(l => l.worker_id === member.user_id);
      const days = logs.length;
      let totalRegHours = 0;
      let totalOtHours = 0;
      let totalLateDeduction = 0;
      let totalOtEarned = 0;
      let totalEarned = 0;

      logs.forEach(l => {
        const reg = parseFloat(String(l.regular_hours || 0));
        const ot = parseFloat(String(l.overtime_hours || 0));
        totalRegHours += reg;
        totalOtHours += ot;

        const metrics = calculateShiftMetrics(member.user_id, l.clock_in, reg, ot);
        totalLateDeduction += metrics.lateDeduction;
        totalOtEarned += metrics.otEarned;
        totalEarned += metrics.netDayPay;
      });

      const profile = getWorkerProfile(member.user_id);

      return {
        ...member,
        profile,
        daysWorked: days,
        regularHours: totalRegHours.toFixed(1),
        otHours: totalOtHours.toFixed(1),
        totalLateDeduction,
        totalOtEarned,
        totalPay: totalEarned > 0 ? totalEarned : days * Math.round(profile.monthly_salary / profile.working_days)
      };
    });
  }, [teamMembers, attendanceLogs, wageProfiles]);

  // -------------------------------------------------------------
  // AUTHENTICATION & MANUAL PUNCH HANDLERS
  // -------------------------------------------------------------
  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoginError('');

    const target = e.currentTarget;
    const password = (target.elements.namedItem('password') as HTMLInputElement).value;

    try {
      const res = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginInput.trim(), password })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        const payload = {
          id: data.user.id,
          user_id: data.user.user_id,
          full_name: data.user.full_name,
          designation: data.user.designation,
          role: data.user.role
        };
        setUserRole(data.user.role);
        setUserData(payload);
        localStorage.setItem('alfareed_session', JSON.stringify(payload));
        setIsLoginOpen(false);
      } else {
        setLoginError(data.error || 'Authentication rejected. Verify credentials.');
      }
    } catch (err) {
      setLoginError('Could not connect to the Al Fareed production server.');
    }
  };

  const handleLogout = () => {
    setUserRole(null);
    setUserData(null);
    localStorage.removeItem('alfareed_session');
  };

  const handleManualPunchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualWorkerId) return;

    try {
      if (manualAction === 'in') {
        const res = await fetch('/api/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ employee_id: manualWorkerId, status: 'Manual Admin Punch' })
        });
        if (res.ok) {
          alert('Member successfully clocked in manually!');
          setIsManualPunchOpen(false);
          fetchAllData();
        } else {
          const err = await res.json();
          alert(err.error || 'Failed to clock in');
        }
      } else {
        const res = await fetch('/api/attendance/checkout', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ employee_id: manualWorkerId })
        });
        const data = await res.json();
        if (res.ok) {
          alert(`Member successfully clocked out! Overtime: ${data.overtime_hrs || 0}h`);
          setIsManualPunchOpen(false);
          fetchAllData();
        } else {
          alert(data.error || 'Failed to clock out');
        }
      }
    } catch (err) {
      alert('Network connection error during manual punch.');
    }
  };

  // -------------------------------------------------------------
  // SERVICES CATALOGUE DATA
  // -------------------------------------------------------------
  const servicePillars = [
    {
      id: '01',
      title: 'Industrial Offset & Digital Printing',
      spec: 'Offset Presses & Production Digital Copiers',
      desc: 'High-speed multi-color printing for corporate catalogs, magazines, letterheads, brochures, carbonless NCR bill books, and packaging boxes with Pantone precision.',
      icon: '🖨️',
      tag: 'Core Production'
    },
    {
      id: '02',
      title: 'Document Composing & Urdu Nastaleeq',
      spec: 'Jameel Noori Nastaleeq • Legal Layouts',
      desc: 'Master document typography in Urdu Nastaleeq, English corporate drafting, Arabic translation, court affidavits, stamped bond agreements, and academic manuscripts.',
      icon: '⌨️',
      tag: 'Typography Studio'
    },
    {
      id: '03',
      title: 'Commercial Photostat & Duplication',
      spec: 'Konica Minolta bizhub High-Volume Fleet',
      desc: 'High-volume digital photocopying, architectural blueprint reproduction, bulk exam copying, dual-sided ledger scanning, and rapid secure paper handling.',
      icon: '📑',
      tag: 'High Velocity'
    },
    {
      id: '04',
      title: 'PVC Smart Cards & NFC Credentials',
      spec: 'Dual-Interface 13.56MHz & HID Dongle Sync',
      desc: 'Edge-to-edge high-definition thermal PVC card printing, employee RFID badges, custom printed polyester lanyards, and direct 24/7 terminal attendance integration.',
      icon: '💳',
      tag: 'Hardware Solutions'
    },
    {
      id: '05',
      title: 'Finishing, Lamination & Luxury Binding',
      spec: 'Hot Foil Embossing • Rexine Hard Covers',
      desc: 'Spiral coil, wire-o, comb binding, thermal glue binding, and handmade hard leatherette bookbinding with golden seal embossing and scratch-proof matte/gloss coatings.',
      icon: '📚',
      tag: 'Finishing Works'
    },
    {
      id: '06',
      title: 'Outdoor Flex, Signage & Billboards',
      spec: 'Wide-Format UV & Solvent Outdoor Plotters',
      desc: 'Heavy-duty Panaflex shop signs, street streamers, backlit commercial signage, frosted glass films, one-way vision graphics, and customized rollup standees.',
      icon: '🏛️',
      tag: 'Signage & Displays'
    },
    {
      id: '07',
      title: 'Enterprise Software & Web Portals',
      spec: 'Next.js 15 • Node.js • MySQL Engine',
      desc: 'Enterprise business management portals, cloud POS billing solutions, biometric/NFC worker monitoring gates, and digital asset portals developed in-house.',
      icon: '🌐',
      tag: 'Digital Engineering'
    },
    {
      id: '08',
      title: 'Corporate Stationery & Digital Stamps',
      spec: 'Pre-Inked Flash Polymer & Brass Seals',
      desc: 'Custom flash stamps, dater seals, official company monograms, premium executive envelopes, presentation folders, and corporate paper assortments.',
      icon: '🖋️',
      tag: 'Corporate Supply'
    }
  ];

  // =============================================================
  // AUTHENTICATED PORTAL VIEW
  // =============================================================
  if (userRole) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans text-[#111827] antialiased selection:bg-[#FF6600] selection:text-white">
        {/* Top Management Header */}
        <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-[#FF6600] rounded-xl flex items-center justify-center text-white font-black text-xl shadow-md shadow-orange-500/20">
                AF
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-black text-lg tracking-tight uppercase text-black">
                    Al Fareed <span className="text-[#FF6600]">Portal</span>
                  </h1>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-slate-100 text-slate-700">
                    {userRole}
                  </span>
                </div>
                <p className="text-[11px] font-semibold text-slate-400">
                  {userData?.full_name || 'Authorized Member'} {userData?.designation ? `• ${userData.designation}` : ''}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {userRole === 'admin' && (
                <button
                  onClick={() => setIsManualPunchOpen(true)}
                  className="bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-sm"
                >
                  ⚡ Manual Sign In/Out
                </button>
              )}
              <a
                href="/kiosk"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 bg-orange-50 hover:bg-[#FF6600] text-[#FF6600] hover:text-white border border-orange-200 hover:border-[#FF6600] px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-sm"
              >
                <span>Terminal Gate</span>
                <span className="text-sm">↗</span>
              </a>
              <button
                onClick={handleLogout}
                className="bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-600 px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all"
              >
                Sign Out
              </button>
            </div>
          </div>
        </header>

        {/* ---------------- ADMIN DASHBOARD ---------------- */}
        {userRole === 'admin' && (
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
            {/* Live Metrics Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">On-Floor Active</p>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                </div>
                <p className="text-4xl font-black text-emerald-600 mt-2">{activeStaffCount}</p>
                <p className="text-[11px] text-slate-400 font-semibold mt-1">Clocked in today (in shift)</p>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Enrolled Staff</p>
                <p className="text-4xl font-black text-[#FF6600] mt-2">{teamMembers.length}</p>
                <p className="text-[11px] text-slate-400 font-semibold mt-1">
                  {teamMembers.filter(m => m.card_id).length} RFID cards paired
                </p>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Overtime Logged</p>
                <p className="text-4xl font-black text-black mt-2">{totalOTLogged}h</p>
                <p className="text-[11px] text-slate-400 font-semibold mt-1">Calculated for current month</p>
              </div>

              <div className="bg-black text-white p-6 rounded-3xl shadow-xl flex flex-col justify-between">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-black uppercase tracking-[0.25em] text-[#FF6600]">Hardware Station</span>
                  <button
                    onClick={fetchAllData}
                    disabled={isRefreshing}
                    className="text-xs text-slate-400 hover:text-white font-mono"
                  >
                    {isRefreshing ? 'Syncing...' : 'Sync Now ⟳'}
                  </button>
                </div>
                <div>
                  <p className="text-xs font-mono font-bold text-slate-300">Johar Mor Gate #01</p>
                  <p className="text-[10px] text-emerald-400 font-mono mt-0.5">● Database Sync Live</p>
                </div>
              </div>
            </div>

            {/* Navigation Tabs Bar */}
            <div className="flex border-b border-slate-200 space-x-2 overflow-x-auto no-scrollbar">
              {[
                { id: 'attendance', label: 'Live Punches Feed' },
                { id: 'calendar', label: '📅 Calendar & Inspector' },
                { id: 'wages', label: '💼 Staff Shift & Wages' },
                { id: 'cards', label: 'NFC Card Pairing' },
                { id: 'payroll', label: 'Payroll & Deductions' },
                { id: 'leads', label: `Client Inquiries (${projectBriefs.length})` },
                { id: 'register', label: 'Register New Staff' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setAdminTab(tab.id as AdminTab)}
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

            {/* TAB 1: LIVE ATTENDANCE PUNCHES */}
            {adminTab === 'attendance' && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h2 className="text-2xl font-black tracking-tight text-black">Live Attendance Feed</h2>
                    <p className="text-xs text-slate-400 font-semibold mt-0.5">
                      Punches received from the Johar Mor 24/7 attendance gate
                    </p>
                  </div>
                  <input
                    type="text"
                    value={attendanceSearch}
                    onChange={(e) => setAttendanceSearch(e.target.value)}
                    placeholder="Search worker by name or ID..."
                    className="w-full sm:w-72 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-[#FF6600]"
                  />
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead>
                      <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                        <th className="pb-3 pl-2">Worker / Entity</th>
                        <th className="pb-3">Punch Date</th>
                        <th className="pb-3">Clock In</th>
                        <th className="pb-3">Clock Out</th>
                        <th className="pb-3">Logged Duration</th>
                        <th className="pb-3 text-right pr-2">Shift Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs font-semibold">
                      {attendanceLogs
                        .filter(l => 
                          (l.worker_name?.toLowerCase().includes(attendanceSearch.toLowerCase())) ||
                          (l.worker_id.includes(attendanceSearch))
                        )
                        .map(log => (
                          <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-4 pl-2">
                              <span className="font-bold text-black block">{log.worker_name || 'Worker'}</span>
                              <span className="font-mono text-[10px] text-slate-400">ID: #{log.worker_id}</span>
                            </td>
                            <td className="py-4 font-mono text-slate-600">{normalizeDate(log.date)}</td>
                            <td className="py-4 font-mono font-bold text-emerald-600">{log.clock_in}</td>
                            <td className="py-4 font-mono font-bold text-blue-600">{log.clock_out || '—'}</td>
                            <td className="py-4 font-mono text-slate-600">
                              {log.clock_out ? (
                                `${(parseFloat(String(log.regular_hours || 0)) + parseFloat(String(log.overtime_hours || 0))).toFixed(1)} hrs`
                              ) : (
                                <span className="text-[#FF6600] font-bold">Shift in Progress</span>
                              )}
                            </td>
                            <td className="py-4 pr-2 text-right">
                              {!log.clock_out ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  Active
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600">
                                  Logged Out
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      {attendanceLogs.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-400 italic">
                            No attendance punches recorded yet today.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 2: CALENDAR VIEW & DAILY SHIFT INSPECTOR */}
            {adminTab === 'calendar' && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-8">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-6">
                  <div>
                    <h2 className="text-2xl font-black tracking-tight text-black">Calendar & Daily Shift Inspector</h2>
                    <p className="text-xs text-slate-400 font-semibold mt-0.5">
                      Select any date and worker to analyze arrival times, tardiness, and daily earnings
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    <div>
                      <label className="block text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">Pick Date</label>
                      <input
                        type="date"
                        value={selectedCalendarDate}
                        onChange={(e) => setSelectedCalendarDate(e.target.value)}
                        className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold font-mono outline-none focus:border-[#FF6600]"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">Filter Worker</label>
                      <select
                        value={selectedWorkerFilter}
                        onChange={(e) => setSelectedWorkerFilter(e.target.value)}
                        className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-[#FF6600]"
                      >
                        <option value="ALL">All Active Workers ({teamMembers.length})</option>
                        {teamMembers.map(m => (
                          <option key={m.id} value={m.user_id}>{m.full_name} (#{m.user_id})</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Shifts</p>
                    <p className="text-2xl font-black text-black mt-1">{calendarRecords.length}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Logs on {selectedCalendarDate}</p>
                  </div>
                  <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Late Arrivals</p>
                    <p className="text-2xl font-black text-red-500 mt-1">
                      {calendarRecords.filter(r => {
                        const m = calculateShiftMetrics(r.worker_id, r.clock_in, 0, 0);
                        return m.isLate;
                      }).length}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Exceeded grace period</p>
                  </div>
                  <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Overtime Generated</p>
                    <p className="text-2xl font-black text-[#FF6600] mt-1">
                      {calendarRecords.reduce((acc, r) => acc + parseFloat(String(r.overtime_hours || 0)), 0).toFixed(1)}h
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Total extra hours</p>
                  </div>
                  <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Late Deductions</p>
                    <p className="text-2xl font-black text-black mt-1">
                      Rs. {calendarRecords.reduce((acc, r) => {
                        const m = calculateShiftMetrics(r.worker_id, r.clock_in, parseFloat(String(r.regular_hours || 0)), parseFloat(String(r.overtime_hours || 0)));
                        return acc + m.lateDeduction;
                      }, 0).toLocaleString()}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Total daily penalty</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-400">
                    Shift Breakdowns for {selectedCalendarDate}
                  </h3>

                  {calendarRecords.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {calendarRecords.map(record => {
                        const reg = parseFloat(String(record.regular_hours || 0));
                        const ot = parseFloat(String(record.overtime_hours || 0));
                        const metrics = calculateShiftMetrics(record.worker_id, record.clock_in, reg, ot);

                        return (
                          <div
                            key={record.id}
                            className="p-6 rounded-3xl border border-slate-200 hover:border-[#FF6600] bg-white shadow-sm transition-all space-y-4"
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="font-black text-base text-black">{record.worker_name || 'Worker'}</h4>
                                <p className="text-[10px] font-mono text-slate-400">ID: #{record.worker_id} • {record.designations}</p>
                              </div>
                              {metrics.isLate ? (
                                <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-50 text-red-600 border border-red-200">
                                  Late by {metrics.lateMins}m
                                </span>
                              ) : (
                                <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  On Schedule
                                </span>
                              )}
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-100">
                              <div>
                                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">Scheduled Start</span>
                                <span className="font-mono font-bold text-black">{metrics.profile.shift_start}</span>
                              </div>
                              <div>
                                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">Actual Clock In</span>
                                <span className="font-mono font-bold text-emerald-600">{record.clock_in}</span>
                              </div>
                              <div>
                                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">Actual Clock Out</span>
                                <span className="font-mono font-bold text-blue-600">{record.clock_out || 'In Shift...'}</span>
                              </div>
                              <div>
                                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">Logged Hours</span>
                                <span className="font-mono font-bold text-black">
                                  {record.clock_out ? `${(reg + ot).toFixed(1)} hrs` : 'Active'}
                                </span>
                              </div>
                            </div>

                            <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-100">
                              <div>
                                {metrics.lateDeduction > 0 && (
                                  <span className="text-red-500 font-bold block text-[11px]">
                                    -Rs. {metrics.lateDeduction} (Late penalty)
                                  </span>
                                )}
                                {metrics.otEarned > 0 && (
                                  <span className="text-emerald-600 font-bold block text-[11px]">
                                    +Rs. {metrics.otEarned} (OT {ot}h)
                                  </span>
                                )}
                              </div>
                              <div className="text-right">
                                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">Net Earned Today</span>
                                <span className="font-mono font-black text-lg text-black">Rs. {metrics.netDayPay.toLocaleString()}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-12 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                      <p className="text-slate-400 text-xs italic">
                        No attendance records logged for {selectedWorkerFilter === 'ALL' ? 'any worker' : `Worker #${selectedWorkerFilter}`} on {selectedCalendarDate}.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: MANAGE STAFF, SHIFT TIMINGS & WAGES (Daily / Hourly / Monthly Options) */}
            {adminTab === 'wages' && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
                <div>
                  <h2 className="text-2xl font-black tracking-tight text-black">Worker Shift Timings & Wage Master</h2>
                  <p className="text-xs text-slate-400 font-semibold mt-0.5">
                    Configure staff on Monthly Salary, Daily Basis, or Per Hour with auto-calculated rates
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[850px]">
                    <thead>
                      <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                        <th className="pb-3 pl-2">Staff Member</th>
                        <th className="pb-3">Pay Basis</th>
                        <th className="pb-3">Scheduled Shift</th>
                        <th className="pb-3">Monthly / Base Wage</th>
                        <th className="pb-3">Calculated Rate</th>
                        <th className="pb-3">OT Multiplier</th>
                        <th className="pb-3 text-right pr-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs font-semibold">
                      {teamMembers.map(member => {
                        const profile = getWorkerProfile(member.user_id);

                        return (
                          <tr key={member.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-4 pl-2">
                              <span className="font-bold text-black block">{member.full_name}</span>
                              <span className="font-mono text-[10px] text-slate-400">ID: #{member.user_id} • {member.designations}</span>
                            </td>
                            <td className="py-4">
                              <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                                profile.pay_basis === 'monthly' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                                profile.pay_basis === 'daily' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              }`}>
                                {profile.pay_basis}
                              </span>
                            </td>
                            <td className="py-4 font-mono text-slate-700">
                              <span className="px-2.5 py-1 rounded-lg bg-slate-100 font-bold">
                                {profile.shift_start} - {profile.shift_end}
                              </span>
                            </td>
                            <td className="py-4 font-mono font-bold text-black">
                              {profile.pay_basis === 'monthly' && `Rs. ${profile.monthly_salary.toLocaleString()} /mo`}
                              {profile.pay_basis === 'daily' && `Rs. ${profile.daily_wage.toLocaleString()} /day`}
                              {profile.pay_basis === 'hourly' && `Rs. ${profile.hourly_rate.toLocaleString()} /hr`}
                            </td>
                            <td className="py-4 font-mono text-slate-600">
                              Rs. {profile.hourly_rate}/hr
                              <span className="block text-[9px] text-slate-400">Rs. {profile.daily_wage}/day</span>
                            </td>
                            <td className="py-4 font-mono text-[#FF6600] font-bold">
                              {profile.ot_multiplier}x (Rs. {Math.round(profile.hourly_rate * profile.ot_multiplier)}/h)
                            </td>
                            <td className="py-4 pr-2 text-right">
                              <button
                                onClick={() => {
                                  setEditingWageWorker(member);
                                  setWageFormState(profile);
                                }}
                                className="bg-black hover:bg-[#FF6600] text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
                              >
                                Edit Profile ✎
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

            {/* TAB 4: NFC CARD PAIRING */}
            {adminTab === 'cards' && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-2xl font-black tracking-tight text-black">NFC & RFID Card Enrollment</h2>
                    <p className="text-xs text-slate-400 font-semibold mt-0.5">
                      Assign 10-digit decimal RFID/NFC cards to employees
                    </p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-50 text-[#FF6600] border border-orange-200">
                    {teamMembers.filter(m => m.card_id).length} of {teamMembers.length} Enrolled
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead>
                      <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                        <th className="pb-3 pl-2">Staff Member</th>
                        <th className="pb-3">Worker ID</th>
                        <th className="pb-3">Department / Skill</th>
                        <th className="pb-3">Assigned Card ID</th>
                        <th className="pb-3 text-right pr-2">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs font-semibold">
                      {teamMembers.map(member => (
                        <tr key={member.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-4 pl-2 font-bold text-black">{member.full_name}</td>
                          <td className="py-4 font-mono text-slate-500">{member.user_id}</td>
                          <td className="py-4 text-slate-500 max-w-xs truncate">{member.designations || member.role}</td>
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
                                setSelectedWorker(member);
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

            {/* TAB 5: PAYROLL & DEDUCTIONS */}
            {adminTab === 'payroll' && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
                <div>
                  <h2 className="text-2xl font-black tracking-tight text-black">Precision Payroll & Deductions</h2>
                  <p className="text-xs text-slate-400 font-semibold mt-0.5">
                    Factors in logged regular hours, overtime bonuses, and exact late arrival deductions
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[750px]">
                    <thead>
                      <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                        <th className="pb-3 pl-2">Employee</th>
                        <th className="pb-3">Shifts Logged</th>
                        <th className="pb-3">Total Hours</th>
                        <th className="pb-3">Late Penalty</th>
                        <th className="pb-3">Overtime Earned</th>
                        <th className="pb-3 text-right pr-2">Calculated Payout</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs font-semibold">
                      {payrollSummary.map(row => (
                        <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-4 pl-2 font-bold text-black">
                            {row.full_name}
                            <span className="block font-mono text-[10px] text-slate-400">
                              Base ({row.profile.pay_basis}): Rs. {row.profile.pay_basis === 'monthly' ? row.profile.monthly_salary.toLocaleString() : row.profile.daily_wage.toLocaleString() + '/d'}
                            </span>
                          </td>
                          <td className="py-4 font-mono text-slate-600">{row.daysWorked} Shifts</td>
                          <td className="py-4 font-mono text-slate-600">{row.regularHours}h (+{row.otHours}h OT)</td>
                          <td className="py-4 font-mono text-red-500 font-bold">
                            {row.totalLateDeduction > 0 ? `-Rs. ${row.totalLateDeduction.toLocaleString()}` : '—'}
                          </td>
                          <td className="py-4 font-mono font-bold text-[#FF6600]">
                            {row.totalOtEarned > 0 ? `+Rs. ${row.totalOtEarned.toLocaleString()}` : '—'}
                          </td>
                          <td className="py-4 pr-2 text-right font-mono font-black text-base text-black">
                            Rs. {row.totalPay.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 6: CLIENT INQUIRIES & LEADS */}
            {adminTab === 'leads' && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
                <div>
                  <h2 className="text-2xl font-black tracking-tight text-black">Client Project Inquiries</h2>
                  <p className="text-xs text-slate-400 font-semibold mt-0.5">
                    Orders and project briefs submitted through the public website
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead>
                      <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                        <th className="pb-3 pl-2">Client / Entity</th>
                        <th className="pb-3">Service</th>
                        <th className="pb-3">Timeline</th>
                        <th className="pb-3">Project Requirements</th>
                        <th className="pb-3 text-right pr-2">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs font-semibold">
                      {projectBriefs.map(brief => (
                        <tr key={brief.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-4 pl-2 font-bold text-black">
                            {brief.client_name}
                            {brief.phone && <span className="block text-[10px] text-slate-400 font-mono">{brief.phone}</span>}
                          </td>
                          <td className="py-4">
                            <span className="px-2.5 py-1 rounded-lg text-[10px] uppercase font-bold bg-slate-100 text-slate-700">
                              {brief.service_type}
                            </span>
                          </td>
                          <td className="py-4 text-slate-500 font-mono">{brief.deadline || 'Flexible'}</td>
                          <td className="py-4 text-slate-600 max-w-sm truncate">{brief.description}</td>
                          <td className="py-4 pr-2 text-right">
                            <a
                              href={`https://wa.me/923325327333?text=Salam%20${encodeURIComponent(brief.client_name)},%20regarding%20your%20${encodeURIComponent(brief.service_type)}%20inquiry%20at%20Al%20Fareed:`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-block bg-[#25D366] text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider hover:opacity-90 transition-all"
                            >
                              WhatsApp
                            </a>
                          </td>
                        </tr>
                      ))}
                      {projectBriefs.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-slate-400 italic">
                            No project inquiries submitted yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 7: REGISTER STAFF */}
            {adminTab === 'register' && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 max-w-2xl">
                <div>
                  <h2 className="text-2xl font-black tracking-tight text-black">Register Team Member</h2>
                  <p className="text-xs text-slate-400 font-semibold mt-0.5">
                    Create new database credentials for the Al Fareed production crew
                  </p>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    const payload = Object.fromEntries(formData);
                    try {
                      const res = await fetch('/api/users/register', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                      });
                      if (res.ok) {
                        alert('Team member registered successfully!');
                        (e.target as HTMLFormElement).reset();
                        fetchAllData();
                      } else {
                        const err = await res.json();
                        alert(err.error || 'Registration failed');
                      }
                    } catch (err) {
                      alert('Connection error');
                    }
                  }}
                  className="space-y-4 mt-6"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Full Name</label>
                      <input name="full_name" required placeholder="e.g. Babar Ahmed" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-[#FF6600]" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Worker User ID</label>
                      <input name="username" required placeholder="e.g. 3086049240" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-[#FF6600]" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Password</label>
                      <input name="password" type="password" required placeholder="Pass-key" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-[#FF6600]" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Designation</label>
                      <input name="designation" placeholder="e.g. Offset Master / Composing" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-[#FF6600]" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">System Role</label>
                    <select name="role" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-[#FF6600]">
                      <option value="worker">Worker</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-[#FF6600] hover:bg-black text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest transition-all shadow-md shadow-orange-500/20"
                  >
                    Create Account +
                  </button>
                </form>
              </div>
            )}
          </main>
        )}

        {/* ---------------- WORKER DASHBOARD (Enhanced with Full Details) ---------------- */}
        {userRole === 'worker' && (() => {
          const workerId = userData?.user_id || String(userData?.id || '');
          const myLogs = attendanceLogs.filter(l => l.worker_id === workerId);
          const profile = getWorkerProfile(workerId);

          // Filtering worker logs
          const filteredLogs = myLogs.filter(l => {
            const dateStr = normalizeDate(l.date);
            if (workerHistoryRange === 'month') {
              const currentMonth = new Date().toISOString().substring(0, 7);
              return dateStr.startsWith(currentMonth);
            }
            if (workerHistoryRange === 'custom' && workerCustomStart && workerCustomEnd) {
              return dateStr >= workerCustomStart && dateStr <= workerCustomEnd;
            }
            return true;
          });

          let totalReg = 0;
          let totalOt = 0;
          let totalDeductions = 0;
          let totalOtEarned = 0;
          let netEarned = 0;

          filteredLogs.forEach(l => {
            const reg = parseFloat(String(l.regular_hours || 0));
            const ot = parseFloat(String(l.overtime_hours || 0));
            totalReg += reg;
            totalOt += ot;
            const m = calculateShiftMetrics(workerId, l.clock_in, reg, ot);
            totalDeductions += m.lateDeduction;
            totalOtEarned += m.otEarned;
            netEarned += m.netDayPay;
          });

          return (
            <main className="max-w-5xl mx-auto px-4 py-12 space-y-8">
              {/* Profile Card */}
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-orange-100 text-[#FF6600] rounded-2xl flex items-center justify-center text-3xl font-black">
                    AF
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-black">Welcome, {userData?.full_name}</h2>
                    <p className="text-xs text-slate-400 font-semibold mt-0.5">
                      {userData?.designation || 'Production Floor'} • ID: #{workerId} • Basis: <span className="uppercase font-bold text-black">{profile.pay_basis}</span>
                    </p>
                  </div>
                </div>
                <a
                  href="/kiosk"
                  target="_blank"
                  rel="noreferrer"
                  className="bg-[#FF6600] hover:bg-black text-white px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-orange-500/20"
                >
                  Open Terminal Gate ↗
                </a>
              </div>

              {/* Financial & Time Statistics Summary */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Shifts Logged</p>
                  <p className="text-3xl font-black text-black mt-2">{filteredLogs.length}</p>
                  <p className="text-[11px] text-slate-400 mt-1">Within selected range</p>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Regular / OT Hours</p>
                  <p className="text-3xl font-black text-[#FF6600] mt-2">{totalReg.toFixed(1)}h</p>
                  <p className="text-[11px] text-emerald-600 font-bold mt-1">+{totalOt.toFixed(1)}h Overtime</p>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Late Deductions</p>
                  <p className="text-3xl font-black text-red-500 mt-2">-Rs. {totalDeductions.toLocaleString()}</p>
                  <p className="text-[11px] text-slate-400 mt-1">Grace period: {profile.grace_period_mins}m</p>
                </div>
                <div className="bg-black text-white p-6 rounded-3xl shadow-xl flex flex-col justify-between">
                  <p className="text-[9px] font-black uppercase tracking-widest text-[#FF6600]">Estimated Earnings</p>
                  <p className="text-3xl font-black font-mono">Rs. {netEarned.toLocaleString()}</p>
                  <p className="text-[10px] text-slate-400 font-mono">Includes OT & penalties</p>
                </div>
              </div>

              {/* Attendance Timings & Range Filters */}
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h3 className="text-xl font-black text-black">My Attendance & Wage Log</h3>
                    <p className="text-xs text-slate-400 font-semibold mt-0.5">Detailed view of your shifts, timings, and deductions</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setWorkerHistoryRange('all')}
                      className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                        workerHistoryRange === 'all' ? 'bg-[#FF6600] text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      All Time
                    </button>
                    <button
                      onClick={() => setWorkerHistoryRange('month')}
                      className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                        workerHistoryRange === 'month' ? 'bg-[#FF6600] text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      This Month
                    </button>
                    <button
                      onClick={() => setWorkerHistoryRange('custom')}
                      className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                        workerHistoryRange === 'custom' ? 'bg-[#FF6600] text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      Custom Range
                    </button>
                  </div>
                </div>

                {workerHistoryRange === 'custom' && (
                  <div className="flex flex-wrap items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <div>
                      <label className="block text-[9px] font-black uppercase text-slate-400 mb-1">Start Date</label>
                      <input
                        type="date"
                        value={workerCustomStart}
                        onChange={(e) => setWorkerCustomStart(e.target.value)}
                        className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-black uppercase text-slate-400 mb-1">End Date</label>
                      <input
                        type="date"
                        value={workerCustomEnd}
                        onChange={(e) => setWorkerCustomEnd(e.target.value)}
                        className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono"
                      />
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead>
                      <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                        <th className="pb-3 pl-2">Date</th>
                        <th className="pb-3">Clock In</th>
                        <th className="pb-3">Clock Out</th>
                        <th className="pb-3">Hours (Reg + OT)</th>
                        <th className="pb-3">Late Penalty</th>
                        <th className="pb-3 text-right pr-2">Net Shift Pay</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs font-semibold">
                      {filteredLogs.map(log => {
                        const reg = parseFloat(String(log.regular_hours || 0));
                        const ot = parseFloat(String(log.overtime_hours || 0));
                        const m = calculateShiftMetrics(workerId, log.clock_in, reg, ot);

                        return (
                          <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-4 pl-2 font-mono font-bold text-black">{normalizeDate(log.date)}</td>
                            <td className="py-4 font-mono font-bold text-emerald-600">{log.clock_in}</td>
                            <td className="py-4 font-mono font-bold text-blue-600">{log.clock_out || 'Active Shift'}</td>
                            <td className="py-4 font-mono text-slate-600">
                              {log.clock_out ? `${(reg + ot).toFixed(1)}h (${reg}h + ${ot}h OT)` : 'In Progress'}
                            </td>
                            <td className="py-4 font-mono text-red-500 font-bold">
                              {m.lateDeduction > 0 ? `-Rs. ${m.lateDeduction} (${m.lateMins}m late)` : 'None'}
                            </td>
                            <td className="py-4 pr-2 text-right font-mono font-black text-black">
                              Rs. {m.netDayPay.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                      {filteredLogs.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-400 italic">
                            No attendance records found for the selected range.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </main>
          );
        })()}

        {/* ---------------- MANUAL ADMIN PUNCH MODAL ---------------- */}
        {isManualPunchOpen && (
          <div className="fixed inset-0 z-[7000] flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
            <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl relative border border-slate-200 animate-in zoom-in-95">
              <button
                onClick={() => setIsManualPunchOpen(false)}
                className="absolute top-6 right-6 text-slate-400 hover:text-black font-bold text-lg"
              >
                ✕
              </button>

              <h3 className="text-xl font-black text-black">Manual Member Sign In/Out</h3>
              <p className="text-xs text-slate-400 font-semibold mt-1">
                Admin override to manually log attendance for any worker
              </p>

              <form onSubmit={handleManualPunchSubmit} className="space-y-4 mt-6 text-xs">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Select Worker</label>
                  <select
                    value={manualWorkerId}
                    onChange={(e) => setManualWorkerId(e.target.value)}
                    required
                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-[#FF6600]"
                  >
                    <option value="">-- Choose Team Member --</option>
                    {teamMembers.map(m => (
                      <option key={m.id} value={m.user_id}>{m.full_name} (#{m.user_id}) - {m.designations || m.role}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Action Type</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setManualAction('in')}
                      className={`py-3 rounded-xl font-black uppercase tracking-wider transition-all border ${
                        manualAction === 'in' ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      Clock In
                    </button>
                    <button
                      type="button"
                      onClick={() => setManualAction('out')}
                      className={`py-3 rounded-xl font-black uppercase tracking-wider transition-all border ${
                        manualAction === 'out' ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      Clock Out
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-[#FF6600] hover:bg-black text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest transition-all shadow-md shadow-orange-500/20"
                >
                  Execute Manual {manualAction === 'in' ? 'Clock In' : 'Clock Out'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ---------------- WAGE PROFILE CONFIG MODAL (Daily / Hourly / Monthly Options) ---------------- */}
        {editingWageWorker && (
          <div className="fixed inset-0 z-[7000] flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
            <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl relative border border-slate-200 animate-in zoom-in-95">
              <button
                onClick={() => setEditingWageWorker(null)}
                className="absolute top-6 right-6 text-slate-400 hover:text-black font-bold text-lg"
              >
                ✕
              </button>

              <h3 className="text-xl font-black text-black">Configure Shift & Wages</h3>
              <p className="text-xs text-slate-400 font-semibold mt-1">
                Employee: <strong className="text-black">{editingWageWorker.full_name}</strong> (#{editingWageWorker.user_id})
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const updated = {
                    ...wageProfiles,
                    [editingWageWorker.user_id]: wageFormState
                  };
                  setWageProfiles(updated);
                  localStorage.setItem('alfareed_wage_profiles', JSON.stringify(updated));
                  setEditingWageWorker(null);
                }}
                className="space-y-4 mt-6 text-xs"
              >
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Pay Basis Selection</label>
                  <select
                    value={wageFormState.pay_basis}
                    onChange={(e) => updateWageForm({ pay_basis: e.target.value as any })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-[#FF6600]"
                  >
                    <option value="monthly">Monthly Salary Based</option>
                    <option value="daily">Daily Wage Basis</option>
                    <option value="hourly">Per Hour Rate Basis</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Shift Start Time</label>
                    <input
                      type="time"
                      value={wageFormState.shift_start}
                      onChange={(e) => updateWageForm({ shift_start: e.target.value })}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Shift End Time</label>
                    <input
                      type="time"
                      value={wageFormState.shift_end}
                      onChange={(e) => updateWageForm({ shift_end: e.target.value })}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                      {wageFormState.pay_basis === 'monthly' ? 'Monthly Salary (PKR)' : wageFormState.pay_basis === 'daily' ? 'Daily Wage (PKR)' : 'Hourly Rate (PKR)'}
                    </label>
                    <input
                      type="number"
                      value={
                        wageFormState.pay_basis === 'monthly' ? wageFormState.monthly_salary :
                        wageFormState.pay_basis === 'daily' ? wageFormState.daily_wage : wageFormState.hourly_rate
                      }
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (wageFormState.pay_basis === 'monthly') updateWageForm({ monthly_salary: val });
                        else if (wageFormState.pay_basis === 'daily') updateWageForm({ daily_wage: val });
                        else updateWageForm({ hourly_rate: val });
                      }}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Working Days / Month</label>
                    <input
                      type="number"
                      value={wageFormState.working_days}
                      onChange={(e) => updateWageForm({ working_days: Number(e.target.value) })}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Overtime Multiplier</label>
                    <input
                      type="number"
                      step="0.1"
                      value={wageFormState.ot_multiplier}
                      onChange={(e) => updateWageForm({ ot_multiplier: Number(e.target.value) })}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Grace Period (Minutes)</label>
                    <input
                      type="number"
                      value={wageFormState.grace_period_mins}
                      onChange={(e) => updateWageForm({ grace_period_mins: Number(e.target.value) })}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                    />
                  </div>
                </div>

                {/* Calculation Preview */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 font-mono text-[11px] space-y-1">
                  <p className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">Auto-Calculated Rates:</p>
                  <p className="text-black">Monthly: <strong>Rs. {wageFormState.monthly_salary.toLocaleString()}</strong></p>
                  <p className="text-black">Daily Wage: <strong>Rs. {wageFormState.daily_wage.toLocaleString()}</strong></p>
                  <p className="text-black">Hourly Wage: <strong>Rs. {wageFormState.hourly_rate}/hr</strong></p>
                  <p className="text-[#FF6600]">
                    Late Penalty Rate: <strong>Rs. {(wageFormState.hourly_rate / 60).toFixed(2)}/min</strong> after {wageFormState.grace_period_mins}m grace
                  </p>
                </div>

                <button
                  type="submit"
                  className="w-full bg-[#FF6600] hover:bg-black text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest transition-all"
                >
                  Save Wage Profile
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ---------------- CARD ASSIGNMENT MODAL ---------------- */}
        {isNfcModalOpen && selectedWorker && (
          <div className="fixed inset-0 z-[7000] flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
            <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl relative border border-slate-200 animate-in zoom-in-95">
              <button
                onClick={() => {
                  setIsNfcModalOpen(false);
                  setSelectedWorker(null);
                }}
                className="absolute top-6 right-6 text-slate-400 hover:text-black font-bold text-lg"
              >
                ✕
              </button>

              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-orange-100 text-[#FF6600] rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl font-black animate-pulse">
                  💳
                </div>
                <h3 className="text-xl font-black text-black">Pair NFC / RFID Card</h3>
                <p className="text-xs text-slate-400 font-semibold mt-1">
                  Linking to: <strong className="text-black">{selectedWorker.full_name}</strong> ({selectedWorker.user_id})
                </p>
              </div>

              <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center mb-6">
                <p className="text-xs font-bold text-slate-700">Ready for card tap...</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Tap card on USB Dongle or the back of an NFC Android phone
                </p>
              </div>

              {nfcStatus.message && (
                <div className={`p-3 rounded-xl text-xs font-bold text-center mb-4 ${
                  nfcStatus.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                  nfcStatus.type === 'error' ? 'bg-red-50 text-red-600 border border-red-200' :
                  'bg-blue-50 text-blue-600 border border-blue-200'
                }`}>
                  {nfcStatus.message}
                </div>
              )}

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!nfcInput.trim()) return;
                  setNfcStatus({ message: 'Saving card...', type: 'loading' });
                  try {
                    const res = await fetch('/api/users/assign-card', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ userId: selectedWorker.user_id, cardId: nfcInput.trim() })
                    });
                    const data = await res.json();
                    if (res.ok) {
                      setNfcStatus({ message: 'Card assigned successfully!', type: 'success' });
                      fetchAllData();
                      setTimeout(() => {
                        setIsNfcModalOpen(false);
                        setSelectedWorker(null);
                      }, 1000);
                    } else {
                      setNfcStatus({ message: data.error || 'Failed to save card.', type: 'error' });
                    }
                  } catch (err) {
                    setNfcStatus({ message: 'Network error.', type: 'error' });
                  }
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                    Manual 10-Digit Card ID
                  </label>
                  <input
                    type="text"
                    value={nfcInput}
                    onChange={(e) => setNfcInput(e.target.value)}
                    placeholder="e.g. 0170112260"
                    maxLength={20}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm font-bold text-center outline-none focus:border-[#FF6600]"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 bg-[#FF6600] hover:bg-black text-white py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all"
                  >
                    Save Card
                  </button>
                  {selectedWorker.card_id && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (confirm(`Unassign card from ${selectedWorker.full_name}?`)) {
                          await fetch('/api/users/assign-card', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId: selectedWorker.user_id, cardId: null })
                          });
                          fetchAllData();
                          setIsNfcModalOpen(false);
                        }
                      }}
                      className="px-4 py-3 bg-red-50 text-red-600 rounded-xl font-black text-xs uppercase hover:bg-red-100 transition-all"
                    >
                      Unpair
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =============================================================
  // PUBLIC WEBSITE VIEW
  // =============================================================
  return (
    <main className="min-h-screen bg-white font-sans text-[#111827] antialiased selection:bg-[#FF6600] selection:text-white">
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-black rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg border border-black">
              AF<span className="text-[#FF6600]">.</span>
            </div>
            <div>
              <div className="flex items-center gap-1.5 leading-none">
                <span className="text-xl font-black tracking-tighter text-black uppercase">AL FAREED</span>
                <span className="text-xl font-black tracking-tighter text-[#FF6600] uppercase">MULTIMEDIA</span>
              </div>
              <p className="text-[9px] font-bold tracking-[0.3em] uppercase text-slate-400 mt-1">
                Printing • Composing • Technology • Advertising
              </p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-8 text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
            <a href="#services" className="hover:text-[#FF6600] transition-colors">Services</a>
            <a href="#calculator" className="hover:text-[#FF6600] transition-colors">Estimator</a>
            <a href="#about" className="hover:text-[#FF6600] transition-colors">Studio & Plant</a>
            <a href="#contact" className="hover:text-[#FF6600] transition-colors">Contact</a>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/kiosk"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-3.5 py-2 rounded-xl border border-slate-200 text-slate-700 hover:border-[#FF6600] hover:text-[#FF6600] transition-all"
            >
              Gate ↗
            </a>
            <button
              onClick={() => setIsLoginOpen(true)}
              className="bg-[#FF6600] hover:bg-black text-white px-6 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all shadow-md shadow-orange-500/20"
            >
              Portal Login
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-16 pb-24 border-b border-slate-100 bg-gradient-to-b from-orange-50/40 via-white to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 bg-orange-100/70 border border-orange-200/80 px-4 py-1.5 rounded-full">
                <span className="w-2 h-2 rounded-full bg-[#FF6600] animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-[#FF6600]">
                  Karachi Hub • Johar Mor • Est. 2005
                </span>
              </div>

              <h1 className="text-5xl sm:text-7xl font-black tracking-tight text-black leading-[0.95] uppercase">
                High-Volume <br />
                <span className="text-[#FF6600]">Print</span> & Digital <br />
                Engineering.
              </h1>

              <p className="text-base sm:text-lg text-slate-600 font-medium max-w-xl leading-relaxed">
                Industrial offset production, Urdu Nastaleeq typography composing, heavy-duty photocopying, smart PVC RFID employee cards, and bespoke enterprise management portals.
              </p>

              <div className="flex flex-wrap gap-4 pt-2">
                <button
                  onClick={() => setIsProjectModalOpen(true)}
                  className="bg-[#FF6600] hover:bg-black text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-orange-500/20"
                >
                  Launch Project +
                </button>
                <a
                  href="#calculator"
                  className="border-2 border-black hover:bg-black hover:text-white text-black px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
                >
                  Estimate Cost
                </a>
              </div>

              <div className="grid grid-cols-3 gap-6 pt-6 border-t border-slate-200/60 max-w-lg">
                <div>
                  <p className="text-2xl font-black text-black">20+</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">Years Legacy</p>
                </div>
                <div>
                  <p className="text-2xl font-black text-[#FF6600]">100%</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">In-House Fleet</p>
                </div>
                <div>
                  <p className="text-2xl font-black text-black">24/7</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">Attendance Gate</p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 grid grid-cols-2 gap-4">
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 space-y-3">
                <span className="text-3xl">🖨️</span>
                <h3 className="font-black text-sm uppercase text-black">Offset & Digital</h3>
                <p className="text-[11px] text-slate-500 leading-relaxed">High-speed Heidelberg & digital production for commercial books and packaging.</p>
              </div>
              <div className="bg-black text-white p-6 rounded-3xl shadow-xl space-y-3 mt-6">
                <span className="text-3xl text-[#FF6600]">⌨️</span>
                <h3 className="font-black text-sm uppercase text-white">Nastaleeq Typeset</h3>
                <p className="text-[11px] text-slate-400 leading-relaxed">Architectural Urdu and legal document drafting with Jameel Noori Nastaleeq font.</p>
              </div>
              <div className="bg-orange-50 p-6 rounded-3xl border border-orange-200 shadow-sm space-y-3">
                <span className="text-3xl">💳</span>
                <h3 className="font-black text-sm uppercase text-[#FF6600]">Smart PVC Cards</h3>
                <p className="text-[11px] text-slate-600 leading-relaxed">RFID 10-digit chip attendance badges paired with instant terminal gate check-in.</p>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 space-y-3 mt-6">
                <span className="text-3xl">🏛️</span>
                <h3 className="font-black text-sm uppercase text-black">Flex Signage</h3>
                <p className="text-[11px] text-slate-500 leading-relaxed">Wide-format Panaflex billboards, acrylic displays, and retail vinyl wrapping.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Catalogue */}
      <section id="services" className="py-24 bg-slate-50 border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-[#FF6600]">Engineering Pillars</p>
              <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-black uppercase mt-1">
                Complete Production Services.
              </h2>
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 max-w-xs">
              Every stage handled in-house from design layout to heavy production and digital delivery.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {servicePillars.map(p => (
              <div
                key={p.id}
                className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm hover:border-[#FF6600] hover:shadow-xl hover:shadow-orange-500/10 transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="flex justify-between items-start mb-6">
                    <span className="text-4xl group-hover:scale-110 transition-transform">{p.icon}</span>
                    <span className="text-[10px] font-black font-mono text-[#FF6600] bg-orange-50 px-2 py-0.5 rounded-md">
                      {p.id}
                    </span>
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                    {p.tag}
                  </span>
                  <h3 className="text-lg font-black text-black leading-snug group-hover:text-[#FF6600] transition-colors">
                    {p.title}
                  </h3>
                  <p className="text-xs font-semibold text-slate-400 mt-1 mb-3">{p.spec}</p>
                  <p className="text-xs text-slate-600 leading-relaxed">{p.desc}</p>
                </div>

                <button
                  onClick={() => setIsProjectModalOpen(true)}
                  className="mt-6 text-[10px] font-black uppercase tracking-widest text-[#FF6600] group-hover:text-black flex items-center gap-1 transition-colors"
                >
                  <span>Inquire Specifications</span>
                  <span>→</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Instant Rate Estimator */}
      <section id="calculator" className="py-24 bg-white border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-black text-white rounded-[40px] p-8 sm:p-14 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-[#FF6600]/20 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 space-y-8">
              <div>
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#FF6600]">Live Estimator</span>
                <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-white uppercase mt-1">
                  Instant Production Calculator.
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-1">
                  Get immediate ballpark pricing for commercial printing, binding, PVC cards, and composing.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center pt-4">
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Select Capability</label>
                    <select
                      value={calcService}
                      onChange={(e: any) => setCalcService(e.target.value)}
                      className="w-full p-4 bg-white/10 border border-white/20 rounded-2xl text-white font-bold text-sm outline-none focus:border-[#FF6600]"
                    >
                      <option className="bg-black text-white" value="color_print">Laser Color Print (A4 Glossy / 100gsm)</option>
                      <option className="bg-black text-white" value="bw_copy">High-Speed B/W Photostat (A4 / 75gsm)</option>
                      <option className="bg-black text-white" value="pvc_card">Smart PVC NFC Card (Printed Dual-Side)</option>
                      <option className="bg-black text-white" value="composing">Urdu / Legal Composing (Per Page)</option>
                      <option className="bg-black text-white" value="spiral_binding">Spiral / Thermal Binding (Per Book)</option>
                      <option className="bg-black text-white" value="hard_binding">Hard Rexine Golden Embossed Binding</option>
                      <option className="bg-black text-white" value="panaflex">Panaflex Billboard Flex (Per Sq Ft)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                      Quantity / Units ({calcQuantity})
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={1000}
                      step={1}
                      value={calcQuantity}
                      onChange={(e) => setCalcQuantity(parseInt(e.target.value))}
                      className="w-full accent-[#FF6600]"
                    />
                    <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1">
                      <span>1 Unit</span>
                      <span>500 Units</span>
                      <span>1,000+ Units</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white/10 border border-white/15 p-8 rounded-3xl text-center space-y-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Estimated Total</p>
                  <p className="text-4xl sm:text-5xl font-black text-[#FF6600] font-mono">
                    Rs. {calculatedEstimate.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-slate-400">Excluding delivery • Standard turnaround</p>

                  <a
                    href={`https://wa.me/923325327333?text=Salam%20Al%20Fareed,%20I%20want%20to%20place%20an%20order%20for%20${calcQuantity}%20units%20of%20${calcService}%20(Estimated%20Rs.%20${calculatedEstimate})`}
                    target="_blank"
                    rel="noreferrer"
                    className="block w-full bg-[#FF6600] hover:bg-white hover:text-black text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest transition-all"
                  >
                    Confirm Order on WhatsApp →
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* About Plant */}
      <section id="about" className="py-24 bg-slate-50 border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <span className="text-xs font-black uppercase tracking-[0.25em] text-[#FF6600]">Karachi Facility</span>
              <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-black uppercase">
                Production Plant & Studio Hub.
              </h2>
              <p className="text-slate-600 font-medium leading-relaxed text-sm sm:text-base">
                Operating directly out of Johar Mor on Rashid Minhas Road, Al Fareed combines heavy industrial copiers, digital presses, bindery stations, and an in-house software engineering team to fulfill enterprise orders with zero subcontracting delay.
              </p>

              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-3">
                  <span className="text-[#FF6600] font-black">✓</span>
                  <span className="text-xs font-bold text-slate-700">Offset & High-Speed Digital Presses</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[#FF6600] font-black">✓</span>
                  <span className="text-xs font-bold text-slate-700">Konica Minolta High-Volume Duplicators</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[#FF6600] font-black">✓</span>
                  <span className="text-xs font-bold text-slate-700">Dedicated Jameel Noori Nastaleeq Urdu Composing Desks</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[#FF6600] font-black">✓</span>
                  <span className="text-xs font-bold text-slate-700">24/7 NFC Terminal Gate Monitoring</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xl space-y-6">
              <h3 className="text-xl font-black text-black uppercase tracking-tight">Direct Studio Contacts</h3>
              
              <div className="space-y-4 text-xs font-semibold">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-4">
                  <span className="text-2xl">📍</span>
                  <div>
                    <p className="font-black text-black uppercase">Karachi Headquarters</p>
                    <p className="text-slate-500 mt-0.5">Shop # 21, Empire Centre, Johar Mor, Rashid Minhas Road, Karachi, Pakistan.</p>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-4">
                  <span className="text-2xl">📞</span>
                  <div>
                    <p className="font-black text-black uppercase">Direct Production Hotline</p>
                    <p className="text-slate-500 mt-0.5">0310-2828228 • 0332-5327333</p>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-4">
                  <span className="text-2xl">✉️</span>
                  <div>
                    <p className="font-black text-black uppercase">Official Communications</p>
                    <p className="text-slate-500 mt-0.5">info@alfareed.pk</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Login Modal */}
      {isLoginOpen && (
        <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-8 shadow-2xl relative border border-slate-200 animate-in zoom-in-95">
            <button
              onClick={() => {
                setIsLoginOpen(false);
                setLoginError('');
              }}
              className="absolute top-6 right-6 text-slate-400 hover:text-black font-bold text-lg"
            >
              ✕
            </button>

            <div className="text-center mb-6">
              <span className="w-12 h-12 bg-black text-[#FF6600] rounded-2xl flex items-center justify-center mx-auto text-xl font-black mb-3">
                AF
              </span>
              <h3 className="text-2xl font-black text-black uppercase tracking-tight">System Access</h3>
              <p className="text-xs text-slate-400 font-semibold mt-1">Enter your assigned terminal credentials</p>
            </div>

            {loginError && (
              <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-bold text-center">
                {loginError}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Worker User ID</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. admin or 3086049240"
                  value={loginInput}
                  onChange={(e) => setLoginInput(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-[#FF6600]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Secure Password</label>
                <input
                  name="password"
                  type="password"
                  required
                  placeholder="••••••••"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-[#FF6600]"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-[#FF6600] hover:bg-black text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest transition-all shadow-md shadow-orange-500/20"
              >
                Execute Login
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Floating WhatsApp Action */}
      <div className="fixed bottom-6 right-6 z-50">
        <a
          href="https://wa.me/923325327333"
          target="_blank"
          rel="noreferrer"
          className="w-14 h-14 bg-[#25D366] text-white rounded-full flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-all text-2xl"
          title="Direct WhatsApp"
        >
          💬
        </a>
      </div>

      <footer className="bg-black text-white py-12 border-t border-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <span className="font-black text-lg uppercase tracking-tight text-white">AL FAREED MULTIMEDIA</span>
            <span className="text-[#FF6600]">•</span>
            <span className="text-xs font-mono text-slate-400">Johar Mor, Karachi</span>
          </div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-slate-500">
            © 2026 Al Fareed Marketing & Advertisement. Industrial & Digital Operations.
          </p>
        </div>
      </footer>
    </main>
  );
}
