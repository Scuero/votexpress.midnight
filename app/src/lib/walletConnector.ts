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

/**
 * Conecta la wallet Lace y obtiene la API autorizada.
 * Solicita permiso al usuario vía el popup de la extensión.
 */
export async function connectLaceWallet(): Promise<WalletAPI> {
  const provider = getLaceProvider();
  if (!provider) {
    throw new Error(
      'Lace wallet no detectada. Instalá la extensión Lace para Midnight desde https://lace.io'
    );
  }

  try {
    const walletApi = await provider.enable();
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
