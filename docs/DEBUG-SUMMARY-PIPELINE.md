# Debug: Summary Pipeline Investigation

**Problem:** Summary generation starts but agent exits before OpenAI responds  
**Evidence:** `[Summary] 📤 Sending to OpenAI...` followed immediately by `Goodbye!`  
**Root Cause:** Async summary not awaited before process shutdown  

---

## 🔍 Step 1: Find the Async Issue

### File to check: `services/ai-agent/src/db/prisma.ts`

Look for `completeSession` function. Find the summary generation call:

```typescript
// FIND THIS PATTERN - fire and forget (WRONG)
generateSessionSummary(sessionId, transcript)
  .then(() => console.log('done'))
  .catch((err) => console.error(err));

console.log(`[DB] 🚀 AI summary generation started in background`);
// Function returns immediately, process can exit
```

**The Problem:** The function doesn't wait for the summary to finish.

---

## 🔧 Step 2: Fix - Await the Summary Generation

### Option A: Make completeSession await the summary

```typescript
export async function completeSession(params: {
  sessionId: string;
  generateTranscript?: boolean;
  generateSummary?: boolean;
}): Promise<void> {
  const { sessionId, generateTranscript = true, generateSummary = true } = params;

  console.log(`[DB] 📊 Starting session completion for: ${sessionId}`);

  try {
    // ... existing code to fetch messages and generate transcript ...

    // Update session status FIRST
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        status: 'completed',
        endedAt: new Date(),
        durationMinutes,
        transcript: transcript || null,
      }
    });

    console.log(`[DB] ✅ Session marked complete: ${sessionId}`);

    // Generate AI summary - AWAIT IT!
    if (generateSummary && transcript && transcript.length > 30) {
      console.log(`[DB] 🤖 Generating AI summary (awaiting completion)...`);
      
      const { generateSessionSummary } = await import('../services/summary-generator');
      
      // ✅ AWAIT the summary generation
      await generateSessionSummary(sessionId, transcript);
      
      console.log(`[DB] ✅ AI summary generation completed`);
    }

  } catch (error) {
    console.error(`[DB] ❌ Session completion failed:`, error);
  }
}
```

### Option B: If completeSession is called from agent shutdown

Check `services/ai-agent/src/livekit-agent.ts` or similar for where completeSession is called:

```typescript
// FIND THIS PATTERN
async disconnect() {
  // ... cleanup code ...
  
  // This might not be awaited!
  completeSession({ sessionId, generateSummary: true });
  
  // Process exits here
}
```

**FIX:**

```typescript
async disconnect() {
  // ... cleanup code ...
  
  // ✅ AWAIT the session completion including summary
  await completeSession({ sessionId, generateSummary: true });
  
  console.log('[Agent] ✅ Session fully completed with summary');
  // NOW process can exit
}
```

---

## 🔍 Step 3: Trace the Call Chain

Run these searches to find the flow:

```bash
# Find where completeSession is called
grep -rn "completeSession" services/ai-agent/src/

# Find where generateSessionSummary is called
grep -rn "generateSessionSummary" services/ai-agent/src/

# Find the disconnect/cleanup logic
grep -rn "disconnect\|cleanup\|shutdown" services/ai-agent/src/
```

### Expected call chain:
```
Agent disconnect/cleanup
  → completeSession()
    → generateSessionSummary()  ← Must be awaited
      → OpenAI API call (2-5 seconds)
      → prisma.sessionInsight.upsert()
      → prisma.session.update({ aiSummary })
```

---

## 🔍 Step 4: Add Debugging to summary-generator.ts

### File: `services/ai-agent/src/services/summary-generator.ts`

Add timestamps to see if the function completes:

```typescript
export async function generateSessionSummary(
  sessionId: string,
  transcript: string
): Promise<void> {
  const startTime = Date.now();
  console.log(`[Summary] 🤖 START generating summary for ${sessionId}`);
  console.log(`[Summary] 📊 Transcript: ${transcript.length} chars, ${transcript.split('\n').length} lines`);

  try {
    // Validation
    if (!transcript || transcript.trim().length < 30) {
      console.log(`[Summary] ⏭️ Skipping - transcript too short`);
      return;
    }

    console.log(`[Summary] 📤 Calling OpenAI API...`);
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 600,
      messages: [
        {
          role: 'system',
          content: `You are a wellness coaching assistant. Analyze this coaching session and return JSON:
{
  "summary": "2-3 sentence overview",
  "keyTopics": ["topic1", "topic2"],
  "clientMoodStart": 1-5,
  "clientMoodEnd": 1-5,
  "breakthroughMoments": [],
  "clientCommitments": [],
  "suggestedFocusAreas": []
}`
        },
        {
          role: 'user',
          content: `Transcript:\n${transcript}`
        }
      ],
      response_format: { type: 'json_object' }
    });

    console.log(`[Summary] 📥 OpenAI responded in ${Date.now() - startTime}ms`);

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      console.error(`[Summary] ❌ Empty OpenAI response`);
      return;
    }

    const result = JSON.parse(responseText);
    console.log(`[Summary] 📝 Parsed result: "${result.summary?.slice(0, 50)}..."`);

    // Save to SessionInsight
    console.log(`[Summary] 💾 Saving to SessionInsight...`);
    await prisma.sessionInsight.upsert({
      where: { sessionId },
      create: {
        sessionId,
        summary: result.summary,
        keyTopics: result.keyTopics || [],
        clientMoodStart: result.clientMoodStart,
        clientMoodEnd: result.clientMoodEnd,
        breakthroughMoments: result.breakthroughMoments || [],
        clientCommitments: result.clientCommitments || [],
        suggestedFocusAreas: result.suggestedFocusAreas || [],
      },
      update: {
        summary: result.summary,
        keyTopics: result.keyTopics || [],
        clientMoodStart: result.clientMoodStart,
        clientMoodEnd: result.clientMoodEnd,
        breakthroughMoments: result.breakthroughMoments || [],
        clientCommitments: result.clientCommitments || [],
        suggestedFocusAreas: result.suggestedFocusAreas || [],
      }
    });
    console.log(`[Summary] ✅ SessionInsight saved`);

    // Also update Session.aiSummary for quick access
    console.log(`[Summary] 💾 Updating Session.aiSummary...`);
    await prisma.session.update({
      where: { id: sessionId },
      data: { aiSummary: result.summary }
    });

    console.log(`[Summary] ✅ COMPLETE in ${Date.now() - startTime}ms`);

  } catch (error) {
    console.error(`[Summary] ❌ FAILED after ${Date.now() - startTime}ms:`, error);
  }
}
```

