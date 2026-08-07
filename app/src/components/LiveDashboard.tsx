'use client';

import React, { useState, useEffect } from 'react';
import { getMidnightService, LedgerState, HourlySnapshot } from '../lib/midnight';

interface LiveDashboardProps {
  ledgerState: LedgerState;
  onRefresh: () => void;
}

export default function LiveDashboard({ ledgerState, onRefresh }: LiveDashboardProps) {
  const [snapshots, setSnapshots] = useState<HourlySnapshot[]>([]);
  const [isFinal, setIsFinal] = useState(false);
  const service = getMidnightService();

  useEffect(() => {
    // Check if the election has already finished
    if (ledgerState.estado === 'FINALIZADA') {
      setIsFinal(true);
      setSnapshots(service.getHourlySnapshots());
      return;
    }

    // Load initial snapshots
    setSnapshots(service.getHourlySnapshots());

    // Update interval every 5 seconds (simulates real-time updates)
    const interval = setInterval(() => {
      onRefresh();
      const currentSnapshots = service.getHourlySnapshots();
      setSnapshots(currentSnapshots);

      // Check if state transitioned to FINALIZADA
      if (ledgerState.estado === 'FINALIZADA') {
        setIsFinal(true);
        clearInterval(interval);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [ledgerState.estado, onRefresh, service]);

  const maxVotes = Math.max(...ledgerState.candidatos.map(c => c.votos), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Real-time Status Card */}
      <div className="glass-card" style={{ padding: 24, position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800 }}>Escrutinio Provisorio</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: isFinal ? '#ef4444' : '#10b981',
              animation: isFinal ? 'none' : 'pulse-ring 1.5s infinite'
            }} />
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: isFinal ? '#fca5a5' : '#a78bfa' }}>
              {isFinal ? 'Votación Cerrada (Resultados Finales)' : 'En Vivo — Actualizando'}
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Total Votos Registrados</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'white', marginTop: 4 }}>{ledgerState.totalVotos}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Tiempo Restante</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#a78bfa', marginTop: 10 }}>
              {ledgerState.estado === 'CERRADA' ? (
                'Sin Iniciar'
              ) : ledgerState.tiempoRestante > 0 ? (
                `${Math.floor(ledgerState.tiempoRestante / 3600)}h ${Math.floor((ledgerState.tiempoRestante % 3600) / 60)}m`
              ) : (
                'Finalizado'
              )}
            </div>
          </div>
        </div>

        {/* Candidate progress bars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {ledgerState.candidatos.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
              No hay candidatos registrados en la votación.
            </p>
          ) : (
            ledgerState.candidatos.map((cand, idx) => {
              const pct = ledgerState.totalVotos > 0 ? Math.round((cand.votos / ledgerState.totalVotos) * 100) : 0;
              const barWidth = `${(cand.votos / maxVotes) * 100}%`;
              return (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}>
                    <span>{cand.nombre}</span>
                    <span style={{ color: '#a78bfa' }}>{cand.votos} ({pct}%)</span>
                  </div>
                  <div style={{ width: '100%', height: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 999, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                    <div style={{
                      width: barWidth,
                      height: '100%',
                      background: 'linear-gradient(90deg, #8b5cf6, #3b82f6)',
                      borderRadius: 999,
                      transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)'
                    }} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Hourly Progress Graph/Table (Hora a hora) */}
      <div className="glass-card" style={{ padding: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Evolución Temporal (Hora a hora)</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Historial de acumulados por hora del evento de votación. {isFinal && 'Votación concluida, no se actualizarán nuevos datos.'}
        </p>

        {snapshots.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
            La votación no ha iniciado o no se han generado registros por hora aún.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '8px 12px' }}>Intervalo</th>
                  <th style={{ padding: '8px 12px' }}>Hora</th>
                  {ledgerState.candidatos.map((c, i) => (
                    <th key={i} style={{ padding: '8px 12px' }}>{c.nombre}</th>
                  ))}
                  <th style={{ padding: '8px 12px', fontWeight: 700 }}>Total Votos</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((snap, sIdx) => (
                  <tr key={sIdx} style={{ borderBottom: '1px solid var(--border-subtle)', background: sIdx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>T + {snap.hora}h</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>
                      {new Date(snap.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    {ledgerState.candidatos.map((c, cIdx) => {
                      const match = snap.candidatos.find(sc => sc.nombre === c.nombre);
                      return (
                        <td key={cIdx} style={{ padding: '10px 12px' }}>{match ? match.votos : 0}</td>
                      );
                    })}
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: '#a78bfa' }}>{snap.totalVotos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
