# Schema Unification Plan - P1

## Executive Summary

This plan outlines the unification of two divergent Prisma schemas: the legacy `sms-insights/prisma/schema.prisma` (758 lines) and the modern `apps/backend/prisma/schema.prisma` (870 lines). The unified schema will consolidate all business models while resolving naming inconsistencies, enum differences, and structural conflicts.

**Key Challenges:**
- Enum differences (SmsDirection: inbound/outbound vs inbound/outbound/unknown)
- Model naming inconsistencies (conversations vs Conversation)
- Field structure differences (contact_id vs contact_key as primary keys)
- Overlapping functionality with different implementations
- Missing models in each schema

## Current Schema Analysis

### Legacy Schema (sms-insights/prisma/schema.prisma)
**Line count:** 758
**Key models:** 25+ models focused on coaching, PL imports, SMS compliance
**Enums:** SmsDirection (inbound/outbound), TcpaConsentStatus, OptOutMethod

### Modern Schema (apps/backend/prisma/schema.prisma)
**Line count:** 870
**Key models:** 40+ models focused on Monday.com integration, analytics facts, attribution
**Enums:** SmsDirection (inbound/outbound/unknown), ConversationStatus, CadenceStatus, etc.

## Unification Strategy

### 1. Enum Resolution
| Enum | Legacy | Modern | Unified Resolution |
|------|--------|--------|-------------------|
| SmsDirection | inbound, outbound | inbound, outbound, unknown | Add `unknown` to legacy |
| ConversationStatus | N/A | open, closed, archived | Keep modern |
| CadenceStatus | N/A | idle, active, paused | Keep modern |
| TcpaConsentStatus | OPTED_IN, OPTED_OUT, PENDING, UNKNOWN | N/A | Keep legacy |
| OptOutMethod | SMS_REPLY, LINK_CLICK, MANUAL, SYSTEM | N/A | Keep legacy |

### 2. Model Naming Standardization
| Legacy Name | Modern Name | Unified Name | Reasoning |
|-------------|-------------|--------------|-----------|
| conversations | Conversation | Conversation | Capitalize for consistency |
| inbox_contact_profiles | inbox_contact_profiles | InboxContactProfile | PascalCase model names |
| sms_events | sms_events | SmsEvent | PascalCase |
| send_attempts | send_attempts | SendAttempt | PascalCase |
| work_items | work_items | WorkItem | PascalCase |
| draft_suggestions | draft_suggestions | DraftSuggestion | PascalCase |

### 3. Primary Key Resolution
| Model | Legacy PK | Modern PK | Unified PK | Migration Strategy |
|-------|-----------|-----------|------------|-------------------|
| InboxContactProfile | contact_id (UUID) | contact_key (String) | contact_key (String) | Migrate legacy data |
| Conversation | id (UUID) | id (UUID) | id (UUID) | Compatible |
| SmsEvent | id (UUID) | id (UUID) | id (UUID) | Compatible |

### 4. Field Consolidation
**InboxContactProfile fields to merge:**
- Legacy: tcpa_consent_status, dnc_list_checked_at, gdpr_consent_status
- Modern: revenue_mix_category, employment_status, coaching_interest, tags
- Unified: Include all fields with appropriate defaults

**Conversation fields:**
- Legacy: has_active_consent, consent_verified_at, is_opted_out
- Modern: status, nextFollowupAt, metadata_updated_at
- Unified: Merge all compliance and status fields

## Implementation Plan

### Phase 1: Schema Merge (Week 1)
1. **Create unified schema file** (`prisma/schema.unified.prisma`)
2. **Resolve enum differences** - Add missing enum values
3. **Standardize model names** - Apply PascalCase convention
4. **Merge model fields** - Include all unique fields from both schemas
5. **Resolve relation conflicts** - Ensure consistent foreign key references

### Phase 2: Migration Preparation (Week 2)
1. **Data mapping analysis** - Identify data transformation needs
2. **Migration scripts** - Create scripts to transform legacy data
3. **Backup procedures** - Ensure data safety during migration
4. **Test migration** - Run on staging environment first

### Phase 3: Migration Execution (Week 3)
1. **Schema deployment** - Apply unified schema to database
2. **Data migration** - Transform and migrate legacy data
3. **Application updates** - Update code to use unified models
4. **Validation** - Verify data integrity and application functionality

### Phase 4: Cleanup (Week 4)
1. **Remove legacy schemas** - Delete old schema files
2. **Update imports** - Point all applications to unified schema
3. **Documentation** - Update schema documentation
4. **Monitoring** - Monitor for any issues post-migration

## Risk Mitigation

### Data Safety
- **Full database backup** before any schema changes
- **Staging environment testing** for migration scripts
- **Rollback procedures** documented and tested
- **Gradual rollout** with feature flags

### Application Compatibility
- **Import path updates** automated where possible
- **Type checking** after schema changes
- **Integration testing** for all affected endpoints
- **Gradual backend migration** (legacy → unified)

## Success Metrics

### Functional
- [ ] All existing API endpoints work with unified schema
- [ ] Data integrity maintained during migration
- [ ] No data loss during transformation
- [ ] All business logic continues to function

### Performance
- [ ] Query performance maintained or improved
- [ ] Database indexes preserved and optimized
- [ ] Migration completes within acceptable time window

### Developer Experience
- [ ] Single source of truth for database schema
- [ ] Consistent naming conventions applied
- [ ] Clear migration path documented
- [ ] Reduced cognitive load for schema changes

## Migration Scripts

### Required Scripts
1. **schema_unification.sql** - Database schema changes
2. **data_migration.sql** - Data transformation queries
3. **validation_queries.sql** - Post-migration data integrity checks
4. **rollback.sql** - Emergency rollback procedures

### Automation
- **Prisma migrate** for schema changes
- **Custom scripts** for data transformation
- **Validation scripts** for integrity checking

## Next Steps

1. **Week 1:** Create unified schema draft
2. **Week 2:** Develop and test migration scripts
3. **Week 3:** Execute migration in staging
4. **Week 4:** Production deployment and cleanup

This unification will eliminate schema drift, provide a single source of truth, and enable unified data access across all applications.