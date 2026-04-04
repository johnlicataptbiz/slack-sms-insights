-- ═══════════════════════════════════════════════════════════════════════════════
-- COMPREHENSIVE FIXES SQL MIGRATIONS
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Issue #4: Add rejection tracking to draft_suggestions ────────────────────
ALTER TABLE draft_suggestions
ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS rejection_feedback TEXT,
ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

-- ─── Issue #32: Create audit_logs table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255),
  details JSONB DEFAULT '{}',
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);

-- ─── Issue #27: Create goals table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS goals (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  target DECIMAL NOT NULL,
  unit VARCHAR(50) NOT NULL,
  period VARCHAR(20) NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default goals
INSERT INTO goals (id, name, target, unit, period) VALUES
  ('daily-bookings', 'Daily Bookings', 3, 'bookings', 'daily'),
  ('weekly-reply-rate', 'Weekly Reply Rate', 10, '%', 'weekly'),
  ('weekly-opt-out-rate', 'Weekly Opt-out Rate', 3, '% (max)', 'weekly'),
  ('monthly-bookings', 'Monthly Bookings', 60, 'bookings', 'monthly')
ON CONFLICT (id) DO NOTHING;

-- ─── Issue #28: Create alerts table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trend_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type VARCHAR(100) NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  metric VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  value DECIMAL,
  threshold DECIMAL,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trend_alerts_created_at ON trend_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trend_alerts_acknowledged ON trend_alerts(acknowledged_at) WHERE acknowledged_at IS NULL;

-- ─── Issue #8: Normalize line names ────────────────────────────────────────────
UPDATE sms_events
SET line = 'Jack''s Personal Line (+1 817-580-9950)'
WHERE (line LIKE '%817-580-9950%' OR line LIKE '%8175809950%')
  AND line != 'Jack''s Personal Line (+1 817-580-9950)';

UPDATE sms_events
SET line = 'Brandon''s Personal Line (+1 678-820-3770)'
WHERE (line LIKE '%678-820-3770%' OR line LIKE '%6788203770%')
  AND line != 'Brandon''s Personal Line (+1 678-820-3770)';

-- ─── Issue #1, #2, #3: Auto-assign work items based on line ────────────────────
WITH work_item_lines AS (
  SELECT
    wi.id AS work_item_id,
    (
      SELECT line FROM sms_events
      WHERE contact_phone = c.contact_phone
      AND direction = 'outbound'
      ORDER BY event_ts DESC
      LIMIT 1
    ) AS last_line
  FROM work_items wi
  JOIN conversations c ON wi.conversation_id = c.id
  WHERE wi.rep_id IS NULL AND wi.resolved_at IS NULL
)
UPDATE work_items wi
SET rep_id = CASE
  WHEN wil.last_line ILIKE '%jack%' OR wil.last_line LIKE '%817-580-9950%' THEN 'jack'
  WHEN wil.last_line ILIKE '%brandon%' OR wil.last_line LIKE '%678-820-3770%' THEN 'brandon'
  ELSE 'jack'  -- Default to jack for round-robin
END,
updated_at = NOW()
FROM work_item_lines wil
WHERE wi.id = wil.work_item_id;

-- ─── Create function to auto-assign on insert ────────────────────────────────────
CREATE OR REPLACE FUNCTION auto_assign_work_item()
RETURNS TRIGGER AS $$
DECLARE
  last_line TEXT;
