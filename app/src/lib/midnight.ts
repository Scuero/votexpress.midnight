/**
 * MidnightService — Capa de abstracción para interactuar con la red Midnight.
 *
 * Soporta dos modos:
 * 1. Simulación: funciona sin SDK ni red real (para desarrollo y demo)
 * 2. Real: se conecta al SDK @midnight-ntwrk/* y la red Midnight (testnet/mainnet)
 *
 * El modo se determina automáticamente según la configuración de entorno.
 */

import { getNetworkConfig, getDefaultVotingDuration } from './midnightProviders';

// ── Tipos ──────────────────────────────────────────────────────────────

export type EstadoVotacion = 'CERRADA' | 'ABIERTA' | 'FINALIZADA';

export interface CandidatoInfo {
  nombre: string;
  votos: number;
}

export interface LedgerState {
  estado: EstadoVotacion;
  candidatos: CandidatoInfo[];
  totalVotos: number;
  horaInicio: number | null;       // timestamp Unix (segundos)
  duracionSegundos: number;
  tiempoRestante: number;          // segundos restantes (-1 si no inició)
  cantidadCandidatos: number;
}

export interface TxResult {
  success: boolean;
  transactionId: string;
  proofHash: string;
  details: string;
}

export interface VoteSubmissionResult extends TxResult {
  candidatoNombre: string;
  nullifierRegistered: string;
  updatedLedger: LedgerState;
}

export interface HourlySnapshot {
  hora: number;         // hour index (0 = start, 1 = +1h, ...)
  timestamp: number;    // Unix timestamp
  candidatos: CandidatoInfo[];
  totalVotos: number;
}

// ── Interfaz del servicio ──────────────────────────────────────────────

export interface IMidnightService {
  // Administración
  registrarCandidato(nombre: string): Promise<TxResult>;
  iniciarVotacion(duracionSegundos?: number): Promise<TxResult>;
  finalizarVotacion(): Promise<TxResult>;

  // Votación
  emitirVoto(candidato: string, nullifierHex: string): Promise<VoteSubmissionResult>;
  registrarDni(hashUnico: string): Promise<TxResult>;

  // Consulta
  getLedgerState(): Promise<LedgerState>;
  getHourlySnapshots(): HourlySnapshot[];
  checkProofServerHealth(): Promise<{ status: boolean; message: string }>;
}

// ── Implementación Simulada ────────────────────────────────────────────

class SimulatedMidnightService implements IMidnightService {
  private estado: EstadoVotacion = 'CERRADA';
  private candidatos: Map<string, number> = new Map();
  private nullifiers: Set<string> = new Set();
  private dniRegistrados: Set<string> = new Set();
  private horaInicio: number | null = null;
  private duracionSegundos: number = getDefaultVotingDuration();
  private totalVotos: number = 0;
  private hourlySnapshots: HourlySnapshot[] = [];
  private snapshotInterval: ReturnType<typeof setInterval> | null = null;

  private generateTxId(): string {
    return '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private generateProofHash(): string {
    return 'zkp_' + Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Sincronizar el estado actual con el servidor para soporte multidispositivo
  private async pullState(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const res = await fetch('/api/ledger');
      if (res.ok) {
        const data = await res.json();
        this.estado = data.estado;
        this.candidatos = new Map(data.candidatos);
        this.nullifiers = new Set(data.nullifiers);
        this.dniRegistrados = new Set(data.dniRegistrados);
        this.horaInicio = data.horaInicio;
        this.duracionSegundos = data.duracionSegundos;
        this.totalVotos = data.totalVotos;
        this.hourlySnapshots = data.hourlySnapshots;
      }
    } catch (err) {
      console.warn('Error de lectura en ledger simulado:', err);
    }
  }

