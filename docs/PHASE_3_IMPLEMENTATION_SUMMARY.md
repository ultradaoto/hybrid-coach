# Phase 3: AI Agent Database Integration - Implementation Summary

## ✅ Completed Tasks

### 1. Database Helper Files Created
- **`services/ai-agent/src/db/prisma.ts`** - Core database functions:
  - `createAgentSession()` - Creates session when agent joins room
  - `storeMessage()` - Stores transcript messages in real-time
  - `completeSession()` - Marks session complete with duration and transcript
  - `parseParticipantIdentity()` - Extracts role and userId from identity
  - `cleanupAbandonedSessions()` - Cleans up crashed sessions on startup
  
- **`services/ai-agent/src/db/index.ts`** - Export barrel file

### 2. LiveKitAgent Integration
Modified **`services/ai-agent/src/livekit-agent.ts`**:

- **Added imports** (line 50-56):
  - Database functions imported from `./db/index.js`

- **Added session tracking properties** (line 166-174):
  ```typescript
  private dbSessionId: string | null = null;
  private messageBuffer: Array<{...}> = [];
  private isStoringMessages: boolean = true;
  ```

- **Hook in connect() method** (line 233-266):
  - Cleans up abandoned sessions for the room
  - Finds primary user from room participants
  - Creates database session
  - Logs session ID

- **Hook in broadcastTranscript() method** (line 1083-1125):
  - Changed method to `async`
  - Stores messages in database when session is active
  - Maps roles (assistant → ai, coach → coach, user → client)
  - Buffers messages on failure for retry

- **Hook in disconnect() method** (line 1220-1250):
  - Flushes buffered messages
  - Generates transcript from messages
  - Completes session with duration
  - Cleans up session ID

- **Updated event handler** (line 426-428):
  - Made conversation-text handler async
  - Awaits broadcastTranscript call

### 3. Startup Cleanup
Modified **`services/ai-agent/src/index.ts`** (line 280-285):
- Added import for `cleanupAbandonedSessions`
- Cleans up abandoned sessions on agent startup
- Logs cleanup count

### 4. Schema Updates
Modified **`prisma/schema.prisma`**:
- Made `Session.appointmentId` optional (line 123)
- Made `Message.userId` optional (line 171)
- Made `Session.appointment` relation optional (line 146)
- Made `Message.user` relation optional (line 177)
- Removed unique constraint on `[appointmentId, userId]` (was causing issues with nulls)
- Added index on `appointmentId` for performance

### 5. Test Script
Created **`services/ai-agent/test-db.ts`**:
- Comprehensive database integration test
- Tests session creation without appointments
- Tests message creation with and without userId
- Tests session completion
- Tests cleanup functions
- Includes detailed output and troubleshooting

---

## 🔧 Required Next Steps

### Step 1: Start PostgreSQL Database
Ensure your PostgreSQL server is running:
```bash
# Check if running (Windows)
Get-Service postgresql*

# Or check connection
psql -U hybridcoach -d hybridcoach_dev -h localhost
```

### Step 2: Apply Schema Changes
Run the migration to update the database schema:

```bash
cd C:\Users\ultra\Documents\Websites\MyUltraCoach

# Option A: Create a migration (recommended for production)
npx prisma migrate dev --name phase3_optional_appointment_and_user

# Option B: Push changes directly (faster for development)
npx prisma db push
```

### Step 3: Regenerate Prisma Client (if needed)
```bash
npx prisma generate
```

### Step 4: Run Database Test
Verify everything works:
```bash
cd services/ai-agent
npx tsx test-db.ts
```

Expected output:
```
=============================================================
🧪 Phase 3 Database Integration Test
=============================================================

Test 1: Testing database connection...
✅ Connected! User count: X

Test 2: Creating test session (without appointment)...
✅ Session created: abc123

...

✅ ALL TESTS PASSED!
```

### Step 5: Test with Real AI Agent
Start the AI agent and join a room:
```bash
cd services/ai-agent
npm run dev test-room-123
```

Watch the console for:
```
[Startup] Checking for abandoned sessions...
[Agent] Database session initialized: xyz789
[DB] 💬 Message stored: client - "Hello AI..."
[DB] 💬 Message stored: ai - "Hello! How can I help..."
[Agent] Database session completed: xyz789 (5 min)
```

