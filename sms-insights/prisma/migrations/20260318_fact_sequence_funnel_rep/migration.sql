ALTER TABLE "fact_sequence_funnel_daily"
  ADD COLUMN "rep_id" text NOT NULL DEFAULT 'unknown';

ALTER TABLE "fact_sequence_funnel_daily"
  DROP CONSTRAINT "fact_sequence_funnel_daily_pkey";

ALTER TABLE "fact_sequence_funnel_daily"
  ADD CONSTRAINT "fact_sequence_funnel_daily_pkey" PRIMARY KEY ("day", "sequence_id", "rep_id");

CREATE INDEX "idx_fact_sequence_funnel_daily_rep_day" ON "fact_sequence_funnel_daily" ("rep_id", "day");
