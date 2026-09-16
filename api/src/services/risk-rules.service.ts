import { query, queryOne } from '../db';
import { applyTrustEvent } from './trust-score.service';
import logger from '../utils/logger';
import { captureError } from '../utils/sentry';

interface IdentityContext {
  id: string;
  trust_score: number;
  aml_status: string;
  verification_level: number;
  is_blacklisted: boolean;
  country: string | null;
}

interface RuleCondition {
  field: keyof Omit<IdentityContext, 'id'>;
  operator: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte' | 'in' | 'not_in';
  value: unknown;
}

interface RiskRule {
  id: string;
  name: string;
  conditions: RuleCondition[];
  conditions_mode: 'all' | 'any';
  action: 'trust_delta' | 'flag';
  action_params: { delta?: number } | null;
  priority: number;
}

function evaluateCondition(ctx: IdentityContext, cond: RuleCondition): boolean {
  const actual = ctx[cond.field as keyof IdentityContext] as unknown;
  switch (cond.operator) {
    case 'eq':       return actual === cond.value;
    case 'ne':       return actual !== cond.value;
    case 'lt':       return typeof actual === 'number' && typeof cond.value === 'number' && actual < cond.value;
    case 'lte':      return typeof actual === 'number' && typeof cond.value === 'number' && actual <= cond.value;
    case 'gt':       return typeof actual === 'number' && typeof cond.value === 'number' && actual > cond.value;
    case 'gte':      return typeof actual === 'number' && typeof cond.value === 'number' && actual >= cond.value;
    case 'in':       return Array.isArray(cond.value) && cond.value.includes(actual);
    case 'not_in':   return Array.isArray(cond.value) && !cond.value.includes(actual);
    default:         return false;
  }
}

function ruleMatches(ctx: IdentityContext, rule: RiskRule): boolean {
  if (!rule.conditions.length) return false;
  if (rule.conditions_mode === 'any') {
    return rule.conditions.some((c) => evaluateCondition(ctx, c));
  }
  return rule.conditions.every((c) => evaluateCondition(ctx, c));
}

async function applyAction(rule: RiskRule, ctx: IdentityContext): Promise<void> {
  if (rule.action === 'trust_delta') {
    const delta = rule.action_params?.delta;
    if (typeof delta !== 'number') return;
    await applyTrustEvent({
      identity_id: ctx.id,
      event_type: 'flagged_confirmed',
      score_delta: delta,
      notes: `Risk rule: ${rule.name}`,
    });
    logger.info('Risk rule applied trust_delta', { ruleId: rule.id, identityId: ctx.id, delta });
    return;
  }

  if (rule.action === 'flag') {
    // Skip if an open flag from this rule already exists for this identity
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM risk_flags WHERE identity_id = $1 AND rule_id = $2 AND resolved_at IS NULL LIMIT 1`,
      [ctx.id, rule.id]
    );
    if (existing) return;

    await query(
      `INSERT INTO risk_flags (identity_id, rule_id, rule_name, triggered_context)
       VALUES ($1, $2, $3, $4)`,
      [ctx.id, rule.id, rule.name, JSON.stringify(ctx)]
    );
    logger.info('Risk rule created flag', { ruleId: rule.id, identityId: ctx.id, ruleName: rule.name });
  }
}

export async function evaluateIdentity(identityId: string): Promise<{ rulesTriggered: number }> {
  const identity = await queryOne<IdentityContext>(
    `SELECT id, trust_score, aml_status, verification_level, is_blacklisted, country
     FROM verified_identities WHERE id = $1`,
    [identityId]
  );
  if (!identity) return { rulesTriggered: 0 };

  const rules = await query<RiskRule>(
    `SELECT id, name, conditions, conditions_mode, action, action_params, priority
     FROM risk_rules WHERE is_active = true ORDER BY priority ASC`,
    []
  );

  let triggered = 0;
  for (const rule of rules) {
    try {
      if (ruleMatches(identity, rule)) {
        await applyAction(rule, identity);
        triggered++;
      }
    } catch (err) {
      logger.error('Risk rule evaluation error', {
        ruleId: rule.id, identityId, error: (err as Error).message,
      });
      captureError(err as Error, { ruleId: rule.id, identityId, job: 'risk_rules' });
    }
  }

  logger.info('Risk rule evaluation complete', { identityId, rulesTriggered: triggered });
  return { rulesTriggered: triggered };
}
