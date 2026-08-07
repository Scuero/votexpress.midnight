'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  DniArgentinaData,
  verifyDniWithGovernmentApi,
  computeDniNullifier,
} from '../lib/argentinaDni';
import { parseArgentineDniPdf417 } from '../lib/dniScanner';
import { startNativeCamera, CameraControl } from '../lib/cameraScanner';
import { getMidnightService, LedgerState, VoteSubmissionResult } from '../lib/midnight';

interface VoterPanelProps {
  ledgerState: LedgerState;
  onRefresh: () => void;
}

type VoterStep = 'idle' | 'scanning' | 'verifying' | 'voting' | 'submitting' | 'done';

export default function VoterPanel({ ledgerState, onRefresh }: VoterPanelProps) {
  const [step, setStep] = useState<VoterStep>('idle');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraRef = useRef<CameraControl | null>(null);

  const [dniData, setDniData] = useState<DniArgentinaData | null>(null);
  const [personName, setPersonName] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState<string>('');

  const [nullifier, setNullifier] = useState<string | null>(null);
  const [result, setResult] = useState<VoteSubmissionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const service = getMidnightService();

  const stopCamera = useCallback(() => {
    cameraRef.current?.stop();
    cameraRef.current = null;
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const handleScan = async () => {
    setError(null);
    setStep('scanning');

    // Wait briefly for video component to be in the DOM
    await new Promise((r) => setTimeout(r, 150));

    if (!videoRef.current) {
      setError('No se pudo inicializar la cámara. Reintentá.');
      setStep('idle');
      return;
    }

    try {
      const ctrl = await startNativeCamera(videoRef.current, (code) => {
        onCodeDetected(code);
      });
      cameraRef.current = ctrl;
    } catch (err: any) {
      setError(err?.message || 'No se pudo acceder a la cámara.');
      setStep('idle');
    }
  };

  const onCodeDetected = async (raw: string) => {
    stopCamera();
    setError(null);

    const parsed = parseArgentineDniPdf417(raw);
    if (!parsed) {
      setError('Código no reconocido. Volvé a enfocar el código de barras del dorso de tu DNI.');
      setStep('idle');
      return;
    }

    setDniData(parsed.data);
    setPersonName(parsed.fullName);
    setStep('verifying');

    try {
      const govRes = await verifyDniWithGovernmentApi(parsed.data);
      if (!govRes.valid) {
        setError(govRes.message);
        setStep('idle');
        return;
      }

      // Check registration on DNI registry contract
      const { nullifierHex } = await computeDniNullifier(parsed.data);
      
      // Let's first register the DNI in the Registry contract (ZK proof generation)
      await service.registrarDni(nullifierHex);

      setNullifier(nullifierHex);
      setStep('voting');
      
      // Set initial selected candidate to first candidate if available
      if (ledgerState.candidatos.length > 0) {
        setSelectedCandidate(ledgerState.candidatos[0].nombre);
      }
    } catch (err: any) {
      setError(err?.message || 'Error al verificar en RENAPER.');
      setStep('idle');
    }
  };

  const handleVote = async () => {
    if (!dniData || !nullifier || !selectedCandidate) return;
    setError(null);
    setStep('submitting');

    try {
      const res = await service.emitirVoto(selectedCandidate, nullifier);
      setResult(res);
      setStep('done');
      onRefresh();
    } catch (err: any) {
      setError(err?.message || 'Error al emitir el voto.');
      setStep('voting');
    }
  };

  const handleReset = () => {
    stopCamera();
    setStep('idle');
    setDniData(null);
    setResult(null);
    setError(null);
    setSelectedCandidate('');
  };

  // Guard: if voting is closed
  if (ledgerState.estado !== 'ABIERTA') {
    return (
      <div className="glass-card" style={{ padding: 32, textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 800 }}>Votación No Activa</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 }}>
          {ledgerState.estado === 'CERRADA' 
            ? 'La elección aún no ha sido abierta por el administrador.' 
            : 'La elección ha finalizado. Podés ver los resultados finales en la pestaña Escrutinio.'}
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card-glow" style={{ padding: 32, position: 'relative', overflow: 'hidden' }}>
      {/* IDLE: Show scan button */}
      {step === 'idle' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
          <div style={{ width: 88, height: 88, borderRadius: 28, background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 32px rgba(139, 92, 246, 0.3)' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>
          </div>
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 20, fontWeight: 700 }}>Escanear DNI</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              Se abrirá la cámara y se detectará el código PDF417 automáticamente.
            </p>
          </div>
          <button className="btn-primary" onClick={handleScan} style={{ width: '100%', padding: '16px 24px', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            Escanear DNI
          </button>
        </div>
      )}

      {/* SCANNING: Camera viewfinder */}
      {step === 'scanning' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="viewfinder">
            <video ref={videoRef} autoPlay playsInline muted />
            <div className="viewfinder-overlay">
              <div className="viewfinder-corners" />
              <div className="animate-scan-sweep" />
              <div style={{ position: 'absolute', bottom: 20, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', padding: '8px 16px', borderRadius: 999, fontSize: 11, fontWeight: 600, color: '#c4b5fd', display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg className="animate-pulse" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/></svg>
                Enfocá el código de barras al dorso
              </div>
            </div>
          </div>
          <button onClick={() => { stopCamera(); setStep('idle'); }} style={{ width: '100%', padding: '12px', borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Cancelar
          </button>
        </div>
      )}

      {/* VERIFYING: Loading spinner */}
      {step === 'verifying' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '32px 0' }}>
          <svg className="animate-spin" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent-purple)" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700 }}>Procesando Identidad ZK...</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              Verificando autenticidad en RENAPER y registrando DNI de forma privada en el ledger.
            </p>
          </div>
        </div>
      )}

      {/* VOTING: Dynamic Candidate selection */}
      {(step === 'voting' || step === 'submitting') && dniData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Verified DNI Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 16, background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{personName}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }} className="font-mono">
                DNI {dniData.dniNumber} • RENAPER ✓ • Midnight ZK-DNI Registrado
              </div>
            </div>
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>
            Elegí tu opción de voto (Candidatos Oficiales):
          </div>

          {/* Dynamic grid for candidates */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ledgerState.candidatos.map((cand, idx) => (
              <div
                key={idx}
                className={`candidate-card ${selectedCandidate === cand.nombre ? 'selected-a' : ''}`}
                onClick={() => step === 'voting' && setSelectedCandidate(cand.nombre)}
                style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', letterSpacing: 0.5 }}>OPCIÓN {idx + 1}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>{cand.nombre}</div>
                </div>
                {selectedCandidate === cand.nombre && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                )}
              </div>
            ))}
          </div>

          <button className="btn-primary" onClick={handleVote} disabled={step === 'submitting' || !selectedCandidate} style={{ width: '100%', padding: '16px', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {step === 'submitting' ? (
              <>
                <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                Generando Prueba ZK y Firmando...
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Emitir Voto ZK Privado
              </>
            )}
          </button>
        </div>
      )}

      {/* DONE: Success */}
      {step === 'done' && result && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '8px 0' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', border: '2px solid rgba(16, 185, 129, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: 22, fontWeight: 800 }}>¡Voto Registrado con Éxito!</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              Tu voto fue emitido de forma 100% anónima en Midnight Network.
            </p>
          </div>

          <div style={{ width: '100%', padding: 16, borderRadius: 16, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Opción Elegida</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#a78bfa' }}>{result.candidatoNombre}</div>
            
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12, marginBottom: 4 }}>Prueba ZK Hash</div>
            <div className="font-mono" style={{ fontSize: 10, color: '#c4b5fd', wordBreak: 'break-all', lineHeight: 1.6 }}>{result.proofHash}</div>
            
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12, marginBottom: 4 }}>Transacción Midnight</div>
            <div className="font-mono" style={{ fontSize: 10, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{result.transactionId}</div>
          </div>

          <button className="btn-primary" onClick={handleReset} style={{ width: '100%', padding: '14px', fontSize: 14 }}>
            Escanear otro DNI
          </button>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div style={{ marginTop: 16, padding: '14px 18px', borderRadius: 16, background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12, color: '#fca5a5' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" style={{ flexShrink: 0, marginTop: 1 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <div>{error}</div>
        </div>
      )}
    </div>
  );
}
