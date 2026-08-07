import { NextRequest, NextResponse } from 'next/server';
import { getMidnightServerService } from '@/lib/midnightServer';

export async function POST(
  request: NextRequest,
  { params }: { params: { action: string } }
) {
  const action = params.action;
  const service = getMidnightServerService();

  try {
    const body = await request.json().catch(() => ({}));
    
    if (action === 'registrarCandidato') {
      const res = await service.registrarCandidato(body.nombre);
      return NextResponse.json(res);
    }
    
    if (action === 'iniciarVotacion') {
      const res = await service.iniciarVotacion(body.duracionSegundos);
      return NextResponse.json(res);
    }
    
    if (action === 'finalizarVotacion') {
      const res = await service.finalizarVotacion();
      return NextResponse.json(res);
    }
    
    if (action === 'emitirVoto') {
      const res = await service.emitirVoto(body.candidato, body.nullifierHex);
      return NextResponse.json(res);
    }
    
    if (action === 'registrarDni') {
      const res = await service.registrarDni(body.hashUnico);
      return NextResponse.json(res);
    }
    
    return NextResponse.json({ error: `Acción no soportada: ${action}` }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { action: string } }
) {
  const action = params.action;
  const service = getMidnightServerService();

  try {
    if (action === 'getLedgerState') {
      const res = await service.getLedgerState();
      return NextResponse.json(res);
    }
    
    if (action === 'getHourlySnapshots') {
      const res = service.getHourlySnapshots();
      return NextResponse.json(res);
    }
    
    if (action === 'checkProofServerHealth') {
      const res = await service.checkProofServerHealth();
      return NextResponse.json(res);
    }
    
    return NextResponse.json({ error: `Acción no soportada: ${action}` }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
  }
}
