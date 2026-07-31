#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
report_directory="${SCAN_REPORT_DIR:-${repository_root}/artifacts/scans}"
mkdir -p "${report_directory}"

if [[ "${1:-}" == "--self-test" ]]; then
  grep --quiet -- '--prod --audit-level high' "${BASH_SOURCE[0]}"
  echo "Dependency scanner self-test passed."
  exit 0
fi

cd "${repository_root}"
pnpm audit --prod --audit-level high --json >"${report_directory}/dependencies.json"
echo "Dependency scan passed with no high or critical production advisory."
