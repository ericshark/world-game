# World Game: one Node process serving the site, the API and the WebSocket, with SQLite on a
# volume and (optionally) Litestream replicating it. Build: docker build -t world-game .

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
# Leave only what the server needs at run time.
RUN npm prune --omit=dev

FROM node:24-slim AS run
ENV NODE_ENV=production \
    PORT=8788 \
    DATABASE_PATH=/data/world-game.sqlite
WORKDIR /app
COPY --from=litestream/litestream:0.5 /usr/local/bin/litestream /usr/local/bin/litestream
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
# The server reads the country data from public/data (the same files the site serves).
COPY --from=build /app/public/data ./public/data
COPY docker/litestream.yml /etc/litestream.yml
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh && mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8788
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["entrypoint.sh"]
