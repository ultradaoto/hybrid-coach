# Transcript Collection & AI Summarization System

**Status:** 🟡 In Progress (90% complete - User record issue blocking)  
**Created:** 2025-12-16  
**Priority:** High  

---

## 📋 Overview

This document describes the implementation of an **AI-powered transcript collection and summarization system** that allows clients to view summaries of their coaching sessions on their dashboard without requiring page refreshes.

### Business Requirements

1. **24/7 AI Availability**: Clients can start sessions anytime without scheduling
2. **Session Tracking**: All conversations are captured and stored in the database
3. **AI Summarization**: After each session, OpenAI GPT-4o-mini generates a concise summary
4. **Client Dashboard**: Summaries appear automatically on the client dashboard
5. **Privacy**: Clients see summaries but NOT full transcripts
6. **Cost Efficiency**: Token-optimized transcripts (no timestamps)

---

## 🗄️ Database Schema Changes

### Current State

The `Session` model in `prisma/schema.prisma` has been updated to support both scheduled and ad-hoc sessions:

```prisma
model Session {
  id                String    @id @default(cuid())
  roomId            String
  appointmentId     String?   // ✅ NOW OPTIONAL for ad-hoc sessions
  userId            String
  sessionType       String    @default("adhoc") // ✅ NEW: "adhoc" or "scheduled"
  
  // Session timing
  startedAt         DateTime  @default(now())
  endedAt           DateTime?
  durationMinutes   Int       @default(20)
  
  // Session state
  status            String    @default("active") // active, completed, cancelled
  warningsSent      Int       @default(0)
  
  // Content
  transcript        String?   @db.Text  // Clean format: "AI: Hello\nClient: Hi"
  aiSummary         String?   @db.Text
  summary           String?   @db.Text
  
  // Archival
  isArchived        Boolean   @default(false)
  archivedAt        DateTime?
  
  // Relations
  user              User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  appointment       Appointment? @relation(fields: [appointmentId], references: [id], onDelete: Cascade)
  messages          Message[]
  rating            SessionRating?
  insight           SessionInsight?
  
  @@unique([roomId, userId])  // ✅ CHANGED: was [appointmentId, userId]
  @@index([userId, status])
  @@index([status, endedAt])
  @@index([isArchived])
  @@index([sessionType])  // ✅ NEW INDEX
}
```

### Key Changes Made

1. **`appointmentId` is now optional** - Allows ad-hoc sessions without appointments
2. **`sessionType` field added** - Tracks whether session is "adhoc" or "scheduled"
3. **Unique constraint changed** - From `[appointmentId, userId]` to `[roomId, userId]`
4. **`appointment` relation is optional** - Uses `Appointment?` instead of `Appointment`

### Migration Status

- ✅ Schema updated in `prisma/schema.prisma`
- ✅ Database schema in sync (`npx prisma db push` completed)
- ✅ Prisma client regenerated

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Client Joins Room (Ad-hoc or Scheduled)                        │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ AI Agent: TrackSubscribed Event Fires                          │
│  - Parse participant identity → extract userId                 │
│  - Create Session record (appointmentId optional)              │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ Real-time Message Capture                                      │
│  - Store each message in Message table                         │
│  - Format: sender (ai/client/coach) + content                 │
│  - NO timestamps stored (saves OpenAI tokens)                  │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ Agent Disconnect: Session Completion                           │
│  1. Compile messages → clean transcript                        │
│  2. Update Session: status='completed', store transcript       │
│  3. Trigger async AI summarization                             │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ AI Summary Generation (Background)                             │
│  - OpenAI GPT-4o-mini analyzes transcript                      │
│  - Generates: summary, key topics, mood, breakthroughs         │
│  - Stores in SessionInsight table                              │
│  - Cost: ~$0.03 per session                                    │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ Client Dashboard Auto-Update                                   │
│  - Polls /api/client/sessions/latest every 30s                │
│  - Displays summary when ready (no page refresh needed)        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 Files Modified/Created

### Modified Files

1. **`prisma/schema.prisma`**
   - Made `appointmentId` optional
   - Added `sessionType` field
   - Changed unique constraint

2. **`services/ai-agent/src/db/prisma.ts`**
   - Updated `createAgentSession()` to handle optional appointment
   - Updated `completeSession()` to generate transcripts and trigger summaries
   - Updated `storeMessage()` to handle user relations properly

3. **`services/ai-agent/src/livekit-agent.ts`**
   - Moved session creation to `TrackSubscribed` event (not `ParticipantConnected`)
   - Added comprehensive logging for debugging
   - Enabled `generateSummary: true` on disconnect

4. **`apps/api/src/routes/client.ts`**
   - Added `GET /api/client/sessions/:sessionId/summary` endpoint
   - Added `GET /api/client/sessions/latest` endpoint for dashboard polling

