# Dockerfile para Cloud Run - VotExpress Midnight Web App
# Stage 1: Build (usamos Debian slim para compatibilidad con el compilador compactc binario)
FROM node:20-slim AS builder

WORKDIR /workspace

# Instalar dependencias necesarias para descargar e instalar el compilador
RUN apt-get update && apt-get install -y \
    curl \
    bash \
    ca-certificates \
    xz-utils \
    unzip \
    tar \
    gzip \
    && rm -rf /var/lib/apt/lists/*

# Descargar e instalar el compilador Compact oficial
RUN curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh

# Configurar el PATH para incluir las herramientas de Compact
ENV PATH="/root/.local/bin:${PATH}"

# Descargar la versión del compilador compatible
RUN compact update 0.23.0

# Copiar configuraciones generales
COPY app/package*.json ./app/
COPY app/tsconfig.json ./app/
COPY app/next.config.mjs ./app/
COPY contract/ ./contract/

# Instalar dependencias npm de Next.js
WORKDIR /workspace/app
RUN npm install

# Crear directorio public para evitar errores de copia
RUN mkdir -p public

# Copiar código fuente
COPY app/src ./src
COPY app/public ./public

# Compilar los contratos Compact reales ZK (generará los bindings de typescript en src/managed)
RUN compact compile ../contract/votacion.compact src/managed/votacion && \
    compact compile ../contract/registro_dni.compact src/managed/registro_dni

# Compilar la aplicación Next.js standalone
RUN npm run build

# Stage 2: Runner de producción minimalista (Alpine liviano para el servidor web Node)
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
# Cloud Run inyecta PORT automáticamente, por defecto 8080
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

# Copiar assets generados en el build
COPY --from=builder /workspace/app/public ./public
COPY --from=builder /workspace/app/.next/standalone ./
COPY --from=builder /workspace/app/.next/static ./.next/static
COPY --from=builder /workspace/app/node_modules ./node_modules
COPY --from=builder /workspace/app/package.json ./package.json

EXPOSE 8080

CMD ["node", "server.js"]
