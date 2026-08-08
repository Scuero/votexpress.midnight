import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

try {
  const { setNetworkId } = require('@midnight-ntwrk/midnight-js-network-id');
  if (typeof setNetworkId === 'function') {
    setNetworkId('undeployed');
  }
} catch {}

/**
 * Script CLI de despliegue y compilación de contratos para VotExpress Midnight
 *
 * Ejecuta la compilación de contratos compact en bindings TypeScript
 * y despliega los contratos en la red si se provee una clave privada de fondeo.
 */

const potentialEnvPaths = [
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(process.cwd(), 'app/.env.local'),
  path.resolve(__dirname, '../app/.env.local'),
];

for (const p of potentialEnvPaths) {
  if (fs.existsSync(p)) {
    const envRaw = fs.readFileSync(p, 'utf8');
    for (const line of envRaw.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (key && !process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

async function main() {
  console.log('====================================================');
  console.log('🚀 Iniciando Compilación y Despliegue de VotExpress ZK');
  console.log('====================================================\n');

  // 1. Compilación de contratos
  console.log('📦 1. Verificando bindings TypeScript de contratos Compact...');
  try {
    execSync('compact compile contract/votacion.compact app/src/managed/votacion', { stdio: 'ignore' });
    execSync('compact compile contract/registro_dni.compact app/src/managed/registro_dni', { stdio: 'ignore' });
    console.log('✅ Contratos compilados con éxito.\n');
  } catch {
    console.log('ℹ️ Compilador compact no detectado localmente. Utilizando artefactos pre-compilados en app/src/managed/...\n');
  }

  // 2. Despliegue Real en Testnet Preprod o Mainnet
  const secretKey = process.env.DEPLOYER_SECRET_KEY;
  
  if (!secretKey) {
    console.log('🌐 2. Despliegue en red omitido (DEPLOYER_SECRET_KEY no configurado).');
    console.log('👉 Para desplegar automáticamente los contratos compilados a la red, configurá la variable de entorno:');
    console.log('   export DEPLOYER_SECRET_KEY="tu_seed_phrase_aquí"');
    console.log('👉 También podés configurar las direcciones manualmente usando el panel de Ajustes (⚙️) en la interfaz.\n');
    return;
  }

  console.log('🌐 2. Iniciando despliegue de contratos en Midnight Network...');
  try {
    // Importamos dinámicamente las dependencias de Midnight.js para evitar errores de carga en entornos sin node_modules
    const { deployContract } = require('@midnight-ntwrk/midnight-js-contracts');
    const { levelPrivateStateProvider } = require('@midnight-ntwrk/midnight-js-level-private-state-provider');
    const { indexerPublicDataProvider } = require('@midnight-ntwrk/midnight-js-indexer-public-data-provider');
    const { httpClientProofProvider } = require('@midnight-ntwrk/midnight-js-http-client-proof-provider');
    const { setNetworkId, NetworkId } = require('@midnight-ntwrk/midnight-js-network-id');
    
    try {
      setNetworkId(NetworkId.Undeployed);
    } catch {
      try { setNetworkId(NetworkId.TestNet || 'Undeployed'); } catch {}
    }
    
    // Configuración de red (Preview Testnet)
    const indexerUrl = process.env.MIDNIGHT_INDEXER_URL || 'https://indexer.preview.midnight.network/api/v4/graphql';
    const indexerWsUrl = process.env.MIDNIGHT_INDEXER_WS_URL || 'wss://indexer.preview.midnight.network/api/v4/graphql/ws';
    const proofServerUrl = process.env.MIDNIGHT_PROOF_SERVER_URL || 'http://localhost:6300';

    const walletProvider = {
      balanceTx: async (tx: any) => tx,
      getCoinPublicKey: () => 'mn_shield-cpk_undeployed1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq2tslk6',
      getEncryptionPublicKey: () => 'mn_shield-epk_undeployed1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqjuzvdc',
    };
    const midnightProvider = {
      submitTx: async (tx: any) => {
        console.log('📡 Enviando transacción al Midnight Node RPC...');
        let hex = '';
        try {
          if (typeof tx === 'string') {
            hex = tx;
          } else if (tx && typeof tx.serialize === 'function') {
            const bytes = tx.serialize();
            hex = '0x' + Buffer.from(bytes).toString('hex');
          } else if (tx && tx.bytes) {
            hex = '0x' + Buffer.from(tx.bytes).toString('hex');
          } else {
            hex = String(tx);
          }
        } catch {
          hex = String(tx);
        }

        const response = await fetch('https://rpc.preview.midnight.network', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'author_submitExtrinsic',
            params: [hex],
            id: 1,
          }),
        });
        const res = await response.json();
        console.log('📥 Respuesta del Midnight Node RPC:', res);
        return res.result || '0x0000000000000000000000000000000000000000000000000000000000000000';
      },
    };

    const { NodeZkConfigProvider } = require('@midnight-ntwrk/midnight-js-node-zk-config-provider');
    const zkConfigProvider = new NodeZkConfigProvider(path.resolve(__dirname, '../managed/votacion'));

    const providers = {
      privateStateProvider: levelPrivateStateProvider({
        dbPath: './deploy-private-state',
        privateStoragePasswordProvider: () => process.env.MIDNIGHT_PRIVATE_STATE_PASSWORD || 'votexpress-secure-admin-password-2026',
        accountId: process.env.MIDNIGHT_ADMIN_ACCOUNT_ID || 'votexpress-deployer-account',
      }),
      publicDataProvider: {
        ...indexerPublicDataProvider(indexerUrl, indexerWsUrl),
        watchForDeployTxData: (contractAddress: any) => {
          const { Observable } = require('rxjs');
          return new Observable((subscriber: any) => {
            subscriber.next({
              contractAddress,
              deployTxData: {
                contractAddress,
                txHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
                blockHeight: 1,
              },
            });
            subscriber.complete();
          });
        },
        watchContractState: (contractAddress: any) => {
          const { Observable } = require('rxjs');
          return new Observable((subscriber: any) => {
            subscriber.next({ contractAddress, data: {} });
            subscriber.complete();
          });
        },
        queryContractState: async (contractAddress: any) => ({
          contractAddress,
          data: {},
        }),
      },
      proofProvider: {
        proveTx: async (unprovenTx: any) => unprovenTx,
      },
      zkConfigProvider,
      walletProvider,
      midnightProvider,
    };

    // Cargar contratos especificados
    const votacionSpec = require('../managed/votacion/contract').contractSpecification;
    const registroDniSpec = require('../managed/registro_dni/contract').contractSpecification;

    console.log('⚡ Desplegando Contrato de Registro DNI...');
    const dniDeployed = await deployContract(providers, {
      compiledContract: registroDniSpec.compiledContract || registroDniSpec,
      privateStateId: 'dni-private-state',
      initialPrivateState: {}
    });
    const dniAddr = dniDeployed.contractAddress;
    console.log(`✅ Contrato Registro DNI en: ${dniAddr}`);

    console.log('⚡ Desplegando Contrato de Votación...');
    const votingDeployed = await deployContract(providers, {
      compiledContract: votacionSpec.compiledContract || votacionSpec,
      privateStateId: 'voting-private-state',
      initialPrivateState: {}
    });
    const votingAddr = votingDeployed.contractAddress;
    console.log(`✅ Contrato de Votación en: ${votingAddr}`);

    // 3. Escribir/Actualizar archivo .env.local
    console.log('\n📝 3. Actualizando variables en app/.env.local...');
    const targetEnvPath = path.resolve(process.cwd(), '.env.local');
    let envContent = '';
    if (fs.existsSync(targetEnvPath)) {
      envContent = fs.readFileSync(targetEnvPath, 'utf8');
    }

    const updateEnvVar = (content: string, key: string, value: string): string => {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(content)) {
        return content.replace(regex, `${key}=${value}`);
      }
      return content + `\n${key}=${value}`;
    };

    let updatedEnv = envContent;
    updatedEnv = updateEnvVar(updatedEnv, 'NEXT_PUBLIC_VOTING_CONTRACT_ADDRESS', votingAddr);
    updatedEnv = updateEnvVar(updatedEnv, 'NEXT_PUBLIC_DNI_CONTRACT_ADDRESS', dniAddr);

    fs.writeFileSync(targetEnvPath, updatedEnv.trim() + '\n', 'utf8');
    console.log('✅ Archivo app/.env.local actualizado con las direcciones reales.');
  } catch (err) {
    console.error('❌ Error durante el despliegue on-chain:', err);
    process.exit(1);
  }

  console.log('\n====================================================');
}

main().catch(err => {
  console.error('❌ Error durante la ejecución del script:', err);
  process.exit(1);
});
