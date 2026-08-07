/**
 * MidnightService — Capa de integración real con la red Midnight.
 *
 * Conecta la aplicación con el SDK @midnight-ntwrk/* y la red Midnight (testnet/mainnet).
 * Utiliza los contratos ZK reales compilados en app/src/managed.
 */

import { getNetworkConfig, getCachedConfig, getDefaultVotingDuration } from './midnightProviders';
import { connectLaceWallet } from './walletConnector';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';

// @ts-ignore
import * as votacionContract from '../managed/votacion/contract';
// @ts-ignore
import * as registroDniContract from '../managed/registro_dni/contract';

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

// ── Implementación Blockchain Real ─────────────────────────────────────

class RealMidnightService implements IMidnightService {
  private hourlySnapshots: HourlySnapshot[] = [];

  // Helper para inicializar providers del SDK conectados a la billetera y red
  private async getProviders() {
    const config = getNetworkConfig();
    const walletAPI = await connectLaceWallet();
    
    return {
      privateStateProvider: levelPrivateStateProvider({
        dbPath: './midnight-private-state'
      }),
      publicDataProvider: indexerPublicDataProvider(
        config.indexerUrl,
        config.indexerWsUrl
      ),
      proofProvider: httpClientProofProvider(
        config.proofServerUrl
      ),
      walletProvider: walletAPI
    };
  }

  async registrarCandidato(nombre: string): Promise<TxResult> {
    if (!nombre.trim()) {
      throw new Error('El nombre del candidato no puede estar vacío.');
    }
    
    const config = getCachedConfig();
    if (!config.votingContractAddress) {
      throw new Error('Contrato de votación no configurado en la DApp.');
    }

    const providers = await this.getProviders();
    const deployed = await findDeployedContract(providers, {
      compiledContract: votacionContract.contractSpecification,
      contractAddress: config.votingContractAddress,
    });

    const tx = await deployed.callTx.registrarCandidato(nombre);
    
    return {
      success: true,
      transactionId: tx.txHash,
      proofHash: tx.proofHash || '',
      details: `Candidato "${nombre}" registrado exitosamente en Midnight Testnet.`,
    };
  }

  async iniciarVotacion(duracionSegundos?: number): Promise<TxResult> {
    const config = getCachedConfig();
    if (!config.votingContractAddress) {
      throw new Error('Contrato de votación no configurado en la DApp.');
    }

    const providers = await this.getProviders();
    const deployed = await findDeployedContract(providers, {
      compiledContract: votacionContract.contractSpecification,
      contractAddress: config.votingContractAddress,
    });

    const duration = BigInt(duracionSegundos || getDefaultVotingDuration());
    const now = BigInt(Math.floor(Date.now() / 1000));

    const tx = await deployed.callTx.iniciarVotacion(now, duration);
    this.hourlySnapshots = [];

    return {
      success: true,
      transactionId: tx.txHash,
      proofHash: tx.proofHash || '',
      details: 'Votación iniciada oficialmente en la blockchain de Midnight.',
    };
  }

  async finalizarVotacion(): Promise<TxResult> {
    const config = getCachedConfig();
    if (!config.votingContractAddress) {
      throw new Error('Contrato de votación no configurado en la DApp.');
    }

    const providers = await this.getProviders();
    const deployed = await findDeployedContract(providers, {
      compiledContract: votacionContract.contractSpecification,
      contractAddress: config.votingContractAddress,
    });

    const now = BigInt(Math.floor(Date.now() / 1000));
    const tx = await deployed.callTx.finalizarVotacion(now);

    return {
      success: true,
      transactionId: tx.txHash,
      proofHash: tx.proofHash || '',
      details: 'Votación finalizada y recuento de votos cerrado en la blockchain.',
    };
  }

  async emitirVoto(candidato: string, nullifierHex: string): Promise<VoteSubmissionResult> {
    const config = getCachedConfig();
    if (!config.votingContractAddress) {
      throw new Error('Contrato de votación no configurado en la DApp.');
    }

    const providers = await this.getProviders();
    const deployed = await findDeployedContract(providers, {
      compiledContract: votacionContract.contractSpecification,
      contractAddress: config.votingContractAddress,
    });

    // Convertir el nullifier del DNI (hexadecimal) a BigInt compatible con Uint<254>
    const nullifierBigInt = BigInt('0x' + nullifierHex.replace(/^0x/, ''));
    const now = BigInt(Math.floor(Date.now() / 1000));

    const tx = await deployed.callTx.emitirVoto(candidato, nullifierBigInt, now);

    return {
      success: true,
      transactionId: tx.txHash,
      proofHash: tx.proofHash || '',
      details: 'Voto emitido exitosamente con prueba ZK en Midnight.',
      candidatoNombre: candidato,
      nullifierRegistered: nullifierHex,
      updatedLedger: await this.getLedgerState(),
    };
  }

