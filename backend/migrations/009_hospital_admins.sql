-- Hospital administrators verify doctors (MVP document section 5.3).
-- Admin accounts are created by an operator script, never by self-registration.

CREATE TABLE admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX admins_email_lower_unique ON admins (lower(email));

-- Who last reviewed a doctor's registration, when, and why (shown to the doctor on rejection or revocation).
ALTER TABLE doctors
  ADD COLUMN reviewed_by uuid REFERENCES admins(id) ON DELETE SET NULL,
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN review_note text CHECK (review_note IS NULL OR char_length(review_note) <= 500);

-- Admin actions are audited like patient and doctor actions.
ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_actor_type_check;
ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_actor_type_check CHECK (actor_type IN ('patient', 'doctor', 'system', 'admin'));
