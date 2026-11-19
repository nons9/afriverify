#!/usr/bin/env bash
# Encrypted, verified Postgres backup. Runs as a scheduled job (see README.md).
#
#   1. pg_dump (custom format)
#   2. prove the dump is readable: pg_restore --list, and (weekly, or always) a real restore into a scratch database
#   3. encrypt with age to a PUBLIC key (the private key is never on this server, so a server breach cannot read old backups)
#   4. upload dump + manifest, then check the upload by size
#   5. delete backups older than BACKUP_RETENTION_DAYS
#
# Required env: DATABASE_URL, BACKUP_AGE_RECIPIENT (age1...), BACKUP_DEST (s3://bucket/prefix or a local directory)
# Optional env: BACKUP_RETENTION_DAYS (35), BACKUP_RESTORE_TEST (weekly|always|never; default weekly = Sundays UTC),
#               BACKUP_PING_URL (GET on success, GET <url>/fail on failure), ALERT_WEBHOOK_URL (Slack-style, on failure),
#               AWS_ENDPOINT_URL / AWS_* (when BACKUP_DEST is s3://)
set -Eeuo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT (an age public key) is required}"
: "${BACKUP_DEST:?BACKUP_DEST is required}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-35}"
RESTORE_TEST="${BACKUP_RESTORE_TEST:-weekly}"

WORK="$(mktemp -d)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SCRATCH_DB=""
ADMIN_URL=""

log() { printf '%s backup: %s\n' "$(date -u +%FT%TZ)" "$*"; }

with_db() { # replace the database name in a postgres URL
  local url="$1" db="$2" base query=""
  [[ "$url" == *\?* ]] && query="?${url#*\?}" && url="${url%%\?*}"
  base="${url%/*}"
  printf '%s/%s%s' "$base" "$db" "$query"
}

cleanup() {
  local code=$?
  if [[ -n "$SCRATCH_DB" && -n "$ADMIN_URL" ]]; then psql "$ADMIN_URL" -q -c "DROP DATABASE IF EXISTS \"$SCRATCH_DB\" WITH (FORCE)" >/dev/null 2>&1 || true; fi
  rm -rf "$WORK"
  if [[ $code -ne 0 ]]; then
    log "FAILED (exit $code)"
    [[ -n "${BACKUP_PING_URL:-}" ]] && curl -fsS -m 10 "${BACKUP_PING_URL%/}/fail" >/dev/null 2>&1 || true
    [[ -n "${ALERT_WEBHOOK_URL:-}" ]] && curl -fsS -m 10 -X POST -H 'Content-Type: application/json' \
      -d "{\"text\":\"AfriVerify BACKUP FAILED at ${STAMP}. Check the backup job logs.\"}" "$ALERT_WEBHOOK_URL" >/dev/null 2>&1 || true
  fi
  exit $code
}
trap cleanup EXIT

log "dumping"
pg_dump --format=custom --compress=9 --no-owner --no-privileges --file="$WORK/db.dump" "$DATABASE_URL"
pg_restore --list "$WORK/db.dump" >"$WORK/toc.txt"
TABLES="$(grep -c ' TABLE public ' "$WORK/toc.txt" || true)"
[[ "$TABLES" -gt 0 ]] || { log "dump contains no tables"; exit 1; }

DO_RESTORE=0
case "$RESTORE_TEST" in
  always) DO_RESTORE=1 ;;
  weekly) [[ "$(date -u +%u)" == "7" ]] && DO_RESTORE=1 ;;
  never) ;;
  *) log "BACKUP_RESTORE_TEST must be weekly, always or never"; exit 2 ;;
esac

