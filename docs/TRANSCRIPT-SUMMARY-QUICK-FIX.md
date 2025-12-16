# Transcript Summary Quick Fix v3

**Purpose:** Complete end-to-end fix for transcript collection and AI summarization  
**Priority:** 🔴 Critical  
**Estimated Time:** 20 minutes  
**Status:** Messages now storing ✅ → Summary threshold blocking ❌

---

## 📊 Current State (What's Working)

Based on latest logs, **message storage is now working**:

```
[DB] 💬 Found 4 messages           ✅ Messages ARE being stored!
[DB] 📄 Generated transcript: 92 characters  ✅ Transcript generated!
[DB] 🤖 Initiating AI summary generation...
[Summary] 🤖 Generating summary for session cmj89xaif0000w7hqh3hkbcrp...
[Summary] ⏭️ Skipping - transcript too short (4 lines)  ❌ BLOCKED HERE
```

**The Problem Now:** The summary generator has a minimum threshold that rejects short conversations.

---

## 🎯 Issues to Fix

| Issue | Status | Fix |
|-------|--------|-----|
| Message storage | ✅ Fixed | `userId` direct field |
| Session creation | ✅ Working | `connectOrCreate` |
| Summary threshold | ❌ Blocking | Lower minimum or remove check |
| Dashboard polling | ⚠️ Untested | Verify API endpoint |

---

## 🔧 Fix 1: Summary Generator Threshold

### File: `services/ai-agent/src/services/summary-generator.ts`

Find the threshold check and adjust it:

#### FIND THIS PATTERN:

```typescript
// Look for something like:
const MIN_LINES = 10;  // or MIN_MESSAGES or similar
// or
if (lines.length < 10) {
  console.log(`[Summary] ⏭️ Skipping - transcript too short`);
  return;
}
// or
if (transcript.split('\n').length < 5) {
  // skip
}
```

#### REPLACE WITH:

```typescript
// Option A: Lower the threshold significantly
const MIN_LINES = 2;  // Allow very short conversations

// Option B: Check character count instead of lines
const MIN_CHARS = 50;  // ~10 words minimum
if (transcript.length < MIN_CHARS) {
  console.log(`[Summary] ⏭️ Skipping - transcript too short (${transcript.length} chars < ${MIN_CHARS})`);
  return;
}

// Option C: Remove the check entirely for testing
// (comment out the threshold check)
```

---

## 📋 Complete Fixed `summary-generator.ts`

Here's a comprehensive rewrite of the summary generator:

```typescript
// services/ai-agent/src/services/summary-generator.ts

import OpenAI from 'openai';
import { prisma } from '../db/prisma';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configuration
const CONFIG = {
  MIN_TRANSCRIPT_CHARS: 30,      // Minimum ~6 words (was probably 10+ lines)
  MIN_TRANSCRIPT_LINES: 2,       // At least 2 exchanges
  MODEL: 'gpt-4o-mini',
  MAX_TOKENS: 600,
  TEMPERATURE: 0.3,
};

interface SummaryResult {
  summary: string;
  keyTopics: string[];
  clientMoodStart: number;
  clientMoodEnd: number;
  breakthroughMoments: string[];
  clientCommitments: string[];
  suggestedFocusAreas: string[];
}

export async function generateSessionSummary(
  sessionId: string,
  transcript: string
): Promise<void> {
  console.log(`[Summary] 🤖 Generating summary for session ${sessionId}...`);
  console.log(`[Summary] 📊 Transcript stats: ${transcript.length} chars, ${transcript.split('\n').length} lines`);

  // Validation with clear logging
  if (!transcript || transcript.trim().length === 0) {
    console.log(`[Summary] ⏭️ Skipping - empty transcript`);
    return;
  }

  const lines = transcript.split('\n').filter(l => l.trim().length > 0);
  
  if (lines.length < CONFIG.MIN_TRANSCRIPT_LINES) {
    console.log(`[Summary] ⏭️ Skipping - too few exchanges (${lines.length} < ${CONFIG.MIN_TRANSCRIPT_LINES})`);
    // Still save a basic summary for short sessions
    await saveBasicSummary(sessionId, transcript, lines.length);
    return;
  }

  if (transcript.length < CONFIG.MIN_TRANSCRIPT_CHARS) {
    console.log(`[Summary] ⏭️ Skipping - too short (${transcript.length} < ${CONFIG.MIN_TRANSCRIPT_CHARS} chars)`);
    await saveBasicSummary(sessionId, transcript, lines.length);
    return;
  }

  try {
    console.log(`[Summary] 📤 Sending to OpenAI (${CONFIG.MODEL})...`);
    
    const completion = await openai.chat.completions.create({
      model: CONFIG.MODEL,
      temperature: CONFIG.TEMPERATURE,
      max_tokens: CONFIG.MAX_TOKENS,
      messages: [
        {
          role: 'system',
          content: `You are a wellness coaching assistant. Analyze this coaching session transcript and provide a structured summary. Be concise but insightful.

