#!/usr/bin/env bash
# One command, same gates as CI: run this before you push (and whenever GitHub Actions is unavailable).
#   ./scripts/verify.sh            # api + web + liveness engine
#   ./scripts/verify.sh api        # just one
# Optional: TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/scratch  also runs the migration-chain test
#           (use an EMPTY scratch database; it applies every migration to it).
set -euo pipefail
cd "$(dirname "$0")/.."
want="${1:-all}"
run() { echo; echo "== $*"; }

if [ "$want" = all ] || [ "$want" = hygiene ]; then
  run "Hygiene: no em-dashes"
  ./scripts/check-no-emdash.sh
fi
if [ "$want" = all ] || [ "$want" = api ]; then
  run "API: typecheck, tests, build"
  (cd api && npm run typecheck && npm test && npm run build)
  [ -z "${TEST_DATABASE_URL:-}" ] && echo "   (migration-chain test skipped: set TEST_DATABASE_URL to a scratch database to run it)"
fi
if [ "$want" = all ] || [ "$want" = web ]; then
  run "Web: typecheck, production build"
  (cd web && npm run typecheck && npm run build)
fi
if [ "$want" = all ] || [ "$want" = engine ]; then
  run "Liveness engine: pytest"
  (cd liveness-service && python3 -m pytest -q)
fi
echo; echo "verify: all gates passed"
