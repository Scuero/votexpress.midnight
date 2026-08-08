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
    indexerUrl: 'https://indexer.preview.midnight.network/api/v4/graphql',
    indexerWsUrl: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
    nodeUrl: 'https://rpc.preview.midnight.network',
    proofServerUrl: 'http://localhost:6300',
  },
  preview: {
    indexerUrl: 'https://indexer.preview.midnight.network/api/v4/graphql',
    indexerWsUrl: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
    nodeUrl: 'https://rpc.preview.midnight.network',
    proofServerUrl: 'http://localhost:6300',
  },
  mainnet: {
    indexerUrl: 'https://indexer.mainnet.midnight.network/api/v4/graphql',
    indexerWsUrl: 'wss://indexer.mainnet.midnight.network/api/v4/graphql/ws',
    nodeUrl: 'https://rpc.mainnet.midnight.network',
    proofServerUrl: 'http://localhost:6300',
  },
};

// Caché de configuración de ejecución con fallbacks hardcodeados para Cloud Run multi-instancia
let cachedConfig = {
  network: (process.env.MIDNIGHT_NETWORK || process.env.NEXT_PUBLIC_MIDNIGHT_NETWORK || 'testnet') as MidnightNetwork,
  blockfrostProjectId: process.env.BLOCKFROST_PROJECT_ID || process.env.NEXT_PUBLIC_BLOCKFROST_PROJECT_ID || '',
  votingContractAddress: process.env.VOTING_CONTRACT_ADDRESS || process.env.NEXT_PUBLIC_VOTING_CONTRACT_ADDRESS || 'b62807c1734098303d0e86e47ae1ef04c4481b397d63782ea78a5c2874e7aeef',
  dniContractAddress: process.env.DNI_CONTRACT_ADDRESS || process.env.NEXT_PUBLIC_DNI_CONTRACT_ADDRESS || '8ccc6bf37e02cfdbfa330c49288f23d894fe95f8bf42a62dd3d29709b4d75332',
  proofServerUrl: process.env.PROOF_SERVER_URL || process.env.NEXT_PUBLIC_PROOF_SERVER_URL || 'http://localhost:6300',
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
  if (typeof window === 'undefined') {
    const globalStore = globalThis as unknown as { __votexpress_config?: typeof cachedConfig };
    
    // Leer variables de entorno vivas en tiempo de ejecución del contenedor (Cloud Run)
    const envVoting = process.env.VOTING_CONTRACT_ADDRESS || process.env.NEXT_PUBLIC_VOTING_CONTRACT_ADDRESS || 'b62807c1734098303d0e86e47ae1ef04c4481b397d63782ea78a5c2874e7aeef';
    const envDni = process.env.DNI_CONTRACT_ADDRESS || process.env.NEXT_PUBLIC_DNI_CONTRACT_ADDRESS || '8ccc6bf37e02cfdbfa330c49288f23d894fe95f8bf42a62dd3d29709b4d75332';
    const envNetwork = (process.env.MIDNIGHT_NETWORK || process.env.NEXT_PUBLIC_MIDNIGHT_NETWORK || 'testnet') as MidnightNetwork;
    const envProof = process.env.PROOF_SERVER_URL || process.env.NEXT_PUBLIC_PROOF_SERVER_URL || 'http://localhost:6300';
    const envBf = process.env.BLOCKFROST_PROJECT_ID || process.env.NEXT_PUBLIC_BLOCKFROST_PROJECT_ID || '';

    if (envVoting) cachedConfig.votingContractAddress = envVoting;
    if (envDni) cachedConfig.dniContractAddress = envDni;
    if (envNetwork) cachedConfig.network = envNetwork;
    if (envProof) cachedConfig.proofServerUrl = envProof;
    if (envBf) cachedConfig.blockfrostProjectId = envBf;

    if (globalStore.__votexpress_config) {
      cachedConfig = { ...cachedConfig, ...globalStore.__votexpress_config };
    }
  }
  return {
    ...cachedConfig,
    votingContractAddress: cachedConfig.votingContractAddress ? cachedConfig.votingContractAddress.trim().replace(/^0x/i, '') : '',
    dniContractAddress: cachedConfig.dniContractAddress ? cachedConfig.dniContractAddress.trim().replace(/^0x/i, '') : '',
  };
}

