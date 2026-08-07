'use client';

import React, { useState, useEffect } from 'react';
import {
  isLaceInstalled,
  connectLaceWallet,
  getWalletState,
  formatAddress,
  WalletAPI,
  WalletState
} from '../lib/walletConnector';

interface WalletConnectProps {
  onWalletConnected: (walletApi: WalletAPI | null, walletState: WalletState | null) => void;
  label?: string;
}

export default function WalletConnect({ onWalletConnected, label = 'Conectar Lace Wallet' }: WalletConnectProps) {
  const [installed, setInstalled] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletState, setWalletState] = useState<WalletState | null>(null);
  const [walletApi, setWalletApi] = useState<WalletAPI | null>(null);

  useEffect(() => {
    setInstalled(isLaceInstalled());
  }, []);

  const handleConnect = async () => {
    setError(null);
    setConnecting(true);
    try {
      const api = await connectLaceWallet();
      const state = await getWalletState(api);
      setWalletApi(api);
      setWalletState(state);
      onWalletConnected(api, state);
    } catch (err: any) {
      setError(err?.message || 'Error al conectar la wallet.');
      onWalletConnected(null, null);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    setWalletApi(null);
    setWalletState(null);
    onWalletConnected(null, null);
  };

  if (!installed) {
    return (
      <div className="wallet-connect-card error">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <div>
          <h4 style={{ fontWeight: 700, fontSize: 14 }}>Lace Wallet no detectada</h4>
          <p style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
            Instalá la extensión Beta de Lace para Midnight en tu navegador para interactuar con la red.
          </p>
          <a href="https://lace.io" target="_blank" rel="noreferrer" className="btn-link" style={{ display: 'inline-block', marginTop: 8, fontSize: 12, color: '#a78bfa', textDecoration: 'underline' }}>
            Descargar Lace
          </a>
        </div>
      </div>
    );
  }

  if (walletState?.connected) {
    return (
      <div className="wallet-connect-card connected">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="wallet-avatar" />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Conectado a Lace</div>
              <div className="font-mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {formatAddress(walletState.address)}
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-purple)' }}>
              {walletState.balanceTDust} tDUST
            </div>
            <button onClick={handleDisconnect} className="btn-disconnect" style={{ background: 'transparent', border: 'none', color: '#f87171', fontSize: 11, cursor: 'pointer', marginTop: 4 }}>
              Desconectar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      <button 
        className="btn-primary" 
        onClick={handleConnect} 
        disabled={connecting}
        style={{ width: '100%', padding: '14px', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
      >
        {connecting ? (
          <>
            <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            Conectando...
          </>
        ) : (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"/><path d="M12 4v16M2 10h20"/></svg>
            {label}
          </>
        )}
      </button>
      {error && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#f87171', textAlign: 'center' }}>
          {error}
        </div>
      )}
    </div>
  );
}
