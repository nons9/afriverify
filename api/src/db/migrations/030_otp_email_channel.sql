-- Lets a verification session receive its OTP by email instead of SMS.
-- Phone stays required (it's still the identity anchor everything else -
-- blacklist checks, the fraud graph, the returning-user lookup - keys off
-- of), this only adds a choice for *where the code itself is delivered*.
ALTER TABLE verification_sessions
  ADD COLUMN email VARCHAR(255),
  ADD COLUMN otp_channel VARCHAR(10) NOT NULL DEFAULT 'sms' CHECK (otp_channel IN ('sms', 'email'));
