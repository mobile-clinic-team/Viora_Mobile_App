-- Extend the canonical auth transaction; no parallel authentication store.
ALTER TABLE auth_transactions ADD COLUMN step_up_binding JSONB;
ALTER TABLE auth_transactions ADD CONSTRAINT auth_transactions_step_up_binding_check
CHECK (
  (purpose = 'LOGIN' AND step_up_binding IS NULL)
  OR (purpose = 'STEP_UP' AND step_up_binding IS NOT NULL
      AND jsonb_typeof(step_up_binding) = 'object')
);
