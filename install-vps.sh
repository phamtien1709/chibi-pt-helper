#!/usr/bin/env bash
set -euo pipefail
chibi_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec node "$chibi_dir/deploy/install-service.mjs" "$@"
