# Unified Analytics (Metabase + ptbizsms.com)

This document defines the governed analytics model introduced for PT Biz.

## Core principle

Do not mix board grains:

- `lead_item` boards feed lead-funnel analytics.
- `aggregate_metric` boards feed ops scorecards.

## Governance tables

- `monday_board_registry`: canonical board classification (`board_class`, `metric_grain`, inclusion flags).
- `actor_directory`: canonical role map for people (`setter`, `closer`, `other`) with aliases.
- `monday_metric_facts`: extracted scorecard metrics from aggregate boards.

## Canonical views

- `analytics_actor_directory_v`
- `analytics_board_registry_v`
- `analytics_lead_funnel_fact_v`
- `analytics_sequence_outcomes_v`
- `analytics_monday_scorecard_fact_v`
- `analytics_data_quality_v`

These are intended as the primary Metabase models and app-level analytics sources.

## API endpoints

- `GET /api/v2/admin/monday/lead-insights`
  - Supports `scope=curated|all|board_ids` and `boardIds` csv.
  - Default scope is `curated`.
- `GET /api/v2/admin/monday/board-catalog`
  - Returns board governance + sync + completeness rollup.
- `GET /api/v2/admin/monday/scorecards`
  - Returns aggregate scorecard metrics and trends.

## Operational rebuild

After deploying schema + ingestion changes:

```bash
cd sms-insights
npm run rebuild:monday:governed
```

This will:

1. Purge non-funnel rows from `lead_outcomes`, `lead_attribution`, and `setter_activity`.
2. Force-resync all configured Monday boards with governed routing.

## Metabase collection layout

- `00 Data Health`
- `10 Executive`
- `20 Lead Journey`
- `30 Sequence + Qualification`
- `40 Monday Scorecards`
- `50 Ads + Acquisition`

Always build funnel cards from `analytics_lead_funnel_fact_v` and scorecard cards from `analytics_monday_scorecard_fact_v`.
