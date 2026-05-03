FROM node:20-alpine

RUN npm install -g pnpm@9

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/kernel/package.json ./packages/kernel/
COPY packages/kernel-impl/package.json ./packages/kernel-impl/
COPY packages/personality/package.json ./packages/personality/
COPY packages/environment/package.json ./packages/environment/
COPY packages/engine/package.json ./packages/engine/
COPY packages/agent-runtime/package.json ./packages/agent-runtime/
COPY packages/inft/package.json ./packages/inft/

RUN pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY packages/kernel ./packages/kernel
COPY packages/kernel-impl ./packages/kernel-impl
COPY packages/personality ./packages/personality
COPY packages/environment ./packages/environment
COPY packages/engine ./packages/engine
COPY packages/agent-runtime ./packages/agent-runtime
COPY packages/inft ./packages/inft

EXPOSE 8765

CMD ["node", "--import", "tsx/esm", "packages/engine/src/index.ts"]