Return JSON in this exact format:
{
  "summary": "2-3 sentence overview of the session",
  "keyTopics": ["topic1", "topic2", "topic3"],
  "clientMoodStart": 1-5,
  "clientMoodEnd": 1-5,
  "breakthroughMoments": ["insight1", "insight2"],
  "clientCommitments": ["commitment1"],
  "suggestedFocusAreas": ["area1", "area2"]
}

If the session is very short, still provide what insights you can.`
        },
        {
          role: 'user',
          content: `Session transcript:\n\n${transcript}`
        }
      ],
      response_format: { type: 'json_object' }
    });

    const responseText = completion.choices[0]?.message?.content;
    
    if (!responseText) {
      console.error(`[Summary] ❌ Empty response from OpenAI`);
      await saveBasicSummary(sessionId, transcript, lines.length);
      return;
    }

    console.log(`[Summary] 📥 Received response from OpenAI`);
    
    const result: SummaryResult = JSON.parse(responseText);
    
    // Save to SessionInsight table
    await prisma.sessionInsight.upsert({
      where: { sessionId },
      create: {
        sessionId,
        summary: result.summary,
        keyTopics: result.keyTopics,
        clientMoodStart: result.clientMoodStart,
        clientMoodEnd: result.clientMoodEnd,
        breakthroughMoments: result.breakthroughMoments,
        clientCommitments: result.clientCommitments,
        suggestedFocusAreas: result.suggestedFocusAreas,
      },
      update: {
        summary: result.summary,
        keyTopics: result.keyTopics,
        clientMoodStart: result.clientMoodStart,
        clientMoodEnd: result.clientMoodEnd,
        breakthroughMoments: result.breakthroughMoments,
        clientCommitments: result.clientCommitments,
        suggestedFocusAreas: result.suggestedFocusAreas,
      }
    });

    // Also update the Session.aiSummary field for quick access
    await prisma.session.update({
      where: { id: sessionId },
      data: { aiSummary: result.summary }
    });

    console.log(`[Summary] ✅ Summary saved for session ${sessionId}`);
    console.log(`[Summary] 📝 "${result.summary.slice(0, 100)}..."`);

  } catch (error) {
    console.error(`[Summary] ❌ Failed to generate summary:`, error);
    
    // Save error state so we know it was attempted
    await prisma.session.update({
      where: { id: sessionId },
      data: { aiSummary: '[Summary generation failed - will retry]' }
    }).catch(() => {});
  }
}

/**
 * Save a basic summary for very short sessions
 * This ensures SOMETHING appears on the dashboard
 */
async function saveBasicSummary(
  sessionId: string,
  transcript: string,
  lineCount: number
): Promise<void> {
  console.log(`[Summary] 💾 Saving basic summary for short session...`);
  
  const basicSummary = lineCount <= 2
    ? 'Brief check-in session. Client connected but conversation was minimal.'
    : `Short session with ${lineCount} exchanges. ${extractFirstTopic(transcript)}`;

  try {
    await prisma.sessionInsight.upsert({
      where: { sessionId },
      create: {
        sessionId,
        summary: basicSummary,
        keyTopics: [],
        clientMoodStart: 3,
        clientMoodEnd: 3,
        breakthroughMoments: [],
        clientCommitments: [],
        suggestedFocusAreas: [],
      },
      update: {
        summary: basicSummary,
      }
    });

    await prisma.session.update({
      where: { id: sessionId },
      data: { aiSummary: basicSummary }
    });

    console.log(`[Summary] ✅ Basic summary saved: "${basicSummary}"`);
  } catch (error) {
    console.error(`[Summary] ❌ Failed to save basic summary:`, error);
  }
}

/**
 * Extract a simple topic from short transcript
 */
function extractFirstTopic(transcript: string): string {
  const clientLines = transcript
    .split('\n')
    .filter(l => l.startsWith('Client:'))
    .map(l => l.replace('Client:', '').trim());
  
  if (clientLines.length === 0) return 'No client responses recorded.';
  
  const firstResponse = clientLines[0];
  if (firstResponse.length < 20) return `Client greeted: "${firstResponse}"`;
  
  return `Client discussed: "${firstResponse.slice(0, 50)}..."`;
}
```

