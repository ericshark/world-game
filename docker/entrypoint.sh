#!/bin/sh
# Starts the server. With LITESTREAM_REPLICA_URL set, first restores the database from the
# backup if this machine has none (a new server, or a lost disk), then runs the server under
# Litestream so every change is replicated as it is made.
set -eu

if [ -z "${LITESTREAM_REPLICA_URL:-}" ]; then
  echo '{"level":"warn","event":"no-backup","message":"LITESTREAM_REPLICA_URL is not set; the database is not being backed up"}'
  exec node dist-server/index.js
fi

litestream restore -if-db-not-exists -if-replica-exists -config /etc/litestream.yml "$DATABASE_PATH"
exec litestream replicate -config /etc/litestream.yml -exec "node dist-server/index.js"
