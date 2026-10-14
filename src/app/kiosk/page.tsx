'use client';
import { useState, useEffect, useRef } from 'react';

type TerminalState = 'idle' | 'scanning' | 'clock_in' | 'clock_out' | 'error';

interface ScanResult {
  action?: 'CLOCK_IN' | 'CLOCK_OUT';
  employee?: {
    name: string;
    worker_id: string;
  };
  time?: string;
  date?: string;
  totalHours?: number;
  message?: string;
  error?: string;
  cardId?: string;
}

export default function KioskPage() {
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');
  const [state, setState] = useState<TerminalState>('idle');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  
  // Mobile NFC States
  const [isMobileDevice, setIsMobileDevice] = useState<boolean>(false);
  const [nfcSupported, setNfcSupported] = useState<boolean>(false);
  const [nfcActive, setNfcActive] = useState<boolean>(false);
  const [nfcError, setNfcError] = useState<string>('');

  const [recentLogs, setRecentLogs] = useState<Array<{ name: string; action: string; time: string }>>([]);

  // Card debounce lock
  const lastScannedCard = useRef<string>('');
  const lastScannedTime = useRef<number>(0);
  const resetTimer = useRef<NodeJS.Timeout | null>(null);

  // -------------------------------------------------------------
  // 1. LIVE CLOCK (Karachi Time)
  // -------------------------------------------------------------
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Karachi',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        }).format(now)
      );
      setCurrentDate(
        new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Karachi',
          weekday: 'long',
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        }).format(now)
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // -------------------------------------------------------------
  // 2. DEVICE CAPABILITY & SCREEN WAKE LOCK
  // -------------------------------------------------------------
  useEffect(() => {
    // Detect mobile touch environment
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;
    setIsMobileDevice(isMobile);

    if (typeof window !== 'undefined' && 'NDEFReader' in window) {
      setNfcSupported(true);
    }

    let wakeLock: any = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch (err) {}
    };

    requestWakeLock();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (wakeLock) wakeLock.release().catch(() => {});
    };
  }, []);

  // -------------------------------------------------------------
  // 3. SYNTHETIC AUDIO FEEDBACK (Web Audio API)
  // -------------------------------------------------------------
  const playTone = (type: 'clock_in' | 'clock_out' | 'error') => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      if (type === 'clock_in') {
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.frequency.value = 523.25;
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        gain1.gain.setValueAtTime(0.3, ctx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc1.start(ctx.currentTime);
        osc1.stop(ctx.currentTime + 0.15);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.frequency.value = 659.25;
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.15);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc2.start(ctx.currentTime + 0.15);
        osc2.stop(ctx.currentTime + 0.4);
      } else if (type === 'clock_out') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(659.25, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440.0, ctx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.35);
      } else {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = 180;
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.35, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch (e) {}
  };

  // -------------------------------------------------------------
  // 4. SCAN PROCESSING & BACKEND SUBMISSION
  // -------------------------------------------------------------
  const processCardScan = async (rawCardId: string) => {
    const cleanId = rawCardId.replace(/\D/g, '').trim();
    if (cleanId.length < 4) return;

    const now = Date.now();
    if (lastScannedCard.current === cleanId && now - lastScannedTime.current < 4000) {
      return;
    }
    lastScannedCard.current = cleanId;
    lastScannedTime.current = now;

    if (resetTimer.current) clearTimeout(resetTimer.current);

    setState('scanning');
    setScanResult(null);

    try {
      const res = await fetch('/api/attendance/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId: cleanId })
      });

      const data = await res.json();

      if (res.ok) {
        setScanResult(data);
        if (data.action === 'CLOCK_IN') {
          setState('clock_in');
          playTone('clock_in');
          setRecentLogs(prev => [
            { name: data.employee.name, action: 'IN', time: data.time },
            ...prev.slice(0, 4)
          ]);
        } else {
          setState('clock_out');
          playTone('clock_out');
          setRecentLogs(prev => [
            { name: data.employee.name, action: 'OUT', time: data.time },
            ...prev.slice(0, 4)
          ]);
        }
      } else {
        setState('error');
        setScanResult({
          error: data.message || data.error || 'Card unrecognized',
          cardId: cleanId
        });
        playTone('error');
      }
    } catch (err) {
      setState('error');
      setScanResult({ error: 'Server connection failed', cardId: cleanId });
      playTone('error');
    }

    resetTimer.current = setTimeout(() => {
      setState('idle');
      setScanResult(null);
    }, 4000);
  };

  // -------------------------------------------------------------
  // 5. USB IC READER (Desktop Keyboard Wedge Buffer)
  // -------------------------------------------------------------
  useEffect(() => {
    let buffer = '';
    let flushTimer: NodeJS.Timeout;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (buffer.length >= 4) processCardScan(buffer);
        buffer = '';
        clearTimeout(flushTimer);
        return;
      }

      if (/^\d$/.test(e.key)) {
        buffer += e.key;
        clearTimeout(flushTimer);
        flushTimer = setTimeout(() => {
          if (buffer.length >= 4) processCardScan(buffer);
          buffer = '';
        }, 150);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(flushTimer);
    };
  }, []);

  // -------------------------------------------------------------
  // 6. ANDROID WEB NFC: EXPLICIT USER GESTURE ACTIVATION
  // -------------------------------------------------------------
  const activateMobileNFC = async () => {
    if (!('NDEFReader' in window)) {
      setNfcError('Web NFC is not supported in this browser. Use Chrome on Android.');
      return;
    }

    try {
      setNfcError('');
      const ndef = new (window as any).NDEFReader();
      
      // Explicit user gesture unlocks Chrome Reader Mode & claims tag focus
      await ndef.scan();
      setNfcActive(true);

      ndef.onreadingerror = () => {
        setNfcError('NFC reading error. Ensure the card is held steady against the back of the phone.');
      };

      ndef.onreading = (event: any) => {
        if (!event.serialNumber) return;

        // Extract UID bytes
        const hexParts = event.serialNumber.split(':');
        
        // Format A: Standard Big-Endian Decimal
        const hexBig = hexParts.join('');
        const decBig = parseInt(hexBig, 16);
        const cardIdBig = String(decBig).padStart(10, '0');

        // Format B: Little-Endian Decimal (Matches standard USB IC Readers)
        const hexLittle = [...hexParts].reverse().join('');
        const decLittle = parseInt(hexLittle, 16);
        const cardIdLittle = String(decLittle).padStart(10, '0');

        // Pass format to backend processor
        processCardScan(cardIdBig.length === 10 ? cardIdBig : cardIdLittle);
      };
    } catch (err: any) {
      console.error('NFC Scan Activation Error:', err);
      setNfcActive(false);
      if (err.name === 'NotAllowedError') {
        setNfcError('NFC permission was denied. Tap the screen and select "Allow".');
      } else {
        setNfcError(err.message || 'Could not start NFC scanner.');
      }
    }
  };

  return (
    <main 
      onClick={() => {
        // Fallback user gesture: tapping anywhere on mobile starts the reader
        if (nfcSupported && !nfcActive) activateMobileNFC();
      }}
      className="min-h-screen bg-[#070707] text-white flex flex-col justify-between p-6 md:p-12 select-none font-sans relative overflow-hidden"
    >
      {/* Background Ambience Glow */}
      <div className={`fixed inset-0 pointer-events-none transition-all duration-700 ${
        state === 'clock_in' ? 'bg-emerald-600/15' :
        state === 'clock_out' ? 'bg-blue-600/15' :
        state === 'error' ? 'bg-red-600/15' :
        'bg-[#FF6600]/5'
      }`} />

      {/* TOP BAR: Brand & Station Status */}
      <header className="relative z-10 flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-3xl font-black uppercase tracking-tighter">
              AL FAREED <span className="text-[#FF6600]">TERMINAL</span>
            </h1>
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <p className="text-[10px] md:text-xs font-mono uppercase tracking-[0.3em] text-slate-500 mt-1">
            24/7 Attendance Gate • Johar Mor Station
          </p>
        </div>

        {/* Live Reader Indicators */}
        <div className="flex items-center gap-2">
          {!isMobileDevice && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[9px] font-mono uppercase text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              USB IC Wedge: Active
            </div>
          )}

          {isMobileDevice && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[9px] font-mono uppercase transition-colors ${
              nfcActive 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                : 'bg-orange-500/10 border-orange-500/30 text-[#FF6600]'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${nfcActive ? 'bg-emerald-500 animate-ping' : 'bg-[#FF6600]'}`} />
              {nfcActive ? 'Mobile NFC: Active' : 'NFC: Tap To Enable'}
            </div>
          )}
        </div>
      </header>

      {/* CENTER: Status Stage */}
      <section className="relative z-10 flex flex-col items-center justify-center text-center my-auto py-6">
        {/* MOBILE ACTIVATION BANNER: Overrides default Android system tag interception */}
        {isMobileDevice && !nfcActive && (
          <div className="mb-6 w-full max-w-sm animate-bounce">
            <button
              onClick={(e) => {
                e.stopPropagation();
                activateMobileNFC();
              }}
              className="w-full bg-[#FF6600] hover:bg-white hover:text-black text-white font-black py-4 px-6 rounded-2xl text-xs uppercase tracking-widest shadow-xl shadow-orange-600/30 transition-all flex items-center justify-center gap-2"
            >
              <span>📱</span>
              <span>Tap Screen to Activate Mobile NFC</span>
            </button>
            <p className="text-[10px] text-slate-400 mt-2 font-mono">
              Enables Chrome Reader Mode to suppress Android system popups
            </p>
          </div>
        )}

        {nfcError && (
          <div className="mb-6 max-w-sm p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs font-semibold">
            {nfcError}
          </div>
        )}

        {state === 'idle' && (
          <div className="space-y-6 max-w-xl animate-in fade-in zoom-in-95 duration-300">
            <div>
              <p className="text-5xl sm:text-7xl md:text-8xl font-black tracking-tighter font-mono text-white">
                {currentTime}
              </p>
              <p className="text-xs md:text-sm font-bold uppercase tracking-[0.3em] text-[#FF6600] mt-2">
                {currentDate}
              </p>
            </div>

            <div className="w-24 h-24 sm:w-32 sm:h-32 mx-auto rounded-[32px] bg-white/5 border-2 border-dashed border-white/20 flex items-center justify-center relative group">
              <div className="absolute inset-0 rounded-[32px] bg-[#FF6600]/20 blur-xl animate-pulse" />
              <span className="text-3xl sm:text-4xl relative z-10">💳</span>
            </div>

            <div>
              <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight text-white">
                Ready for Card Tap
              </h2>
              <p className="text-xs text-slate-400 font-medium mt-1">
                {isMobileDevice 
                  ? (nfcActive ? 'Hold card against the back of this phone' : 'Tap screen to engage NFC reader') 
                  : 'Tap card on USB Reader to record attendance'}
              </p>
            </div>
          </div>
        )}

        {state === 'scanning' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="w-16 h-16 rounded-full border-4 border-t-[#FF6600] border-white/10 animate-spin mx-auto" />
            <h2 className="text-2xl font-black uppercase tracking-wider text-slate-200">
              Validating Card...
            </h2>
          </div>
        )}

        {state === 'clock_in' && scanResult && (
          <div className="space-y-4 max-w-lg bg-emerald-950/40 border-2 border-emerald-500/50 p-8 md:p-12 rounded-[40px] shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-emerald-500 text-white rounded-2xl flex items-center justify-center mx-auto text-3xl font-bold">
              ✓
            </div>
            <div>
              <span className="inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Shift Started • Clocked In
              </span>
              <h2 className="text-3xl md:text-4xl font-black text-white mt-2">
                {scanResult.employee?.name}
              </h2>
              <p className="text-xs text-slate-400 font-mono mt-1">
                ID: #{scanResult.employee?.worker_id} • Time: {scanResult.time}
              </p>
            </div>
            <p className="text-sm font-semibold text-emerald-300">
              {scanResult.message}
            </p>
          </div>
        )}

        {state === 'clock_out' && scanResult && (
          <div className="space-y-4 max-w-lg bg-blue-950/40 border-2 border-blue-500/50 p-8 md:p-12 rounded-[40px] shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-blue-500 text-white rounded-2xl flex items-center justify-center mx-auto text-3xl font-bold">
              👋
            </div>
            <div>
              <span className="inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-blue-500/20 text-blue-400 border border-blue-500/30">
                Shift Ended • Clocked Out
              </span>
              <h2 className="text-3xl md:text-4xl font-black text-white mt-2">
                {scanResult.employee?.name}
              </h2>
              <p className="text-xs text-slate-400 font-mono mt-1">
                Total Worked: <strong className="text-white">{scanResult.totalHours} hrs</strong> • Left at {scanResult.time}
              </p>
            </div>
            <p className="text-sm font-semibold text-blue-300">
              {scanResult.message}
            </p>
          </div>
        )}

        {state === 'error' && scanResult && (
          <div className="space-y-4 max-w-lg bg-red-950/40 border-2 border-red-500/50 p-8 md:p-12 rounded-[40px] shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-500 text-white rounded-2xl flex items-center justify-center mx-auto text-3xl font-bold">
              ✕
            </div>
            <div>
              <span className="inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-red-500/20 text-red-400 border border-red-500/30">
                Access Denied
              </span>
              <h2 className="text-2xl md:text-3xl font-black text-white mt-2">
                {scanResult.error}
              </h2>
              {scanResult.cardId && (
                <p className="text-xs text-slate-400 font-mono mt-1">
                  Card UID: {scanResult.cardId}
                </p>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Please register this card via Admin Portal first.
            </p>
          </div>
        )}
      </section>

      {/* BOTTOM BAR: Recent Activity Log */}
      <footer className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-4 border-t border-white/5 pt-4">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">
            Recent Punches:
          </span>
          {recentLogs.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {recentLogs.map((log, idx) => (
                <span
                  key={idx}
                  className={`text-[10px] font-mono px-2.5 py-1 rounded-lg border ${
                    log.action === 'IN'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                  }`}
                >
                  {log.name.split(' ')[0]} ({log.action} @ {log.time})
                </span>
              ))}
            </div>
          ) : (
            <span className="text-[10px] font-mono text-slate-600 italic">
              No recent scans today
            </span>
          )}
        </div>

        <p className="text-[9px] font-mono uppercase tracking-widest text-slate-600">
          Al Fareed Multimedia • Hardware Engine v2.0
        </p>
      </footer>
    </main>
  );
}