  private async pushState(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      await fetch('/api/ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estado: this.estado,
          candidatos: Array.from(this.candidatos.entries()),
          nullifiers: Array.from(this.nullifiers.values()),
          dniRegistrados: Array.from(this.dniRegistrados.values()),
          horaInicio: this.horaInicio,
          duracionSegundos: this.duracionSegundos,
          totalVotos: this.totalVotos,
          hourlySnapshots: this.hourlySnapshots,
        })
      });
    } catch (err) {
      console.warn('Error al escribir en ledger simulado:', err);
    }
  }

  private startSnapshotTimer(): void {
    if (this.snapshotInterval) clearInterval(this.snapshotInterval);
    this.takeSnapshot();
    const intervalMs = 60_000; // 1 minuto en demo
    this.snapshotInterval = setInterval(async () => {
      await this.pullState();
      if (this.estado === 'ABIERTA') {
        this.takeSnapshot();
        await this.pushState();
      } else {
        if (this.snapshotInterval) clearInterval(this.snapshotInterval);
      }
    }, intervalMs);
  }

  private takeSnapshot(): void {
    this.hourlySnapshots.push({
      hora: this.hourlySnapshots.length,
      timestamp: Math.floor(Date.now() / 1000),
      candidatos: Array.from(this.candidatos.entries()).map(([nombre, votos]) => ({ nombre, votos })),
      totalVotos: this.totalVotos,
    });
  }

  async registrarCandidato(nombre: string): Promise<TxResult> {
    await this.simulateDelay(800);
    await this.pullState();

    if (this.estado !== 'CERRADA') {
      throw new Error('No se pueden agregar candidatos con la votación activa o finalizada.');
    }
    if (this.candidatos.has(nombre)) {
      throw new Error(`El candidato "${nombre}" ya está registrado.`);
    }
    if (!nombre.trim()) {
      throw new Error('El nombre del candidato no puede estar vacío.');
    }

    this.candidatos.set(nombre, 0);
    await this.pushState();

    return {
      success: true,
      transactionId: this.generateTxId(),
      proofHash: this.generateProofHash(),
      details: `Candidato "${nombre}" registrado exitosamente en el ledger Midnight.`,
    };
  }

  async iniciarVotacion(duracionSegundos?: number): Promise<TxResult> {
    await this.simulateDelay(1500);
    await this.pullState();

    if (this.estado !== 'CERRADA') {
      throw new Error('La votación ya fue iniciada o finalizada.');
    }
    if (this.candidatos.size < 2) {
      throw new Error(`Se necesitan al menos 2 candidatos. Actualmente hay ${this.candidatos.size}.`);
    }

    this.duracionSegundos = duracionSegundos || getDefaultVotingDuration();
    this.horaInicio = Math.floor(Date.now() / 1000);
    this.estado = 'ABIERTA';
    this.hourlySnapshots = [];
    this.startSnapshotTimer();
    await this.pushState();

    return {
      success: true,
      transactionId: this.generateTxId(),
      proofHash: this.generateProofHash(),
      details: `Votación iniciada. Duración: ${this.duracionSegundos} segundos (${(this.duracionSegundos / 3600).toFixed(1)} horas).`,
    };
  }

  async finalizarVotacion(): Promise<TxResult> {
    await this.simulateDelay(1000);
    await this.pullState();

    if (this.estado !== 'ABIERTA') {
      throw new Error('La votación no está abierta.');
    }

    const now = Math.floor(Date.now() / 1000);
    if (this.horaInicio && (now - this.horaInicio) < this.duracionSegundos) {
      const remaining = this.duracionSegundos - (now - this.horaInicio);
      throw new Error(`El tiempo de votación no ha expirado. Faltan ${Math.ceil(remaining / 60)} minutos.`);
    }

    this.estado = 'FINALIZADA';
    this.takeSnapshot(); // Snapshot final
    if (this.snapshotInterval) clearInterval(this.snapshotInterval);
    await this.pushState();

    return {
      success: true,
      transactionId: this.generateTxId(),
      proofHash: this.generateProofHash(),
      details: 'Votación finalizada. Recuento de votos completado.',
    };
  }

  async emitirVoto(candidato: string, nullifierHex: string): Promise<VoteSubmissionResult> {
    await this.simulateDelay(2000);
    await this.pullState();

    if (this.estado !== 'ABIERTA') {
      throw new Error('La votación no está abierta.');
    }

    // Verificar tiempo
    const now = Math.floor(Date.now() / 1000);
    if (this.horaInicio && (now - this.horaInicio) >= this.duracionSegundos) {
      throw new Error('El tiempo de votación ha expirado.');
    }

    if (!this.candidatos.has(candidato)) {
      throw new Error(`Candidato "${candidato}" no está registrado.`);
    }

    if (this.nullifiers.has(nullifierHex)) {
      throw new Error('Este DNI ya ha emitido su voto en esta votación.');
    }

    this.nullifiers.add(nullifierHex);
    this.candidatos.set(candidato, (this.candidatos.get(candidato) || 0) + 1);
    this.totalVotos++;
    await this.pushState();

    return {
      success: true,
      transactionId: this.generateTxId(),
      proofHash: this.generateProofHash(),
      details: 'Voto emitido exitosamente con prueba ZK en la red Midnight.',
      candidatoNombre: candidato,
      nullifierRegistered: nullifierHex,
      updatedLedger: await this.getLedgerState(),
    };
  }

  async registrarDni(hashUnico: string): Promise<TxResult> {
    await this.simulateDelay(1000);
    await this.pullState();

    if (this.dniRegistrados.has(hashUnico)) {
      throw new Error('Este DNI ya fue registrado previamente en la red Midnight.');
    }

    this.dniRegistrados.add(hashUnico);
    await this.pushState();

    return {
      success: true,
      transactionId: this.generateTxId(),
      proofHash: this.generateProofHash(),
      details: 'DNI registrado de forma privada en la red Midnight.',
    };
  }

  async getLedgerState(): Promise<LedgerState> {
    await this.pullState();
    const now = Math.floor(Date.now() / 1000);
    let tiempoRestante = -1;

    if (this.estado === 'ABIERTA' && this.horaInicio) {
      tiempoRestante = Math.max(0, this.duracionSegundos - (now - this.horaInicio));
      // Auto-finalizar si el tiempo expiró
      if (tiempoRestante <= 0) {
        this.estado = 'FINALIZADA';
        this.takeSnapshot();
        if (this.snapshotInterval) clearInterval(this.snapshotInterval);
        tiempoRestante = 0;
        await this.pushState();
      }
    } else if (this.estado === 'FINALIZADA') {
      tiempoRestante = 0;
    }

    return {
      estado: this.estado,
      candidatos: Array.from(this.candidatos.entries()).map(([nombre, votos]) => ({ nombre, votos })),
      totalVotos: this.totalVotos,
      horaInicio: this.horaInicio,
      duracionSegundos: this.duracionSegundos,
      tiempoRestante,
      cantidadCandidatos: this.candidatos.size,
    };
  }

  getHourlySnapshots(): HourlySnapshot[] {
    return [...this.hourlySnapshots];
  }

  async checkProofServerHealth(): Promise<{ status: boolean; message: string }> {
    const proofServerUrl = getNetworkConfig().proofServerUrl;
    try {
      const response = await fetch(`${proofServerUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) {
        return { status: true, message: 'Midnight Proof Server operacional' };
      }
      return { status: false, message: `Proof Server respondió con HTTP ${response.status}` };
    } catch {
      return { status: false, message: `Proof Server en ${proofServerUrl} offline — modo simulación activo` };
    }
  }

  private simulateDelay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ── Singleton del servicio ─────────────────────────────────────────────

let serviceInstance: IMidnightService | null = null;

/**
 * Obtiene la instancia del servicio Midnight.
 * Usa simulación por defecto; cambiará a real cuando el SDK esté configurado.
 */
export function getMidnightService(): IMidnightService {
  if (!serviceInstance) {
    // TODO: cuando el SDK esté instalado, verificar si la red real está configurada
    // y usar RealMidnightService en su lugar.
    // if (isRealNetworkConfigured() && hasSDKPackages()) {
    //   serviceInstance = new RealMidnightService();
    // } else {
    serviceInstance = new SimulatedMidnightService();
    // }
  }
  return serviceInstance;
}

/**
 * Resetea la instancia del servicio (útil para testing o cambio de red).
 */
export function resetMidnightService(): void {
  serviceInstance = null;
}
