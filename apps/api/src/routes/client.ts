import type { AuthUser } from '../middleware/auth';
import { jsonResponse } from '../middleware/cors';
import { 
  createAppointment, 
  getAppointmentsForClient, 
  updateAppointment,
  getDefaultCoachId,
  type Appointment 
} from '../db/appointments';
import { prisma } from '../db/prisma';

type Slot = { iso: string; label: string };

type AssignedCoach = {
  name: string;
  title: string;
  specialties: string[];
  avatar: string;
};

type LastSession = {
  startedAt: string | null;
  durationMinutes: number | null;
  summary: string | null;
  keyTakeaways: string[];
  nextSteps: string[];
};

type WeeklyRecommendation = {
  id: string;
  title: string;
  duration: string;
  instructions: string;
  category: 'breath' | 'cold' | 'movement' | 'reflection' | 'sleep' | 'nutrition';
};

const lastSessionByUser = new Map<string, LastSession>();

function makeDefaultSlots(): Slot[] {
  const now = Date.now();
  const day = 86400000;
  return [
    { iso: new Date(now + day).toISOString(), label: 'Tomorrow 10:00 AM' },
    { iso: new Date(now + 2 * day).toISOString(), label: 'Day After Tomorrow 2:00 PM' },
    { iso: new Date(now + 3 * day).toISOString(), label: 'In 3 Days 9:00 AM' },
  ];
}

function makeAssignedCoach(_user: AuthUser): AssignedCoach {
  // Dev placeholder until coach assignment + membership sync are wired.
  return {
    name: 'Ultra Coach',
    title: 'Vagus Health Coach',
    avatar: '🧠',
    specialties: ['Vagus nerve regulation', 'Breathwork', 'Stress resilience', 'Sleep routines'],
  };
}

function makeWeeklyRecommendations(): WeeklyRecommendation[] {
  return [
    {
      id: crypto.randomUUID(),
      title: '2-minute physiological sigh',
      duration: '2 min',
      category: 'breath',
      instructions: 'Two short inhales through the nose + one long exhale. Repeat for 2 minutes.',
    },
    {
      id: crypto.randomUUID(),
      title: 'Post-meal 10-minute walk',
      duration: '10 min',
      category: 'movement',
      instructions: 'Easy pace. Focus on nasal breathing and relaxed shoulders.',
    },
    {
      id: crypto.randomUUID(),
      title: 'Evening downshift (screen-off)',
      duration: '20 min',
      category: 'sleep',
      instructions: 'Dim lights, no screens. Try a warm shower + slow exhales (1:2 inhale:exhale).',
    },
    {
      id: crypto.randomUUID(),
      title: '1-line reflection',
      duration: '1 min',
      category: 'reflection',
      instructions: 'Write: “What helped my nervous system today?” (one honest sentence).',
    },
  ];
}

