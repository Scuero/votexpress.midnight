import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { ContractState, ContractOperation } from '@midnight-ntwrk/compact-runtime';

export class Contract {
  witnesses = {};
  circuits = {
    registrarDNI: (ctx: any) => ({ context: ctx, result: undefined }),
  };
  provableCircuits = {
    registrarDNI: (ctx: any) => ({ context: ctx, result: undefined }),
  };
  initialState(ctx: any) {
    const cs = new ContractState();
    cs.setOperation('registrarDNI', new ContractOperation());
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

export const compiledContract = CompiledContract.make('registro_dni', Contract as any);
export const contractSpecification = {
  name: 'registro_dni',
  contract: new Contract(),
  compiledContract,
  verifierKeys: {
    registrarDNI: new Uint8Array(32),
  },
  zkir: {
    registrarDNI: new Uint8Array(),
  },
};
