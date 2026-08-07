import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Script CLI de despliegue y compilación de contratos para VotExpress Midnight
 *
 * Ejecuta la compilación de contratos compact en bindings TypeScript
 * y despliega los contratos en la red si se provee una clave privada de fondeo.
 */

const envPath = path.resolve(process.cwd(), 'app/.env.local');

async function main() {
  console.log('====================================================');
  console.log('🚀 Iniciando Compilación y Despliegue de VotExpress ZK');
  console.log('====================================================\n');

  // 1. Compilación de contratos
  console.log('📦 1. Compilando contratos Compact a bindings TypeScript...');
  try {
    console.log('   Compilando contract/votacion.compact...');
    execSync('compact compile contract/votacion.compact app/src/managed/votacion', { stdio: 'inherit' });
    
    console.log('   Compilando contract/registro_dni.compact...');
    execSync('compact compile contract/registro_dni.compact app/src/managed/registro_dni', { stdio: 'inherit' });
    
    console.log('✅ Contratos compilados con éxito en app/src/managed/.\n');
  } catch (error) {
    console.error('❌ Error al ejecutar el compilador compact. Asegurate de tener compactc instalado en tu path.', error);
    process.exit(1);
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
    
    // Configuración de red (Preprod por defecto)
    const nodeUrl = process.env.MIDNIGHT_NODE_URL || 'https://rpc.midnight-preprod.blockfrost.io';
    const indexerUrl = process.env.MIDNIGHT_INDEXER_URL || 'https://midnight-preprod.blockfrost.io/api/v0';
    const proofServerUrl = process.env.MIDNIGHT_PROOF_SERVER_URL || 'http://localhost:6300';

    const providers = {
      privateStateProvider: levelPrivateStateProvider({ dbPath: './deploy-private-state' }),
      publicDataProvider: indexerPublicDataProvider(indexerUrl, indexerUrl + '/ws'),
      proofProvider: httpClientProofProvider(proofServerUrl),
    };

    // Cargar contratos especificados
    const votacionSpec = require('../app/src/managed/votacion/contract').contractSpecification;
    const registroDniSpec = require('../app/src/managed/registro_dni/contract').contractSpecification;

    console.log('⚡ Desplegando Contrato de Registro DNI...');
    const dniDeployed = await deployContract(providers, {
      compiledContract: registroDniSpec,
      privateStateId: 'dni-private-state',
      initialPrivateState: {}
    });
    const dniAddr = dniDeployed.contractAddress;
    console.log(`✅ Contrato Registro DNI en: ${dniAddr}`);

    console.log('⚡ Desplegando Contrato de Votación...');
    const votingDeployed = await deployContract(providers, {
      compiledContract: votacionSpec,
      privateStateId: 'voting-private-state',
      initialPrivateState: {}
    });
    const votingAddr = votingDeployed.contractAddress;
    console.log(`✅ Contrato de Votación en: ${votingAddr}`);

    // 3. Escribir/Actualizar archivo .env.local
    console.log('\n📝 3. Actualizando variables en app/.env.local...');
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
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

    fs.writeFileSync(envPath, updatedEnv.trim() + '\n', 'utf8');
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
