import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { ContractState, ContractOperation } from '@midnight-ntwrk/compact-runtime';

export class Contract {
  witnesses = {};
  circuits = {
    registrarCandidato: (ctx: any) => ({ context: ctx, result: undefined }),
    iniciarVotacion: (ctx: any) => ({ context: ctx, result: undefined }),
    finalizarVotacion: (ctx: any) => ({ context: ctx, result: undefined }),
    emitirVoto: (ctx: any) => ({ context: ctx, result: undefined }),
  };
  provableCircuits = {
    registrarCandidato: (ctx: any) => ({ context: ctx, result: undefined }),
    iniciarVotacion: (ctx: any) => ({ context: ctx, result: undefined }),
    finalizarVotacion: (ctx: any) => ({ context: ctx, result: undefined }),
    emitirVoto: (ctx: any) => ({ context: ctx, result: undefined }),
  };
  initialState(ctx: any) {
    const cs = new ContractState();
    cs.setOperation('registrarCandidato', new ContractOperation());
    cs.setOperation('iniciarVotacion', new ContractOperation());
    cs.setOperation('finalizarVotacion', new ContractOperation());
    cs.setOperation('emitirVoto', new ContractOperation());
    return {
      currentContractState: cs,
      currentPrivateState: ctx?.initialPrivateState || {},
      currentZswapLocalState: {
        coinPublicKey: { bytes: new Uint8Array(32) },
        currentIndex: 0n,
        inputs: [],
        outputs: [],
      },
    };
  }
}

export const compiledContract = CompiledContract.make('votacion', Contract as any);
export const contractSpecification = {
  name: 'votacion',
  contract: new Contract(),
  compiledContract,
  verifierKeys: {
    registrarCandidato: new Uint8Array(32),
    iniciarVotacion: new Uint8Array(32),
    finalizarVotacion: new Uint8Array(32),
    emitirVoto: new Uint8Array(32),
  },
  zkir: {
    registrarCandidato: new Uint8Array(),
    iniciarVotacion: new Uint8Array(),
    finalizarVotacion: new Uint8Array(),
    emitirVoto: new Uint8Array(),
  },
};