---

## 🔧 Fix 2: Verify `completeSession` Triggers Summary

### File: `services/ai-agent/src/db/prisma.ts`

Make sure `completeSession` actually calls the summary generator:

```typescript
export async function completeSession(params: {
  sessionId: string;
  generateTranscript?: boolean;
  generateSummary?: boolean;
}): Promise<void> {
  const { sessionId, generateTranscript = true, generateSummary = true } = params;

  console.log(`[DB] 📊 Starting session completion for: ${sessionId}`);
  console.log(`[DB] Options: transcript=${generateTranscript}, summary=${generateSummary}`);

  try {
    // Get session info
    const session = await prisma.session.findUnique({
      where: { id: sessionId }
    });

    if (!session) {
      console.error(`[DB] ❌ Session not found: ${sessionId}`);
      return;
    }

    console.log(`[DB] ✅ Found session for user: ${session.userId}`);

    // Calculate duration
    const startTime = session.startedAt;
    const endTime = new Date();
    const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
    console.log(`[DB] ⏱️ Session duration: ${durationMinutes} minutes`);

    let transcript = '';

    if (generateTranscript) {
      console.log(`[DB] 📝 Fetching messages for transcript...`);
      
      const messages = await prisma.message.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' }
      });

      console.log(`[DB] 💬 Found ${messages.length} messages`);

      // Generate clean transcript
      transcript = messages
        .map(m => {
          const speaker = m.sender === 'ai' ? 'AI' : 
                         m.sender === 'coach' ? 'Coach' : 'Client';
          return `${speaker}: ${m.content}`;
        })
        .join('\n');

      console.log(`[DB] 📄 Generated transcript: ${transcript.length} characters`);
    }

    // Update session
    console.log(`[DB] 💾 Updating session status to completed...`);
    
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        status: 'completed',
        endedAt: endTime,
        durationMinutes,
        transcript: transcript || null,
      }
    });

    console.log(`[DB] ✅ Session completed: ${sessionId} (${durationMinutes} min)`);

    // Generate AI summary
    if (generateSummary && transcript) {
      console.log(`[DB] 🤖 Initiating AI summary generation...`);
      
      // Import dynamically to avoid circular dependencies
      const { generateSessionSummary } = await import('../services/summary-generator');
      
      // Run in background - don't await
      generateSessionSummary(sessionId, transcript)
        .then(() => {
          console.log(`[DB] ✅ AI summary generation completed`);
        })
        .catch((err) => {
          console.error(`[DB] ❌ AI summary generation failed:`, err);
        });
      
      console.log(`[DB] 🚀 AI summary generation started in background`);
    } else {
      console.log(`[DB] ⏭️ Skipping summary: generateSummary=${generateSummary}, hasTranscript=${!!transcript}`);
    }

  } catch (error) {
    console.error(`[DB] ❌ Session completion failed:`, error);
  }
}
```

---

## 🔧 Fix 3: Verify Dashboard API Endpoint

### File: `apps/api/src/routes/client.ts`

Ensure the `/api/client/sessions/latest` endpoint returns summary data:

```typescript
// GET /api/client/sessions/latest
router.get('/sessions/latest', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get most recent completed session with insight
    const session = await prisma.session.findFirst({
      where: {
        userId,
        status: 'completed',
      },
      orderBy: { endedAt: 'desc' },
      include: {
        insight: true,  // Include SessionInsight relation
      }
    });

    if (!session) {
      return res.json({ success: true, data: null });
    }

    // Return summary data for dashboard
    res.json({
      success: true,
      data: {
        sessionId: session.id,
        endedAt: session.endedAt,
        durationMinutes: session.durationMinutes,
        // Summary from SessionInsight or fallback to aiSummary
        summary: session.insight?.summary || session.aiSummary || null,
        keyTopics: session.insight?.keyTopics || [],
        breakthroughMoments: session.insight?.breakthroughMoments || [],
        clientMoodStart: session.insight?.clientMoodStart || null,
        clientMoodEnd: session.insight?.clientMoodEnd || null,
        // Don't expose full transcript to client
        hasTranscript: !!session.transcript,
      }
    });

  } catch (error) {
    console.error('[API] Error fetching latest session:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch session' });
  }
});
```

