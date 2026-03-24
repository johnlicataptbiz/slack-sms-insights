#!/usr/bin/env bash
# Production smoke-check script for PTBizSMS
# Usage: ./scripts/ops/production-smoke-check.sh [BASE_URL]
# Default BASE_URL: https://ptbizsms.com

set -euo pipefail

BASE_URL="${1:-https://ptbizsms.com}"
PASS=0
FAIL=0

check() {
  local desc="$1"
  local url="$2"
  local expected_status="$3"
  local actual_status
  actual_status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url")
  if [ "$actual_status" = "$expected_status" ]; then
    echo "  ✅  $desc ($url) → $actual_status"
    PASS=$((PASS + 1))
  else
    echo "  ❌  $desc ($url) → expected $expected_status, got $actual_status"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "PTBizSMS Production Smoke Check"
echo "================================"
echo "Target: $BASE_URL"
echo ""

check "Root page"          "$BASE_URL/"                    "200"
check "V2 Insights page"   "$BASE_URL/v2/insights"         "200"
check "Health endpoint"    "$BASE_URL/api/health"          "200"
check "Auth verify (unauthed should be 401)" "$BASE_URL/api/auth/verify" "401"

echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  echo "❌ Smoke check FAILED"
  exit 1
else
  echo "✅ Smoke check PASSED"
  exit 0
fi
