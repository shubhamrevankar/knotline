#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${repository_root}"

for required_command in docker rg grep; do
  command -v "${required_command}" >/dev/null || {
    echo "Required container-policy command is unavailable: ${required_command}" >&2
    exit 1
  }
done

docker compose --file infra/docker-compose.yml config --quiet

for dockerfile in apps/api/Dockerfile apps/web/Dockerfile; do
  grep --quiet '^USER ' "${dockerfile}"
  grep --quiet '^HEALTHCHECK ' "${dockerfile}"
  if grep -Eiq '^FROM[[:space:]]+[^[:space:]]+:(latest|main|master)(@|[[:space:]]|$)' "${dockerfile}"; then
    echo "Unpinned base image in ${dockerfile}" >&2
    exit 1
  fi
done

if rg --line-number '^\s*image:\s*[^@[:space:]]+\s*$' infra/docker-compose.yml; then
  echo "Every Compose image must be digest pinned." >&2
  exit 1
fi

if [[ "${CONTAINER_RUNTIME_TEST:-0}" != "1" ]]; then
  echo "Container policy checks passed; set CONTAINER_RUNTIME_TEST=1 for build/runtime checks."
  exit 0
fi

run_id="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-0}-$$"
api_image="knotline-api:container-test-${run_id}"
web_image="knotline-web:container-test-${run_id}"
api_name="knotline-api-container-test-${run_id}"
web_name="knotline-web-container-test-${run_id}"

cleanup() {
  docker container rm --force "${api_name}" "${web_name}" >/dev/null 2>&1 || true
  docker image rm "${api_image}" "${web_image}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker build --file apps/api/Dockerfile --tag "${api_image}" .
docker build --file apps/web/Dockerfile --tag "${web_image}" .

for image_name in "${api_image}" "${web_image}"; do
  configured_user="$(docker image inspect --format '{{.Config.User}}' "${image_name}")"
  if [[ -z "${configured_user}" || "${configured_user}" == "0" || "${configured_user}" == "root" ]]; then
    echo "${image_name} does not configure a non-root runtime user" >&2
    exit 1
  fi
  docker image inspect --format '{{json .Config.Healthcheck.Test}}' "${image_name}" | grep --quiet --invert-match '^null$'
done

mkdir -p artifacts/containers
docker image inspect "${api_image}" "${web_image}" > artifacts/containers/images.json

docker run --detach --name "${api_name}" --publish 127.0.0.1::4100 "${api_image}" >/dev/null
docker run --detach --name "${web_name}" --publish 127.0.0.1::8080 "${web_image}" >/dev/null

for container_name in "${api_name}" "${web_name}"; do
  for _attempt in {1..30}; do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "${container_name}")"
    [[ "${status}" == "healthy" ]] && break
    [[ "${status}" == "unhealthy" ]] && docker logs "${container_name}" && exit 1
    sleep 1
  done
  [[ "$(docker inspect --format '{{.State.Health.Status}}' "${container_name}")" == "healthy" ]]
done

for container_and_root in "${api_name}:/app" "${web_name}:/usr/share/nginx/html"; do
  container_name="${container_and_root%%:*}"
  runtime_root="${container_and_root#*:}"
  if docker exec "${container_name}" sh -c \
    "find '${runtime_root}' -type f \( -name '*.test.js' -o -name '*.test.d.ts' -o -name '*.test.js.map' -o -name '*.test.map' \) -print" \
    | grep --quiet .; then
    echo "${container_name} contains compiled test artifacts" >&2
    exit 1
  fi
done

api_port="$(docker port "${api_name}" 4100/tcp | sed 's/.*://')"
web_port="$(docker port "${web_name}" 8080/tcp | sed 's/.*://')"
curl --fail --silent --show-error "http://127.0.0.1:${api_port}/health/live" >/dev/null
curl --fail --silent --show-error "http://127.0.0.1:${api_port}/health/ready" >/dev/null
curl --fail --silent --show-error "http://127.0.0.1:${web_port}/health" >/dev/null
curl --fail --silent --show-error "http://127.0.0.1:${web_port}/ready" >/dev/null

echo "Application container runtime checks passed."
