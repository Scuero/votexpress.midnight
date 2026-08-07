/**
 * Módulo de conexión con la wallet Lace para Midnight Network.
 *
 * Cumple con la API oficial de DApp Connector documentada en:
 * https://docs.midnight.network/api-reference/dapp-connector
 *
 * Flujo correcto según la spec (@midnight-ntwrk/dapp-connector-api v4.0.1):
 * - InitialAPI: { name, icon, apiVersion, connect(networkId) } — NO tiene enable().
 * - connect(networkId) devuelve una Promise<ConnectedAPI>.
 * - ConnectedAPI expone getShieldedBalances, getUnshieldedBalances, getDustBalance,
 *   getShieldedAddresses, getUnshieldedAddress, getDustAddress, getConfiguration,
 *   makeTransfer, balanceSealedTransaction/balanceUnsealedTransaction, submitTransaction.
 * - El antiguo .state() está deprecado; se reemplaza por los getters granulares.
 */

import type { InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import { getCachedConfig } from './midnightProviders';

export interface WalletState {
  connected: boolean;
  address: string;
  balanceTDust: string;
  networkLabel: string;
}

export interface WalletAPI {
  // Métodos del ConnectedAPI documentados en
  // https://docs.midnight.network/api-reference/dapp-connector
  getConfiguration: () => Promise<{
    indexerUri: string;
    indexerWsUri: string;
    proverServerUri: string;
    substrateNodeUri: string;
    networkId: string;
  }>;
  getShieldedBalances: () => Promise<Record<string, bigint>>;
  getUnshieldedBalances: () => Promise<Record<string, bigint>>;
  getDustBalance: () => Promise<bigint>;
  getShieldedAddresses: () => Promise<string[]>;
  getUnshieldedAddress: () => Promise<string>;
  getDustAddress: () => Promise<string>;
  makeTransfer: (outputs: unknown[]) => Promise<unknown>;
  balanceTransaction: (tx: unknown) => Promise<unknown>;
  balanceSealedTransaction: (tx: unknown) => Promise<unknown>;
  balanceUnsealedTransaction: (tx: unknown) => Promise<unknown>;
  submitTransaction: (tx: unknown) => Promise<string>;
  getConnectionStatus: () => Promise<{ networkId: string;[key: string]: unknown }>;
  // Fallback para compatibilidad con versiones anteriores/futuras del API
  [key: string]: any;
}

/**
 * Verifica si una extensión de wallet Midnight está instalada.
 */
export function isLaceInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).midnight;
}

/**
 * Lista todas las wallets inyectadas en window.midnight.
 * Según la documentación: "enumerate window.midnight to handle different extension versions".
 */
export function listWallets(): InitialAPI[] {
  if (typeof window === 'undefined') return [];
  const injected = (window as any).midnight;
  return injected ? Object.values(injected) : [];
}

/**
 * Obtiene el proveedor de wallet Lace inyectado en window.midnight.
 * Enumera las claves disponibles según la documentación oficial.
 */
function getLaceProvider(): InitialAPI | null {
  if (typeof window === 'undefined') return null;
  const midnight = (window as any).midnight;
  if (!midnight) return null;

  // Intentar la clave estándar primero
  if (midnight.mnLace) return midnight.mnLace;

  // Enumerar otros proveedores inyectados (UUIDs de versiones futuras)
  const keys = Object.keys(midnight);
  if (keys.length > 0) return midnight[keys[0]];

  return null;
}

/**
 * Conecta la wallet Lace y obtiene la API autorizada (ConnectedAPI).
 *
 * Según la especificación oficial del DApp Connector API
 * (https://docs.midnight.network/api-reference/dapp-connector), `InitialAPI`
 * solo expone: name, icon, apiVersion y connect(networkId). NO existe un
 * método enable() en la spec actual — ese fue el error de compilación.
 *
 * El flujo documentado es siempre:
 *   const api = await window.midnight.{walletId}.connect(networkId);
 */
