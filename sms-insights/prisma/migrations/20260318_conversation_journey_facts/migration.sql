CREATE TABLE "conversation_journey" (
  "conversation_id" uuid NOT NULL,
  "window_start" timestamptz NOT NULL,
  "window_end" timestamptz NOT NULL,
  "first_outbound_at" timestamptz NOT NULL,
  "first_reply_at" timestamptz,
  "first_qualified_at" timestamptz,
  "first_booked_at" timestamptz,
  "sequence_id" uuid NOT NULL,
  "rep_id" text NOT NULL,
  "reply_latency_minutes" integer,
  "book_latency_days" numeric(8, 2),
  "messages_before_reply" integer NOT NULL DEFAULT 0,
  "messages_before_book" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT "conversation_journey_pkey" PRIMARY KEY ("conversation_id", "window_start")
);

CREATE INDEX "idx_conversation_journey_window_start" ON "conversation_journey" ("window_start");
CREATE INDEX "idx_conversation_journey_sequence_window" ON "conversation_journey" ("sequence_id", "window_start");
CREATE INDEX "idx_conversation_journey_rep_window" ON "conversation_journey" ("rep_id", "window_start");

CREATE TABLE "fact_attribution_method_daily" (
  "day" date NOT NULL,
  "matched_calls" integer NOT NULL DEFAULT 0,
  "manual_direct_calls" integer NOT NULL DEFAULT 0,
  "unattributed_calls" integer NOT NULL DEFAULT 0,
  "sms_phone_match_calls" integer NOT NULL DEFAULT 0,
  "fuzzy_match_calls" integer NOT NULL DEFAULT 0,
  "reply_linked_calls" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT "fact_attribution_method_daily_pkey" PRIMARY KEY ("day")
);

CREATE INDEX "idx_fact_attribution_method_daily_day" ON "fact_attribution_method_daily" ("day");

CREATE TABLE "fact_rep_response_daily" (
  "day" date NOT NULL,
  "rep_id" text NOT NULL,
  "new_leads_contacted" integer NOT NULL DEFAULT 0,
  "leads_replied" integer NOT NULL DEFAULT 0,
  "booked_calls" integer NOT NULL DEFAULT 0,
  "median_reply_time_minutes" numeric(8, 2),
  "median_book_time_days" numeric(8, 2),
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT "fact_rep_response_daily_pkey" PRIMARY KEY ("day", "rep_id")
);

CREATE INDEX "idx_fact_rep_response_daily_rep_day" ON "fact_rep_response_daily" ("rep_id", "day");
