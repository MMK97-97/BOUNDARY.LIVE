# Runtime includes the encoder; no laptop-side Node/FFmpeg installation is needed.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg fonts-dejavu-core ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node relay ./relay
COPY --chown=node:node web ./web
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 TLS_CA_FILE=/etc/ssl/certs/ca-certificates.crt
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node --input-type=module -e "const r=await fetch('http://127.0.0.1:'+process.env.PORT+'/health',{signal:AbortSignal.timeout(4000)});if(!r.ok)process.exit(1)"
CMD ["node", "relay/server.mjs"]