BEGIN
  -- Only auto-assign if rep_id is NULL
  IF NEW.rep_id IS NULL THEN
    -- Get the last outbound line for this conversation
    SELECT line INTO last_line
    FROM sms_events
    WHERE contact_phone = (SELECT contact_phone FROM conversations WHERE id = NEW.conversation_id)
      AND direction = 'outbound'
    ORDER BY event_ts DESC
    LIMIT 1;

    -- Assign based on line
    IF last_line ILIKE '%jack%' OR last_line LIKE '%817-580-9950%' THEN
      NEW.rep_id := 'jack';
    ELSIF last_line ILIKE '%brandon%' OR last_line LIKE '%678-820-3770%' THEN
      NEW.rep_id := 'brandon';
    ELSE
      -- Round-robin: assign to whoever has fewer open items
      SELECT rep_id INTO NEW.rep_id
      FROM (
        SELECT 'jack' AS rep_id, COUNT(*) AS cnt FROM work_items WHERE rep_id = 'jack' AND resolved_at IS NULL
        UNION ALL
        SELECT 'brandon' AS rep_id, COUNT(*) AS cnt FROM work_items WHERE rep_id = 'brandon' AND resolved_at IS NULL
      ) sub
      ORDER BY cnt ASC
      LIMIT 1;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_assign_work_item ON work_items;
CREATE TRIGGER trg_auto_assign_work_item
  BEFORE INSERT ON work_items
  FOR EACH ROW
  EXECUTE FUNCTION auto_assign_work_item();

-- ─── Add response time tracking view ────────────────────────────────────────────
CREATE OR REPLACE VIEW v_response_times AS
WITH response_pairs AS (
  SELECT
    inbound.event_ts AS inbound_time,
    outbound.event_ts AS response_time,
    outbound.line,
    inbound.contact_phone,
    EXTRACT(EPOCH FROM (outbound.event_ts - inbound.event_ts)) / 60 AS response_minutes
  FROM sms_events inbound
  JOIN sms_events outbound ON inbound.contact_phone = outbound.contact_phone
    AND outbound.direction = 'outbound'
    AND outbound.event_ts > inbound.event_ts
    AND outbound.event_ts < inbound.event_ts + INTERVAL '24 hours'
  WHERE inbound.direction = 'inbound'
    AND NOT EXISTS (
      SELECT 1 FROM sms_events e2
      WHERE e2.contact_phone = inbound.contact_phone
        AND e2.direction = 'outbound'
        AND e2.event_ts > inbound.event_ts
        AND e2.event_ts < outbound.event_ts
    )
)
SELECT
  DATE_TRUNC('day', inbound_time) AS day,
  CASE
    WHEN line ILIKE '%jack%' OR line LIKE '%817-580-9950%' THEN 'Jack'
    WHEN line ILIKE '%brandon%' OR line LIKE '%678-820-3770%' THEN 'Brandon'
    ELSE 'Other'
  END AS rep,
  COUNT(*) AS responses,
  AVG(response_minutes) AS avg_minutes,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_minutes) AS median_minutes,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_minutes) AS p95_minutes
FROM response_pairs
WHERE response_minutes > 0 AND response_minutes < 1440
GROUP BY 1, 2;

-- ─── Add time-to-booking view ────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_time_to_booking AS
WITH booking_times AS (
  SELECT
    bc.id AS booked_call_id,
    bc.event_time AS booking_time,
    bc.conversation_id,
    (
      SELECT MIN(event_ts) FROM sms_events
      WHERE contact_phone = (SELECT contact_phone FROM conversations WHERE id = bc.conversation_id)
        AND direction = 'outbound'
    ) AS first_contact,
    (
      SELECT sequence FROM sms_events
      WHERE contact_phone = (SELECT contact_phone FROM conversations WHERE id = bc.conversation_id)
        AND direction = 'outbound' AND sequence IS NOT NULL
      ORDER BY event_ts LIMIT 1
    ) AS first_sequence
  FROM booked_calls bc
  WHERE bc.conversation_id IS NOT NULL
)
SELECT
  DATE_TRUNC('week', booking_time) AS week,
  COALESCE(first_sequence, 'Manual') AS sequence,
  COUNT(*) AS bookings,
  AVG(EXTRACT(EPOCH FROM (booking_time - first_contact)) / 86400) AS avg_days_to_booking,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (booking_time - first_contact)) / 86400) AS median_days
FROM booking_times
WHERE first_contact IS NOT NULL
GROUP BY 1, 2;

COMMIT;
