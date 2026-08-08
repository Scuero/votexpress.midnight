/**
 * Configuración de Providers del SDK de Midnight según la red seleccionada.
 *
 * Soporta tres modos:
 * - "local"   → Docker local (proof server + indexer + nodo)
 * - "testnet" → Preprod con Blockfrost + proof server local
 * - "mainnet" → Producción con Blockfrost + proof server local
 */

export type MidnightNetwork = 'local' | 'testnet' | 'preview' | 'mainnet';

export interface NetworkConfig {
  network: MidnightNetwork;
  indexerUrl: string;
  indexerWsUrl: string;
  nodeUrl: string;
  proofServerUrl: string;
  blockfrostProjectId?: string;
}

const NETWORK_CONFIGS: Record<MidnightNetwork, Omit<NetworkConfig, 'network' | 'blockfrostProjectId'>> = {
  local: {
    indexerUrl: 'http://localhost:8088/api/v4/graphql',
    indexerWsUrl: 'ws://localhost:8088/api/v4/graphql/ws',
    nodeUrl: 'http://localhost:9944',
    proofServerUrl: 'http://localhost:6300',
  },
  testnet: {
    indexerUrl: 'https://midnight-preprod.blockfrost.io/api/v0',
    indexerWsUrl: 'wss://midnight-preprod.blockfrost.io/api/v0/ws',
    nodeUrl: 'https://rpc.midnight-preprod.blockfrost.io',
    proofServerUrl: 'http://localhost:6300',
  },
  preview: {
    indexerUrl: 'https://midnight-preview.blockfrost.io/api/v0',
    indexerWsUrl: 'wss://midnight-preview.blockfrost.io/api/v0/ws',
    nodeUrl: 'https://rpc.midnight-preview.blockfrost.io',
    proofServerUrl: 'http://localhost:6300',
  },
  mainnet: {
    indexerUrl: 'https://midnight-mainnet.blockfrost.io/api/v0',
    indexerWsUrl: 'wss://midnight-mainnet.blockfrost.io/api/v0/ws',
    nodeUrl: 'https://rpc.midnight-mainnet.blockfrost.io',
    proofServerUrl: 'http://localhost:6300',
  },
};

// Caché de configuración de ejecución
let cachedConfig = {
  network: (process.env.NEXT_PUBLIC_MIDNIGHT_NETWORK || 'testnet') as MidnightNetwork,
  blockfrostProjectId: process.env.NEXT_PUBLIC_BLOCKFROST_PROJECT_ID || '',
  votingContractAddress: process.env.NEXT_PUBLIC_VOTING_CONTRACT_ADDRESS || '',
  dniContractAddress: process.env.NEXT_PUBLIC_DNI_CONTRACT_ADDRESS || '',
  proofServerUrl: process.env.NEXT_PUBLIC_PROOF_SERVER_URL || '',
};

export function saveConfigToLocalStorage(config: typeof cachedConfig) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('votexpress_config', JSON.stringify(config));
  cachedConfig = { ...config };

  // Sincronizar con el servidor para que otros dispositivos lo detecten
  fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  }).catch(err => console.warn('Error de sincronización con servidor:', err));
}

/**
 * Obtiene la configuración actual de la caché.
 */
export function getCachedConfig() {
  return { ...cachedConfig };
}

/**
 * Carga la configuración del servidor y la combina con la de LocalStorage si existe.
 */
export async function fetchRuntimeConfig(): Promise<void> {
  if (typeof window === 'undefined') return; // Solo ejecutar en cliente
  
  // 1. Verificar si hay parámetros en la URL (ideal para compartir links entre dispositivos)
  const urlParams = new URLSearchParams(window.location.search);
  const urlNet = urlParams.get('net');
  const urlVoting = urlParams.get('voting');
  const urlDni = urlParams.get('dni');
  const urlBf = urlParams.get('bf');
  const urlProof = urlParams.get('proof');
  
  if (urlNet || urlVoting || urlDni) {
    const newConfig = {
      network: (urlNet || cachedConfig.network) as MidnightNetwork,
      blockfrostProjectId: urlBf || cachedConfig.blockfrostProjectId,
      votingContractAddress: urlVoting || cachedConfig.votingContractAddress,
      dniContractAddress: urlDni || cachedConfig.dniContractAddress,
      proofServerUrl: urlProof || cachedConfig.proofServerUrl,
    };
    saveConfigToLocalStorage(newConfig);
    console.log('🔗 Configuración importada desde URL compartida:', newConfig);
    
    // Limpiar los parámetros de la URL para dejarla limpia
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
    return;
  }

  // 2. Intentar cargar de LocalStorage primero
  const saved = localStorage.getItem('votexpress_config');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      cachedConfig = { ...cachedConfig, ...parsed };
      console.log('⚙️ Configuración cargada desde LocalStorage:', cachedConfig);
      return;
    } catch (e) {
      console.error('Error al parsear configuración de LocalStorage:', e);
    }
  }

  // 3. Fallback a la API de servidor (Cloud Run Env)
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const data = await res.json();
      cachedConfig = {
        network: (data.network || cachedConfig.network) as MidnightNetwork,
        blockfrostProjectId: data.blockfrostProjectId || cachedConfig.blockfrostProjectId,
        votingContractAddress: data.votingContractAddress || cachedConfig.votingContractAddress,
        dniContractAddress: data.dniContractAddress || cachedConfig.dniContractAddress,
        proofServerUrl: data.proofServerUrl || cachedConfig.proofServerUrl,
      };
      console.log('⚙️ Configuración en ejecución cargada desde API de servidor:', cachedConfig);
    }
  } catch (err) {
    console.warn('⚠️ No se pudo obtener la configuración dinámica del servidor, usando variables estáticas:', err);
  }
}

/**
 * Obtiene la configuración de red según las variables de entorno o caché.
 */
export function getNetworkConfig(): NetworkConfig {
  const network = NETWORK_CONFIGS[cachedConfig.network] ? cachedConfig.network : 'testnet';
  const config = NETWORK_CONFIGS[network];

  return {
    network,
    ...config,
    proofServerUrl: cachedConfig.proofServerUrl || config.proofServerUrl,
    blockfrostProjectId: cachedConfig.blockfrostProjectId || undefined,
  };
}

/**
 * Obtiene la dirección del contrato de votación desplegado.
 */
export function getVotingContractAddress(): string | null {
  return cachedConfig.votingContractAddress || null;
}

/**
 * Obtiene la dirección del contrato de registro DNI desplegado.
 */
export function getDniContractAddress(): string | null {
  return cachedConfig.dniContractAddress || null;
}

/**
 * Duración por defecto de la votación en segundos.
 */
export function getDefaultVotingDuration(): number {
  return parseInt(process.env.NEXT_PUBLIC_VOTING_DURATION_SECONDS || '86400', 10);
}

/**
 * Verifica si la configuración mínima está presente para usar la red real.
 */
export function isRealNetworkConfigured(): boolean {
  const config = getNetworkConfig();
  if (config.network === 'local') return true;
  return !!config.blockfrostProjectId;
}

/**
 * Nombre legible de la red actual.
 */
export function getNetworkDisplayName(): string {
  const names: Record<MidnightNetwork, string> = {
    local: 'Local (Docker)',
    testnet: 'Testnet Preprod',
    preview: 'Testnet Preview',
    mainnet: 'Mainnet',
  };
  return names[getNetworkConfig().network];
}
