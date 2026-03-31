# TODO: Fix TypeScript Compilation Errors

**Approved Plan Execution - 260 errors to fix**

## Remaining Steps:
### 1. Create TODO.md [✅ COMPLETE]

### 2. Fix services/inbox-store.ts [✅ 16/16 errors fixed]
- ✅ prisma.draftSuggestions, conversionExamples
- ✅ Stubbed conversation_notes/message_templates  
- ✅ status: {set: status}

### 3. Fix services/kpi-facts-fixed.ts (18 errors) 
- All snake_case → camelCase (sequenceRegistry, smsEvents, etc.)
- Type map(row: any) → proper interfaces
- Handle missing fact tables w/ raw SQL

**Progress: 1/8 steps complete**

### 4. Fix services/monday-store.ts (6 errors)
- mondayBoardRegistry, actorDirectory → create if missing
- monday_call_snapshots → mondayCallSnapshots
- Import fixes

### 5. Fix services/sequences-deep-fixed.ts (4 errors)
- factBookingDaily, sequenceRegistry, factMondayHealthDaily, smsEvents

### 6. Fix services/sequence-registry.ts (4 errors)
- sequenceAliases, sequenceRegistry

### 7. Global fixes
- src/app.ts: create aloware.controller.js stub
- src/lib/prisma.ts: remove bad imports
- All services: enum {set:}, implicit any, Zod/NextFunction imports

### 8. Finalize & test
```
cd apps/backend
npx prisma generate
npx tsc --noEmit  
npm run build
```

**Progress: 0/8 steps complete**

