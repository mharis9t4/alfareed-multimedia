// components/PublicLanding.tsx
'use client';

import { useState, useMemo } from 'react';

interface PublicLandingProps {
  onLoginSuccess: (user: {
    id: number;
    user_id: string;
    full_name: string;
    designation?: string;
    role: 'admin' | 'worker' | 'customer';
  }) => void;
}

export default function PublicLanding({ onLoginSuccess }: PublicLandingProps) {
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [loginInput, setLoginInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [calcService, setCalcService] = useState<
    | 'bw_copy'
    | 'color_print'
    | 'pvc_card'
    | 'composing'
    | 'spiral_binding'
    | 'hard_binding'
    | 'panaflex'
  >('color_print');
  const [calcQuantity, setCalcQuantity] = useState<number>(50);

  const calculatedEstimate = useMemo(() => {
    const rates: Record<string, number> = {
      bw_copy: 6,
      color_print: 100,
      pvc_card: 200,
      composing: 500,
      spiral_binding: 250,
      hard_binding: 1000,
      panaflex: 45,
    };
    return (rates[calcService] || 10) * Math.max(1, calcQuantity);
  }, [calcService, calcQuantity]);

  const servicePillars = [
    {
      id: '01',
      title: 'Industrial Offset & Digital Printing',
      spec: 'Offset Presses & Production Digital Copiers',
      desc: 'High-speed multi-color printing for catalogs, magazines, letterheads, brochures, carbonless NCR bill books, and packaging boxes.',
      icon: '🖨️',
      tag: 'Core Production',
    },
    {
      id: '02',
      title: 'Document Composing & Urdu Nastaleeq',
      spec: 'Jameel Noori Nastaleeq • Legal Layouts',
      desc: 'Master document typography in Urdu Nastaleeq, English corporate drafting, Arabic translation, court affidavits, stamped bond agreements, and academic manuscripts.',
      icon: '✒️',
      tag: 'Typography Studio',
    },
    {
      id: '03',
      title: 'Commercial Photostat & Duplication',
      spec: 'Konica Minolta bizhub High-Volume Fleet',
      desc: 'High-volume digital photocopying, blueprint reproduction, bulk exam copying, dual-sided ledger scanning, and rapid secure paper handling.',
      icon: '📄',
      tag: 'High Velocity',
    },
    {
      id: '04',
      title: 'PVC Smart Cards & NFC Credentials',
      spec: 'Dual-Interface 13.56MHz & HID Dongle Sync',
      desc: 'Edge-to-edge high-definition thermal PVC card printing, employee RFID badges, custom printed polyester lanyards, and direct 24/7 terminal attendance integration.',
      icon: '🪪',
      tag: 'Hardware Solutions',
    },
    {
      id: '05',
      title: 'Finishing, Lamination & Luxury Binding',
      spec: 'Hot Foil Embossing • Rexine Hard Covers',
      desc: 'Spiral coil, wire-o, comb binding, thermal glue binding, and handmade hard leatherette bookbinding with golden seal embossing.',
      icon: '📚',
      tag: 'Finishing Works',
    },
    {
      id: '06',
      title: 'Outdoor Flex, Signage & Billboards',
      spec: 'Wide-Format UV & Solvent Outdoor Plotters',
      desc: 'Heavy-duty Panaflex shop signs, street streamers, backlit commercial signage, frosted glass films, and rollup standees.',
      icon: '🏗️',
      tag: 'Signage & Displays',
    },
    {
      id: '07',
      title: 'Enterprise Software & Web Portals',
      spec: 'Next.js • Node.js • MySQL Engine',
      desc: 'Enterprise business management portals, cloud POS billing solutions, biometric/NFC worker monitoring gates, and digital asset portals developed in-house.',
      icon: '💻',
      tag: 'Digital Engineering',
    },
    {
      id: '08',
      title: 'Corporate Stationery & Digital Stamps',
      spec: 'Pre-Inked Flash Polymer & Brass Seals',
      desc: 'Custom flash stamps, dater seals, official company monograms, premium executive envelopes, and corporate paper assortments.',
      icon: '💮',
      tag: 'Corporate Supply',
    },
  ];

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);

    const target = e.currentTarget;
    const password = (target.elements.namedItem('password') as HTMLInputElement).value;

    try {
      const res = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginInput.trim(), password }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        onLoginSuccess({
          id: data.user.id,
          user_id: data.user.user_id,
          full_name: data.user.full_name,
          designation: data.user.designation,
          role: data.user.role,
        });
        setIsLoginOpen(false);
      } else {
        setLoginError(data.error || 'Authentication rejected. Verify credentials.');
      }
    } catch {
      setLoginError('Could not connect to the Al Fareed production server.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <main className="min-h-screen bg-white font-sans text-[#111827] antialiased selection:bg-[#FF6600] selection:text-white">
      {/* Top Brand Navigation */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="px-3 h-11 bg-black rounded-2xl flex items-center justify-center text-white font-black text-sm tracking-tighter shadow-lg border border-black">
              ALFAREED<span className="text-[#FF6600]">.</span>
            </div>
            <div>
              <div className="flex items-center gap-1.5 leading-none">
                <span className="text-xl font-black tracking-tighter text-black uppercase">
                  AL FAREED
                </span>
                <span className="text-xl font-black tracking-tighter text-[#FF6600] uppercase">
                  MULTIMEDIA
                </span>
              </div>
              <p className="text-[9px] font-bold tracking-[0.25em] uppercase text-slate-400 mt-1">
                Printing • Composing • Technology • Advertising
              </p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-8 text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
            <a href="#services" className="hover:text-[#FF6600] transition-colors">
              Services
            </a>
            <a href="#calculator" className="hover:text-[#FF6600] transition-colors">
              Estimator
            </a>
            <a href="#about" className="hover:text-[#FF6600] transition-colors">
              Studio & Plant
            </a>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/kiosk"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-3.5 py-2 rounded-xl border border-slate-200 text-slate-700 hover:border-[#FF6600] hover:text-[#FF6600] transition-all"
            >
              Terminal Gate ↗
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
                Industrial offset production, Urdu Nastaleeq typography composing, heavy-duty
                photocopying, smart PVC RFID employee cards, and bespoke enterprise management
                portals.
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
            </div>

            <div className="lg:col-span-5 grid grid-cols-2 gap-4">
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xl space-y-3">
                <span className="text-3xl">🖨️</span>
                <h3 className="font-black text-sm uppercase text-black">Offset & Digital</h3>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  High-speed Heidelberg & digital production for commercial books and packaging.
                </p>
              </div>
              <div className="bg-black text-white p-6 rounded-3xl shadow-xl space-y-3 mt-6">
                <span className="text-3xl text-[#FF6600]">✒️</span>
                <h3 className="font-black text-sm uppercase text-white">Nastaleeq Typeset</h3>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Architectural Urdu and legal document drafting with Jameel Noori Nastaleeq font.
                </p>
              </div>
              <div className="bg-orange-50 p-6 rounded-3xl border border-orange-200 shadow-sm space-y-3">
                <span className="text-3xl">🪪</span>
                <h3 className="font-black text-sm uppercase text-[#FF6600]">Smart PVC Cards</h3>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  RFID 10-digit chip attendance badges paired with instant terminal gate check-in.
                </p>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xl space-y-3 mt-6">
                <span className="text-3xl">🏗️</span>
                <h3 className="font-black text-sm uppercase text-black">Flex Signage</h3>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Wide-format Panaflex billboards, acrylic displays, and retail vinyl wrapping.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Catalogue */}
      <section id="services" className="py-24 bg-slate-50 border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-[#FF6600]">
              Engineering Pillars
            </p>
            <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-black uppercase mt-1">
              Complete Production Services.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {servicePillars.map((p) => (
              <div
                key={p.id}
                className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm hover:border-[#FF6600] hover:shadow-xl transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="flex justify-between items-start mb-6">
                    <span className="text-4xl">{p.icon}</span>
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
                  <span>Inquire Specifications →</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Calculator Section */}
      <section id="calculator" className="py-24 bg-white border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-black text-white rounded-[40px] p-8 sm:p-14 shadow-2xl">
            <div className="space-y-8">
              <div>
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#FF6600]">
                  Live Estimator
                </span>
                <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-white uppercase mt-1">
                  Instant Production Calculator.
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center pt-4">
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                      Select Capability
                    </label>
                    <select
                      value={calcService}
                      onChange={(e: any) => setCalcService(e.target.value)}
                      className="w-full p-4 bg-white/10 border border-white/20 rounded-2xl text-white font-bold text-sm outline-none focus:border-[#FF6600]"
                    >
                      <option className="bg-black text-white" value="color_print">
                        Laser Color Print (A4 Glossy / 200gsm)
                      </option>
                      <option className="bg-black text-white" value="bw_copy">
                        High-Speed B/W Photostat (A4 / 70gsm)
                      </option>
                      <option className="bg-black text-white" value="pvc_card">
                        Smart PVC NFC Card (Printed Dual-Side)
                      </option>
                      <option className="bg-black text-white" value="composing">
                        Urdu / Legal Composing (Per Page)
                      </option>
                      <option className="bg-black text-white" value="spiral_binding">
                        Spiral / Thermal Binding (Per Book)
                      </option>
                      <option className="bg-black text-white" value="hard_binding">
                        Hard Rexine Golden Embossed Binding
                      </option>
                      <option className="bg-black text-white" value="panaflex">
                        Panaflex Billboard Flex (Per Sq Ft)
                      </option>
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
                  </div>
                </div>

                <div className="bg-white/10 border border-white/15 p-8 rounded-3xl text-center space-y-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Estimated Total
                  </p>
                  <p className="text-4xl sm:text-5xl font-black text-[#FF6600] font-mono">
                    Rs. {calculatedEstimate.toLocaleString()}
                  </p>
                  <a
                    href={`https://wa.me/923325327333?text=Salam%20Al%20Fareed,%20I%20want%20to%20place%20an%20order%20for%20${calcQuantity}%20units%20of%20${calcService}%20(Estimated%20Rs.%20${calculatedEstimate})`}
                    target="_blank"
                    rel="noreferrer"
                    className="block w-full bg-[#FF6600] hover:bg-white hover:text-black text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest transition-all"
                  >
                    Confirm Order on WhatsApp
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-20 bg-slate-50 border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-4">
            <span className="text-xs font-black uppercase tracking-[0.25em] text-[#FF6600]">
              Karachi Facility
            </span>
            <h2 className="text-4xl font-black tracking-tight text-black uppercase">
              Production Plant & Studio Hub.
            </h2>
            <p className="text-slate-600 font-medium leading-relaxed text-sm">
              Operating directly out of Johar Mor on Rashid Minhas Road, Al Fareed combines heavy
              industrial copiers, digital presses, bindery stations, and an in-house software
              engineering team.
            </p>
          </div>
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4 text-xs font-semibold">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="font-black text-black uppercase">Karachi Headquarters</p>
              <p className="text-slate-500 mt-0.5">
                Shop # 21, Empire Centre, Johar Mor, Rashid Minhas Road, Karachi, Pakistan.
              </p>
            </div>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="font-black text-black uppercase">Hotline & Inquiries</p>
              <p className="text-slate-500 mt-0.5">0310-2828228 • 0332-5327333</p>
            </div>
          </div>
        </div>
      </section>

      {/* Project Inquiry Modal */}
      {isProjectModalOpen && (
        <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl relative border border-slate-200">
            <button
              onClick={() => setIsProjectModalOpen(false)}
              className="absolute top-6 right-6 text-slate-400 hover:text-black font-bold text-lg"
            >
              ✕
            </button>
            <h3 className="text-2xl font-black text-black uppercase tracking-tight">
              Submit Project Brief
            </h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const payload = Object.fromEntries(formData);
                try {
                  const res = await fetch('/api/projects/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                  });
                  if (res.ok) {
                    alert('Project Brief Transmitted Successfully!');
                    setIsProjectModalOpen(false);
                  }
                } catch {
                  setIsProjectModalOpen(false);
                }
              }}
              className="space-y-4 mt-6"
            >
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                  Client Name
                </label>
                <input
                  name="client_name"
                  required
                  placeholder="Your Name or Company"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-[#FF6600]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    Service
                  </label>
                  <select
                    name="service_type"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-[#FF6600]"
                  >
                    <option value="Printing">Printing & Packaging</option>
                    <option value="Composing">Urdu / Legal Composing</option>
                    <option value="Smart Cards">Smart PVC / NFC Badges</option>
                    <option value="Binding">Luxury Binding & Finishing</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                    Phone
                  </label>
                  <input
                    name="phone"
                    required
                    placeholder="0300-1234567"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-[#FF6600]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                  Requirements
                </label>
                <textarea
                  name="description"
                  required
                  rows={3}
                  placeholder="Specs, quantity, deadline..."
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-[#FF6600]"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-[#FF6600] hover:bg-black text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest transition-all"
              >
                Transmit Brief
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Login Modal */}
      {isLoginOpen && (
        <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-8 shadow-2xl relative border border-slate-200">
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
              <span className="px-3 py-2 bg-black text-[#FF6600] rounded-2xl inline-block text-xs font-black mb-3">
                ALFAREED PORTAL
              </span>
              <h3 className="text-2xl font-black text-black uppercase tracking-tight">
                System Access
              </h3>
              <p className="text-xs text-slate-400 font-semibold mt-1">
                Enter your Admin or Staff User ID
              </p>
            </div>
            {loginError && (
              <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-bold text-center">
                {loginError}
              </div>
            )}
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                  User ID
                </label>
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
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                  Password
                </label>
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
                disabled={isLoggingIn}
                className="w-full bg-[#FF6600] hover:bg-black text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest transition-all shadow-md shadow-orange-500/20"
              >
                {isLoggingIn ? 'Verifying...' : 'Execute Login'}
              </button>
            </form>
          </div>
        </div>
      )}

      <footer className="bg-black text-white py-12 border-t border-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <span className="font-black text-lg uppercase tracking-tight text-white">
              AL FAREED MULTIMEDIA
            </span>
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