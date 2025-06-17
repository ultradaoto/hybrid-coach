import OpenAI from 'openai';
import { prisma } from '../lib/prisma.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function chat(userMessage, userId, sessionId) {
  let systemPrompt = `You are Hybrid Coach AI. Speak in clear, matter-of-fact sentences that can be read aloud. Do NOT use markdown, asterisks, bullet symbols, or any special formatting—plain text only. The human coach is present on the call and will step in when needed, so you don't need to remind the client about that in every reply.

If the client's profile includes recent check-in data (sleep, mood, supplement adherence, etc.) weave relevant follow-up questions into the conversation so progress can be tracked. Provide practical, evidence-based suggestions and defer to the human coach only when medical oversight is obviously required.`;

  if (userId) {
    const profile = await prisma.profile.findUnique({ where: { userId } });
    if (profile?.bioJson) {
      systemPrompt += `\nClient profile: ${JSON.stringify(profile.bioJson)}`;
    }

    if (sessionId) {
      const lastMessages = await prisma.message.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
      const context = lastMessages.reverse().map(m => `${m.sender}: ${m.content}`).join('\n');
      if (context) systemPrompt += `\nConversation so far:\n${context}`;
    }
  }

  console.log('[GPT prompt]', systemPrompt);

  const completion = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  });
  return completion.choices[0].message.content.trim();
} 