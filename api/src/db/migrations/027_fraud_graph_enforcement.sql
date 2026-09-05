-- The fraud graph (fraud_graph_nodes/edges) and the blacklist table both
-- already existed and worked, but nothing connected them to each other or
-- to the actual verification gate: a platform could flag someone at 100%
-- confidence and recordFraudSignal() would update the graph's risk score,
-- but nothing ever called addToBlacklist(), so that person could go
-- re-verify immediately, anywhere, unimpeded. And a brand-new verification
-- attempt never checked the fraud graph at all, even though it already
-- models device/IP-subnet linkage - exactly the signal that catches a
-- repeat fraudster switching phone numbers to dodge a block.
ALTER TYPE ve_event_type_enum ADD VALUE 'network_risk_blocked';