RESTORED="no"
if [[ $DO_RESTORE -eq 1 ]]; then
  # Real restore into a throwaway database on the same server, then compare with the source.
  SCRATCH_DB="restore_test_${STAMP,,}"
  ADMIN_URL="$(with_db "$DATABASE_URL" postgres)"
  SCRATCH_URL="$(with_db "$DATABASE_URL" "$SCRATCH_DB")"
  log "restore test into $SCRATCH_DB"
  psql "$ADMIN_URL" -q -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$SCRATCH_DB\""
  pg_restore --no-owner --no-privileges --exit-on-error --dbname="$SCRATCH_URL" "$WORK/db.dump"
  q() { psql "$1" -At -v ON_ERROR_STOP=1 -c "$2"; }
  src_mig="$(q "$DATABASE_URL" 'SELECT count(*) FROM schema_migrations')"
  dst_mig="$(q "$SCRATCH_URL" 'SELECT count(*) FROM schema_migrations')"
  src_tab="$(q "$DATABASE_URL" "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")"
  dst_tab="$(q "$SCRATCH_URL" "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")"
  log "migrations source=$src_mig restored=$dst_mig, tables source=$src_tab restored=$dst_tab"
  [[ "$src_mig" == "$dst_mig" && "$src_tab" == "$dst_tab" && "$dst_mig" -gt 0 ]] || { log "RESTORE TEST MISMATCH"; exit 1; }
  RESTORED="yes"
  psql "$ADMIN_URL" -q -c "DROP DATABASE \"$SCRATCH_DB\" WITH (FORCE)" >/dev/null
  SCRATCH_DB=""
fi

log "encrypting"
age -r "$BACKUP_AGE_RECIPIENT" -o "$WORK/db.dump.age" "$WORK/db.dump"
SIZE="$(stat -c %s "$WORK/db.dump.age")"
SHA="$(sha256sum "$WORK/db.dump.age" | cut -d' ' -f1)"
KEY="db-${STAMP}.dump.age"
cat >"$WORK/manifest.json" <<EOF
{"file":"$KEY","created_utc":"$STAMP","bytes":$SIZE,"sha256":"$SHA","tables":$TABLES,"restore_tested":"$RESTORED","pg_dump":"$(pg_dump --version | tr -d '"')"}
EOF

log "uploading $KEY ($SIZE bytes)"
if [[ "$BACKUP_DEST" == s3://* ]]; then
  DEST="${BACKUP_DEST%/}"
  EP=(); [[ -n "${AWS_ENDPOINT_URL:-}" ]] && EP=(--endpoint-url "$AWS_ENDPOINT_URL")
  aws "${EP[@]}" s3 cp --only-show-errors "$WORK/db.dump.age" "$DEST/$KEY"
  aws "${EP[@]}" s3 cp --only-show-errors "$WORK/manifest.json" "$DEST/${KEY}.manifest.json"
  remote="$(aws "${EP[@]}" s3 ls "$DEST/$KEY" | awk '{print $3}')"
  [[ "$remote" == "$SIZE" ]] || { log "uploaded size $remote differs from $SIZE"; exit 1; }
  # retention
  cutoff="$(date -u -d "-${RETENTION_DAYS} days" +%Y%m%dT%H%M%SZ)"
  aws "${EP[@]}" s3 ls "$DEST/" | awk '{print $4}' | grep -E '^db-[0-9]{8}T[0-9]{6}Z\.dump\.age(\.manifest\.json)?$' | while read -r f; do
    ts="${f#db-}"; ts="${ts%%.*}"
    if [[ "$ts" < "$cutoff" ]]; then log "pruning $f"; aws "${EP[@]}" s3 rm --only-show-errors "$DEST/$f"; fi
  done
else
  mkdir -p "$BACKUP_DEST"
  cp "$WORK/db.dump.age" "$BACKUP_DEST/$KEY"
  cp "$WORK/manifest.json" "$BACKUP_DEST/${KEY}.manifest.json"
  [[ "$(stat -c %s "$BACKUP_DEST/$KEY")" == "$SIZE" ]] || { log "copied size differs"; exit 1; }
  cutoff="$(date -u -d "-${RETENTION_DAYS} days" +%Y%m%dT%H%M%SZ)"
  for f in "$BACKUP_DEST"/db-*.dump.age "$BACKUP_DEST"/db-*.dump.age.manifest.json; do
    [[ -e "$f" ]] || continue
    b="$(basename "$f")"; ts="${b#db-}"; ts="${ts%%.*}"
    if [[ "$ts" < "$cutoff" ]]; then log "pruning $b"; rm -f "$f"; fi
  done
fi

log "ok: $KEY tables=$TABLES restore_tested=$RESTORED"
[[ -n "${BACKUP_PING_URL:-}" ]] && curl -fsS -m 10 "$BACKUP_PING_URL" >/dev/null 2>&1 || true
exit 0
