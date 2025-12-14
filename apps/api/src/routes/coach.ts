import type { AuthUser } from '../middleware/auth';
import { jsonResponse } from '../middleware/cors';
import { 
  getAppointmentsForCoach, 
  unassignCoachFromAppointment,
  getDefaultCoachId,
  type Appointment 
} from '../db/appointments';

type CoachUser = AuthUser & {
  displayName?: string;
  isAvailable?: boolean;
};

type Meeting = { summary: string; start: string };

// Format appointment for coach view (includes client info)
type CoachAppointmentView = {
  id: string;
  roomId: string;
  scheduledFor: string;
  status: string;
  client?: { id: string; displayName?: string; email?: string };
};

const coachAvailability = new Map<string, boolean>();

function formatAppointmentForCoach(appt: Appointment): CoachAppointmentView {
  return {
    id: appt.id,
    roomId: appt.roomId,
    scheduledFor: appt.scheduledFor,
    status: appt.status,
    client: {
      id: appt.clientId,
      displayName: appt.clientName,
      email: appt.clientEmail,
    },
  };
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

    // Get appointments assigned to this coach OR to the default coach ID
    // This handles the case where appointments are assigned via email or ID
    const defaultCoachId = getDefaultCoachId();
    let rawAppointments = getAppointmentsForCoach(user.id);
    
    // Also check if this is the default coach email (ultradaoto@gmail.com)
    if (user.email === 'ultradaoto@gmail.com') {
      const defaultAppointments = getAppointmentsForCoach(defaultCoachId);
      // Merge, avoiding duplicates
      const seen = new Set(rawAppointments.map(a => a.id));
      for (const appt of defaultAppointments) {
        if (!seen.has(appt.id)) {
          rawAppointments.push(appt);
        }
      }
    }
    
    // Format for coach view
    const appointments = rawAppointments
      .filter(a => a.status !== 'cancelled') // Only show active appointments
      .map(formatAppointmentForCoach);

    const meetings: Meeting[] = [];

    console.log('[Coach Dashboard]', user.email, 'has', appointments.length, 'appointments');

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

    // Remove coach assignment (returns to pool)
    unassignCoachFromAppointment(appointmentId);
    return jsonResponse({ success: true });
  }

  return jsonResponse({ success: false, error: 'Not Found' }, { status: 404 });
}
