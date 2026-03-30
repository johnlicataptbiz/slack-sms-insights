-- Add partial indexes for status filtering optimization

-- send_attempts: Only index blocked/queued/failed status for pending operations
CREATE INDEX "idx_send_attempts_pending" ON "send_attempts"("conversation_id", "status", "created_at" DESC) WHERE "status" IN ('blocked', 'queued', 'failed');

-- monday_booked_call_pushes: Only index non-synced statuses for pending sync operations
CREATE INDEX "idx_monday_pushes_pending" ON "monday_booked_call_pushes"("board_id", "status", "updated_at" DESC) WHERE "status" != 'synced';