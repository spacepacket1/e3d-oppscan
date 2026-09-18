#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${NVM_DIR:-}" && -d "${HOME}/.nvm" ]]; then
  export NVM_DIR="${HOME}/.nvm"
fi

if [[ -n "${NVM_DIR:-}" && -s "${NVM_DIR}/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  . "${NVM_DIR}/nvm.sh"
  if [[ -n "${OPPSCAN_NODE_VERSION:-}" ]]; then
    nvm use "${OPPSCAN_NODE_VERSION}" >/dev/null
  elif nvm alias default >/dev/null 2>&1; then
    nvm use default >/dev/null
  fi
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ ! -f "${ROOT_DIR}/package.json" ]]; then
  echo "Expected e3d-oppscan/package.json" >&2
  exit 1
fi

cd "${ROOT_DIR}"

if [[ -f .env.production.local ]]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.production.local
  set +a
fi

export NODE_ENV="production"
npm run build

export OPPSCAN_PORT="${OPPSCAN_PORT:-${PORT:-3009}}"
export OPPSCAN_HOSTNAME="${OPPSCAN_HOSTNAME:-127.0.0.1}"

exec npm run start -- --hostname "${OPPSCAN_HOSTNAME}" --port "${OPPSCAN_PORT}"
