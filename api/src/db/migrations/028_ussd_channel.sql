-- USSD verification: the fourth "game-changer" discussed - every existing
-- verification path assumes a smartphone with a data connection (the app
-- flow) or at minimum SMS delivery for an OTP. USSD reaches feature phones
-- with none of that, and uniquely, a USSD session is itself already proof
-- of phone possession (it can only be initiated by dialing from that exact
-- SIM) - so this channel needs no OTP round-trip at all.
--
-- A USSD short code is shared infrastructure a platform's developer
-- configures once, not a per-request credential - there's no way for a
-- telco/aggregator's callback to carry a Bearer token, so the short code
-- itself is how a callback is resolved back to a platform's api_key.
ALTER TABLE api_keys ADD COLUMN ussd_service_code VARCHAR(20) UNIQUE;

ALTER TYPE ve_event_type_enum ADD VALUE 'ussd_verified';
