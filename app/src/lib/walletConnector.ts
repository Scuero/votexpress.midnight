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
  balanceTNight: string;
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
  const netId = config.network === 'local' ? 'undeployed' : (config.network === 'testnet' ? 'testnet' : 'mainnet');

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
    let msg = 'Error desconocido';
    try {
      if (typeof error === 'string') {
        msg = error;
      } else if (error && typeof error === 'object') {
        msg = error.message || error.error || String(error);
      } else {
        msg = String(error);
      }
    } catch {
      msg = 'Error al comunicarse con la extensión de Lace';
    }

    if (msg.includes('rejected') || msg.includes('user rejected') || (error && error.code === -1)) {
      throw new Error('Conexión rechazada por el usuario en Lace wallet.');
    }
    if (msg.includes('Network ID mismatch') || msg.includes('network') || msg.includes('mismatch')) {
      const expectedNet = config.network === 'local' ? 'Local (Docker devnet)' : (config.network === 'testnet' ? 'Testnet Preprod' : 'Mainnet');
      throw new Error(`Error de Red: Tu billetera Lace está configurada en una red distinta. Cambiá la red en Lace para: ${expectedNet}.`);
    }
    throw new Error(`Error al conectar Lace: ${msg}`);
  }
}

/**
 * Obtiene el estado actual de la wallet conectada.
 * Lanza un error amigable si la billetera está bloqueada o no retorna dirección.
 */
export async function getWalletState(walletApi: WalletAPI): Promise<WalletState> {
  try {
    if (typeof walletApi.getUnshieldedAddress !== 'function') {
      throw new Error('La API de la billetera no expone getUnshieldedAddress().');
    }

    const address = await walletApi.getUnshieldedAddress();
    if (!address) {
      throw new Error('La billetera está bloqueada. Por favor, desbloqueá Lace e ingresá tu clave de seguridad.');
    }

    let balanceTDust = '0';
    let balanceTNight = '0';
    if (typeof walletApi.getUnshieldedBalances === 'function') {
      const balances = await walletApi.getUnshieldedBalances();
      let dustBalance = BigInt(0);
      let nightBalance = BigInt(0);
      if (balances) {
        if (typeof (balances as any).get === 'function') {
          dustBalance = (balances as any).get('') || (balances as any).get('tDUST') || (balances as any).get('dust') || BigInt(0);
          nightBalance = (balances as any).get('tNIGHT') || (balances as any).get('NIGHT') || (balances as any).get('night') || BigInt(0);
        } else {
          dustBalance = (balances as any)[''] || (balances as any)['tDUST'] || (balances as any)['dust'] || BigInt(0);
          nightBalance = (balances as any)['tNIGHT'] || (balances as any)['NIGHT'] || (balances as any)['night'] || BigInt(0);
        }
      }
      balanceTDust = dustBalance.toString();
      balanceTNight = nightBalance.toString();
    }

    let networkLabel = 'unknown';
    const config = getCachedConfig();
    if (config.network === 'testnet') networkLabel = 'Preprod';
    else if (config.network === 'mainnet') networkLabel = 'Mainnet';
    else if (config.network === 'local') networkLabel = 'Local';

    return {
      connected: true,
      address,
      balanceTDust,
      balanceTNight,
      networkLabel,
    };
  } catch (error: any) {
    let msg = '';
    try {
      msg = error?.message || String(error);
    } catch {
      msg = 'La billetera está bloqueada';
    }
    throw new Error(
      msg.includes('locked') || msg.includes('bloqueada') || msg.includes('address') || msg.includes('undefined')
        ? 'Tu wallet Lace está bloqueada. Abrí la extensión de Lace en tu navegador, ingresá tu clave para desbloquearla y volvé a intentar.'
        : `Error al obtener datos de la wallet: ${msg}`
    );
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