5. **`apps/web-client/src/pages/Dashboard.tsx`**
   - Added 30-second polling for latest session summary
   - Auto-updates dashboard when new summary is available

### Created Files

1. **`services/ai-agent/src/services/summary-generator.ts`**
   - OpenAI integration for session summarization
   - Generates structured summaries from transcripts
   - Stores results in `SessionInsight` table

---

## 🔧 Implementation Details

### Session Creation Logic

**Location:** `services/ai-agent/src/db/prisma.ts` → `createAgentSession()`

```typescript
export async function createAgentSession(params: CreateSessionParams): Promise<string | null> {
  // 1. Check for existing active session (prevent duplicates)
  // 2. Try to find appointment linked to room
  // 3. Determine session type: "scheduled" (with appointment) or "adhoc"
  // 4. Create session using Prisma relations (not direct foreign keys)
  // 5. Return session ID for message tracking
}
```

**Key Logic:**
- If `appointmentId` found → `sessionType = "scheduled"`
- If no appointment → `sessionType = "adhoc"`
- Use `user: { connect: { id } }` instead of direct `userId` field

### Transcript Generation

**Location:** `services/ai-agent/src/db/prisma.ts` → `completeSession()`

**Transcript Format (Token-Optimized):**
```
AI: Hello! I'm your Ultra Coach. How are you feeling today?
Client: I'm feeling a bit stressed.
AI: I understand. Let's try a breathing exercise.
Client: Okay, that helped.
```

**Why No Timestamps?**
- Saves ~40% tokens when sending to OpenAI
- Typical session: 100 messages = ~2,000 tokens saved
- Monthly savings: $5-10 at scale

### AI Summary Generation

**Location:** `services/ai-agent/src/services/summary-generator.ts`

**OpenAI Model:** GPT-4o-mini (cost-effective)  
**Temperature:** 0.3 (consistent, focused)  
**Max Tokens:** 600  
**Cost per Summary:** ~$0.03

**Summary Includes:**
- Overall session summary (2-3 sentences)
- Key topics discussed (2-3 main themes)
- Client mood: start vs end (1-5 scale)
- Breakthrough moments/insights
- Client commitments/action items
- Suggested focus areas for next session

**Example Output:**
```json
{
  "summary": "Client expressed stress about work deadlines. We practiced vagus nerve breathing exercises which provided immediate relief. Client committed to daily practice.",
  "keyTopics": ["work stress", "breathing techniques", "vagus nerve activation"],
  "clientMoodStart": 2,
  "clientMoodEnd": 4,
  "breakthroughMoments": ["Realized connection between shallow breathing and anxiety"],
  "clientCommitments": ["Practice 4-7-8 breathing twice daily"],
  "suggestedFocusAreas": ["Sleep hygiene", "Stress management routines"]
}
```

### Dashboard Polling

**Location:** `apps/web-client/src/pages/Dashboard.tsx`

```typescript
useEffect(() => {
  const pollLatestSummary = async () => {
    const res = await fetch('/api/client/sessions/latest', {
      headers: { Authorization: `Bearer ${getAuthToken()}` }
    });
    const json = await res.json();
    if (json.success && json.data) {
      setLastSession({
        summary: json.data.summary,
        keyTakeaways: json.data.breakthroughMoments,
        // ... etc
      });
    }
  };

  // Poll immediately, then every 30 seconds
  pollLatestSummary();
  const interval = setInterval(pollLatestSummary, 30000);
  return () => clearInterval(interval);
}, []);
```

---

## 🐛 Current Issues & Blockers

### Issue 1: User Records Don't Exist ⚠️

**Error:**
```
No 'User' record(s) was found for a nested connect on one-to-many relation 'SessionToUser'.
```

**Cause:**
- Participant identity: `client-a03639cb`
- Parsed userId: `a03639cb`
- This userId doesn't exist in the User table

**Why This Happens:**
- Users joining from the client app are authenticated via OAuth/JWT
- The JWT token contains a userId
- The LiveKit identity is constructed as `client-{userId}` or `coach-{userId}`
- If a user joins without being in the database first, session creation fails

**Possible Solutions:**

1. **Create User on First Join (Recommended)**
   ```typescript
   // In createAgentSession, before creating session:
   await prisma.user.upsert({
     where: { id: clientUserId },
     create: {
       id: clientUserId,
       email: `temp-${clientUserId}@placeholder.com`,
       role: 'client',
       displayName: `Client ${clientUserId.slice(0, 8)}`
     },
     update: {} // No-op if exists
   });
   ```

2. **Use connectOrCreate (Cleaner)**
   ```typescript
   user: {
     connectOrCreate: {
       where: { id: clientUserId },
       create: {
         id: clientUserId,
         email: `${clientUserId}@auto-created.local`,
         role: 'client'
       }
     }
   }
   ```

