#!/usr/bin/env bash
# Restore an encrypted backup into a database. Run this on a trusted machine that holds the age PRIVATE key.
#
#   ./restore.sh <backup-file.dump.age> <age-identity-file> <target-database-url>
#
# The target must be an EMPTY database (create one first). Use a new database for a drill; for a real
# disaster, point your services at the restored database afterwards.
set -Eeuo pipefail
FILE="${1:?backup file (db-....dump.age)}"
IDENTITY="${2:?age identity (private key) file}"
TARGET="${3:?target database url}"

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
age -d -i "$IDENTITY" -o "$tmp/db.dump" "$FILE"
pg_restore --list "$tmp/db.dump" >/dev/null
started=$(date +%s)
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$TARGET" "$tmp/db.dump"
echo "restored in $(( $(date +%s) - started )) seconds"
psql "$TARGET" -At -c "SELECT 'migrations: ' || count(*) FROM schema_migrations"
