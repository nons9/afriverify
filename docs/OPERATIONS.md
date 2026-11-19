# Operations runbook

What keeps AfriVerify recoverable and observable, what was measured, and what still needs a person.

## 1. Backups

`ops/backup/` is a scheduled job that dumps Postgres, proves the dump restores, encrypts it with an **age public key** (the private key never lives on the server, so a breach of the server cannot read old backups), uploads it to object storage, checks the upload size, and prunes backups older than 35 days.

Tested here against a real, fully migrated database: dump, restore into a scratch database with identical migration and table counts, encryption, upload, retention pruning, a wrong-key restore refusing to decrypt, and a failure (bad database) returning a non-zero exit and calling the failure ping.

### Targets

| | Target | Why |
| --- | --- | --- |
| RPO (most data you can lose) | 6 hours | Run the job every 6 hours. A day of lost verifications and billing records is too much for paying customers. |
| RTO (time to be back) | 4 hours | Provision a database, run `restore.sh`, point services at it. **Not yet measured at production size.** |

The restore of a small test database took under a second. Production restore time depends on its size, so the first drill below produces the real number.

### One-time setup (needs you)

1. On a trusted computer: `age-keygen -o afriverify-backup-key.txt`. Store that file in your password manager and a second safe place. **If it is lost, no backup can be read.** It prints a public key starting `age1`: send me that public key only (never the file).
2. I create a Railway cron service from `ops/backup` with `DATABASE_URL`, the AWS variables, `BACKUP_AGE_RECIPIENT`, `BACKUP_DEST=s3://<bucket>/db-backups`, and `0 */6 * * *`.
3. Turn on Railway's own volume backups for the Postgres volume in the dashboard as a second layer (this is a plan feature; I cannot see or enable it from here).

### Restore drill (do this once now, then every quarter)

```
createdb restore_drill
./ops/backup/restore.sh db-<timestamp>.dump.age afriverify-backup-key.txt postgresql://.../restore_drill
```

It prints the restore time and the migration count. Write the date and time taken in the table below.

| Date | Backup used | Size | Restore time | Result |
| --- | --- | --- | --- | --- |
| (not yet done) | | | | |

Also back up the **object storage** (ID photos and selfies). Enable bucket versioning at your storage provider so an accidental delete or overwrite is recoverable.

## 2. Alerts

Alerts go to every configured channel: `ALERT_EMAIL_TO` (comma separated, sent with Resend) and/or `ALERT_WEBHOOK_URL` (Slack style). **Before this change neither was set in production, so alerts were only written to logs and nobody was told.** The API now logs a loud error at boot if no channel exists, and an alert nobody receives is logged as "NOT DELIVERED".

Prove it works: after setting `ALERT_EMAIL_TO`, call `POST /v1/admin/ops/test-alert` with an admin token. It returns 200 only if a channel really delivered.

In-process alerts cannot tell you the API is **down**, because a dead process sends nothing. Add one external monitor (a free uptime service) on:

- `https://<api-domain>/health/ready` every 1 minute, alert after 2 failures
- the same for the liveness engine's `/healthz` if it has a public domain (otherwise the API's own engine-error alert covers it)

## 3. Capacity (measured locally, not on production)

`ops/loadtest/load.mjs` is a dependency-free load tester. Never run it against production. Measured on a 4-core test machine with the engine running as a non-root user:

| Scenario | Result |
| --- | --- |
| Live scan analysis, 1 at a time | about 250 to 290 ms each |
| Live scan analysis, 2 to 4 at once | about 6.4 scans per second ceiling (roughly 23,000 scans an hour), no errors |
| Engine first request before the fix | about 8 seconds (models loaded on first use) |
| Engine first request after the fix | under 0.3 seconds (models are loaded before the service takes traffic) |
| API health and read paths | about 2,400 to 3,500 requests per second on one process, p99 under 35 ms; the global per-IP limit correctly returned 429 on the public plans endpoint |

What this means: at 10,000 verifications a month the average load is a few thousandths of a scan per second, so **one engine instance is enough for capacity**; a second instance is for redundancy (surviving a restart or a bad deploy), not speed. Re-run the same script against a staging copy sized like your Railway plan to get exact numbers there, because this machine is not your plan.

## 4. Containers

Both services now run as an unprivileged user (`node` for the API, a dedicated `app` user for the engine), and the backup job runs as `postgres`. Neither app writes to disk, so nothing needs to be writable. Verified here by running the engine as an unprivileged user (health, models loaded, full scans); the Docker builds themselves are verified by the Railway deploy, because there is no Docker daemon in the build environment I work in.

## 5. Second replica (decision, not yet taken)

Add it when a customer contract or SLA asks for it, engine first. It roughly doubles that service's compute charge. Until then a restart takes seconds and the readiness check stops a bad deploy from taking traffic.
