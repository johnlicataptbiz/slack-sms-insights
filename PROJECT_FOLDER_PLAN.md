# Project Folder Organization Plan

## Analysis Summary
**Timestamp:** 2026-03-31T01:22:08.265Z
**Scope:** Full workspace recursive scan
**Total files analyzed:** 500+ (estimated from directory listing)
**Root directory files:** 45+ visible files
**Clutter assessment:** High (35-40% root clutter)

## Current State Analysis

### Root Directory Clutter (35%+)
The root directory contains excessive files that belong in organized subdirectories:

**Scattered Scripts (8 files):**
- `board_maintenance.py` - Database maintenance script
- `data_analysis.py` - Data processing script
- `performance_review.py` - Performance analysis script
- `root_cause_analysis.py` - Root cause analysis script
- `highest_leverage_recommendation.md` - Analysis report
- `implementation_plan.md` - Implementation documentation
- `PHASE_1_DEPLOYMENT_READY.md` - Deployment status
- `PHASE_4_APPLICATION_OPTIMIZATION.md` - Optimization plan

**Data Files (2 files):**
- `march_booked_sms_conversations.json` - Sample data export
- `Data Flow and Database Usage Report_ PTBiz SMS Insights.md` - Data documentation

**Temporary/Process Files (3 files):**
- `agent-handoff-20260324-092210.md` - Session handoff notes
- `INBOX_V2_COMPREHENSIVE_AUDIT.md` - Audit report
- `INBOX_V2_FIXES_IMPLEMENTED.md` - Implementation log

**Configuration Files (Already appropriate):**
- `.gitignore`, `.npmrc`, `package.json`, `tsconfig.json`, `biome.json` - Keep at root

### Directory Structure Issues
- `ptbiz_sms_asset_kit/` - Standalone asset package at root level (consider moving to `assets/`)
- `archive/` - Legacy code archive (appropriate location)
- Multiple documentation files scattered across root instead of `docs/`

## Proposed Organization Plan

### New Directory Structure
```
slack-sms-insights/
├── scripts/
│   ├── analysis/          # Data analysis and maintenance scripts
│   └── ...               # Other scripts
├── docs/
│   ├── reports/          # Analysis reports and audits
│   ├── data/             # Sample data files and documentation
│   └── handoffs/         # Session handoff notes
├── assets/               # Asset packages (ptbiz_sms_asset_kit/)
└── ...                   # Existing structure
```

### Prioritized Action Plan

#### P0 — Immediate (No Risk)
| Action | Details | Reason |
|--------|---------|--------|
| CREATE | `scripts/analysis/` | Group analysis and maintenance scripts |
| CREATE | `docs/reports/` | Centralize analysis reports |
| CREATE | `docs/data/` | Store data files and documentation |
| CREATE | `docs/handoffs/` | Organize session handoff notes |
| CREATE | `assets/` | Prepare for asset reorganization |

#### P1 — Low Risk (Reversible)
| Action | Source | Destination | Reason |
|--------|--------|-------------|--------|
| MOVE | `board_maintenance.py` | `scripts/analysis/board_maintenance.py` | Script belongs in organized scripts directory |
| MOVE | `data_analysis.py` | `scripts/analysis/data_analysis.py` | Script belongs in organized scripts directory |
| MOVE | `performance_review.py` | `scripts/analysis/performance_review.py` | Script belongs in organized scripts directory |
| MOVE | `root_cause_analysis.py` | `scripts/analysis/root_cause_analysis.py` | Script belongs in organized scripts directory |
| MOVE | `highest_leverage_recommendation.md` | `docs/reports/highest_leverage_recommendation.md` | Report belongs in documentation |
| MOVE | `implementation_plan.md` | `docs/reports/implementation_plan.md` | Report belongs in documentation |
| MOVE | `PHASE_1_DEPLOYMENT_READY.md` | `docs/reports/PHASE_1_DEPLOYMENT_READY.md` | Report belongs in documentation |
| MOVE | `PHASE_4_APPLICATION_OPTIMIZATION.md` | `docs/reports/PHASE_4_APPLICATION_OPTIMIZATION.md` | Report belongs in documentation |
| MOVE | `INBOX_V2_COMPREHENSIVE_AUDIT.md` | `docs/reports/INBOX_V2_COMPREHENSIVE_AUDIT.md` | Report belongs in documentation |
| MOVE | `INBOX_V2_FIXES_IMPLEMENTED.md` | `docs/reports/INBOX_V2_FIXES_IMPLEMENTED.md` | Report belongs in documentation |
| MOVE | `march_booked_sms_conversations.json` | `docs/data/march_booked_sms_conversations.json` | Sample data belongs in data directory |
| MOVE | `Data Flow and Database Usage Report_ PTBiz SMS Insights.md` | `docs/data/Data_Flow_and_Database_Usage_Report_PTbiz_SMS_Insights.md` | Data documentation belongs in data directory |
| MOVE | `agent-handoff-20260324-092210.md` | `docs/handoffs/agent-handoff-20260324-092210.md` | Handoff notes belong in handoffs directory |

#### P2 — Medium Risk (Needs Review)
| Action | Source | Destination | Reason |
|--------|--------|-------------|--------|
| MOVE | `ptbiz_sms_asset_kit/` | `assets/ptbiz_sms_asset_kit/` | Asset package belongs in assets directory |
| REVIEW | Root-level .md files | Evaluate which are permanent vs temporary | Some may be ready for archive/ |

#### P3 — High Risk (Future Consideration)
| Action | Details | Reason |
|--------|---------|--------|
| CONSOLIDATE | Multiple Prisma schemas | Merge sms-insights and apps/backend schemas |
| ARCHIVE | Temporary reports | Move old reports to archive/ after review |

## Safety Measures

### Pre-Execution Checklist
- [ ] Git status checked (no uncommitted changes)
- [ ] Backup manifest created
- [ ] Import paths verified (no hardcoded root references)
- [ ] Build passes before moves

### Execution Strategy
1. Execute P0 actions (directory creation)
2. Execute P1 actions in batches of 3-5 moves
3. Verify after each batch:
   - No broken imports
   - Scripts still executable from new locations
   - Documentation links still work
4. Commit each batch separately

### Rollback Plan
If issues arise:
```bash
git reset --hard HEAD~N  # Reset to before moves
# Or manually move files back
```

## Expected Outcomes
- Root clutter reduced from 35% to <10%
- Scripts organized in `scripts/analysis/`
- Documentation centralized in `docs/`
- Improved developer experience and project maintainability

## Next Steps
1. Review and approve this plan
2. Execute P0 and P1 actions
3. Update any documentation links if needed
4. Consider P2 actions for further cleanup

---
*Generated by project-folder-organizer skill on 2026-03-31*