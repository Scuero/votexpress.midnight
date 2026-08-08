'use client';

import React, { useState, useEffect } from 'react';
import { getMidnightService, LedgerState } from '@/lib/midnight';
import {
  getNetworkDisplayName,
  fetchRuntimeConfig,
  getCachedConfig,
  saveConfigToLocalStorage,
  MidnightNetwork
} from '@/lib/midnightProviders';
import AdminPanel from '@/components/AdminPanel';

export default function AdminPage() {
  const [ledgerState, setLedgerState] = useState<LedgerState | null>(null);
  const [proofServerOnline, setProofServerOnline] = useState(false);
  const [proofServerMsg, setProofServerMsg] = useState('Verificando Proof Server...');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // States for config panel
  const [showSettings, setShowSettings] = useState(false);
  const [networkSetting, setNetworkSetting] = useState<MidnightNetwork>('testnet');
  const [bfProjectId, setBfProjectId] = useState('');
  const [votingContract, setVotingContract] = useState('');
  const [dniContract, setDniContract] = useState('');
  const [proofUrl, setProofUrl] = useState('');

  const service = getMidnightService();

  const triggerRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  useEffect(() => {
    const init = async () => {
      try {
        // 1. Cargar config en tiempo de ejecución
        await fetchRuntimeConfig();

        const current = getCachedConfig();
        setNetworkSetting(current.network);
        setBfProjectId(current.blockfrostProjectId);
        setVotingContract(current.votingContractAddress);
        setDniContract(current.dniContractAddress);
        setProofUrl(current.proofServerUrl);

        // 2. Verificar estado de Proof Server
        const res = await service.checkProofServerHealth().catch(() => ({ status: false, message: 'Proof Server Offline' }));
        setProofServerOnline(res.status);
        setProofServerMsg(res.message);

        // 3. Cargar estado del ledger
        const state = await service.getLedgerState().catch(() => ({
          estado: 'CERRADA' as const,
          candidatos: [],
          totalVotos: 0,
          horaInicio: null,
          duracionSegundos: 86400,
          tiempoRestante: -1,
          cantidadCandidatos: 0,
        }));
        setLedgerState(state);
      } catch (err) {
        console.error('Error inicializando panel de administración:', err);
        setLedgerState({
          estado: 'CERRADA',
          candidatos: [],
          totalVotos: 0,
          horaInicio: null,
          duracionSegundos: 86400,
          tiempoRestante: -1,
          cantidadCandidatos: 0,
        });
      }
    };

    init();
  }, [refreshTrigger, service]);

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    saveConfigToLocalStorage({
      network: networkSetting,
      blockfrostProjectId: bfProjectId,
      votingContractAddress: votingContract,
      dniContractAddress: dniContract,
      proofServerUrl: proofUrl
    });
    setShowSettings(false);
    triggerRefresh();
  };

  if (!ledgerState) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <svg className="animate-spin" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent-purple)" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Conectando panel de administración...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 16px', background: 'var(--bg-primary)' }}>
      <div style={{ width: '100%', maxWidth: 540, display: 'flex', flexDirection: 'column', gap: 24 }}>
        
        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', fontSize: 11, fontWeight: 700, color: '#fca5a5', letterSpacing: 0.5 }}>
              🔒 PANEL DE ADMINISTRACIÓN
            </div>
            <button 
              onClick={() => setShowSettings(!showSettings)}
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}
              title="Configuración de Red"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 900, color: 'white' }}>Configuración de Elección</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            Establece candidatos, duración de evento y activa la votación on-chain.
          </p>
        </div>

        {/* Collapsible Settings Form */}
        {showSettings && (
          <div className="glass-card" style={{ padding: 20, border: '1px solid rgba(139, 92, 246, 0.2)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>⚙️ Configuración de Red y Contratos</h3>
            <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>Red Midnight</label>
                <select 
                  value={networkSetting} 
                  onChange={(e) => setNetworkSetting(e.target.value as MidnightNetwork)}
                  style={{ width: '100%', padding: '10px', marginTop: 4, borderRadius: 8, background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white', fontSize: 13 }}
                >
                  <option value="local">Local (Docker devnet)</option>
                  <option value="testnet">Testnet Preprod</option>
                  <option value="preview">Testnet Preview</option>
                  <option value="mainnet">Mainnet</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>Blockfrost Project ID</label>
                <input 
                  type="text" 
                  value={bfProjectId}
                  onChange={(e) => setBfProjectId(e.target.value)}
                  placeholder="project_id..."
                  style={{ width: '100%', padding: '10px', marginTop: 4, borderRadius: 8, background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white', fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>Contrato de Votación Address</label>
                <input 
                  type="text" 
                  value={votingContract}
                  onChange={(e) => setVotingContract(e.target.value)}
                  placeholder="0x..."
                  style={{ width: '100%', padding: '10px', marginTop: 4, borderRadius: 8, background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white', fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>Contrato de Registro DNI Address</label>
                <input 
                  type="text" 
                  value={dniContract}
                  onChange={(e) => setDniContract(e.target.value)}
                  placeholder="0x..."
                  style={{ width: '100%', padding: '10px', marginTop: 4, borderRadius: 8, background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white', fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>Proof Server URL</label>
                <input 
                  type="text" 
                  value={proofUrl}
                  onChange={(e) => setProofUrl(e.target.value)}
                  placeholder="http://localhost:6300"
                  style={{ width: '100%', padding: '10px', marginTop: 4, borderRadius: 8, background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white', fontSize: 13 }}
                />
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button type="submit" className="btn-primary" style={{ flex: 1, padding: '10px', cursor: 'pointer' }}>
                  Guardar Configuración
                </button>
                <button 
                  type="button" 
                  onClick={() => setShowSettings(false)}
                  style={{ flex: 1, padding: '10px', borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', color: 'white', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Render Admin Panel */}
        <AdminPanel ledgerState={ledgerState} onRefresh={triggerRefresh} />

        {/* Footer Status */}
        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12 }}>
          <div style={{ width: 6, height: 6, borderRadius: 999, background: proofServerOnline ? '#10b981' : '#f59e0b' }} />
          <span>{proofServerMsg} ({getNetworkDisplayName()})</span>
        </div>
      </div>
    </div>
  );
}
