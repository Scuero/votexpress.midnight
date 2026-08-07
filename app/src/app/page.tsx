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
import VoterPanel from '@/components/VoterPanel';
import LiveDashboard from '@/components/LiveDashboard';

type Tab = 'voter' | 'dashboard';

export default function ExpressVotingPage() {
  const [activeTab, setActiveTab] = useState<Tab>('voter');
  const [ledgerState, setLedgerState] = useState<LedgerState | null>(null);
  const [proofServerOnline, setProofServerOnline] = useState(false);
  const [proofServerMsg, setProofServerMsg] = useState('Verificando Proof Server...');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // States for dynamic config panel
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
      // 1. Obtener config en tiempo de ejecución (importante para Cloud Run)
      await fetchRuntimeConfig();

      // Cargar valores para los inputs desde la caché cargada
      const current = getCachedConfig();
      setNetworkSetting(current.network);
      setBfProjectId(current.blockfrostProjectId);
      setVotingContract(current.votingContractAddress);
      setDniContract(current.dniContractAddress);
      setProofUrl(current.proofServerUrl);

      // 2. Verificar estado de Proof Server
      const res = await service.checkProofServerHealth();
      setProofServerOnline(res.status);
      setProofServerMsg(res.message);

      // 3. Cargar estado inicial del ledger
      const state = await service.getLedgerState();
      setLedgerState(state);
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

  // Periodic poll of state (every 3s) to catch timer updates
  useEffect(() => {
    const interval = setInterval(() => {
      service.getLedgerState().then((state) => {
        setLedgerState(state);
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [service]);

  if (!ledgerState) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <svg className="animate-spin" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent-purple)" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Conectando a la red Midnight...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 16px', background: 'var(--bg-primary)' }}>
      <div style={{ width: '100%', maxWidth: 540, display: 'flex', flexDirection: 'column', gap: 24 }}>
        
        {/* Network Header badge & Title */}
        <div style={{ textAlign: 'center', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.2)', fontSize: 11, fontWeight: 600, color: '#a78bfa', letterSpacing: 0.5 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Midnight Network • {getNetworkDisplayName()}
            </div>
            
            <button 
              onClick={() => setShowSettings(!showSettings)}
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}
              title="Configuración de Red"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
          </div>
          
          <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1, background: 'linear-gradient(135deg, #f1f5f9, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1.1 }}>
            VotExpress ZK
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 }}>
            Votación nacional de DNI electrónico protegida por criptografía de conocimiento cero.
          </p>
        </div>

        {ledgerState && (ledgerState.estado === 'ABIERTA' || ledgerState.estado === 'FINALIZADA') && (
          <div style={{ textAlign: 'center', marginTop: -8, display: 'flex', justifyContent: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)', padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border-subtle)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              🗳️ Contrato Activo: 
              <span 
                style={{ color: '#a78bfa', fontFamily: 'monospace', cursor: 'pointer', fontWeight: 600 }}
                onClick={() => {
                  navigator.clipboard.writeText(getCachedConfig().votingContractAddress);
                }}
                title="Hacé clic para copiar dirección de contrato de votación"
              >
                {getCachedConfig().votingContractAddress ? `${getCachedConfig().votingContractAddress.slice(0, 12)}...${getCachedConfig().votingContractAddress.slice(-10)}` : 'No configurado'} 📋
              </span>
            </span>
          </div>
        )}

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
                  <option value="mainnet">Mainnet</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>Blockfrost Project ID (Opcional en Local)</label>
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

        {/* Tab Selection Navigation */}
        <div className="tab-navigation" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <button 
            className={`tab-btn ${activeTab === 'voter' ? 'active' : ''}`}
            onClick={() => setActiveTab('voter')}
          >
            Emitir Voto
          </button>
          <button 
            className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            Escrutinio En Vivo
          </button>
        </div>

        {/* Tab content rendering */}
        <div style={{ flex: 1 }}>
          {activeTab === 'voter' && (
            <VoterPanel ledgerState={ledgerState} onRefresh={triggerRefresh} />
          )}
          {activeTab === 'dashboard' && (
            <LiveDashboard ledgerState={ledgerState} onRefresh={triggerRefresh} />
          )}
        </div>

        {/* Footer Status */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', marginTop: 12 }}>
          <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: 999, background: proofServerOnline ? '#10b981' : '#f59e0b' }} />
            <span>{proofServerMsg}</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.6 }}>
            VotExpress v0.2.0 • Desarrollado con Compact y Midnight JS SDK
          </div>
        </div>

      </div>
    </div>
  );
}
