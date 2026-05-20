import { query } from '../../db';
import { sha256 } from '../../utils/crypto';
import logger from '../../utils/logger';

export interface AccessContext {
  identityId: string;
  platformName: string;
  ipAddress?: string;
  deviceId?: string;
  userAgent?: string;
}

export interface ContinuityResult {
  continuityScore: number;
  flags: string[];
}

// Hash the first two octets of an IPv4 address (or first two groups of IPv6)
// to get a broad regional fingerprint — never stores precise IP.
function ipToRegionHash(ip?: string): string | null {
  if (!ip) return null;
  const v4parts = ip.split('.');
  if (v4parts.length === 4) {
    return sha256(`${v4parts[0]}.${v4parts[1]}`).substring(0, 16);
  }
  const v6parts = ip.replace(/::/, ':0:').split(':');
  if (v6parts.length >= 2) {
    return sha256(`${v6parts[0]}:${v6parts[1]}`).substring(0, 16);
  }
  return null;
}

export async function recordContinuity(ctx: AccessContext): Promise<ContinuityResult> {
  const ipRegion = ipToRegionHash(ctx.ipAddress);
  const deviceHash = ctx.deviceId ? sha256(ctx.deviceId) : null;
  const uaHash = ctx.userAgent ? sha256(ctx.userAgent) : null;

  // Fetch last 10 ledger entries for this identity to establish pattern
  const history = await query<{
    ip_geohash: string | null;
    device_fingerprint_hash: string | null;
    created_at: string;
  }>(
    `SELECT ip_geohash, device_fingerprint_hash, created_at
     FROM live_ledger
     WHERE identity_id = $1
     ORDER BY created_at DESC
     LIMIT 10`,
    [ctx.identityId]
  );

  let continuityScore = 100;
  const flags: string[] = [];
  const now = Date.now();

  if (history.length >= 1) {
    const mostRecent = history[0];
    const lastSeenMs = new Date(mostRecent.created_at).getTime();
    const secondsApart = (now - lastSeenMs) / 1000;

    // Device fingerprint changed from most recent access
    if (deviceHash && mostRecent.device_fingerprint_hash &&
        mostRecent.device_fingerprint_hash !== deviceHash) {
      continuityScore -= 20;
      flags.push('device_changed');
    }

    // IP region changed — assess plausibility against time gap
    if (ipRegion && mostRecent.ip_geohash && mostRecent.ip_geohash !== ipRegion) {
      if (secondsApart < 7_200) {
        // Region changed but less than 2 hours since last access — physically implausible
        continuityScore -= 35;
        flags.push('impossible_location_change');
      } else {
        // Could be travel or VPN — note but don't penalise as heavily
        continuityScore -= 10;
        flags.push('location_changed');
      }
    }

    // Concurrent session detection: same identity active from a DIFFERENT
    // device within the last 60 seconds — strong account sharing / takeover signal
    const concurrentCount = history.filter((h) => {
      const t = new Date(h.created_at).getTime();
      return now - t < 60_000 && h.device_fingerprint_hash !== deviceHash;
    }).length;

    if (concurrentCount >= 2) {
      continuityScore -= 40;
      flags.push('concurrent_sessions_detected');
    }
  }

  continuityScore = Math.max(0, Math.min(100, continuityScore));

  // Write ledger entry asynchronously — never block the API response
  query(
    `INSERT INTO live_ledger
       (identity_id, platform_name, ip_geohash, device_fingerprint_hash,
        user_agent_hash, continuity_score, anomaly_flags)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      ctx.identityId,
      ctx.platformName,
      ipRegion,
      deviceHash,
      uaHash,
      continuityScore,
      JSON.stringify(flags)
    ]
  ).catch((err) => logger.error('LiveLedger: write failed', { error: err.message }));

  return { continuityScore, flags };
}

export async function getContinuityHistory(
  identityId: string,
  limit = 20
): Promise<Record<string, unknown>[]> {
  return query(
    `SELECT platform_name, continuity_score, anomaly_flags, created_at
     FROM live_ledger
     WHERE identity_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [identityId, limit]
  );
}
