-- Migration 016: fraud_graph
-- OrbitShield: FraudGraph — Cross-Platform Fraud Intelligence Network
-- Nodes represent entities (identities, devices, IP subnets).
-- Edges represent co-occurrence during fraud events.
-- Every /identity/flag call updates the graph. Every /identity/check queries it.

CREATE TABLE IF NOT EXISTS fraud_graph_nodes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_type            VARCHAR(20)  NOT NULL,   -- 'identity' | 'device' | 'ip_subnet'
  node_hash            VARCHAR(64)  NOT NULL,   -- SHA-256 of "type:value" — never raw values
  risk_score           INTEGER      NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  fraud_reports_count  INTEGER      NOT NULL DEFAULT 0,
  first_seen           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_seen            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT fraud_graph_nodes_hash_unique UNIQUE (node_hash)
);

CREATE INDEX IF NOT EXISTS idx_fraud_graph_nodes_type_risk
  ON fraud_graph_nodes (node_type, risk_score DESC);

CREATE INDEX IF NOT EXISTS idx_fraud_graph_nodes_last_seen
  ON fraud_graph_nodes (last_seen DESC);

CREATE TABLE IF NOT EXISTS fraud_graph_edges (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_node_id UUID NOT NULL REFERENCES fraud_graph_nodes(id),
  target_node_id UUID NOT NULL REFERENCES fraud_graph_nodes(id),
  edge_type      VARCHAR(50) NOT NULL,   -- 'same_device' | 'same_ip_subnet' | 'co_reported'
  weight         DECIMAL(4,2) NOT NULL DEFAULT 1.0,
  created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT fraud_graph_edges_unique UNIQUE (source_node_id, target_node_id, edge_type)
);

CREATE INDEX IF NOT EXISTS idx_fraud_graph_edges_source
  ON fraud_graph_edges (source_node_id);

CREATE INDEX IF NOT EXISTS idx_fraud_graph_edges_target
  ON fraud_graph_edges (target_node_id);