/**
 * Carga la configuración del servidor y la combina con la de LocalStorage si existe.
 */
export async function fetchRuntimeConfig(): Promise<void> {
  if (typeof window === 'undefined') return; // Solo ejecutar en cliente

  // 1. Cargar del servidor primero (para obtener variables de entorno de Docker/Cloud Run)
  let serverData: any = {};
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      serverData = await res.json();
    }
  } catch (err) {
    console.warn('⚠️ No se pudo obtener la configuración de la API de servidor:', err);
  }
  
  // 2. Verificar si hay parámetros en la URL
  const urlParams = new URLSearchParams(window.location.search);
  const urlNet = urlParams.get('net');
  const urlVoting = urlParams.get('voting');
  const urlDni = urlParams.get('dni');
  const urlBf = urlParams.get('bf');
  const urlProof = urlParams.get('proof');
  
  if (urlNet || urlVoting || urlDni) {
    const newConfig = {
      network: (urlNet || serverData.network || cachedConfig.network) as MidnightNetwork,
      blockfrostProjectId: urlBf || serverData.blockfrostProjectId || cachedConfig.blockfrostProjectId,
      votingContractAddress: urlVoting || serverData.votingContractAddress || cachedConfig.votingContractAddress,
      dniContractAddress: urlDni || serverData.dniContractAddress || cachedConfig.dniContractAddress,
      proofServerUrl: urlProof || serverData.proofServerUrl || cachedConfig.proofServerUrl,
    };
    saveConfigToLocalStorage(newConfig);
    console.log('🔗 Configuración importada desde URL compartida:', newConfig);
    
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
    return;
  }

  // 3. Cargar de LocalStorage y combinar con servidor
  let localData: any = {};
  const saved = localStorage.getItem('votexpress_config');
  if (saved) {
    try {
      localData = JSON.parse(saved);
      if (localData.network === 'testnet') {
        localData.network = 'preview';
      }
    } catch (e) {
      console.error('Error al parsear configuración de LocalStorage:', e);
    }
  }

  cachedConfig = {
    network: (localData.network || serverData.network || cachedConfig.network) as MidnightNetwork,
    blockfrostProjectId: localData.blockfrostProjectId || serverData.blockfrostProjectId || cachedConfig.blockfrostProjectId,
    votingContractAddress: localData.votingContractAddress || serverData.votingContractAddress || cachedConfig.votingContractAddress,
    dniContractAddress: localData.dniContractAddress || serverData.dniContractAddress || cachedConfig.dniContractAddress,
    proofServerUrl: localData.proofServerUrl || serverData.proofServerUrl || cachedConfig.proofServerUrl,
  };

  if (serverData.votingContractAddress && (!localData.votingContractAddress || localData.votingContractAddress !== cachedConfig.votingContractAddress)) {
    saveConfigToLocalStorage(cachedConfig);
  }
}

/**
 * Obtiene la configuración de red según las variables de entorno o caché.
 */
export function getNetworkConfig(): NetworkConfig {
  const current = getCachedConfig();
  const network = NETWORK_CONFIGS[current.network] ? current.network : 'preview';
  const config = NETWORK_CONFIGS[network];

  return {
    network,
    ...config,
    proofServerUrl: current.proofServerUrl || config.proofServerUrl,
    blockfrostProjectId: current.blockfrostProjectId || undefined,
  };
}

/**
 * Obtiene la dirección del contrato de votación desplegado.
 */
export function getVotingContractAddress(): string | null {
  return getCachedConfig().votingContractAddress || null;
}

/**
 * Obtiene la dirección del contrato de registro DNI desplegado.
 */
export function getDniContractAddress(): string | null {
  return getCachedConfig().dniContractAddress || null;
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
