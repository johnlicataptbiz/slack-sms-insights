# Sequence KPI Contract

## Purpose
Establish a canonical, stable definition of sequence KPIs so the dashboard and downstream consumers do not depend on raw, free-text sequence labels.

## Canonical Sequence Tables

### `sequence_registry`
- **Purpose:** Canonical list of sequences with a normalized label.
- **Key fields:**
  - `label`: preferred human label (first-seen representative).
  - `normalized_label`: normalization key used for grouping.
  - `status`: `active | inactive`.

### `sequence_aliases`
- **Purpose:** Raw label → canonical mapping.
- **Key fields:**
  - `raw_label`: raw label as received from source systems.
  - `normalized_label`: normalized label for grouping.
  - `sequence_id`: FK to `sequence_registry`.

### `sms_events.sequence_id`
- **Purpose:** Canonical sequence FK on each SMS event. This should be populated at ingestion.

## Normalization Rules
Applied when upserting into `sequence_registry` / `sequence_aliases`:
1. Trim whitespace.
2. Lowercase.
3. Replace non-alphanumeric runs with a single space.
4. Collapse whitespace to single spaces.

This yields `normalized_label`, used to group labels like:
- `"Follow Up - 7 Day"`, `"follow_up 7-day"`, `"FollowUp 7 Day"` → `"follow up 7 day"`.

## KPI Contract (per sequence)
The core KPI table should provide, at minimum, the following fields per canonical sequence label:
- `sequenceLabel` (canonical, from `sequence_registry.label`)
- `messagesSent`
- `peopleContacted`
- `repliesReceived`
- `replyRatePct`
- `bookedCalls`
- `bookingRatePct`
- `optOuts`
- `optOutRatePct`

### Definitions
- **messagesSent:** Count of outbound SMS events attributed to the sequence.
- **peopleContacted:** Unique contacts receiving at least one outbound message from the sequence.
- **repliesReceived:** Unique contacts that replied within the reply window, attributed to the latest outbound touch from this sequence.
- **replyRatePct:** `repliesReceived / peopleContacted * 100`.
- **bookedCalls:** Calls attributed to this sequence per the current booked-call attribution logic.
- **bookingRatePct:** `bookedCalls / peopleContacted * 100`.
- **optOuts:** Unique contacts that sent opt-out signals attributed to the latest outbound touch from this sequence.
- **optOutRatePct:** `optOuts / messagesSent * 100`.

## API Reference
- `GET /api/v2/sequences/kpis`
  - Intended as the canonical KPI endpoint for the sequence table.
  - It should use `sequence_registry` for canonical labels and not rely on raw `sms_events.sequence` text.

## Implementation Notes
- All KPI rollups should prefer `sms_events.sequence_id` and `sequence_registry` for grouping.
- When raw labels are missing, attribution should use a consistent manual/default bucket (e.g. manual/outbound).
