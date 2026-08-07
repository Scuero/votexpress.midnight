/**
 * Módulo de conexión con la wallet Lace para Midnight Network.
 *
 * Cumple con la API oficial de DApp Connector documentada en:
 * https://docs.midnight.network/api-reference
 *
 * Cambios respecto a versiones anteriores:
 * - DAppConnectorAPI → InitialAPI
 * - DAppConnectorWalletAPI → WalletConnectedAPI
 * - .state() → DEPRECADO, usar getShieldedBalances(), getUnshieldedAddress(), etc.
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
  // Métodos actuales del WalletConnectedAPI (Midnight DApp Connector)
  getShieldedBalances: () => Promise<Record<string, bigint>>;
  getUnshieldedBalances: () => Promise<Record<string, bigint>>;
  getShieldedAddresses: () => Promise<string[]>;
  getUnshieldedAddress: () => Promise<string>;
  balanceTransaction: (tx: unknown) => Promise<unknown>;
  submitTransaction: (tx: unknown) => Promise<string>;
  // Fallback para compatibilidad con versiones anteriores
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
 * Conecta la wallet Lace y obtiene la API autorizada (WalletConnectedAPI).
 * Usa enable() como método principal según la documentación del DApp Connector.
 */
export async function connectLaceWallet(): Promise<WalletAPI> {
  const provider = getLaceProvider();
  if (!provider) {
    throw new Error(
      'Lace wallet no detectada. Instalá la extensión Lace para Midnight desde https://lace.io'
    );
  }

  try {
    let walletApi: any;

    // Según la documentación: "Use the enable() method to request permissions"
    if (typeof provider.enable === 'function') {
      walletApi = await provider.enable();
    } else if (typeof (provider as any).connect === 'function') {
      // Fallback para versiones que usan connect(networkId)
      const config = getCachedConfig();
      const netId = config.network === 'local' ? 'undeployed' : (config.network === 'testnet' ? 'preprod' : 'mainnet');
      walletApi = await (provider as any).connect(netId);
    } else {
      throw new Error('El proveedor inyectado de Lace no expone los métodos enable() ni connect().');
    }

    return walletApi as WalletAPI;
  } catch (error: any) {
    if (error?.code === -1 || error?.message?.includes('rejected')) {
      throw new Error('Conexión rechazada por el usuario en Lace wallet.');
    }
    if (error?.message?.includes('Network ID mismatch') || error?.message?.includes('network') || error?.message?.includes('mismatch')) {
      const config = getCachedConfig();
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

    // getUnshieldedBalances() → balances públicos
    if (typeof walletApi.getUnshieldedBalances === 'function') {
      const balances = await walletApi.getUnshieldedBalances();
      // El balance de tDUST suele estar bajo la clave '' o 'tDUST'
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
