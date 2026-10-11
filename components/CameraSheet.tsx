import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Image as ImageIcon, Zap, ZapOff, RotateCcw } from 'lucide-react';
import { SHEET_SPRING } from '../lib/motion';
import { useBackClose } from '../lib/backStack';

// Scan a receipt (demo): a camera sheet that slides up to just under the top of Home, so the
// header and your total stay in view above it. Live back camera with a guide frame, Photos and
// (on Android) the torch underneath. Taking a photo flashes, freezes the view and shows it.
// Nothing is read or saved yet; this is the camera part on its own.

type Phase = 'starting' | 'live' | 'taken' | 'error';

const CameraSheet: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('starting');
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [torch, setTorch] = useState<boolean | null>(null); // null: the camera has no torch
  const [flash, setFlash] = useState(0);
  useBackClose(open, onClose);

  const stop = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  const start = async () => {
    setPhase('starting');
    setPhoto(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(window.isSecureContext
        ? "This browser can't open the camera here. You can still choose a photo."
        : 'The camera only works over a secure (https) connection, so it is off on this address. You can still choose a photo.');
      setPhase('error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) { v.srcObject = stream; await v.play().catch(() => {}); }
      const caps = (stream.getVideoTracks()[0]?.getCapabilities?.() || {}) as { torch?: boolean };
      setTorch(caps.torch ? false : null);
      setPhase('live');
    } catch (e) {
      const name = (e as DOMException)?.name;
      setError(name === 'NotAllowedError'
        ? 'Camera access is off for WealthWise. Allow it in your browser or phone settings, or choose a photo instead.'
        : "Couldn't start the camera. You can still choose a photo.");
      setPhase('error');
    }
  };

  useEffect(() => {
    if (!open) { stop(); return; }
    // let the sheet start sliding before the camera spins up
    const id = window.setTimeout(start, 120);
    return () => { window.clearTimeout(id); stop(); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    try { await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] }); setTorch(!torch); } catch { /* not supported */ }
  };

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')?.drawImage(v, 0, 0);
    setPhoto(c.toDataURL('image/jpeg', 0.85));
    setFlash(n => n + 1);
    setPhase('taken');
    stop();
  };

  const pick = (f: File | undefined) => {
    if (!f) return;
    stop();
    const r = new FileReader();
    r.onload = () => { setPhoto(String(r.result)); setPhase('taken'); };
    r.readAsDataURL(f);
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div key="camera" className="fixed inset-0 z-[140]" initial={{ pointerEvents: 'auto' }} exit={{ pointerEvents: 'none' }}>
          {/* Home stays visible above, dimmed */}
          <motion.div className="absolute inset-0 bg-slate-900/35 touch-none" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} />
          <motion.div
            role="dialog"
            aria-label="Scan a receipt"
            className="absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)_+_12px)] top-[calc(env(safe-area-inset-top)_+_230px)] bg-[#0B0F19] rounded-[26px] overflow-hidden flex flex-col shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
            initial={{ y: '110%' }}
            animate={{ y: 0 }}
            exit={{ y: '110%' }}
            transition={SHEET_SPRING}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, i) => { if (i.offset.y > 110 || i.velocity.y > 550) onClose(); }}
          >
            <div className="shrink-0 pt-2 pb-1">
              <div className="w-9 h-[5px] rounded-full bg-white/30 mx-auto" />
              <div className="flex items-center justify-between px-5 pt-2 text-white">
                <span className="text-[14px] font-semibold">Scan a receipt</span>
                <button onClick={onClose} aria-label="Close" className="w-8 h-8 -mr-1.5 rounded-full flex items-center justify-center text-white/80 active:bg-white/10"><X size={18} /></button>
              </div>
            </div>

            {/* Viewfinder */}
            <div className="relative flex-1 min-h-0 mx-3 mt-1 rounded-[20px] overflow-hidden bg-[radial-gradient(circle_at_50%_35%,#374151,#0B0F19)]">
              <video ref={videoRef} playsInline muted autoPlay className={`absolute inset-0 w-full h-full object-cover ${phase === 'live' ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`} />
              {photo && <img src={photo} alt="Your photo" className="absolute inset-0 w-full h-full object-contain bg-black" />}
              {phase !== 'taken' && <div className="absolute inset-x-[14%] inset-y-[9%] rounded-2xl border-2 border-white/80 pointer-events-none" />}
              <AnimatePresence>
                {flash > 0 && phase === 'taken' && (
                  <motion.div key={flash} className="absolute inset-0 bg-white pointer-events-none" initial={{ opacity: 0.85 }} animate={{ opacity: 0 }} transition={{ duration: 0.45 }} />
                )}
              </AnimatePresence>
              {phase === 'starting' && <p className="absolute inset-x-0 bottom-3 text-center text-[12px] text-white/70">Starting the camera…</p>}
              {phase === 'live' && <p className="absolute inset-x-0 bottom-3 text-center text-[12px] text-white/80">Fit the receipt in the frame</p>}
              {phase === 'error' && (
                <div className="absolute inset-0 flex items-center justify-center p-6">
                  <p className="text-center text-[13px] leading-relaxed text-white/85">{error}</p>
                </div>
              )}
            </div>

            {/* Controls, or what to do with the photo */}
            <div className="shrink-0 h-[112px] flex items-center">
              {phase === 'taken' ? (
                <div className="w-full mx-3 rounded-[18px] bg-white dark:bg-neutral-800 px-4 py-3">
                  <p className="text-[13.5px] font-semibold text-slate-900 dark:text-neutral-100">Photo taken</p>
                  <p className="text-[11.5px] text-slate-500 dark:text-neutral-400">Demo: receipts aren't read or saved yet.</p>
                  <div className="mt-2.5 flex gap-2">
                    <button onClick={start} className="flex-1 h-10 rounded-xl bg-slate-100 dark:bg-neutral-700 text-[13px] font-semibold text-indigo-700 dark:text-indigo-300 flex items-center justify-center gap-1.5"><RotateCcw size={14} /> Retake</button>
                    <button onClick={onClose} className="flex-1 h-10 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold">Done</button>
                  </div>
                </div>
              ) : (
                <div className="w-full flex items-center justify-between px-7">
                  <button onClick={() => fileRef.current?.click()} className="w-16 flex flex-col items-center gap-1 text-white/85 text-[11px]"><ImageIcon size={20} /> Photos</button>
                  <button onClick={capture} disabled={phase !== 'live'} aria-label="Take photo" className="w-[66px] h-[66px] rounded-full border-4 border-white flex items-center justify-center disabled:opacity-40 active:scale-95 transition-transform">
                    <span className="w-[50px] h-[50px] rounded-full bg-white" />
                  </button>
                  {torch === null ? <span className="w-16" /> : (
                    <button onClick={toggleTorch} className="w-16 flex flex-col items-center gap-1 text-white/85 text-[11px]">{torch ? <Zap size={20} /> : <ZapOff size={20} />} Flash</button>
                  )}
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default CameraSheet;
