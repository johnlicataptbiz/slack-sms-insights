# Agent Supporting Docs Index

This file explains which supporting document to retrieve for each drafting situation.

All referenced voice docs are grounded in real raw `sms_events` outbound messaging plus booked-call examples. Treat them as behavior references, not loose inspiration.

## Use this first

Always read [AGENT.md](/Users/jl/Developer/slack-sms-insights/AGENT.md) first for:
- hard rules
- lead quality protection
- qualification logic
- call readiness
- formatting constraints

## Then choose the supporting doc by situation

### Brand new lead from asset download
- `AGENT_CORE_KNOWLEDGE__JACK__OPENERS_AND_DIRECTIONAL_QUESTIONS.md`

### Mid-thread qualification
- `AGENT_CORE_KNOWLEDGE__JACK__QUALIFICATION_AND_CONVERSION_SNIPPETS.md`

### Booking, reschedule, support, or logistics
- `AGENT_CORE_KNOWLEDGE__JACK__BOOKING_FOLLOWUP_AND_SUPPORT_SNIPPETS.md`

### Need a longer Jack-style call pitch example
- `AGENT_CORE_KNOWLEDGE__BOOKING_HIGHLIGHTS__JACK__MULTI_TURN_CONVERSION_PATTERNS.md`

### Older lead, prior context, or thoughtful re-engagement
- `AGENT_CORE_KNOWLEDGE__BRANDON__HIGH_CONTEXT_REENGAGEMENT_AND_NICHE_OUTREACH.md`

### Brandon-style short texts or scheduling flow
- `AGENT_CORE_KNOWLEDGE__BRANDON__BOOKING_AND_CASUAL_TEXTING_SNIPPETS.md`

### Brandon longer booking / recovery flow
- `AGENT_CORE_KNOWLEDGE__BOOKING_HIGHLIGHTS__BRANDON__MULTI_TURN_SCHEDULING_AND_RECOVERY.md`

### Unsure which voice to use or need global guardrails
- `AGENT_CORE_KNOWLEDGE__PTBIZ__VOICE_GUARDRAILS_AND_USAGE_MAP.md`

## Retrieval priority

If the question is about:
- fit / qualification / escalation: use `AGENT.md`
- style / wording / snippets: use the voice docs
- booking pitch pacing: use the booking highlights docs

If the question is about:
- authentic Jack or Brandon wording: use the `sms_events` grounded voice docs
- call pitch structure: use the booked highlights docs first
- whether to pitch at all: use `AGENT.md`, not the snippet docs

## Rule

Do not let supporting docs override:
- qualification order
- lead-quality rules
- bad-fit exits
- podcast safeguard
- call readiness logic

Those always come from `AGENT.md`.
