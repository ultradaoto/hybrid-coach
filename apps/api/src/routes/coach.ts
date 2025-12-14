import type { AuthUser } from '../middleware/auth';
import { jsonResponse } from '../middleware/cors';

type CoachUser = AuthUser & {
  displayName?: string;
  isAvailable?: boolean;
};

type Meeting = { summary: string; start: string };

type Appointment = {
  id: string;
  roomId: string;
  scheduledFor: string;
  status: 'scheduled' | 'cancelled' | 'reassigned';
  client?: { id: string; displayName?: string; email?: string };
};

const coachAvailability = new Map<string, boolean>();
const coachAppointments = new Map<string, Appointment[]>();

function getAppointments(coachId: string) {
  return coachAppointments.get(coachId) ?? [];
}

function setAppointments(coachId: string, appts: Appointment[]) {
  coachAppointments.set(coachId, appts);
}

export async function coachRoutes(req: Request, user: AuthUser): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  if (path === '/api/coach/dashboard' && method === 'GET') {
    const isAvailable = coachAvailability.get(user.id) ?? false;
    const coachUser: CoachUser = {
      ...user,
      role: user.role ?? 'coach',
      displayName: user.email?.split('@')[0] ?? 'Coach',
      isAvailable,
    };

    const appointments = getAppointments(user.id).sort(
      (a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime()
    );

    const meetings: Meeting[] = [];

    return jsonResponse({
      success: true,
      data: {
        user: coachUser,
        calendarConnected: false,
        meetings,
        appointments,
      },
    });
  }

  if (path === '/api/coach/toggle-availability' && method === 'POST') {
    const current = coachAvailability.get(user.id) ?? false;
    coachAvailability.set(user.id, !current);
    return jsonResponse({ success: true, data: { isAvailable: !current } });
  }

  if (path === '/api/coach/reassign-appointment' && method === 'POST') {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ success: false, error: 'Invalid JSON' }, { status: 400 });
    }

    const appointmentId = body?.appointmentId;
    if (typeof appointmentId !== 'string' || !appointmentId) {
      return jsonResponse({ success: false, error: 'Missing appointmentId' }, { status: 400 });
    }

    const current = getAppointments(user.id);
    const next = current.map((a) => (a.id === appointmentId ? { ...a, status: 'reassigned' as const } : a));
    setAppointments(user.id, next);
    return jsonResponse({ success: true });
  }

  return jsonResponse({ success: false, error: 'Not Found' }, { status: 404 });
}
