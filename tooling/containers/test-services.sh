#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
compose_file="${repository_root}/infra/docker-compose.yml"
project_name="knotline-integration-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-0}-$$"

cleanup() {
  docker compose --project-name "${project_name}" --file "${compose_file}" down --volumes --remove-orphans
}
diagnose() {
  docker compose --project-name "${project_name}" --file "${compose_file}" ps --all || true
  docker compose --project-name "${project_name}" --file "${compose_file}" logs \
    --no-color --tail 200 postgres temporal mailpit minio || true
}
trap diagnose ERR
trap cleanup EXIT

docker compose --project-name "${project_name}" --file "${compose_file}" config --quiet
docker compose --project-name "${project_name}" --file "${compose_file}" up --detach --wait \
  postgres redis minio mailpit temporal temporal-ui

curl --fail --silent --show-error http://127.0.0.1:9000/minio/health/ready >/dev/null
curl --fail --silent --show-error http://127.0.0.1:8025/livez >/dev/null
curl --fail --silent --show-error http://127.0.0.1:8233 >/dev/null

node --input-type=module -e '
  import net from "node:net";
  const ports = [5432, 6379, 7233];
  await Promise.all(ports.map((port) => new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(3000);
    socket.once("connect", () => { socket.destroy(); resolve(); });
    socket.once("timeout", () => { socket.destroy(); reject(new Error(`timeout:${port}`)); });
    socket.once("error", reject);
  })));
'

docker compose --project-name "${project_name}" --file "${compose_file}" exec --no-TTY postgres \
  psql --username knotline_local --dbname knotline --tuples-only --command \
  "SELECT extname FROM pg_extension WHERE extname = 'vector'" | grep --quiet vector
docker compose --project-name "${project_name}" --file "${compose_file}" exec --no-TTY redis \
  redis-cli ping | grep --quiet PONG

mkdir -p "${repository_root}/artifacts/integration"
docker compose --project-name "${project_name}" --file "${compose_file}" ps \
  --format json > "${repository_root}/artifacts/integration/services.json"

echo "Local dependency integration checks passed."
