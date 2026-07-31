#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
node "${repository_root}/tooling/scans/secrets.mjs" --self-test
node "${repository_root}/tooling/scans/licenses.mjs" --self-test
"${repository_root}/tooling/scans/dependencies.sh" --self-test
echo "Scanner policy self-tests passed."
