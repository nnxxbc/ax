# Implementation Plan — NFC Completion Fix + Flexible User-Created Checkpoint System

This plan addresses the HTTP 500 error during NFC completion and refactors the checkpoint/routine logic to be fully flexible and user-configurable.

## User Review Required

> [!IMPORTANT]
> The data model already contains `isRequired` and `isRepeatable` fields in `checkpointsTable`. I will leverage these to support cycle completion logic and repeatable tasks.
> The HTTP 500 is likely caused by a missing import of `real` in `checkpoint_sessions.ts`.

## Proposed Changes

### Database & Types
- Fix missing `real` import in [checkpoint_sessions.ts](file:///C:/Users/81806/ax/lib/db/src/schema/checkpoint_sessions.ts).
- Update [api.ts](file:///C:/Users/81806/ax/lib/api-zod/src/generated/api.ts) (if needed, though it's generated, I might need to update the source if I can find it, or just ensure the backend returns the expected shape).

### API Server — NFC Scan Processor
- Refactor [nfc-scan-processor.ts](file:///C:/Users/81806/ax/artifacts/api-server/src/lib/nfc-scan-processor.ts):
    - Allow starting a new session even if all pre-created sessions for that checkpoint are completed (supporting repeatable tasks).
    - Ensure scanning *any* tag works regardless of order.
- Update [routine-helpers.ts](file:///C:/Users/81806/ax/artifacts/api-server/src/lib/routine-helpers.ts):
    - Improve cycle completion calculation (all `isRequired` checkpoints must be `completed` at least once).

### API Server — Routes
- Add/Update routes in [checkpoints.ts](file:///C:/Users/81806/ax/artifacts/api-server/src/routes/checkpoints.ts) and [nfc.ts](file:///C:/Users/81806/ax/artifacts/api-server/src/routes/nfc.ts) to support user-created checkpoints and tag assignment.

### Frontend
- Improve logging in [home.tsx](file:///C:/Users/81806/ax/artifacts/transition-assistant/src/pages/home.tsx) to show full error details.
- Ensure the UI handles arbitrary order and multiple completions correctly.

## Verification Plan

### Automated Tests
- I will use `simulateScan` to test the state machine transitions.
- Test 1: Start checkpoint (waiting -> in_progress).
- Test 2: Complete checkpoint (in_progress -> completed).
- Test 3: Repeat checkpoint (create new session, status = in_progress).
- Test 4: Cycle completion check.

### Manual Verification
- Deploy to Android and verify physical NFC scan transitions.
- Test adding a new checkpoint in Settings and assigning a tag.