---

## 🔧 Fix 4: Ensure SessionInsight Model Exists

### File: `prisma/schema.prisma`

Verify the SessionInsight model is defined:

```prisma
model SessionInsight {
  id                  String   @id @default(cuid())
  sessionId           String   @unique
  summary             String?  @db.Text
  keyTopics           String[] @default([])
  clientMoodStart     Int?
  clientMoodEnd       Int?
  breakthroughMoments String[] @default([])
  clientCommitments   String[] @default([])
  suggestedFocusAreas String[] @default([])
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  session             Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)
}

model Session {
  // ... existing fields ...
  
  // Add this relation if missing:
  insight             SessionInsight?
}
```

After schema changes:
```bash
npx prisma db push
npx prisma generate
```

---

## ✅ Complete Verification Checklist

### Step 1: Rebuild Everything

```bash
# From project root
npx prisma generate
cd services/ai-agent && npm run build
```

### Step 2: Test Session Flow

1. Join a room as client
2. Have a conversation (at least 3-4 exchanges)
3. Leave the room
4. Wait 60s for grace period

### Step 3: Check Logs For This Sequence

```
[DB] 💬 Found 4 messages                    ✅
[DB] 📄 Generated transcript: 150 characters ✅
[DB] 🤖 Initiating AI summary generation...  ✅
[Summary] 🤖 Generating summary for session...
[Summary] 📤 Sending to OpenAI...            ✅ (not "Skipping")
[Summary] ✅ Summary saved for session...    ✅
```

### Step 4: Database Verification

```sql
-- Check SessionInsight was created
SELECT 
  si.id,
  si."sessionId",
  si.summary,
  si."keyTopics",
  s."endedAt"
FROM "SessionInsight" si
JOIN "Session" s ON s.id = si."sessionId"
ORDER BY si."createdAt" DESC
LIMIT 5;

-- Check Session.aiSummary was updated
SELECT id, "aiSummary", status, "endedAt"
FROM "Session"
WHERE status = 'completed'
ORDER BY "endedAt" DESC
LIMIT 5;
```

### Step 5: Test Dashboard API

```bash
# Get auth token from your app, then:
curl http://localhost:3000/api/client/sessions/latest \
  -H "Authorization: Bearer YOUR_TOKEN"

# Should return:
# {
#   "success": true,
#   "data": {
#     "sessionId": "cmj89xaif...",
#     "summary": "Brief coaching session...",
#     "keyTopics": ["greeting"],
#     ...
#   }
# }
```

---

## 🔍 Debugging: If Summary Still Doesn't Appear

### Check 1: OpenAI API Key

```bash
# Verify env var is set
echo $OPENAI_API_KEY

# Or check in the agent startup logs
```

### Check 2: SessionInsight Table Exists

```bash
npx prisma studio
# Navigate to SessionInsight table
```

### Check 3: Add More Logging

Temporarily add verbose logging to summary-generator.ts:

```typescript
console.log(`[Summary] DEBUG: About to call OpenAI`);
console.log(`[Summary] DEBUG: Transcript = "${transcript}"`);
```

### Check 4: Test OpenAI Directly

```typescript
// Quick test script
import OpenAI from 'openai';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const test = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Say hello' }]
});
console.log(test.choices[0].message.content);
```

---

## 📝 Summary of All Changes

| File | Change | Purpose |
|------|--------|---------|
| `db/prisma.ts` → `storeMessage()` | `userId: string` direct | Fix message storage |
| `db/prisma.ts` → `completeSession()` | Enhanced logging | Debug flow |
| `services/summary-generator.ts` | Lower threshold + basic fallback | Allow short sessions |
| `prisma/schema.prisma` | Verify SessionInsight model | Store summaries |
| `routes/client.ts` | Include insight relation | Return to dashboard |

---

## 🚀 Quick Copy-Paste Commands

```bash
# 1. Apply schema changes
npx prisma db push && npx prisma generate

# 2. Rebuild agent
cd services/ai-agent && npm run build && cd ../..

# 3. Restart everything
# (your restart command - probably bun run dev or similar)

# 4. Test
# Join room, chat, leave, wait 60s, check dashboard
```

---

*v3 - Updated 2025-12-16 - Addresses summary threshold blocking issue*