### Step 6: Verify in Admin Dashboard
Check that transcripts appear in the admin interface:
```bash
curl http://127.0.0.1:3699/api/admin/transcripts | jq '.[0]'
```

Should show:
- Real `messageCount` (not 0)
- Session duration
- Transcript data

---

## 📊 Database Schema Changes

### Session Model
```prisma
model Session {
  appointmentId  String?  // ← Now optional (was required)
  // ... other fields unchanged
  
  appointment    Appointment? @relation(...)  // ← Now optional relation
}
```

**Why:** Sessions can exist without appointments for ad-hoc coaching calls.

### Message Model
```prisma
model Message {
  userId   String?  // ← Now optional (was required)
  // ... other fields unchanged
  
  user     User? @relation(...)  // ← Now optional relation
}
```

**Why:** AI messages don't have a userId - only human messages do.

---

## 🔍 Verification Queries

### Check recent sessions
```sql
SELECT 
  id,
  "roomId",
  "userId",
  status,
  "startedAt",
  "endedAt",
  "durationMinutes"
FROM "Session"
WHERE "startedAt" > NOW() - INTERVAL '1 day'
ORDER BY "startedAt" DESC;
```

### Check messages for a session
```sql
SELECT 
  id,
  sender,
  LEFT(content, 50) as content_preview,
  "createdAt"
FROM "Message"
WHERE "sessionId" = 'YOUR_SESSION_ID'
ORDER BY "createdAt" ASC;
```

### Session statistics
```sql
SELECT 
  status,
  COUNT(*) as count,
  AVG("durationMinutes") as avg_duration
FROM "Session"
WHERE "startedAt" > NOW() - INTERVAL '7 days'
GROUP BY status;
```

---

## 🎯 Success Criteria

Phase 3 is complete when:

- [x] Database helper files created
- [x] LiveKitAgent class integrated with database
- [x] Session creation on room join
- [x] Real-time message storage
- [x] Session completion on disconnect
- [x] Startup cleanup of abandoned sessions
- [x] Schema updated for optional fields
- [x] Test script created
- [ ] **Schema migration applied** ← YOU ARE HERE
- [ ] **Test script passes**
- [ ] **Real agent test shows data in DB**
- [ ] **Admin dashboard shows transcripts**

---

## 🐛 Troubleshooting

### "Cannot find module '@prisma/client'"
```bash
cd services/ai-agent
npm install @prisma/client
```

### "Authentication failed against database"
Check `.env` file has correct `DATABASE_URL`:
```
DATABASE_URL="postgresql://hybridcoach:PASSWORD@localhost:5432/hybridcoach_dev?schema=public"
```

### "Messages not appearing in database"
1. Check `dbSessionId` is set (agent logs show "Database session initialized")
2. Check `isStoringMessages` is true
3. Check transcript entries have `isFinal: true`
4. Check database connection is active

### "Session not completing"
1. Ensure `disconnect()` is being called
2. Check console for "Failed to complete database session" errors
3. Verify session ID still exists in database

---

## 📁 Files Modified

| File | Changes |
|------|---------|
| `services/ai-agent/src/db/prisma.ts` | CREATE - Database helpers |
| `services/ai-agent/src/db/index.ts` | CREATE - Export barrel |
| `services/ai-agent/src/livekit-agent.ts` | MODIFY - Add DB integration hooks |
| `services/ai-agent/src/index.ts` | MODIFY - Add startup cleanup |
| `prisma/schema.prisma` | MODIFY - Make fields optional |
| `services/ai-agent/test-db.ts` | CREATE - Integration test |

---

## 📚 References

- **Phase 3 Guide**: `docs/NOVA_3_MEDICAL_UPGRADE.md` (if exists)
- **Prisma Docs**: https://www.prisma.io/docs
- **LiveKit Agent**: `services/ai-agent/README.md`

---

**Document Created:** December 14, 2025  
**Implementation Status:** Code Complete - Awaiting Database Migration  
**Next Action:** Run `npx prisma db push` or `npx prisma migrate dev`
