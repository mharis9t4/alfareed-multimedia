// app/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import PublicLanding from '@/components/PublicLanding';
import AdminPortal, {
  TeamMember,
  AttendanceRecord,
  ProjectBrief,
} from '@/components/AdminPortal';
import WorkerPortal from '@/components/WorkerPortal';
import { WageConfig, DEFAULT_WAGE_CONFIG } from '@/lib/payroll';

type UserRole = 'admin' | 'worker' | 'customer' | null;

export default function Home() {
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [userData, setUserData] = useState<{
    id?: number;
    user_id?: string;
    full_name: string;
    designation?: string;
    role?: UserRole;
  } | null>(null);

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceRecord[]>([]);
  const [projectBriefs, setProjectBriefs] = useState<ProjectBrief[]>([]);
  const [wageProfiles, setWageProfiles] = useState<Record<string, WageConfig>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Restore session on mount
  useEffect(() => {
    const saved = localStorage.getItem('alfareed_session');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setUserRole(parsed.role);
        setUserData(parsed);
      } catch {
        localStorage.removeItem('alfareed_session');
      }
    }
  }, []);

  // Synchronize all data from MySQL APIs
  const fetchAllData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [teamRes, attRes, projRes, wageRes] = await Promise.all([
        fetch('/api/users/list'),
        fetch('/api/attendance/list'),
        fetch('/api/projects/list').catch(() => null),
        fetch('/api/users/wage-config').catch(() => null),
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

      if (wageRes && wageRes.ok) {
        const wageRows = await wageRes.json();
        if (Array.isArray(wageRows)) {
          const map: Record<string, WageConfig> = {};
          wageRows.forEach((row: any) => {
            const wid = String(row.worker_id || '').trim();
            if (wid) {
              map[wid] = {
                worker_id: wid,
                pay_type: row.pay_type || DEFAULT_WAGE_CONFIG.pay_type,
                base_rate: Number(row.base_rate ?? DEFAULT_WAGE_CONFIG.base_rate),
                shift_start: row.shift_start || DEFAULT_WAGE_CONFIG.shift_start,
                shift_end: row.shift_end || DEFAULT_WAGE_CONFIG.shift_end,
                working_days_month: Number(
                  row.working_days_month ?? DEFAULT_WAGE_CONFIG.working_days_month
                ),
                working_days_week: Number(
                  row.working_days_week ?? DEFAULT_WAGE_CONFIG.working_days_week
                ),
                ot_multiplier: Number(row.ot_multiplier ?? DEFAULT_WAGE_CONFIG.ot_multiplier),
                grace_period_mins: Number(
                  row.grace_period_mins ?? DEFAULT_WAGE_CONFIG.grace_period_mins
                ),
              };
            }
          });
          setWageProfiles(map);
        }
      }
    } catch (err) {
      console.error('Data sync failed:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (userRole) {
      fetchAllData();
      const interval = setInterval(fetchAllData, 15000);
      return () => clearInterval(interval);
    }
  }, [userRole, fetchAllData]);

  const handleLogout = () => {
    setUserRole(null);
    setUserData(null);
    localStorage.removeItem('alfareed_session');
  };

  if (!userRole || !userData) {
    return (
      <PublicLanding
        onLoginSuccess={(payload) => {
          setUserRole(payload.role);
          setUserData(payload);
          localStorage.setItem('alfareed_session', JSON.stringify(payload));
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-[#111827] antialiased selection:bg-[#FF6600] selection:text-white">
      {/* Shared Authenticated Top Bar */}
      <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="px-3 h-10 bg-[#FF6600] rounded-xl flex items-center justify-center text-white font-black text-xs tracking-tighter shadow-md shadow-orange-500/20">
              ALFAREED
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
                {userData.full_name} {userData.designation ? `• ${userData.designation}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/kiosk"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 bg-orange-50 hover:bg-[#FF6600] text-[#FF6600] hover:text-white border border-orange-200 hover:border-[#FF6600] px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-sm"
            >
              <span>Terminal Gate ↗</span>
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

      {userRole === 'admin' ? (
        <AdminPortal
          teamMembers={teamMembers}
          attendanceLogs={attendanceLogs}
          projectBriefs={projectBriefs}
          wageProfiles={wageProfiles}
          isRefreshing={isRefreshing}
          onRefresh={fetchAllData}
        />
      ) : (
        <WorkerPortal
          userData={userData}
          attendanceLogs={attendanceLogs}
          wageConfig={wageProfiles[String(userData.user_id || '').trim()]}
        />
      )}
    </div>
  );
}