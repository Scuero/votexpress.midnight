/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  experimental: {
    // Next.js 14 uses this key (not top-level serverExternalPackages)
    serverComponentsExternalPackages: [
      '@midnight-ntwrk/midnight-js-contracts',
      '@midnight-ntwrk/midnight-js-level-private-state-provider',
      '@midnight-ntwrk/midnight-js-indexer-public-data-provider',
      '@midnight-ntwrk/midnight-js-http-client-proof-provider',
      '@midnight-ntwrk/midnight-js-node-zk-config-provider',
      '@midnight-ntwrk/midnight-js-protocol',
      '@midnight-ntwrk/midnight-js-types',
      '@midnight-ntwrk/compact-runtime',
      '@midnight-ntwrk/compact-js',
      '@midnight-ntwrk/dapp-connector-api',
    ],
  },
  webpack: (config, { isServer }) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    // Externalizar TODOS los paquetes @midnight-ntwrk/* en el servidor.
    // Esto evita que Webpack intente parsear sus exports ESM rotos
    // ("Default condition should be last one") y las exportaciones faltantes
    // de compact-runtime. En su lugar, Node.js los resuelve en tiempo de ejecución.
    if (isServer) {
      const existingExternals = config.externals || [];
      config.externals = [
        ...( Array.isArray(existingExternals) ? existingExternals : [existingExternals] ),
        /^@midnight-ntwrk\/.*/,
      ];

      // Forzar que Node.js use la condición "import" (ESM) en vez de "default" (CJS)
      // porque @midnight-ntwrk/compact-js solo incluye dist/esm, no dist/cjs,
      // a pesar de declarar "default": "./dist/cjs/index.js" en sus exports.
      config.resolve = {
        ...config.resolve,
        conditionNames: ['import', 'module', 'require', 'default'],
      };
    }

    return config;
  },
};

export default nextConfig;

