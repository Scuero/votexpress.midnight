import { NextResponse } from 'next/server';

interface SimulatedLedgerStore {
  estado: 'CERRADA' | 'ABIERTA' | 'FINALIZADA';
  candidatos: [string, number][]; // Map serialized as array of pairs
  nullifiers: string[];
  dniRegistrados: string[];
  horaInicio: number | null;
  duracionSegundos: number;
  totalVotos: number;
  hourlySnapshots: any[];
}

const globalStore = globalThis as unknown as { __simulated_ledger?: SimulatedLedgerStore };

if (!globalStore.__simulated_ledger) {
  globalStore.__simulated_ledger = {
    estado: 'CERRADA',
    candidatos: [],
    nullifiers: [],
    dniRegistrados: [],
    horaInicio: null,
    duracionSegundos: 86400,
    totalVotos: 0,
    hourlySnapshots: [],
  };
}

export async function GET() {
  return NextResponse.json(globalStore.__simulated_ledger);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    globalStore.__simulated_ledger = {
      estado: body.estado ?? globalStore.__simulated_ledger!.estado,
      candidatos: body.candidatos ?? globalStore.__simulated_ledger!.candidatos,
      nullifiers: body.nullifiers ?? globalStore.__simulated_ledger!.nullifiers,
      dniRegistrados: body.dniRegistrados ?? globalStore.__simulated_ledger!.dniRegistrados,
      horaInicio: body.horaInicio !== undefined ? body.horaInicio : globalStore.__simulated_ledger!.horaInicio,
      duracionSegundos: body.duracionSegundos ?? globalStore.__simulated_ledger!.duracionSegundos,
      totalVotos: body.totalVotos ?? globalStore.__simulated_ledger!.totalVotos,
      hourlySnapshots: body.hourlySnapshots ?? globalStore.__simulated_ledger!.hourlySnapshots,
    };
    return NextResponse.json({ success: true, ledger: globalStore.__simulated_ledger });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
