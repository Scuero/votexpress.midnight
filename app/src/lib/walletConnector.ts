/**
 * Módulo de conexión con la wallet Lace para Midnight Network.
 *
 * Detecta la extensión Lace en el navegador, solicita conexión,
 * y expone el estado de la wallet al frontend.
 */

export interface WalletState {
  connected: boolean;
  address: string;
  balanceTDust: string;
  networkLabel: string;
}

export interface WalletAPI {
  state: () => Promise<WalletState>;
  balanceAndProveTransaction: (tx: unknown) => Promise<unknown>;
  submitTransaction: (tx: unknown) => Promise<string>;
}

/**
 * Verifica si la extensión Lace para Midnight está instalada.
 */
export function isLaceInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).midnight;
}

/**
 * Obtiene el proveedor de wallet Lace inyectado en window.midnight.
 * Enumera las claves disponibles para evitar hardcodear 'mnLace'.
 */
function getLaceProvider(): any | null {
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

import { getCachedConfig } from './midnightProviders';

/**
 * Conecta la wallet Lace y obtiene la API autorizada.
 * Soporta tanto el método legacy 'enable()' como el método estándar 'connect(networkId)'.
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
    if (typeof provider.enable === 'function') {
      walletApi = await provider.enable();
    } else if (typeof provider.connect === 'function') {
      const config = getCachedConfig();
      // Formatear network ID compatible: local -> 'undeployed', testnet -> 'preprod', mainnet -> 'mainnet'
      const netId = config.network === 'local' ? 'undeployed' : (config.network === 'testnet' ? 'preprod' : 'mainnet');
      walletApi = await provider.connect(netId);
    } else {
      // Si el objeto tiene un método enable/connect interno por ser una estructura anidada
      const keys = Object.keys(provider);
      let foundMethod = false;
      for (const k of keys) {
        if (provider[k] && typeof provider[k].connect === 'function') {
          const config = getCachedConfig();
          const netId = config.network === 'local' ? 'undeployed' : (config.network === 'testnet' ? 'preprod' : 'mainnet');
          walletApi = await provider[k].connect(netId);
          foundMethod = true;
          break;
        } else if (provider[k] && typeof provider[k].enable === 'function') {
          walletApi = await provider[k].enable();
          foundMethod = true;
          break;
        }
      }
      if (!foundMethod) {
        throw new Error('El proveedor inyectado de Lace no expone los métodos enable() ni connect().');
      }
    }
    return walletApi;
  } catch (error: any) {
    if (error?.code === -1 || error?.message?.includes('rejected')) {
      throw new Error('Conexión rechazada por el usuario en Lace wallet.');
    }
    throw new Error(`Error al conectar Lace: ${error?.message || 'Error desconocido'}`);
  }
}

/**
 * Obtiene el estado actual de la wallet conectada.
 */
export async function getWalletState(walletApi: WalletAPI): Promise<WalletState> {
  try {
    const state = await walletApi.state();
    return {
      connected: true,
      address: state.address || '',
      balanceTDust: state.balanceTDust || '0',
      networkLabel: state.networkLabel || 'unknown',
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
