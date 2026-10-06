# Node 22 satisfies Next.js, pdfjs-dist and pnpm's Node >=22.13 requirement.
FROM node:22-bookworm-slim AS base
WORKDIR /app

FROM base AS dependencies
RUN npm install --global pnpm@11.19.0
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 \
    POLKA_STANDALONE=true
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN groupadd --gid 1001 polka && useradd --uid 1001 --gid polka --no-create-home polka
COPY --from=builder --chown=1001:1001 /app/.next/standalone ./
COPY --from=builder --chown=1001:1001 /app/.next/static ./.next/static
COPY --from=builder --chown=1001:1001 /app/public ./public
USER 1001:1001
EXPOSE 3000
CMD ["node", "server.js"]
