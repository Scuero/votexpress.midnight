'use client';

import React, { useState, useEffect } from 'react';
import { getMidnightService, LedgerState, TxResult } from '../lib/midnight';
import { WalletAPI, WalletState, requestLaceGasApproval, isLaceInstalled } from '../lib/walletConnector';
import { getCachedConfig, getExplorerContractUrl } from '../lib/midnightProviders';
import WalletConnect from './WalletConnect';

interface AdminPanelProps {
  ledgerState: LedgerState;
  onRefresh: () => void;
}

export default function AdminPanel({ ledgerState, onRefresh }: AdminPanelProps) {
  const [adminWallet, setAdminWallet] = useState<WalletState | null>(null);
  const [newCandidate, setNewCandidate] = useState('');
  const [durationHours, setDurationHours] = useState(24);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSuccess, setTxSuccess] = useState<TxResult | null>(null);
  const [copied, setCopied] = useState(false);

  const service = getMidnightService();

  const handleShareLink = () => {
    if (typeof window === 'undefined') return;
    const config = getCachedConfig();
    const shareUrl = `${window.location.origin}/?net=${config.network}&voting=${config.votingContractAddress}&dni=${config.dniContractAddress}&bf=${config.blockfrostProjectId}&proof=${config.proofServerUrl}`;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleWalletConnected = (state: WalletState | null) => {
    setAdminWallet(state);
  };

  const handleAddCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCandidate.trim()) return;
    setError(null);
    setTxSuccess(null);
    setLoading(true);

    try {
      const res = await service.registrarCandidato(newCandidate.trim());
      setTxSuccess(res);
      setNewCandidate('');
      onRefresh();
    } catch (err: any) {
      setError(err?.message || 'Error al registrar candidato.');
    } finally {
      setLoading(false);
    }
  };

  const handleStartVoting = async () => {
    if (!adminWallet?.connected) {
      setError('Debes conectar una wallet de administrador para actuar como pagador de gas.');
      return;
    }
    setError(null);
    setTxSuccess(null);
    setLoading(true);

    try {
      // Solicitar confirmación interactiva de pago de gas a la extensión Lace Wallet en Chrome
      let laceTxHash = '';
      if (isLaceInstalled()) {
        try {
          laceTxHash = await requestLaceGasApproval('Iniciar Votación Oficial');
        } catch (err: any) {
          throw new Error(`Pago de gas cancelado: ${err?.message || 'El usuario rechazó la firma en Lace Wallet.'}`);
        }
      }

      const durationSeconds = durationHours * 3600;
      const res = await service.iniciarVotacion(durationSeconds);
      if (laceTxHash) {
        res.transactionId = laceTxHash;
        res.details = `Votación iniciada con éxito. Transacción de gas procesada vía Lace Wallet (TxID: ${laceTxHash.slice(0, 16)}...).`;
      }
      setTxSuccess(res);
      onRefresh();
    } catch (err: any) {
      setError(err?.message || 'Error al iniciar la votación.');
    } finally {
      setLoading(false);
    }
  };

  const handleEndVoting = async () => {
    setError(null);
    setTxSuccess(null);
    setLoading(true);

    try {
      const res = await service.finalizarVotacion();
      setTxSuccess(res);
      onRefresh();
    } catch (err: any) {
      setError(err?.message || 'Error al finalizar la votación.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Admin Wallet Connector */}
      <div className="glass-card" style={{ padding: 24, border: '1px solid rgba(139, 92, 246, 0.2)' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: adminWallet?.connected ? '#10b981' : '#f59e0b' }} />
          Gas Payer Wallet (Administrador)
        </h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
          La wallet del administrador firma las transacciones on-chain y paga el gas (relayer fees) para que los votantes no necesiten fondos de gas al votar.
        </p>
        <WalletConnect onWalletConnected={handleWalletConnected} label="Vincular Wallet Administrador" />
      </div>

      {/* Contract Control State */}
      <div className="glass-card" style={{ padding: 24 }}>
        <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>Gestión de la Elección</h3>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>ESTADO ACTUAL:</div>
          <span className={`status-badge ${ledgerState.estado.toLowerCase()}`}>
            {ledgerState.estado}
          </span>
        </div>

        {error && (
          <div className="error-alert" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}

        {txSuccess && (
          <div className="success-alert" style={{ marginBottom: 16 }}>
            <h5 style={{ fontWeight: 700, fontSize: 13 }}>Transacción Confirmada</h5>
            <p style={{ fontSize: 11, marginTop: 4 }}>{txSuccess.details}</p>
            <div className="font-mono" style={{ fontSize: 9, marginTop: 8, opacity: 0.8, overflowWrap: 'anywhere' }}>
              TxID: {txSuccess.transactionId}
            </div>
          </div>
        )}

        {/* Action Blocks depending on State */}
        {ledgerState.estado === 'CERRADA' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Candidate Registration Form */}
            <form onSubmit={handleAddCandidate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
                Registrar Nuevo Candidato
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder="Ej: Juan Pérez (Lista Popular)"
                  value={newCandidate}
                  onChange={(e) => setNewCandidate(e.target.value)}
                  disabled={loading}
                  style={{ flex: 1, padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)', color: 'white', fontSize: 14 }}
                />
                <button type="submit" className="btn-primary" disabled={loading || !newCandidate.trim()} style={{ padding: '0 20px', borderRadius: 12 }}>
                  Agregar
                </button>
              </div>
            </form>

            <hr style={{ border: 'none', height: 1, background: 'var(--border-subtle)' }} />

            {/* Voting Initialization parameters */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
                  Duración de la Votación
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                  <input
                    type="number"
                    min="1"
                    max="168"
                    value={durationHours}
                    onChange={(e) => setDurationHours(parseInt(e.target.value) || 24)}
                    disabled={loading}
                    style={{ width: 80, padding: '12px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)', color: 'white', fontSize: 14, textAlign: 'center' }}
                  />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Horas (por defecto 24h)</span>
                </div>
              </div>

              <button
                type="button"
                className="btn-primary"
                onClick={handleStartVoting}
                disabled={loading || ledgerState.cantidadCandidatos < 2 || !adminWallet?.connected}
                style={{ width: '100%', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                {loading ? 'Procesando en Midnight...' : 'Iniciar Votación Oficial'}
              </button>

              {ledgerState.cantidadCandidatos < 2 && (
                <div style={{ fontSize: 11, color: '#f59e0b', textAlign: 'center' }}>
                  ⚠️ Se requieren al menos 2 candidatos registrados para poder iniciar.
                </div>
              )}
              {!adminWallet?.connected && (
                <div style={{ fontSize: 11, color: '#f59e0b', textAlign: 'center' }}>
                  ⚠️ Debes conectar tu wallet para pagar el gas antes de abrir la votación.
                </div>
              )}
            </div>
          </div>
        )}

        {ledgerState.estado === 'ABIERTA' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="info-card">
              <h4 style={{ fontSize: 14, fontWeight: 700 }}>Elección en Curso</h4>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                La votación está actualmente abierta. Los ciudadanos pueden escanear sus DNIs y votar.
              </p>
              
              {/* Dirección de Contratos en pantalla */}
              <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', fontSize: 11, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>Contratos Activos en la Red:</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'monospace' }}>
                  <span style={{ opacity: 0.8 }}>Contrato Votación:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <a
                      href={getExplorerContractUrl(getCachedConfig().votingContractAddress)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#a78bfa', textDecoration: 'underline', fontWeight: 600 }}
                      title="Abrir contrato de votación en Midnight Explorer (Nueva pestaña)"
                    >
                      {getCachedConfig().votingContractAddress ? `${getCachedConfig().votingContractAddress.slice(0, 8)}...${getCachedConfig().votingContractAddress.slice(-6)}` : 'No configurado'} ↗
                    </a>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(getCachedConfig().votingContractAddress)}
                      title="Copiar dirección de contrato"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12 }}
                    >
                      📋
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'monospace' }}>
                  <span style={{ opacity: 0.8 }}>Registro de DNI:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <a
                      href={getExplorerContractUrl(getCachedConfig().dniContractAddress)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#a78bfa', textDecoration: 'underline', fontWeight: 600 }}
                      title="Abrir contrato de registro DNI en Midnight Explorer (Nueva pestaña)"
                    >
                      {getCachedConfig().dniContractAddress ? `${getCachedConfig().dniContractAddress.slice(0, 8)}...${getCachedConfig().dniContractAddress.slice(-6)}` : 'No configurado'} ↗
                    </a>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(getCachedConfig().dniContractAddress)}
                      title="Copiar dirección de contrato"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12 }}
                    >
                      📋
                    </button>
                  </div>
                </div>
              </div>

              {ledgerState.tiempoRestante > 0 ? (
                <p style={{ fontSize: 12, color: '#a78bfa', fontWeight: 600, marginTop: 12 }}>
                  Tiempo restante: {Math.floor(ledgerState.tiempoRestante / 3600)}h {Math.floor((ledgerState.tiempoRestante % 3600) / 60)}m
                </p>
              ) : (
                <p style={{ fontSize: 12, color: '#ef4444', fontWeight: 600, marginTop: 12 }}>
                  El tiempo oficial ha finalizado. El escrutinio se puede cerrar.
                </p>
              )}
            </div>

            <button
              className="btn-primary"
              onClick={handleEndVoting}
              disabled={loading || ledgerState.tiempoRestante > 0}
              style={{ width: '100%', padding: '16px', background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}
            >
              {loading ? 'Finalizando...' : 'Finalizar Votación y Contar Votos'}
            </button>
            
            {ledgerState.tiempoRestante > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                * El botón de finalizar se habilitará cuando transcurra el tiempo configurado ({durationHours}h).
              </div>
            )}
          </div>
        )}

        {ledgerState.estado === 'FINALIZADA' && (
          <div className="info-card success">
            <h4 style={{ fontSize: 14, fontWeight: 700 }}>Votación Completada</h4>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
              El evento de votación ha concluido. Los resultados finales están publicados en la blockchain de Midnight de forma permanente y verificable.
            </p>
          </div>
        )}

        {/* Compartir Votación link */}
        {(ledgerState.estado === 'ABIERTA' || ledgerState.estado === 'FINALIZADA') && (
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border-subtle)' }}>
            <button
              onClick={handleShareLink}
              className="btn-primary"
              style={{ width: '100%', padding: '12px', background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.3)', color: '#a78bfa', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/></svg>
              {copied ? '¡Enlace de Votante Copiado!' : 'Copiar Enlace para Compartir Votación'}
            </button>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', marginTop: 8 }}>
              Comparte este enlace para que otros dispositivos carguen automáticamente los mismos contratos y red de votación.
            </p>
          </div>
        )}
      </div>

      {/* Candidate List preview */}
      <div className="glass-card" style={{ padding: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
          Candidatos Registrados ({ledgerState.cantidadCandidatos})
        </h3>
        {ledgerState.candidatos.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No hay candidatos registrados todavía.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ledgerState.candidatos.map((cand, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{cand.nombre}</span>
                <span style={{ color: 'var(--text-muted)' }}>Candidato {idx + 1}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
