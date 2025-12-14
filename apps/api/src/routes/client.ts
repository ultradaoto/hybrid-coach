import type { AuthUser } from '../middleware/auth';
import { jsonResponse } from '../middleware/cors';
import { 
  createAppointment, 
  getAppointmentsForClient, 
  updateAppointment,
  getDefaultCoachId,
  type Appointment 
} from '../db/appointments';

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

  return jsonResponse({ success: false, error: 'Not Found' }, { status: 404 });
}
