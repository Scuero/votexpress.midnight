/**
 * ClientMidnightService — Cliente ligero para interactuar con la red Midnight.
 *
 * Realiza peticiones HTTP a las API Routes de Next.js para ejecutar la lógica de
 * contratos de forma segura en el servidor, evitando bundler errors de Webpack.
 */

import { IMidnightService, TxResult, VoteSubmissionResult, LedgerState, HourlySnapshot } from './midnightServer';

// Re-exportar tipos para compatibilidad de importación
export type { EstadoVotacion, CandidatoInfo, LedgerState, TxResult, VoteSubmissionResult, HourlySnapshot, IMidnightService } from './midnightServer';

class ClientMidnightService implements IMidnightService {
  private snapshotsCache: HourlySnapshot[] = [];

  private async postJson(action: string, data: any) {
    const res = await fetch(`/api/midnight/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP error ${res.status}`);
    }
    return res.json();
  }

  private async getJson(action: string) {
    const res = await fetch(`/api/midnight/${action}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP error ${res.status}`);
    }
    return res.json();
  }

  async registrarCandidato(nombre: string): Promise<TxResult> {
    return this.postJson('registrarCandidato', { nombre });
  }

  async iniciarVotacion(duracionSegundos?: number): Promise<TxResult> {
    return this.postJson('iniciarVotacion', { duracionSegundos });
  }

  async finalizarVotacion(): Promise<TxResult> {
    return this.postJson('finalizarVotacion', {});
  }

  async emitirVoto(candidato: string, nullifierHex: string): Promise<VoteSubmissionResult> {
    return this.postJson('emitirVoto', { candidato, nullifierHex });
  }

  async registrarDni(hashUnico: string): Promise<TxResult> {
    return this.postJson('registrarDni', { hashUnico });
  }

  async getLedgerState(): Promise<LedgerState> {
    const state = await this.getJson('getLedgerState');
    // Pre-cargar y sincronizar caché de snapshots
    this.snapshotsCache = await this.getJson('getHourlySnapshots').catch(() => []);
    return state;
  }

  getHourlySnapshots(): HourlySnapshot[] {
    return this.snapshotsCache;
  }

  async checkProofServerHealth(): Promise<{ status: boolean; message: string }> {
    return this.getJson('checkProofServerHealth');
  }
}

let serviceInstance: IMidnightService | null = null;

export function getMidnightService(): IMidnightService {
  if (!serviceInstance) {
    serviceInstance = new ClientMidnightService();
  }
  return serviceInstance;
}

export function resetMidnightService(): void {
  serviceInstance = null;
}
