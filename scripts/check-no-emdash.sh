#!/usr/bin/env bash
# Fails if any tracked text file contains an em-dash (U+2014). House style: no em-dashes anywhere.
# Use a comma, colon, full stop, or a plain hyphen instead. En-dashes in real ranges (0 - 15 min) are fine.
set -euo pipefail
cd "$(dirname "$0")/.."
hits="$(git ls-files -z | xargs -0 grep -nI $'\xe2\x80\x94' -- 2>/dev/null | grep -v 'package-lock.json' || true)"
if [ -n "$hits" ]; then
  echo "em-dash found (replace with , : . or -):"; echo "$hits" | cut -c1-160; exit 1
fi
echo "no em-dashes"