  async registrarDni(hashUnico: string): Promise<TxResult> {
    const config = getCachedConfig();
    if (!config.dniContractAddress) {
      throw new Error('Contrato de Registro DNI no configurado en la DApp.');
    }

    const providers = await this.getProviders();
    const deployed = await findDeployedContract(providers, {
      compiledContract: registroDniContract.contractSpecification,
      contractAddress: config.dniContractAddress,
    });

    // Hash único del DNI en formato BigInt compatible con Uint<254>
    const hashBigInt = BigInt('0x' + hashUnico.replace(/^0x/, ''));
    
    // Objeto privado (witness) que no se guarda en el ledger
    const datosDni = {
      numero_dni: hashBigInt,
      apellido_nombres: 'CONFIDENTIAL',
      sexo: 'M',
      fecha_nacimiento: '01/01/1990',
      numero_tramite: BigInt(0)
    };

    const tx = await deployed.callTx.registrarDNI(datosDni, hashBigInt);

    return {
      success: true,
      transactionId: tx.txHash,
      proofHash: tx.proofHash || '',
      details: 'DNI registrado de forma privada en la red Midnight.',
    };
  }

  async getLedgerState(): Promise<LedgerState> {
    const config = getCachedConfig();
    if (!config.votingContractAddress) {
      return {
        estado: 'CERRADA',
        candidatos: [],
        totalVotos: 0,
        horaInicio: null,
        duracionSegundos: getDefaultVotingDuration(),
        tiempoRestante: -1,
        cantidadCandidatos: 0,
      };
    }

    const providers = await this.getProviders();
    const deployed = await findDeployedContract(providers, {
      compiledContract: votacionContract.contractSpecification,
      contractAddress: config.votingContractAddress,
    });

    const ledger = deployed.state.ledger;

    // Convertir estado del enum del contrato (0 = CERRADA, 1 = ABIERTA, 2 = FINALIZADA)
    let estado: EstadoVotacion = 'CERRADA';
    if (ledger.estado_actual === 1) estado = 'ABIERTA';
    if (ledger.estado_actual === 2) estado = 'FINALIZADA';

    const now = Math.floor(Date.now() / 1000);
    const horaInicio = ledger.hora_inicio ? Number(ledger.hora_inicio) : null;
    const duracionSegundos = Number(ledger.duracion_segundos);

    let tiempoRestante = -1;
    if (estado === 'ABIERTA' && horaInicio) {
      tiempoRestante = Math.max(0, duracionSegundos - (now - horaInicio));
    } else if (estado === 'FINALIZADA') {
      tiempoRestante = 0;
    }

    const candidatos: CandidatoInfo[] = [];
    if (ledger.conteo_votos) {
      for (const [nombre, votos] of Object.entries(ledger.conteo_votos)) {
        candidatos.push({
          nombre: String(nombre),
          votos: Number(votos),
        });
      }
    }

    return {
      estado,
      candidatos,
      totalVotos: Number(ledger.total_votos),
      horaInicio,
      duracionSegundos,
      tiempoRestante,
      cantidadCandidatos: Number(ledger.cantidad_candidatos),
    };
  }

  getHourlySnapshots(): HourlySnapshot[] {
    return [...this.hourlySnapshots];
  }

  async checkProofServerHealth(): Promise<{ status: boolean; message: string }> {
    const config = getNetworkConfig();
    try {
      const response = await fetch(`${config.proofServerUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) {
        return { status: true, message: 'Midnight Proof Server operacional' };
      }
      return { status: false, message: `Proof Server respondió con HTTP ${response.status}` };
    } catch {
      return { status: false, message: `No se pudo conectar al Proof Server en ${config.proofServerUrl}` };
    }
  }
}

// ── Singleton del servicio ─────────────────────────────────────────────

let serviceInstance: IMidnightService | null = null;

/**
 * Obtiene la instancia del servicio Midnight conectado a blockchain.
 */
export function getMidnightService(): IMidnightService {
  if (!serviceInstance) {
    serviceInstance = new RealMidnightService();
  }
  return serviceInstance;
}

/**
 * Resetea la instancia del servicio.
 */
export function resetMidnightService(): void {
  serviceInstance = null;
}
