import { NextResponse } from 'next/server';

interface ConfigStore {
  network: string;
  blockfrostProjectId: string;
  votingContractAddress: string;
  dniContractAddress: string;
  proofServerUrl: string;
}

// Persistencia en memoria global del proceso Node para compartir entre dispositivos
const globalStore = globalThis as unknown as { __votexpress_config?: ConfigStore };

if (!globalStore.__votexpress_config) {
  globalStore.__votexpress_config = {
    network: process.env.MIDNIGHT_NETWORK || process.env.NEXT_PUBLIC_MIDNIGHT_NETWORK || 'testnet',
    blockfrostProjectId: process.env.BLOCKFROST_PROJECT_ID || process.env.NEXT_PUBLIC_BLOCKFROST_PROJECT_ID || '',
    votingContractAddress: process.env.VOTING_CONTRACT_ADDRESS || process.env.NEXT_PUBLIC_VOTING_CONTRACT_ADDRESS || '8ac29e39f6ac3de1dd63db8b9d9c5eed8efd407e900901987b32418e9f51457e',
    dniContractAddress: process.env.DNI_CONTRACT_ADDRESS || process.env.NEXT_PUBLIC_DNI_CONTRACT_ADDRESS || '0a397d25eb5779f68fb3685756006d332077185d956bd652d248b00519c8ba10',
    proofServerUrl: process.env.PROOF_SERVER_URL || process.env.NEXT_PUBLIC_PROOF_SERVER_URL || 'http://localhost:6300',
  };
}

export async function GET() {
  return NextResponse.json(globalStore.__votexpress_config);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    globalStore.__votexpress_config = {
      network: body.network || globalStore.__votexpress_config!.network,
      blockfrostProjectId: body.blockfrostProjectId || globalStore.__votexpress_config!.blockfrostProjectId,
      votingContractAddress: body.votingContractAddress || globalStore.__votexpress_config!.votingContractAddress,
      dniContractAddress: body.dniContractAddress || globalStore.__votexpress_config!.dniContractAddress,
      proofServerUrl: body.proofServerUrl || globalStore.__votexpress_config!.proofServerUrl,
    };
    console.log('🔄 Configuración de contratos actualizada en el servidor:', globalStore.__votexpress_config);
    return NextResponse.json({ success: true, config: globalStore.__votexpress_config });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
