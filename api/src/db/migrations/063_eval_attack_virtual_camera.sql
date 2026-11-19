-- Accuracy Studies: add "virtual_camera" (software that feeds video into the browser as a webcam) as an attack type.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'liveness_eval_captures'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%attack_type%' AND pg_get_constraintdef(oid) LIKE '%print_photo%'
  LOOP
    EXECUTE format('ALTER TABLE liveness_eval_captures DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE liveness_eval_captures
  ADD CONSTRAINT liveness_eval_captures_attack_type_check
  CHECK (attack_type IN ('print_photo','screen_photo','screen_video','screen_live_video','virtual_camera','mask','other'));