export async function clientRoutes(req: Request, user: AuthUser): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  if (path === '/api/client/dashboard' && method === 'GET') {
    const appointments = getAppointmentsForClient(user.id);

    const assignedCoach = makeAssignedCoach(user);
    const lastSession = lastSessionByUser.get(user.id) ?? {
      startedAt: null,
      durationMinutes: null,
      summary: null,
      keyTakeaways: [],
      nextSteps: [],
    };

    return jsonResponse({
      success: true,
      data: {
        user,
        assignedCoach,
        currentWeekFocus: 'Calm strength (steady energy, fewer spikes)',
        weeklyRecommendations: makeWeeklyRecommendations(),
        lastSession,
        calendarConnected: false,
        slots: makeDefaultSlots(),
        appointments,
        elevenlabsAgentId: process.env.ELEVENLABS_AGENT_ID ?? 'agent_01jy88zv6zfe1a9v9zdxt69abd',
      },
    });
  }

  if (path === '/api/client/room/create' && method === 'POST') {
    const roomId = crypto.randomUUID();
    return jsonResponse({ success: true, data: { roomId, joinPath: `/room/${roomId}` } });
  }

  if (path === '/api/client/appointments' && method === 'GET') {
    const appointments = getAppointmentsForClient(user.id);
    return jsonResponse({ success: true, data: appointments });
  }

  if (path === '/api/client/appointments' && method === 'POST') {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ success: false, error: 'Invalid JSON' }, { status: 400 });
    }

    const slot = body?.slot;
    if (typeof slot !== 'string' || !slot) {
      return jsonResponse({ success: false, error: 'Missing slot' }, { status: 400 });
    }

    // Create appointment with client info and assign to default coach
    const appt = createAppointment({
      roomId: crypto.randomUUID(),
      scheduledFor: slot,
      status: 'scheduled',
      clientId: user.id,
      clientEmail: user.email,
      clientName: user.email?.split('@')[0] ?? 'Client',
      // Assign to default coach so it shows on their dashboard
      coachId: getDefaultCoachId(),
      coachEmail: 'ultradaoto@gmail.com',
      coachName: 'Ultra Coach',
    });

    return jsonResponse({ success: true, data: appt }, { status: 201 });
  }

  const cancelMatch = path.match(/^\/api\/client\/appointments\/([^/]+)\/cancel$/);
  if (cancelMatch && method === 'POST') {
    const appointmentId = cancelMatch[1];
    updateAppointment(appointmentId, { status: 'cancelled' });
    return jsonResponse({ success: true });
  }

  // GET /api/client/sessions/:sessionId/summary - Fetch AI-generated session summary
  const summaryMatch = path.match(/^\/api\/client\/sessions\/([^/]+)\/summary$/);
  if (summaryMatch && method === 'GET') {
    const sessionId = summaryMatch[1];
    
    try {
      // Fetch session insight
      const insight = await prisma.sessionInsight.findUnique({
        where: { sessionId },
        include: {
          session: {
            select: {
              startedAt: true,
              endedAt: true,
              durationMinutes: true,
              sessionType: true,
              userId: true
            }
          }
        }
      });

      // Check if insight exists and belongs to requesting user
      if (!insight || insight.session.userId !== user.id) {
        return jsonResponse({ 
          success: false, 
          error: 'Session summary not found' 
        }, { status: 404 });
      }

      return jsonResponse({
        success: true,
        data: {
          summary: insight.summary,
          keyTopics: insight.keyTopics,
          breakthroughMoments: insight.breakthroughMoments,
          clientCommitments: insight.clientCommitments,
          suggestedFocusAreas: insight.suggestedFocusAreas,
          clientMoodStart: insight.clientMoodStart,
          clientMoodEnd: insight.clientMoodEnd,
          session: {
            startedAt: insight.session.startedAt.toISOString(),
            endedAt: insight.session.endedAt?.toISOString() || null,
            durationMinutes: insight.session.durationMinutes,
            sessionType: insight.session.sessionType
          },
          generatedAt: insight.generatedAt.toISOString()
        }
      });
    } catch (error) {
      console.error('[API] Failed to fetch session summary:', error);
      return jsonResponse({ 
        success: false, 
        error: 'Failed to fetch session summary' 
      }, { status: 500 });
    }
  }

  // GET /api/client/sessions/latest - Get latest session summary for dashboard
  if (path === '/api/client/sessions/latest' && method === 'GET') {
    try {
      console.log(`[API] 🔍 Fetching latest session for userId: "${user.id}" (email: ${user.email})`);
      
      // Debug: List all completed sessions
      const allSessions = await prisma.session.findMany({
        where: { status: 'completed' },
        orderBy: { endedAt: 'desc' },
        take: 5,
        select: { id: true, userId: true, roomId: true }
      });
      console.log(`[API] 📊 Recent completed sessions:`, allSessions.map(s => ({ id: s.id.slice(0,8), userId: s.userId, room: s.roomId.slice(0,8) })));
      
      // Find most recent completed session for this user
      const latestSession = await prisma.session.findFirst({
        where: {
          userId: user.id,
          status: 'completed'
        },
        orderBy: { endedAt: 'desc' },
        include: {
          insight: true
        }
      });

      console.log(`[API] Found session:`, latestSession ? {
        id: latestSession.id,
        userId: latestSession.userId,
        status: latestSession.status,
        hasInsight: !!latestSession.insight
      } : 'null');

      if (!latestSession) {
        console.log(`[API] No completed sessions found for user ${user.id}`);
        return jsonResponse({
          success: true,
          data: null
        });
      }

      if (!latestSession.insight) {
        console.log(`[API] Session ${latestSession.id} has no insight relation`);
        return jsonResponse({
          success: true,
          data: null
        });
      }

      return jsonResponse({
        success: true,
        data: {
          sessionId: latestSession.id,
          summary: latestSession.insight.summary,
          keyTopics: latestSession.insight.keyTopics,
          breakthroughMoments: latestSession.insight.breakthroughMoments,
          startedAt: latestSession.startedAt.toISOString(),
          endedAt: latestSession.endedAt?.toISOString() || null,
          durationMinutes: latestSession.durationMinutes
        }
      });
    } catch (error) {
      console.error('[API] Failed to fetch latest session:', error);
      return jsonResponse({ 
        success: false, 
        error: 'Failed to fetch latest session' 
      }, { status: 500 });
    }
  }

  return jsonResponse({ success: false, error: 'Not Found' }, { status: 404 });
}
