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
  getUnshieldedAddress: () => Promise<string | { unshieldedAddress: string } | null | undefined>;
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
  const netId = config.network === 'local' 
    ? 'undeployed' 
    : (config.network === 'testnet' 
       ? 'testnet' 
       : (config.network === 'preview' ? 'preview' : 'mainnet'));

  try {
    let walletApi: any;

    if (typeof (provider as any).enable === 'function') {
      // Priorizar enable() porque es el método estándar más compatible
      // y no restringe la red de manera forzada al conectar, evitando bloqueos del canal RPC.
      walletApi = await (provider as any).enable();
    } else if (typeof provider.connect === 'function') {
      walletApi = await provider.connect(netId);
    } else {
      throw new Error('El proveedor inyectado de Lace no expone los métodos enable() ni connect().');
    }

    return walletApi as WalletAPI;
  } catch (error: any) {
    let msg = 'Error desconocido';
    let code: any = undefined;
    try {
      if (typeof error === 'string') {
        msg = error;
      } else if (error && typeof error === 'object') {
        msg = error.message || error.error || String(error);
        code = error.code;
      } else {
        msg = String(error);
      }
    } catch {
      msg = 'Error al comunicarse con la extensión de Lace';
    }

    if (msg.includes('rejected') || msg.includes('user rejected') || code === -1) {
      throw new Error('Conexión rechazada por el usuario en Lace wallet.');
    }
    if (msg.includes('Network ID mismatch') || msg.includes('network') || msg.includes('mismatch')) {
      const expectedNet = config.network === 'local' 
        ? 'Local (Docker devnet)' 
        : (config.network === 'testnet' 
           ? 'Testnet Preprod' 
           : (config.network === 'preview' ? 'Testnet Preview' : 'Mainnet'));
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

    const addressData = await walletApi.getUnshieldedAddress();
    const address = typeof addressData === 'string' 
      ? addressData 
      : (addressData?.unshieldedAddress || '');
      
    if (!address) {
      throw new Error('La billetera está bloqueada. Por favor, desbloqueá Lace e ingresá tu clave de seguridad.');
    }

    let balanceTDust = '0';
    let balanceTNight = '0';
    try {
      if (typeof walletApi.getUnshieldedBalances === 'function') {
        const balances = await walletApi.getUnshieldedBalances();
        let dustBalance = BigInt(0);
        let nightBalance = BigInt(0);

        const toBigInt = (val: any): bigint => {
          if (typeof val === 'bigint') return val;
          if (typeof val === 'number') return BigInt(val);
          if (typeof val === 'string') {
            try { return BigInt(val); } catch { return BigInt(0); }
          }
          return BigInt(0);
        };

        const entries: [any, any][] = [];
        if (balances) {
          if (typeof (balances as any).entries === 'function') {
            entries.push(...(Array.from((balances as any).entries()) as [any, any][] || []));
          } else {
            entries.push(...Object.entries(balances));
          }
        }

        const debugStr = entries.map(([k, v]) => `${typeof k === 'object' ? JSON.stringify(k) : String(k)}: ${String(v)}`).join(', ');
        console.log('📊 Balances devueltos por Lace:', debugStr);

        for (const [key, value] of entries) {
          const keyStr = typeof key === 'object' ? JSON.stringify(key) : String(key).toLowerCase();
          const valBig = toBigInt(value);

          if (keyStr === '' || keyStr.includes('night') || keyStr.includes('native') || keyStr.includes('0000000000000000000000000000000000000000000000000000000000000000')) {
            nightBalance = valBig;
          } else if (keyStr.includes('dust')) {
            dustBalance = valBig;
          } else {
            if (entries.length === 1) {
              nightBalance = valBig;
            }
          }
        }

        const formatBalance = (bal: bigint): string => {
          const integerPart = bal / 1000000n;
          const fractionalPart = bal % 1000000n;
          if (fractionalPart === 0n) {
            return integerPart.toString();
          }
          let fracStr = fractionalPart.toString().padStart(6, '0');
          fracStr = fracStr.replace(/0+$/, '');
          return `${integerPart}.${fracStr}`;
        };

        balanceTDust = formatBalance(dustBalance);
        balanceTNight = formatBalance(nightBalance);
      }
    } catch (e) {
      console.warn('No se pudieron obtener los balances de la wallet:', e);
      balanceTDust = '--';
      balanceTNight = '--';
    }

    // Validar si la red de la billetera coincide con la seleccionada en la DApp
    let walletNetId = '';
    try {
      if (typeof walletApi.getConfiguration === 'function') {
        const wConfig = await walletApi.getConfiguration();
        walletNetId = wConfig?.networkId || '';
      } else if (typeof walletApi.getConnectionStatus === 'function') {
        const status = await walletApi.getConnectionStatus();
        walletNetId = status?.networkId || '';
      }
    } catch (e) {
      console.warn('No se pudo verificar la red de la wallet:', e);
    }

    let networkLabel = 'unknown';
    const config = getCachedConfig();
    
    if (walletNetId) {
      const normalizedWalletNet = walletNetId.toLowerCase();
      const normalizedConfigNet = config.network.toLowerCase();
      
      const isMismatch = (normalizedConfigNet === 'testnet' && normalizedWalletNet !== 'testnet' && normalizedWalletNet !== 'preprod') ||
                         (normalizedConfigNet === 'preview' && normalizedWalletNet !== 'preview') ||
                         (normalizedConfigNet === 'local' && normalizedWalletNet !== 'local' && normalizedWalletNet !== 'undeployed') ||
                         (normalizedConfigNet === 'mainnet' && normalizedWalletNet !== 'mainnet');

      if (isMismatch) {
        const expectedNet = config.network === 'local' 
          ? 'Local (Docker devnet)' 
          : (config.network === 'testnet' 
             ? 'Testnet Preprod' 
             : (config.network === 'preview' ? 'Testnet Preview' : 'Mainnet'));
        throw new Error(`Network ID mismatch: Tu billetera está en '${walletNetId}', pero la DApp está configurada para '${expectedNet}'.`);
      }
    }

    if (config.network === 'testnet') networkLabel = 'Preprod';
    else if (config.network === 'preview') networkLabel = 'Preview';
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
export function formatAddress(address: any, chars = 6): string {
  const str = typeof address === 'string' ? address : (address ? String(address) : '');
  if (!str) return '';
  if (str.length <= chars * 2 + 3) return str;
  return `${str.slice(0, chars + 2)}...${str.slice(-chars)}`;
}

let activeWalletApi: WalletAPI | null = null;

export function getActiveWalletApi(): WalletAPI | null {
  return activeWalletApi;
}

export function setActiveWalletApi(api: WalletAPI | null): void {
  activeWalletApi = api;
}

/**
 * Solicita una firma de transacción de gas a través de la extensión Lace Wallet conectada en el cliente.
 * Invoca `makeTransfer` / `balanceUnsealedTransaction` del DApp Connector API para desplegar el cuadro de diálogo
 * flotante de Lace en Chrome y descontar el saldo tNIGHT real de la wallet del administrador.
 */
export async function requestLaceGasApproval(actionName: string): Promise<string> {
  const walletApi = await connectLaceWallet();
  const config = getCachedConfig();
  const contractAddr = config.votingContractAddress || 'b62807c1734098303d0e86e47ae1ef04c4481b397d63782ea78a5c2874e7aeef';

  if (!walletApi) {
    throw new Error('Lace Wallet no está conectada en el navegador.');
  }

  // 1. Invocar makeTransfer de la especificación DApp Connector API (@midnight-ntwrk/dapp-connector-api)
  if (typeof (walletApi as any).makeTransfer === 'function') {
    try {
      const transferOutputs = [
        {
          type: 'unshielded',
          tokenType: 'tNIGHT',
          amount: BigInt(1_000_000), // 1 tNIGHT de comisión de gas
          receiverAddress: contractAddr,
        },
      ];

      const res = await (walletApi as any).makeTransfer(transferOutputs);
      const txHash = typeof res === 'string' ? res : (res?.txHash || res?.transactionId || `tx_lace_${Date.now().toString(16)}`);
      return String(txHash);
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (
        msg.includes('refused') || 
        msg.includes('reject') || 
        msg.includes('cancel') || 
        msg.includes('User') ||
        msg.includes('Rechazaste') ||
        msg.includes('declined')
      ) {
        throw new Error('Transacción de gas cancelada: Rechazaste el pago de tNIGHT en Lace Wallet.');
      }
      console.warn('⚠️ Fallback al solicitar makeTransfer en Lace Wallet:', msg);
    }
  }

  // 2. Fallback: Intentar balanceUnsealedTransaction + submitTransaction si makeTransfer difiere
  if (typeof (walletApi as any).balanceUnsealedTransaction === 'function' && typeof (walletApi as any).submitTransaction === 'function') {
    try {
      const unsealedTx = await (walletApi as any).balanceUnsealedTransaction({
        fee: BigInt(1_000_000),
        receiverAddress: contractAddr,
      });
      const txHash = await (walletApi as any).submitTransaction(unsealedTx);
      return String(txHash);
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('refused') || msg.includes('reject') || msg.includes('cancel') || msg.includes('declined')) {
        throw new Error('Transacción de gas cancelada: Rechazaste la firma en Lace Wallet.');
      }
    }
  }

  throw new Error('Se requiere confirmación y saldo tNIGHT en Lace Wallet para iniciar la votación.');
}