export async function connectLaceWallet(): Promise<WalletAPI> {
  const provider = getLaceProvider();
  if (!provider) {
    throw new Error(
      'Lace wallet no detectada. Instalá la extensión Lace para Midnight desde https://lace.io'
    );
  }

  const config = getCachedConfig();
  const netId = config.network === 'local' ? 'undeployed' : (config.network === 'testnet' ? 'preprod' : 'mainnet');

  try {
    let walletApi: any;

    if (typeof provider.connect === 'function') {
      // Camino oficial: InitialAPI.connect(networkId) → Promise<ConnectedAPI>
      walletApi = await provider.connect(netId);
    } else if (typeof (provider as any).enable === 'function') {
      // Fallback defensivo: algunas builds muy viejas de wallets (previas a
      // que se estandarizara la spec del DApp Connector) exponían enable()
      // en lugar de connect(). No forma parte del tipo InitialAPI oficial,
      // por eso el cast a `any` acá.
      walletApi = await (provider as any).enable();
    } else {
      throw new Error('El proveedor inyectado de Lace no expone el método connect().');
    }

    return walletApi as WalletAPI;
  } catch (error: any) {
    if (error?.code === -1 || error?.message?.includes('rejected')) {
      throw new Error('Conexión rechazada por el usuario en Lace wallet.');
    }
    if (error?.message?.includes('Network ID mismatch') || error?.message?.includes('network') || error?.message?.includes('mismatch')) {
      const expectedNet = config.network === 'local' ? 'Local (Docker devnet)' : (config.network === 'testnet' ? 'Testnet Preprod' : 'Mainnet');
      throw new Error(`Error de Red: Tu billetera Lace está configurada en una red distinta. Cambiá la red en Lace para: ${expectedNet}.`);
    }
    throw new Error(`Error al conectar Lace: ${error?.message || 'Error desconocido'}`);
  }
}

/**
 * Obtiene el estado actual de la wallet conectada.
 * Usa los métodos granulares de la API nueva (no el deprecado .state()).
 */
export async function getWalletState(walletApi: WalletAPI): Promise<WalletState> {
  try {
    // Usar los métodos granulares del WalletConnectedAPI (no deprecados)
    let address = '';
    let balanceTDust = '0';

    // getUnshieldedAddress() → dirección pública
    if (typeof walletApi.getUnshieldedAddress === 'function') {
      address = await walletApi.getUnshieldedAddress();
    }

    // getDustBalance() → balance de DUST (el recurso que paga las transacciones).
    // Es un getter dedicado en el ConnectedAPI, no una clave dentro de
    // getUnshieldedBalances() — DUST no es un "token type" más, es un recurso
    // aparte generado por NIGHT. Ver la tabla de "Read wallet information" en
    // https://docs.midnight.network/api-reference/dapp-connector
    if (typeof walletApi.getDustBalance === 'function') {
      const dustBalance = await walletApi.getDustBalance();
      balanceTDust = dustBalance.toString();
    } else if (typeof walletApi.getUnshieldedBalances === 'function') {
      // Fallback por si la versión de la wallet conectada no expone
      // getDustBalance() todavía.
      const balances = await walletApi.getUnshieldedBalances();
      const dustBalance = balances[''] || balances['tDUST'] || balances['dust'] || BigInt(0);
      balanceTDust = dustBalance.toString();
    }

    // Determinar la red
    let networkLabel = 'unknown';
    const config = getCachedConfig();
    if (config.network === 'testnet') networkLabel = 'Preprod';
    else if (config.network === 'mainnet') networkLabel = 'Mainnet';
    else if (config.network === 'local') networkLabel = 'Local';

    return {
      connected: true,
      address: address || '',
      balanceTDust,
      networkLabel,
    };
  } catch {
    return {
      connected: false,
      address: '',
      balanceTDust: '0',
      networkLabel: 'disconnected',
    };
  }
}

/**
 * Formatea una dirección larga a un formato corto legible.
 * Ej: "0x1234...abcd"
 */
export function formatAddress(address: string, chars = 6): string {
  if (!address) return '';
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

let activeWalletApi: WalletAPI | null = null;

export function getActiveWalletApi(): WalletAPI | null {
  return activeWalletApi;
}

export function setActiveWalletApi(api: WalletAPI | null): void {
  activeWalletApi = api;
}