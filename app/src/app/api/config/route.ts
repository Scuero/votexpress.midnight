import { NextResponse } from 'next/server';

/**
 * API Route para servir la configuración de red y contratos en tiempo de ejecución.
 *
 * En Cloud Run, las variables NEXT_PUBLIC_ se compilan en el frontend durante el build,
 * lo que requiere reconstruir la imagen para cambiar de contratos.
 * Servir la configuración a través de esta API permite cambiar variables de entorno en
 * Cloud Run en tiempo de ejecución sin necesidad de recompilar la imagen.
 */
export async function GET() {
  return NextResponse.json({
    network: process.env.NEXT_PUBLIC_MIDNIGHT_NETWORK || process.env.MIDNIGHT_NETWORK || 'testnet',
    blockfrostProjectId: process.env.NEXT_PUBLIC_BLOCKFROST_PROJECT_ID || process.env.BLOCKFROST_PROJECT_ID || '',
    votingContractAddress: process.env.NEXT_PUBLIC_VOTING_CONTRACT_ADDRESS || process.env.VOTING_CONTRACT_ADDRESS || '',
    dniContractAddress: process.env.NEXT_PUBLIC_DNI_CONTRACT_ADDRESS || process.env.DNI_CONTRACT_ADDRESS || '',
    proofServerUrl: process.env.NEXT_PUBLIC_PROOF_SERVER_URL || process.env.PROOF_SERVER_URL || 'http://localhost:6300',
  });
}
