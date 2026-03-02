#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://ptbizsms.com}"

echo "Running smoke checks against: ${BASE_URL}"

check_route() {
  local route="$1"
  local expected="$2"
  local code
  code="$(curl -sS -o /dev/null -w "%{http_code}" "${BASE_URL}${route}")"
  if [[ "${code}" != "${expected}" ]]; then
    echo "FAIL ${route}: expected ${expected}, got ${code}"
    return 1
  fi
  echo "PASS ${route}: ${code}"
}

check_route "/" "200"
check_route "/v2/insights" "200"
check_route "/api/health" "200"
check_route "/api/auth/verify" "401"

echo "Smoke checks complete."
