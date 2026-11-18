# Release pipeline and monitoring

## How a change reaches production
1. **Verify locally** with `./scripts/verify.sh` (same gates as CI). Add `TEST_DATABASE_URL=...` (an empty scratch
   Postgres) to also prove the whole migration chain applies.
2. **Pull request.** CI (`.github/workflows/ci.yml`) runs typecheck, tests, the migration chain on a real Postgres,
   and production builds of the API and web app.
3. **Merge to `main`.** Railway builds the image and the API container starts with
   `node dist/db/migrate.js && node dist/index.js`:
   - migrations are serialised by a Postgres advisory lock (two replicas starting together are safe);
   - **if a migration fails the container exits non-zero and the app never starts** (it used to start anyway, which
     hid migration failures for weeks);
4. **Readiness gate.** Railway only promotes the new deployment when `GET /health/ready` returns 200, meaning the
   database and Redis are reachable **and every migration shipped in this build has been applied**. A deploy that
   fails the gate never replaces the working version.
5. **Smoke test.** `./scripts/smoke.sh` (also run every 15 minutes by `.github/workflows/smoke.yml`) checks the live API
   and website, including the exact failure modes we have hit before (a 500 where a 404 is expected, missing assets).

## One-time Railway settings
- API service: set **Healthcheck Path** to `/health/ready` (`/health` stays as the cheap liveness probe).
- Optional but recommended: set the API service **Pre-deploy command** to `npm run migrate:prod` so migrations run once
  per deploy instead of once per replica start.

## Monitoring (what pages you, and how)
| Signal | Where it is computed | Alert |
|---|---|---|
| HTTP 5xx rate (>= 10% of >= 20 requests in 10 min) | Redis counters shared by all replicas | `ALERT_WEBHOOK_URL` |
| Liveness engine unreachable (>= 3 failures in 10 min) | `liveness_engine_error` counter | `ALERT_WEBHOOK_URL` |
| Verification / OTP / liveness failure rate | `verification_events` table | `ALERT_WEBHOOK_URL` |
| Email bounces, complaints, failures | Resend webhook -> `email_events` | `ALERT_WEBHOOK_URL` |
| Site or API down, or a known regression returns | `smoke.yml` every 15 minutes | failed workflow run (+ Slack if `SLACK_WEBHOOK_URL` secret set) |
| Unhandled exceptions with stack traces | Sentry | needs `SENTRY_DSN` |

Alerts fire once per incident across all replicas (Redis cooldown), not once per replica or per check.

**Not yet configured (needs a secret from the owner):** `ALERT_WEBHOOK_URL` (a Slack incoming-webhook URL; without it alerts
only appear in the logs) and `SENTRY_DSN`. Tunables: `HTTP_ALERT_5XX_RATE`, `HTTP_ALERT_MIN_REQUESTS`,
`HTTP_ALERT_CHECK_MINUTES`, `LIVENESS_ALERT_ENGINE_ERRORS`.

## Rolling back
Railway: Deployments -> the previous successful deployment -> **Redeploy**. Migrations are additive; a rollback of the
code does not undo them, so prefer forward fixes for schema problems.

## If GitHub Actions jobs die in ~3 seconds
A job with an empty runner name and 0 ms billable time never started: it is an Actions **billing / spending-limit**
problem on the GitHub account (Settings -> Billing and plans), not a code problem. Until that is fixed CI gives no
protection, which is why the gates above also live inside the deploy itself and in `scripts/verify.sh`.
