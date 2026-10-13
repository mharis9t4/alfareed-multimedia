'use client';
import { useState, useRef, useEffect } from 'react';

type UserRole = 'admin' | 'worker' | 'customer' | null;

interface TeamMember {
  id: number;
  user_id: string;
  full_name: string;
  role: string;
  designations?: string;
  card_id?: string | null;
  is_online?: number;
}

export default function Home() {
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isScopeOpen, setIsScopeOpen] = useState(false);
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [loginInput, setLoginInput] = useState('');
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [userData, setUserData] = useState<{ full_name: string; designation?: string; id?: number } | null>(null);

  const printingRef = useRef<HTMLDivElement>(null);
  const [projectBriefs, setProjectBriefs] = useState([]);
  const [payroll, setPayroll] = useState([]);

  // --- NFC Card Assignment States ---
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedWorker, setSelectedWorker] = useState<TeamMember | null>(null);
  const [isNfcModalOpen, setIsNfcModalOpen] = useState(false);
  const [nfcInput, setNfcInput] = useState('');
  const [nfcStatus, setNfcStatus] = useState<{ message: string; type: 'idle' | 'loading' | 'success' | 'error' }>({
    message: '',
    type: 'idle'
  });

  // SESSION PERSISTENCE
  useEffect(() => {
    const savedSession = localStorage.getItem('alfareed_session');
    if (savedSession) {
      const data = JSON.parse(savedSession);
      setUserRole(data.role);
      setUserData(data);
    }
  }, []);

  const fetchTeamMembers = () => {
    fetch('/api/users/list')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setTeamMembers(data);
      })
      .catch(err => console.error('Error fetching team members:', err));
  };

  useEffect(() => {
    if (userRole === 'admin') {
      fetch('/api/attendance/list')
        .then(res => res.json())
        .then(data => setAttendanceLogs(data));
      fetch('/api/admin/payroll')
        .then(res => res.json())
        .then(data => setPayroll(data));  
      fetch('/api/projects/list')
        .then(res => res.json())
        .then(data => setProjectBriefs(data));
      fetchTeamMembers();
    }
  }, [userRole]);

  // USB HID KEYSTROKE & ANDROID WEB NFC LISTENER (For Card Pairing Modal)
  useEffect(() => {
    if (!isNfcModalOpen || !selectedWorker) return;

    let buffer = '';
    let timer: NodeJS.Timeout;

    const processCardId = async (scannedId: string) => {
      const clean = scannedId.replace(/\D/g, '').trim();
      if (clean.length < 4) return;

      setNfcInput(clean);
      setNfcStatus({ message: `Card ${clean} detected. Assigning...`, type: 'loading' });

      try {
        const res = await fetch('/api/users/assign-card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: selectedWorker.user_id, cardId: clean })
        });
        const data = await res.json();

        if (res.ok) {
          setNfcStatus({ message: `Successfully assigned card ${clean} to ${selectedWorker.full_name}!`, type: 'success' });
          fetchTeamMembers();
          setTimeout(() => {
            setIsNfcModalOpen(false);
            setSelectedWorker(null);
          }, 1500);
        } else {
          setNfcStatus({ message: data.error || 'Failed to assign card.', type: 'error' });
        }
      } catch (err) {
        setNfcStatus({ message: 'Network connection failed.', type: 'error' });
      }
    };

    // 1. Desktop USB IC Reader (Keyboard Wedge listener)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (buffer.length >= 4) {
          processCardId(buffer);
        }
        buffer = '';
        clearTimeout(timer);
        return;
      }

      if (/^\d$/.test(e.key)) {
        buffer += e.key;
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (buffer.length >= 4) {
            processCardId(buffer);
          }
          buffer = '';
        }, 150);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // 2. Mobile Android Chrome (Web NFC listener)
    let ndef: any = null;
    let abortController: AbortController | null = null;
    if (typeof window !== 'undefined' && 'NDEFReader' in window) {
      try {
        abortController = new AbortController();
        ndef = new (window as any).NDEFReader();
        ndef.scan({ signal: abortController.signal }).then(() => {
          ndef.onreading = (event: any) => {
            if (event.serialNumber) {
              const hexParts = event.serialNumber.split(':');
              const hex = hexParts.join('');
              const dec = parseInt(hex, 16);
              if (!isNaN(dec)) {
                processCardId(String(dec).padStart(10, '0'));
              }
            }
          };
        }).catch(() => {});
      } catch (err) {}
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
      if (abortController) abortController.abort();
    };
  }, [isNfcModalOpen, selectedWorker]);

  // Smooth wheel scroll for Service Catalogue
  useEffect(() => {
    const slider = printingRef.current;
    if (!slider) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        slider.scrollLeft += e.deltaY * 2.5; 
      }
    };

    slider.addEventListener('wheel', handleWheel, { passive: false });
    return () => slider.removeEventListener('wheel', handleWheel);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: loginInput, 
          password: (e.target as any).password.value
        }),
      });

      const data = await response.json();
      if (data.success) {
        const userPayload = {
          id: data.user.id,
          full_name: data.user.full_name,
          designation: data.user.designation,
          role: data.user.role
        };

        setUserRole(data.user.role);
        setUserData(userPayload);
        localStorage.setItem('alfareed_session', JSON.stringify(userPayload));
        setIsLoginOpen(false);
      } else {
        alert(data.error || "Login failed. Check your credentials.");
      }
    } catch (err) {
      alert("Could not connect to the Domain.pk server.");
    }
  };

  const handleLogout = () => {
    setUserRole(null);
    setUserData(null);
    localStorage.removeItem('alfareed_session');
  };

  const services = [
    { id: '01', title: 'Industrial Printing', desc: 'High-speed offset and digital production for large scale requirements.', icon: '🖨️' },
    { id: '02', title: 'Composing & Typing', desc: 'Professional document composing, copy typing, and data entry services.', icon: '⌨️' },
    { id: '03', title: 'Binding & Finishing', desc: 'Spiral, thermal, and hard binding with precision cutting.', icon: '📚' },
    { id: '04', title: 'Lamination & Coating', desc: 'Vivid gloss and matte coatings to protect your essential documentation.', icon: '✨' },
    { id: '05', title: 'Web Development', desc: 'Custom enterprise-grade web solutions and portal management.', icon: '🌐' },
    { id: '06', title: 'Marketing & Ads', desc: 'Strategic advertising campaigns and high-impact branding materials.', icon: '🚀' },
    { id: '07', title: 'Stationery Supplies', desc: 'Premium quality corporate and academic stationery items.', icon: '🖋️' },
  ];

  // ==========================================
  // DASHBOARD VIEW
  // ==========================================
  if (userRole) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans p-4 md:p-8 text-[#1a1a1a]">
        <nav className="flex justify-between items-center mb-8 md:mb-12 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex flex-col">
            <div className="font-black text-xl tracking-tighter uppercase">
              AL FAREED <span className="text-[#FF6600]">PORTAL</span>
            </div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
              Welcome back, <span className="text-[#1a1a1a]">{userData?.full_name || 'User'}</span>
              {userData?.designation && ` • ${userData.designation}`}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a 
              href="/kiosk" 
              target="_blank" 
              className="bg-orange-50 text-[#FF6600] border border-orange-200 px-4 py-2 rounded-full font-bold text-xs uppercase hover:bg-[#FF6600] hover:text-white transition-all"
            >
              Open Kiosk ⤢
            </a>
            <button 
              onClick={handleLogout} 
              className="bg-slate-100 px-6 py-2 rounded-full font-bold text-xs uppercase hover:bg-red-50 hover:text-red-500 transition-all"
            >
              Logout
            </button>
          </div>
        </nav>

        {/* ADMIN DASHBOARD */}
        {userRole === 'admin' && (
          <div className="max-w-7xl mx-auto space-y-6 md:space-y-8 animate-in fade-in duration-500">
            {/* STAT CARDS SECTION */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Today</p>
                <p className="text-3xl font-black">
                  {Array.isArray(attendanceLogs) ? attendanceLogs.filter((log: any) => !log.check_out).length : 0}
                </p>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Team Members</p>
                <p className="text-3xl font-black text-[#FF6600]">{teamMembers.length}</p>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total OT Hours</p>
                <p className="text-3xl font-black text-green-600">
                  {Array.isArray(attendanceLogs) 
                    ? attendanceLogs.reduce((acc, log: any) => acc + parseFloat(log.overtime_hrs || 0), 0).toFixed(1) 
                    : "0.0"}h
                </p>
              </div>
              <div className="bg-[#1a1a1a] p-6 rounded-3xl shadow-xl flex items-center justify-center">
                <span className="text-white text-[10px] font-black uppercase tracking-[0.3em]">DB Sync Live</span>
              </div>
            </div>

            {/* TEAM NFC CARD ENROLLMENT MANAGEMENT */}
            <div className="bg-white p-6 md:p-10 rounded-[40px] shadow-sm border border-slate-100">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-2">
                <div>
                  <h2 className="text-2xl md:text-3xl font-black tracking-tighter text-[#1a1a1a]">NFC Card Management</h2>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Pair RFID / NFC cards for instant attendance</p>
                </div>
                <span className="bg-orange-50 text-[#FF6600] px-3 py-1 rounded-full text-[10px] font-black uppercase">
                  {teamMembers.filter(m => m.card_id).length} of {teamMembers.length} Cards Assigned
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead>
                    <tr className="text-slate-400 text-[10px] uppercase tracking-[0.2em] border-b border-slate-100">
                      <th className="pb-3 pl-2">Employee</th>
                      <th className="pb-3">Worker ID</th>
                      <th className="pb-3">Designation</th>
                      <th className="pb-3">Assigned Card ID</th>
                      <th className="pb-3 text-right pr-2">Action</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm font-semibold">
                    {teamMembers.length > 0 ? (
                      teamMembers.map((member) => (
                        <tr key={member.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                          <td className="py-4 pl-2 font-bold text-[#1a1a1a]">{member.full_name}</td>
                          <td className="py-4 font-mono text-slate-500 text-xs">{member.user_id}</td>
                          <td className="py-4 text-slate-500 text-xs">{member.designations || 'Worker'}</td>
                          <td className="py-4">
                            {member.card_id ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono font-bold bg-green-50 text-green-700 border border-green-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                {member.card_id}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-400">
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
                              className="bg-[#1a1a1a] text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-[#FF6600] transition-all"
                            >
                              {member.card_id ? 'Change Card' : 'Pair Card +'}
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400 italic text-xs">
                          Loading team members...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* REGISTER TEAM MEMBER SECTION */}
            <div className="bg-white p-6 md:p-10 rounded-[40px] shadow-sm border border-slate-100">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-2xl md:text-3xl font-black tracking-tighter text-[#1a1a1a]">Register Team Member</h2>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Add new accounts to MySQL</p>
                </div>
              </div>
              <form 
                onSubmit={async (e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const data = Object.fromEntries(formData);
                  
                  try {
                    const res = await fetch('/api/users/register', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(data),
                    });

                    if (res.ok) {
                      alert("Worker registered successfully!");
                      (e.target as HTMLFormElement).reset();
                      fetchTeamMembers();
                    } else {
                      const err = await res.json();
                      alert(err.error || "Registration failed");
                    }
                  } catch (err) {
                    alert("Connection error to Domain.pk server");
                  }
                }}
                className="grid grid-cols-1 md:grid-cols-3 gap-6"
              >
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase px-2">Full Identity</label>
                  <input name="full_name" placeholder="Full Name" required className="w-full p-5 bg-slate-50 rounded-2xl outline-none border-none font-medium focus:ring-2 focus:ring-[#FF6600]/20" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase px-2">Access Username</label>
                  <input name="username" placeholder="Username" required className="w-full p-5 bg-slate-50 rounded-2xl outline-none border-none font-medium focus:ring-2 focus:ring-[#FF6600]/20" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase px-2">Secure Password</label>
                  <input name="password" type="password" placeholder="Password" required className="w-full p-5 bg-slate-50 rounded-2xl outline-none border-none font-medium focus:ring-2 focus:ring-[#FF6600]/20" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase px-2">Job Designation</label>
                  <input name="designation" placeholder="e.g. Graphic Designer" className="w-full p-5 bg-slate-50 rounded-2xl outline-none border-none font-medium focus:ring-2 focus:ring-[#FF6600]/20" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase px-2">System Role</label>
                  <select name="role" required className="w-full p-5 bg-slate-50 rounded-2xl outline-none border-none font-medium appearance-none">
                    <option value="worker">Worker</option>
                    <option value="customer">Customer</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button type="submit" className="w-full bg-[#FF6600] text-white font-black py-5 rounded-2xl hover:bg-[#1a1a1a] transition-all uppercase text-xs tracking-widest shadow-lg shadow-orange-100">
                    Create Account +
                  </button>
                </div>
              </form>
            </div>

            {/* PRECISION PAYROLL TRACKER */}
            <div className="bg-white p-6 md:p-10 rounded-[40px] shadow-sm border border-slate-100">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                  <h2 className="text-2xl md:text-3xl font-black tracking-tighter text-[#1a1a1a]">Precision Payroll</h2>
                  <p className="text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-widest mt-1">
                    Calculates exact earnings based on seconds logged
                  </p>
                </div>
                <div className="flex gap-2">
                  <button className="bg-[#1a1a1a] text-white px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-[#FF6600] transition-all">Monthly</button>
                  <button className="bg-slate-50 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-slate-100 transition-all">Weekly</button>
                  <button className="bg-slate-50 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-slate-100 transition-all">Daily</button>
                </div>
              </div>
              
              <div className="overflow-x-auto -mx-2 md:mx-0">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="text-slate-400 text-[10px] uppercase tracking-[0.2em] border-b border-slate-50">
                      <th className="pb-4 pl-4">Employee</th>
                      <th className="pb-4">Structure</th>
                      <th className="pb-4">Days Active</th>
                      <th className="pb-4">Regular Hrs</th>
                      <th className="pb-4 text-[#FF6600]">Sunday/OT</th>
                      <th className="pb-4 text-right pr-4">Total Earned</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm font-semibold">
                    {Array.isArray(payroll) && payroll.length > 0 ? (
                      payroll.map((row: any) => (
                        <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
                          <td className="py-6 pl-4">
                            <p className="font-bold text-[#1a1a1a]">{row.name}</p>
                            <p className="text-[9px] text-slate-400 uppercase tracking-widest">ID: #{row.id.toString().padStart(3, '0')}</p>
                          </td>
                          <td className="py-6">
                            <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${
                              row.payType === 'hourly' ? 'bg-blue-50 text-blue-500' : 
                              row.payType === 'daily' ? 'bg-purple-50 text-purple-500' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {row.payType}
                            </span>
                          </td>
                          <td className="py-6 font-medium text-slate-600 pl-4">{row.daysWorked} Days</td>
                          <td className="py-6 font-mono text-slate-600">{row.totalHours}h</td>
                          <td className="py-6 font-mono text-[#FF6600] font-bold">{parseFloat(row.otHours) > 0 ? `+${row.otHours}h` : '-'}</td>
                          <td className="py-6 pr-4 text-right">
                            <p className="text-lg font-black text-[#1a1a1a]">Rs. {row.totalPay}</p>
                            <button className="text-[9px] text-[#FF6600] font-bold uppercase tracking-widest hover:underline mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              View Breakdown →
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-300 italic uppercase tracking-widest">
                          {payroll ? "Calculating Payroll..." : "No payroll data found"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* PROJECT BRIEFS SECTION */}
            <div className="bg-white p-6 md:p-10 rounded-[40px] shadow-sm border border-slate-100">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <h2 className="text-2xl md:text-3xl font-black tracking-tighter text-[#1a1a1a]">Incoming Project Briefs</h2>
                <span className="bg-orange-100 text-[#FF6600] px-4 py-1 rounded-full text-[10px] font-black uppercase">
                  {Array.isArray(projectBriefs) ? projectBriefs.length : 0} New Leads
                </span>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="text-slate-400 text-[10px] uppercase tracking-[0.2em] border-b border-slate-50">
                      <th className="pb-4">Client</th>
                      <th className="pb-4">Service</th>
                      <th className="pb-4">Timeline</th>
                      <th className="pb-4">Description</th>
                      <th className="pb-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm font-semibold">
                    {Array.isArray(projectBriefs) && projectBriefs.length > 0 ? (
                      projectBriefs.map((brief: any) => (
                        <tr key={brief.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                          <td className="py-6 font-bold text-[#1a1a1a]">{brief.client_name}</td>
                          <td className="py-6"><span className="bg-slate-100 px-3 py-1 rounded-lg text-[10px] uppercase">{brief.service_type}</span></td>
                          <td className="py-6 text-slate-500">{brief.deadline}</td>
                          <td className="py-6 max-w-xs truncate text-slate-400 font-medium">{brief.description}</td>
                          <td className="py-6 text-right flex gap-4 justify-end items-center">
                            <button 
                              onClick={async () => {
                                if(confirm("Mark this project as completed and remove from list?")) {
                                  const res = await fetch('/api/projects/delete', {
                                    method: 'DELETE',
                                    headers: {'Content-Type': 'application/json'},
                                    body: JSON.stringify({ id: brief.id })
                                  });
                                  if(res.ok) {
                                    setProjectBriefs(prev => prev.filter((b: any) => b.id !== brief.id));
                                  }
                                }
                              }}
                              className="text-gray-300 hover:text-green-500 transition-colors font-bold text-[10px] uppercase tracking-widest"
                            >
                              Done ✓
                            </button>
                            <a href={`mailto:?subject=Al Fareed Project: ${brief.service_type}`} className="text-[#FF6600] hover:underline font-bold text-xs uppercase tracking-widest">Contact</a>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={5} className="py-12 text-center text-slate-300 italic uppercase tracking-widest">No project briefs submitted yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* WORKER DASHBOARD */}
        {userRole === 'worker' && (
          <div className="max-w-7xl mx-auto space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm relative overflow-hidden">
                <div className="flex justify-between items-start mb-6">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Attendance Management</p>
                  <span className="bg-green-100 text-green-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter">Live Session</span>
                </div>
                
                <div className="flex flex-col gap-3">
                  <button 
                    onClick={async () => {
                      try {
                        const response = await fetch('/api/attendance', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ employee_id: userData?.id || 1, status: 'On-Time' }),
                        });
                        if (response.ok) alert('Clock-In Recorded!');
                      } catch (err) {
                        alert('Connection Error');
                      }
                    }}
                    className="w-full bg-[#1a1a1a] text-white py-5 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-[#FF6600] transition-all shadow-lg"
                  >
                    Clock In
                  </button>

                  <button 
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/attendance/checkout', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ employee_id: userData?.id || 1 }),
                        });
                        const data = await res.json();
                        if (res.ok) alert(`Clocked Out! Overtime: ${data.overtime_hrs}h`);
                        else alert(data.error);
                      } catch (err) {
                        alert('Connection Error');
                      }
                    }}
                    className="w-full border-2 border-[#1a1a1a] text-[#1a1a1a] py-5 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-slate-50 transition-all"
                  >
                    Clock Out
                  </button>
                </div>
                <p className="text-[10px] text-center text-slate-400 font-bold mt-4 uppercase tracking-widest italic">Database Sync Active</p>
              </div>

              <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Weekly Statistics</p>
                <div className="flex items-end gap-2">
                  <p className="text-3xl font-black text-[#1a1a1a]">42.5h</p>
                  <p className="text-xs text-green-500 font-bold mb-1">Target: 48h</p>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full mt-4 overflow-hidden">
                  <div className="bg-[#FF6600] h-full w-[88%]" />
                </div>
              </div>

              <div className="bg-orange-50 p-8 rounded-[40px] border border-orange-100 shadow-sm">
                <p className="text-[10px] font-black text-[#FF6600] uppercase tracking-widest mb-4">Overtime Earned</p>
                <p className="text-3xl font-black text-[#FF6600]">08.0h</p>
                <p className="text-xs text-[#FF6600]/60 font-bold mt-1">Calculated for current month</p>
              </div>
            </div>
          </div>
        )}

        {/* CARD ENROLLMENT MODAL */}
        {isNfcModalOpen && selectedWorker && (
          <div className="fixed inset-0 z-[7000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <div className="bg-white rounded-[36px] max-w-md w-full p-8 shadow-2xl relative animate-in fade-in zoom-in-95">
              <button 
                onClick={() => {
                  setIsNfcModalOpen(false);
                  setSelectedWorker(null);
                }} 
                className="absolute top-6 right-6 text-slate-400 hover:text-slate-800 text-lg font-bold"
              >
                ✕
              </button>

              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-orange-100 text-[#FF6600] rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl animate-pulse">
                  💳
                </div>
                <h3 className="text-xl font-black text-[#1a1a1a]">Assign NFC Card</h3>
                <p className="text-slate-400 text-xs mt-1">
                  Employee: <strong className="text-[#1a1a1a]">{selectedWorker.full_name}</strong> ({selectedWorker.user_id})
                </p>
              </div>

              <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center mb-6">
                <p className="text-xs font-bold text-slate-600 mb-1">Waiting for card tap...</p>
                <p className="text-[11px] text-slate-400">
                  Tap card on USB Reader or tap back of NFC phone
                </p>
              </div>

              {nfcStatus.message && (
                <div className={`p-3 rounded-xl text-xs font-bold text-center mb-4 ${
                  nfcStatus.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
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
                      fetchTeamMembers();
                      setTimeout(() => {
                        setIsNfcModalOpen(false);
                        setSelectedWorker(null);
                      }, 1000);
                    } else {
                      setNfcStatus({ message: data.error || 'Failed to assign card.', type: 'error' });
                    }
                  } catch (err) {
                    setNfcStatus({ message: 'Network error.', type: 'error' });
                  }
                }}
                className="space-y-3"
              >
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 px-1">Manual 10-Digit Card ID</label>
                  <input 
                    type="text" 
                    value={nfcInput} 
                    onChange={(e) => setNfcInput(e.target.value)} 
                    placeholder="e.g. 0170112260"
                    maxLength={20}
                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm font-bold text-center outline-none focus:border-[#FF6600]"
                  />
                </div>

                <div className="flex gap-2">
                  <button 
                    type="submit" 
                    className="flex-1 bg-[#FF6600] text-white py-3 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-[#1a1a1a] transition-all"
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
                          fetchTeamMembers();
                          setIsNfcModalOpen(false);
                        }
                      }}
                      className="px-4 py-3 bg-red-50 text-red-600 rounded-xl font-black text-xs uppercase hover:bg-red-100 transition-all"
                    >
                      Remove
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

  // ==========================================
  // LANDING PAGE VIEW
  // ==========================================
  return (
    <main className="min-h-screen bg-[#050505] font-sans relative text-white overflow-x-hidden selection:bg-[#FF6600]">
      <div className="fixed top-[-10%] right-[-10%] w-[300px] md:w-[600px] h-[300px] md:h-[600px] bg-[#FF6600]/10 rounded-full blur-[100px] md:blur-[150px] animate-pulse pointer-events-none" />
      <div className="fixed bottom-[-10%] left-[-10%] w-[300px] md:w-[500px] h-[300px] md:h-[500px] bg-[#333]/20 rounded-full blur-[100px] md:blur-[120px] pointer-events-none" />

      <nav className="flex justify-between items-center px-6 md:px-16 py-8 md:py-10 bg-black/40 backdrop-blur-2xl sticky top-0 z-[1000] border-b border-white/5">
        <div className="flex flex-col group cursor-default leading-none">
          <div className="flex items-baseline">
            <span className="text-xl md:text-3xl font-bold tracking-tighter text-white uppercase">AL FAREED</span>
            <div className="ml-1 w-2 h-2 bg-[#FF6600] animate-pulse"></div>
          </div>
          <span className="text-[8px] font-bold tracking-[0.4em] text-gray-500 uppercase mt-1 hidden md:block">Multimedia Solution Provider</span>
        </div>
        <div className="hidden lg:flex gap-12 font-black uppercase tracking-[0.3em] text-gray-400 text-[10px]">
          <a href="#printing" className="hover:text-[#FF6600] transition-colors">Services</a>
          <a href="#contact" className="hover:text-[#FF6600] transition-colors">Contact</a>
        </div>
        <button onClick={() => setIsLoginOpen(true)} className="bg-white text-black px-8 py-3 md:px-12 md:py-4 rounded-full font-black text-[9px] md:text-[10px] tracking-widest hover:bg-[#FF6600] hover:text-white transition-all transform hover:scale-105 active:scale-95 uppercase shadow-xl">Portal Access</button>
      </nav>

      {/* HERO SECTION */}
      <section className="max-w-7xl mx-auto px-6 pt-24 md:pt-32 pb-24 grid lg:grid-cols-2 gap-12 md:gap-20 items-center">
        <div className="space-y-8 md:space-y-10 relative z-10">
          <div className="inline-block bg-white/5 backdrop-blur-xl border border-white/10 px-6 py-2 rounded-full"><span className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.4em] text-[#FF6600]">Karachi Headquartered • Est. 2005</span></div>
          <h1 className="text-5xl md:text-[90px] font-black tracking-tighter leading-[0.9] md:leading-[0.85] text-white">
            Beyond <br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FF6600] to-white italic">Paper.</span>
          </h1>
          <p className="text-lg md:text-xl text-gray-400 font-medium max-w-lg leading-relaxed">
            Industrial printing, document composing, high-end digital advertising, and enterprise web development. We are your complete multimedia engineering partner.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 md:gap-6">
            <button onClick={() => setIsProjectModalOpen(true)} className="bg-[#FF6600] text-white px-10 py-5 rounded-[24px] font-black text-xs uppercase tracking-widest hover:bg-white hover:text-black transition-all shadow-[0_15px_45px_rgba(255,102,0,0.3)]">Launch Project</button>
            <button onClick={() => setIsScopeOpen(true)} className="border border-white/10 backdrop-blur-md px-10 py-5 rounded-[24px] font-black text-xs uppercase tracking-widest hover:bg-white/5 transition-all">Explore Scope</button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 relative">
          <div className="bg-white/5 backdrop-blur-3xl border border-white/10 p-6 md:p-8 rounded-[32px] md:rounded-[48px] hover:border-[#FF6600]/40 transition-all group">
            <div className="text-3xl md:text-4xl mb-4 group-hover:scale-110 transition-transform">📄</div>
            <h3 className="font-bold text-lg uppercase italic text-white">Documentation</h3>
            <p className="text-gray-500 text-[10px] leading-relaxed mt-2 uppercase font-bold tracking-widest">Typing / Composing / Binding</p>
          </div>
          <div className="bg-white/5 backdrop-blur-3xl border border-white/10 p-6 md:p-8 rounded-[32px] md:rounded-[48px] mt-6 md:mt-10 hover:border-[#FF6600]/40 transition-all group">
            <div className="text-3xl md:text-4xl mb-4 group-hover:scale-110 transition-transform">✨</div>
            <h3 className="font-bold text-lg uppercase italic text-white">Finishing</h3>
            <p className="text-gray-500 text-[10px] leading-relaxed mt-2 uppercase font-bold tracking-widest">Lamination / Coating / Stationery</p>
          </div>
          <div className="bg-white/5 backdrop-blur-3xl border border-white/10 p-6 md:p-8 rounded-[32px] md:rounded-[48px] hover:border-[#FF6600]/40 transition-all group">
            <div className="text-3xl md:text-4xl mb-4 group-hover:scale-110 transition-transform">🌐</div>
            <h3 className="font-bold text-lg uppercase italic text-white">Digital Ops</h3>
            <p className="text-gray-500 text-[10px] leading-relaxed mt-2 uppercase font-bold tracking-widest">Web Dev / SEO / Social Ads</p>
          </div>
          <div className="bg-white/5 backdrop-blur-3xl border border-white/10 p-6 md:p-8 rounded-[32px] md:rounded-[48px] mt-6 md:mt-10 hover:border-[#FF6600]/40 transition-all group">
            <div className="text-3xl md:text-4xl mb-4 group-hover:scale-110 transition-transform">🏛️</div>
            <h3 className="font-bold text-lg uppercase italic text-white">Marketing</h3>
            <p className="text-gray-500 text-[10px] leading-relaxed mt-2 uppercase font-bold tracking-widest">Billboard / POS / Branding</p>
          </div>
        </div>
      </section>

      {/* SERVICE CATALOGUE */}
      <section id="printing" className="py-24 md:py-32 bg-white/5 backdrop-blur-sm border-y border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-12 md:mb-20">
            <h4 className="text-[#FF6600] font-black text-[9px] md:text-[10px] uppercase tracking-[0.5em]">Service Catalogue</h4>
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter italic uppercase">The Multimedia Engine.</h2>
          </div>
          <div 
            ref={printingRef} 
            className="flex flex-col md:flex-row gap-6 md:overflow-x-auto pb-0 md:pb-12 no-scrollbar cursor-default md:cursor-grab md:active:cursor-grabbing" 
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {services.map((s) => (
              <div key={s.id} className="w-full md:w-auto md:min-w-[400px] md:shrink-0 bg-white/5 backdrop-blur-3xl p-8 md:p-12 rounded-[40px] md:rounded-[56px] border border-white/10 hover:border-[#FF6600]/50 transition-all group">
                <div className="text-4xl md:text-5xl mb-8 md:mb-10 group-hover:scale-125 transition-transform duration-500">{s.icon}</div>
                <div className="text-[#FF6600] font-black text-[9px] md:text-[10px] mb-4 opacity-40 tracking-[0.3em] uppercase">{s.id}</div>
                <h3 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6 italic uppercase">{s.title}</h3>
                <p className="text-gray-500 font-medium leading-relaxed text-sm md:text-base">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT & HQ SECTION */}
      <section id="contact" className="py-24 md:py-32 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16 md:gap-24 items-center">
          <div className="bg-white/5 backdrop-blur-3xl rounded-[48px] md:rounded-[56px] p-8 md:p-16 border border-white/10 relative shadow-2xl overflow-hidden group">
            <div className="relative z-10">
              <h3 className="text-2xl md:text-3xl font-black italic uppercase text-white tracking-tighter mb-4">
                Capability <span className="text-[#FF6600]">Pulse.</span>
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed mb-6">
                Direct printing and commercial design center operating in Johar Mor, Karachi.
              </p>
              <button 
                onClick={() => setIsScopeOpen(true)}
                className="w-full bg-white text-black font-black py-4 rounded-2xl hover:bg-[#FF6600] hover:text-white transition-all tracking-[0.2em] uppercase text-[10px]"
              >
                Explore Capabilities →
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <h2 className="text-4xl md:text-5xl font-black tracking-tighter uppercase text-white">
              Reach the <span className="text-[#FF6600]">HQ.</span>
            </h2>
            <div className="p-6 bg-white/5 rounded-3xl border border-white/10 flex items-center gap-4">
              <span className="text-2xl">📍</span>
              <div>
                <p className="text-xs font-black uppercase text-[#FF6600]">Karachi Hub</p>
                <p className="text-gray-400 text-sm font-bold">Shop # 21, Empire Centre, Johar Mor, Karachi.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* LOGIN MODAL */}
      {isLoginOpen && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/80 backdrop-blur-[50px] p-6 text-center">
          <div className="bg-[#0a0a0a] border border-white/20 w-full max-w-md rounded-[40px] p-10 relative shadow-2xl">
            <button onClick={() => setIsLoginOpen(false)} className="absolute top-6 right-6 text-white/40 hover:text-white">✕</button>
            <h2 className="text-3xl font-black tracking-tighter uppercase text-white mb-2">SYSTEM <span className="text-[#FF6600]">ACCESS.</span></h2>
            <form onSubmit={handleLogin} className="space-y-4 mt-6">
              <input type="text" placeholder="Identity / Username" value={loginInput} onChange={(e) => setLoginInput(e.target.value)} className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl outline-none font-bold text-white focus:border-[#FF6600]" />
              <input type="password" name="password" placeholder="Password" className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl outline-none font-bold text-white focus:border-[#FF6600]" />
              <button className="w-full bg-[#FF6600] text-white font-black py-4 rounded-2xl hover:bg-white hover:text-black transition-all uppercase tracking-widest text-xs">Execute Login</button>
            </form>
          </div>
        </div>
      )}

      {/* WHATSAPP FLOAT */}
      <div className="fixed bottom-6 right-6 z-[100]">
        <a href="https://wa.me/923325327333" target="_blank" rel="noreferrer" className="w-14 h-14 bg-[#25D366] rounded-full flex items-center justify-center shadow-2xl hover:scale-110 transition-transform">
          <span className="text-2xl">💬</span>
        </a>
      </div>
    </main>
  );
}