---

## 🔍 Step 5: Check Dashboard API

### File: `apps/api/src/routes/client.ts`

Find the endpoint that serves dashboard data. Search for:

```bash
grep -rn "sessions/latest\|dashboard\|summary" apps/api/src/routes/
```

### Verify it includes the insight relation:

```typescript
// GET /api/client/sessions/latest (or similar)
router.get('/sessions/latest', authenticateToken, async (req, res) => {
  const userId = req.user.id;

  const session = await prisma.session.findFirst({
    where: {
      userId,
      status: 'completed',
    },
    orderBy: { endedAt: 'desc' },
    include: {
      insight: true,  // ← MUST include this!
    }
  });

  if (!session) {
    return res.json({ success: true, data: null });
  }

  res.json({
    success: true,
    data: {
      sessionId: session.id,
      endedAt: session.endedAt,
      durationMinutes: session.durationMinutes,
      // Check BOTH sources for summary
      summary: session.insight?.summary || session.aiSummary || null,
      keyTopics: session.insight?.keyTopics || [],
      breakthroughMoments: session.insight?.breakthroughMoments || [],
    }
  });
});
```

---

## 🔍 Step 6: Check Database Directly

After a test session, run these queries:

```sql
-- Check if Session has transcript and aiSummary
SELECT 
  id, 
  status,
  "endedAt",
  LENGTH(transcript) as transcript_len,
  "aiSummary"
FROM "Session" 
WHERE status = 'completed'
ORDER BY "endedAt" DESC 
LIMIT 3;

-- Check if SessionInsight exists
SELECT 
  si.id,
  si."sessionId",
  si.summary,
  si."keyTopics"
FROM "SessionInsight" si
ORDER BY si."createdAt" DESC
LIMIT 3;

-- Join to see full picture
SELECT 
  s.id as session_id,
  s.status,
  s."aiSummary",
  si.summary as insight_summary,
  si."keyTopics"
FROM "Session" s
LEFT JOIN "SessionInsight" si ON si."sessionId" = s.id
WHERE s.status = 'completed'
ORDER BY s."endedAt" DESC
LIMIT 3;
```

---

## 🔍 Step 7: Check Dashboard Component

### File: `apps/web-client/src/pages/Dashboard.tsx` (or similar)

Find where it fetches and displays session data:

```bash
grep -rn "summary\|lastSession\|insight" apps/web-client/src/
```

Check:
1. Is it calling the right API endpoint?
2. Is it parsing the response correctly?
3. Is it showing loading state while fetching?

```typescript
// Example of what to look for:
const [lastSession, setLastSession] = useState(null);

useEffect(() => {
  const fetchLatest = async () => {
    const res = await fetch('/api/client/sessions/latest', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    console.log('[Dashboard] Latest session data:', data); // Add this!
    if (data.success && data.data) {
      setLastSession(data.data);
    }
  };
  
  fetchLatest();
  // Maybe also poll every 30s
}, []);

// In render:
{lastSession?.summary ? (
  <p>{lastSession.summary}</p>
) : (
  <p>No session summary yet.</p>
)}
```

---

## ✅ Expected Outcome After Fixes

Console should show:

```
[Summary] 🤖 START generating summary for cmj8aa8ed...
[Summary] 📊 Transcript: 500 chars, 11 lines
[Summary] 📤 Calling OpenAI API...
[Summary] 📥 OpenAI responded in 2341ms           ← Should see this!
[Summary] 📝 Parsed result: "The client discussed..."
[Summary] 💾 Saving to SessionInsight...
[Summary] ✅ SessionInsight saved
[Summary] 💾 Updating Session.aiSummary...
[Summary] ✅ COMPLETE in 2567ms                   ← Should see this!
[DB] ✅ AI summary generation completed
[Agent] ✅ Session fully completed with summary
[LiveKitAgent] 👋 Goodbye!                        ← NOW it can exit
```

---

## 📋 Quick Checklist

1. [ ] Find where `completeSession` is called in agent shutdown
2. [ ] Ensure it's `await completeSession(...)` not just `completeSession(...)`
3. [ ] Ensure `generateSessionSummary` is awaited inside `completeSession`
4. [ ] Add debug logging to see OpenAI response time
5. [ ] Check database for SessionInsight records
6. [ ] Check dashboard API includes `insight` relation
7. [ ] Check dashboard component logs the API response

---

## 🚀 Quick Test After Fix

```bash
# 1. Rebuild
cd services/ai-agent && npm run build

# 2. Start fresh
# (restart your dev server)

# 3. Join room, chat, leave

# 4. Watch for these log lines:
# [Summary] 📥 OpenAI responded in XXXms
# [Summary] ✅ COMPLETE in XXXms

# 5. Check database
npx prisma studio
# Look at SessionInsight table

# 6. Refresh dashboard
```

---

*Debug guide for Cursor AI - 2025-12-16*