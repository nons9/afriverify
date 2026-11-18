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
5. **Smoke test.** `./scripts/smoke.sh` (the `smoke.yml` workflow is manual-only so it can never cost Actions minutes) checks the live API
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
| Site or API down, or a known regression returns | a free external uptime monitor on `/health/ready`, or run `scripts/smoke.sh` | monitor's email alert |
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

## SMS routing (OTP delivery)
`api/src/services/otp.service.ts` routes each OTP by destination country code and fails over automatically.

- **Order:** Nigeria (+234) tries Termii first; everywhere else tries Africa's Talking first. Each is the other's failover. Providers with no credentials are skipped without an attempt.
- **Override:** set `SMS_ROUTES` to JSON, e.g. `{"233":["termii","africastalking"],"default":["africastalking","termii"]}` (longest country-code prefix wins; bad JSON falls back to the defaults).
- **Circuit breaker:** 3 failures in 2 minutes skips that provider for the rest of the window (shared across replicas through Redis), so an outage does not add a 10 second timeout to every verification. If every provider is tripped they are all still tried.
- **Measure cost and delivery:** every send writes one row to `sms_messages` (hash and masked phone only). Example: `SELECT provider, status, count(*) FROM sms_messages WHERE created_at > now() - interval '7 days' GROUP BY 1,2;`
- **Cheapest option is no SMS:** offer email OTP first where the product allows it.
