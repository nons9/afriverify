import { query, queryOne } from '../../db';
import { sha256 } from '../../utils/crypto';
import logger from '../../utils/logger';

export interface FraudSignal {
  identityId: string;
  deviceId?: string;
  ipAddress?: string;
  fraudType: string;
  reportingPlatform: string;
}

export interface NetworkRiskResult {
  networkRiskScore: number;
  connectedFraudReports: number;
  riskFactors: string[];
}

type NodeType = 'identity' | 'device' | 'ip_subnet';

async function upsertNode(
  nodeType: NodeType,
  nodeValue: string,
  riskDelta: number
): Promise<string> {
  const nodeHash = sha256(`${nodeType}:${nodeValue}`);
  const rows = await query<{ id: string }>(
    `INSERT INTO fraud_graph_nodes
       (node_type, node_hash, risk_score, fraud_reports_count, last_seen)
     VALUES ($1, $2, $3, 1, NOW())
     ON CONFLICT (node_hash)
     DO UPDATE SET
       fraud_reports_count = fraud_graph_nodes.fraud_reports_count + 1,
       risk_score          = LEAST(100, fraud_graph_nodes.risk_score + $3),
       last_seen           = NOW()
     RETURNING id`,
    [nodeType, nodeHash, riskDelta]
  );
  return rows[0].id;
}

async function upsertEdge(
  sourceId: string,
  targetId: string,
  edgeType: string
): Promise<void> {
  await query(
    `INSERT INTO fraud_graph_edges (source_node_id, target_node_id, edge_type)
     VALUES ($1, $2, $3)
     ON CONFLICT (source_node_id, target_node_id, edge_type) DO NOTHING`,
    [sourceId, targetId, edgeType]
  );
}

export async function recordFraudSignal(signal: FraudSignal): Promise<void> {
  try {
    // Identity node — highest risk delta (20 per report)
    const identityNodeId = await upsertNode('identity', signal.identityId, 20);

    // Device node — 15 per report (device shared across fraud events is a strong cluster signal)
    if (signal.deviceId) {
      const deviceNodeId = await upsertNode('device', signal.deviceId, 15);
      await upsertEdge(identityNodeId, deviceNodeId, 'same_device');
    }

    // IP subnet node — 5 per report (shared IP has weaker signal due to NAT/mobile towers)
    if (signal.ipAddress) {
      const parts = signal.ipAddress.split('.');
      const subnet = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : signal.ipAddress;
      const subnetNodeId = await upsertNode('ip_subnet', subnet, 5);
      await upsertEdge(identityNodeId, subnetNodeId, 'same_ip_subnet');
    }

    logger.info('FraudGraph: signal recorded', {
      identity: signal.identityId,
      platform: signal.reportingPlatform,
      fraud_type: signal.fraudType
    });
  } catch (err) {
    logger.error('FraudGraph: write failed', { error: (err as Error).message });
  }
}

export async function evaluateNetworkRisk(
  identityId?: string,
  deviceId?: string,
  ipAddress?: string
): Promise<NetworkRiskResult> {
  const riskFactors: string[] = [];
  let networkRiskScore = 0;
  let connectedFraudReports = 0;

  try {
    // Check identity node - skipped when there's no identity yet (a brand
    // new verification attempt, before any phone has been matched to one).
    // Device/IP checks below still run and are the whole point of checking
    // risk this early: they catch a known-fraudulent device or subnet
    // reusing itself under a fresh identity, before that identity exists.
    if (identityId) {
      const identityHash = sha256(`identity:${identityId}`);
      const identityNode = await queryOne<{ risk_score: number; fraud_reports_count: number }>(
        `SELECT risk_score, fraud_reports_count FROM fraud_graph_nodes WHERE node_hash = $1`,
        [identityHash]
      );
      if (identityNode) {
        networkRiskScore = Math.max(networkRiskScore, identityNode.risk_score);
        connectedFraudReports += identityNode.fraud_reports_count;
        if (identityNode.fraud_reports_count > 0) riskFactors.push('direct_fraud_reports');
      }
    }

    // Check device node (70% weight — device is a strong linking signal)
    if (deviceId) {
      const deviceHash = sha256(`device:${deviceId}`);
      const deviceNode = await queryOne<{ risk_score: number; fraud_reports_count: number }>(
        `SELECT risk_score, fraud_reports_count FROM fraud_graph_nodes WHERE node_hash = $1`,
        [deviceHash]
      );
      if (deviceNode && deviceNode.fraud_reports_count > 0) {
        networkRiskScore = Math.max(networkRiskScore, Math.round(deviceNode.risk_score * 0.7));
        connectedFraudReports += deviceNode.fraud_reports_count;
        riskFactors.push('device_linked_to_fraud');
      }
    }

    // Check IP subnet node (30% weight — weak signal, many users share the same subnet)
    // Only flag if 3+ fraud reports from this subnet to avoid false positives
    if (ipAddress) {
      const parts = ipAddress.split('.');
      const subnet = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : ipAddress;
      const subnetHash = sha256(`ip_subnet:${subnet}`);
      const subnetNode = await queryOne<{ risk_score: number; fraud_reports_count: number }>(
        `SELECT risk_score, fraud_reports_count FROM fraud_graph_nodes WHERE node_hash = $1`,
        [subnetHash]
      );
      if (subnetNode && subnetNode.fraud_reports_count >= 3) {
        networkRiskScore = Math.max(networkRiskScore, Math.round(subnetNode.risk_score * 0.3));
        connectedFraudReports += subnetNode.fraud_reports_count;
        riskFactors.push('high_risk_ip_subnet');
      }
    }
  } catch (err) {
    logger.error('FraudGraph: evaluation failed', { error: (err as Error).message });
  }

  return {
    networkRiskScore: Math.round(Math.min(100, networkRiskScore)),
    connectedFraudReports,
    riskFactors
  };
}