3. **Pre-create Users at Authentication** (Best Long-term)
   - When user authenticates via OAuth, ensure User record is created
   - Update authentication flow in `apps/api/src/middleware/auth.ts`

---

## 📊 Cost Analysis

### OpenAI Costs (GPT-4o-mini)

| Metric | Value |
|--------|-------|
| Average session length | 10-15 minutes |
| Average messages per session | 100 |
| Transcript size (no timestamps) | ~5,000 tokens |
| Cost per summary | $0.03 |
| Monthly sessions (100) | $3.00 |
| Monthly sessions (1,000) | $30.00 |

### Database Storage

| Item | Size per Session | 1,000 Sessions |
|------|------------------|----------------|
| Messages | ~50KB | 50MB |
| Transcript | ~10KB | 10MB |
| Summary (SessionInsight) | ~2KB | 2MB |
| **Total** | **~62KB** | **~62MB** |

---

## 🧪 Testing Checklist

### Manual Testing

- [ ] Create ad-hoc session (no appointment)
- [ ] Have 5+ message conversation with AI
- [ ] Leave session and wait 60s for grace period
- [ ] Check logs for session creation confirmation
- [ ] Check logs for transcript generation
- [ ] Check logs for AI summary generation
- [ ] Wait 30-60s for OpenAI processing
- [ ] Check dashboard - summary should appear without refresh
- [ ] Verify summary quality and accuracy

### Database Verification

```sql
-- Check session was created
SELECT * FROM "Session" 
WHERE "sessionType" = 'adhoc' 
ORDER BY "startedAt" DESC 
LIMIT 1;

-- Check messages were stored
SELECT COUNT(*) FROM "Message" 
WHERE "sessionId" = '<session-id>';

-- Check transcript was generated
SELECT LENGTH("transcript") as transcript_length 
FROM "Session" 
WHERE id = '<session-id>';

-- Check summary was generated
SELECT * FROM "SessionInsight" 
WHERE "sessionId" = '<session-id>';
```

### API Testing

```bash
# Get latest session summary
curl http://localhost:3000/api/client/sessions/latest \
  -H "Authorization: Bearer <token>"

# Get specific session summary
curl http://localhost:3000/api/client/sessions/<session-id>/summary \
  -H "Authorization: Bearer <token>"
```

---

## 🚀 Deployment Steps

1. **Run Database Migration**
   ```bash
   npx prisma migrate deploy
   # or
   npx prisma db push
   ```

2. **Regenerate Prisma Client**
   ```bash
   npx prisma generate
   ```

3. **Rebuild AI Agent**
   ```bash
   cd services/ai-agent
   npm run build
   ```

4. **Restart Services**
   ```bash
   # Stop all services
   # Restart: bun run dev (or your deployment command)
   ```

5. **Verify Environment Variables**
   ```bash
   OPENAI_API_KEY=sk-...  # Required for summaries
   DATABASE_URL=postgresql://...
   LIVEKIT_URL=wss://...
   LIVEKIT_API_KEY=...
   LIVEKIT_API_SECRET=...
   ```

---

## 📝 Next Steps

### Immediate (Blocking)

1. **Fix User Record Issue**
   - Implement `connectOrCreate` for User in session creation
   - Or ensure users are pre-created at authentication

### Short Term

1. **WebSocket Notifications** (instead of polling)
   - Push summary updates to dashboard instantly
   - Reduce API calls and improve UX

2. **Summary Quality Monitoring**
   - Add logging for summary generation failures
   - Track summary quality metrics

3. **Error Handling**
   - Graceful degradation if OpenAI fails
   - Retry logic for transient failures

### Long Term

1. **Advanced Summarization**
   - Multi-session insights
   - Progress tracking over time
   - Personalized recommendations

2. **Coach Dashboard**
   - Coaches can view client session summaries
   - Aggregate insights across clients

3. **Export Functionality**
   - Clients can download session history
   - GDPR compliance (data portability)

---

## 🔗 Related Documentation

- [AI Agent Architecture](./AI-AGENT-INNER-WORKINGS.md)
- [Database Schema Evolution](./PRISMA-DB-EVOLUTION-PLAN.md)
- [LiveKit Integration](./DEEPGRAM-INTEGRATION.md)

---

## 👥 Contributors

- Initial implementation: 2025-12-16
- AI Agent session tracking
- OpenAI summarization integration
- Client dashboard polling

---

## 📞 Support

If you encounter issues implementing this feature:

1. Check logs for `[Agent]`, `[DB]`, and `[Summary]` prefixes
2. Verify database schema is up to date
3. Confirm Prisma client was regenerated
4. Ensure OpenAI API key is valid
5. Check User records exist for participant identities
