/**
 * Session Summary Generator
 * 
 * Uses OpenAI GPT-4o-mini to generate concise, actionable summaries
 * of coaching session transcripts for client review.
 */

import OpenAI from 'openai';
import { prisma } from '../db/prisma.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const SUMMARY_PROMPT = `You are analyzing a wellness coaching conversation between an AI coach and a client. Generate a concise summary focusing on:

1. Key topics discussed (2-3 main themes)
2. Client's emotional state (start vs end, 1-5 scale where 1=very low, 5=very good)
3. Breakthrough moments or insights
4. Action items or commitments the client made
5. Suggested focus areas for next session

Keep it under 200 words, actionable, and empathetic. Focus on the client's journey and progress.

Conversation Transcript:
{transcript}

Return ONLY valid JSON in this exact format:
{
  "summary": "string - overall session summary in 2-3 sentences",
  "keyTopics": ["string"] - array of 2-3 main topics,
  "clientMoodStart": number - 1 to 5,
  "clientMoodEnd": number - 1 to 5,
  "breakthroughMoments": ["string"] - significant insights or realizations,
  "clientCommitments": ["string"] - what the client committed to do,
  "suggestedFocusAreas": ["string"] - recommended areas for next session
}`;

interface SummaryResult {
  summary: string;
  keyTopics: string[];
  clientMoodStart: number;
  clientMoodEnd: number;
  breakthroughMoments: string[];
  clientCommitments: string[];
  suggestedFocusAreas: string[];
}

/**
 * Generate AI summary for a completed session
 * Runs asynchronously without blocking session completion
 */
export async function generateSessionSummary(
  sessionId: string,
  userId: string,
  transcript: string
): Promise<void> {
  const startTime = Date.now();
  try {
    console.log(`[Summary] 🤖 Generating summary for session ${sessionId}...`);

    // Skip if transcript is too short (less than 2 exchanges)
    const lineCount = transcript.split('\n').filter(line => line.trim()).length;
    if (lineCount < 2) {
      console.log(`[Summary] ⏭️ Skipping - transcript too short (${lineCount} lines, minimum 2)`);
      return;
    }

    // Truncate very long transcripts to stay within token limits
    const maxLines = 200; // ~5000 tokens for a typical session
    const lines = transcript.split('\n');
    const truncatedTranscript = lines.length > maxLines 
      ? lines.slice(0, maxLines).join('\n') + '\n... (transcript truncated)'
      : transcript;

    console.log(`[Summary] 📊 Transcript stats: ${lineCount} lines, ${transcript.length} chars`);

    console.log(`[Summary] 📤 Sending to OpenAI (gpt-4o-mini)...`);
    const apiStartTime = Date.now();

    // Call OpenAI GPT-4o-mini for cost-effective summarization
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are analyzing a wellness coaching conversation. Generate a concise summary. Be insightful even for short sessions.'
        },
        {
          role: 'user',
          content: SUMMARY_PROMPT.replace('{transcript}', truncatedTranscript)
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 600
    });

    console.log(`[Summary] 📥 OpenAI responded in ${Date.now() - apiStartTime}ms`);

    const content = completion.choices[0].message.content;
    if (!content) {
      throw new Error('No content in OpenAI response');
    }

    const result = JSON.parse(content) as SummaryResult;

    // Validate required fields
    if (!result.summary || !result.keyTopics) {
      throw new Error('Invalid summary format from OpenAI');
    }

    console.log(`[Summary] ✅ Summary generated: "${result.summary.substring(0, 60)}..."`);

    // Store in SessionInsight table (use upsert to avoid duplicates)
    await prisma.sessionInsight.upsert({
      where: { sessionId },
      create: {
        sessionId,
        userId,
        summary: result.summary,
        keyTopics: result.keyTopics || [],
        clientMoodStart: result.clientMoodStart || null,
        clientMoodEnd: result.clientMoodEnd || null,
        breakthroughMoments: result.breakthroughMoments || [],
        clientCommitments: result.clientCommitments || [],
        suggestedFocusAreas: result.suggestedFocusAreas || [],
        modelVersion: 'gpt-4o-mini',
        rawAnalysis: result as any
      },
      update: {
        summary: result.summary,
        keyTopics: result.keyTopics || [],
        clientMoodStart: result.clientMoodStart || null,
        clientMoodEnd: result.clientMoodEnd || null,
        breakthroughMoments: result.breakthroughMoments || [],
        clientCommitments: result.clientCommitments || [],
        suggestedFocusAreas: result.suggestedFocusAreas || [],
        modelVersion: 'gpt-4o-mini',
        rawAnalysis: result as any
      }
    });

    // Also update Session.aiSummary for quick access
    await prisma.session.update({
      where: { id: sessionId },
      data: { aiSummary: result.summary }
    });

    console.log(`[Summary] 💾 Stored SessionInsight for session ${sessionId}`);
    console.log(`[Summary] ✅ COMPLETE in ${Date.now() - startTime}ms`);

    // TODO: Notify client via WebSocket that summary is ready
    // This will be implemented when WebSocket notification system is added

  } catch (error) {
    console.error(`[Summary] ❌ Generation FAILED after ${Date.now() - startTime}ms:`, error);
    
    // Store error in session for debugging
    try {
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          aiSummary: `Error generating summary: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      });
    } catch (updateError) {
      console.error('[Summary] Failed to store error:', updateError);
    }
  }
}

/**
 * Get session summary for a user (for API endpoint)
 */
export async function getSessionSummary(sessionId: string, userId: string) {
  try {
    const insight = await prisma.sessionInsight.findUnique({
      where: { sessionId },
      select: {
        sessionId: true,
        userId: true,
        summary: true,
        keyTopics: true,
        breakthroughMoments: true,
        clientCommitments: true,
        suggestedFocusAreas: true,
        clientMoodStart: true,
        clientMoodEnd: true,
        generatedAt: true,
        session: {
          select: {
            startedAt: true,
            endedAt: true,
            durationMinutes: true
          }
        }
      }
    });

    if (!insight || insight.userId !== userId) {
      return null;
    }

    return {
      summary: insight.summary,
      keyTopics: insight.keyTopics,
      breakthroughMoments: insight.breakthroughMoments,
      clientCommitments: insight.clientCommitments,
      suggestedFocusAreas: insight.suggestedFocusAreas,
      clientMoodStart: insight.clientMoodStart,
      clientMoodEnd: insight.clientMoodEnd,
      session: insight.session,
      generatedAt: insight.generatedAt
    };
  } catch (error) {
    console.error('[Summary] Failed to fetch summary:', error);
    return null;
  }
}
