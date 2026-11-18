#!/usr/bin/env bash
# Post-deploy smoke test: read-only checks against a live environment. Exits non-zero if anything is wrong.
#   API_URL=https://api.afriverify.sankofaapp.com WEB_URL=https://afriverify.sankofaapp.com ./scripts/smoke.sh
# Set SMOKE_SKIP_READY=1 to skip the /health/ready check (e.g. against an older build).
# Safe by design: only GETs, plus requests that are rejected before doing anything (fake tokens, unsigned webhooks).
set -u
API_URL="${API_URL:-https://api.afriverify.sankofaapp.com}"
WEB_URL="${WEB_URL:-https://afriverify.sankofaapp.com}"
FAKE="$(printf 'a%.0s' $(seq 1 64))"
pass=0; fail=0

check() {  # check "<name>" "<expected codes, space separated>" "<actual code>" [extra failure detail]
  local name="$1" want="$2" got="$3" detail="${4:-}"
  for w in $want; do
    if [ "$got" = "$w" ]; then printf '  ok    %-58s %s\n' "$name" "$got"; pass=$((pass+1)); return; fi
  done
  printf '  FAIL  %-58s got %s, want %s %s\n' "$name" "$got" "$want" "$detail"; fail=$((fail+1))
}
code()  { curl -s -o /dev/null -m 20 -w '%{http_code}' "$@" 2>/dev/null; }
body()  { curl -s -m 20 "$@" 2>/dev/null || true; }

echo "API  $API_URL"
check "GET /health (liveness probe)"                       200 "$(code "$API_URL/health")"
if [ "${SMOKE_SKIP_READY:-0}" != "1" ]; then
  r="$(body "$API_URL/health/ready")"; c="$(code "$API_URL/health/ready")"
  check "GET /health/ready (db + redis + migrations current)" 200 "$c" "$(echo "$r" | head -c 160)"
fi
# These two once returned 500 in production (missing column). A 404 proves the query runs; a 500 is the regression.
check "hosted branding, unknown session  -> 404 not 500"    404 "$(code "$API_URL/v1/hosted/branding/$FAKE")"
check "hosted status, unknown session    -> 404 not 500"    404 "$(code "$API_URL/v1/hosted/status/$FAKE")"
check "live-scan start, unknown session  -> 404"            404 "$(code -X POST -H 'content-type: application/json' -d "{\"session_token\":\"$FAKE\",\"consent\":true}" "$API_URL/v1/hosted/face/liveness/start")"
check "Resend webhook, unsigned -> rejected (401, or 503 if no secret set)" "401 503" "$(code -X POST -H 'content-type: application/json' -d '{}' "$API_URL/webhooks/resend")"
check "public certificate, unknown id    -> 404 not 500"    404 "$(code "$API_URL/v1/public/cert/AV-SMOKE-DOES-NOT-EXIST")"
check "protected route without API key   -> 401"            401 "$(code "$API_URL/v1/identity/check?phone=%2B2340000000000")"

echo "WEB  $WEB_URL"
for p in / /login /register /docs /privacy /terms /my-identity/login; do
  check "GET $p" 200 "$(code "$WEB_URL$p")"
done
page="$(body "$WEB_URL/")"
echo "$page" | grep -q "AfriVerify" && check "landing page renders brand" ok ok || check "landing page renders brand" ok missing
manifest="$(body "$WEB_URL/manifest.json")"
if echo "$manifest" | python3 -c 'import sys,json; d=json.load(sys.stdin); assert d["icons"]' 2>/dev/null; then
  check "manifest.json is valid JSON with icons" ok ok
  for src in $(echo "$manifest" | python3 -c 'import sys,json; [print(i["src"]) for i in json.load(sys.stdin)["icons"]]'); do
    check "manifest icon $src" 200 "$(code "$WEB_URL$src")"
  done
else
  check "manifest.json is valid JSON with icons" ok broken
fi
for p in /favicon.ico /icon.svg /apple-touch-icon.png /og-image.png; do check "asset $p" 200 "$(code "$WEB_URL$p")"; done
hdr="$(curl -sI -m 20 "$WEB_URL/" 2>/dev/null | tr 'A-Z' 'a-z')"
echo "$hdr" | grep -q "x-frame-options" && check "security header x-frame-options present" ok ok || check "security header x-frame-options present" ok missing

echo
echo "smoke: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
