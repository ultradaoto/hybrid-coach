import type { AuthUser } from '../middleware/auth';
import { jsonResponse } from '../middleware/cors';
import { 
  getAppointmentsForCoach, 
  unassignCoachFromAppointment,
  getDefaultCoachId,
  getAllAppointments,
  type Appointment 
} from '../db/appointments';

type CoachUser = AuthUser & {
  displayName?: string;
  isAvailable?: boolean;
};

// Format appointment for coach view (includes client info)
type CoachAppointmentView = {
  id: string;
  roomId: string;
  scheduledFor: string;
  status: string;
  client?: { id: string; displayName?: string; email?: string };
};

type ActiveRoom = {
  roomId: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  startedAt: string;
  hasAiAgent: boolean;
};

type ClientInfo = {
  id: string;
  email: string;
  displayName: string;
  isOnline: boolean;
  lastSeen: string | null;
  activeRoomId: string | null;
};

const coachAvailability = new Map<string, boolean>();

// Track active rooms (roomId -> room info)
const activeRooms = new Map<string, ActiveRoom>();

// Track client online status (clientId -> last seen timestamp)
const clientLastSeen = new Map<string, string>();
const clientOnlineStatus = new Map<string, boolean>();

// Functions to manage active rooms (called from LiveKit token endpoint)
export function registerActiveRoom(room: ActiveRoom) {
  activeRooms.set(room.roomId, room);
  clientOnlineStatus.set(room.clientId, true);
  clientLastSeen.set(room.clientId, new Date().toISOString());
  console.log('[Coach] Active room registered:', room.roomId, 'for client:', room.clientName);
}

export function unregisterActiveRoom(roomId: string) {
  const room = activeRooms.get(roomId);
  if (room) {
    clientOnlineStatus.set(room.clientId, false);
    clientLastSeen.set(room.clientId, new Date().toISOString());
  }
  activeRooms.delete(roomId);
  console.log('[Coach] Active room unregistered:', roomId);
}

export function getActiveRoomsForCoach(coachId: string): ActiveRoom[] {
  // For now, return all active rooms (in production, filter by coach assignment)
  return Array.from(activeRooms.values());
}

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

function getAssignedClients(coachId: string): ClientInfo[] {
  // Get all appointments for this coach to find assigned clients
  const appointments = getAllAppointments();
  const clientMap = new Map<string, ClientInfo>();
  
  for (const appt of appointments) {
    if (appt.coachId === coachId || appt.coachId === getDefaultCoachId()) {
      if (!clientMap.has(appt.clientId)) {
        // Check if client has an active room
        let activeRoomId: string | null = null;
        activeRooms.forEach((room, roomId) => {
          if (room.clientId === appt.clientId) {
            activeRoomId = roomId;
          }
        });
        
        clientMap.set(appt.clientId, {
          id: appt.clientId,
          email: appt.clientEmail || 'unknown@email.com',
          displayName: appt.clientName || 'Unknown Client',
          isOnline: clientOnlineStatus.get(appt.clientId) || false,
          lastSeen: clientLastSeen.get(appt.clientId) || null,
          activeRoomId,
        });
      }
    }
  }
  
  // Always include the seed client for development
  if (!clientMap.has('client-sterling')) {
    clientMap.set('client-sterling', {
      id: 'client-sterling',
      email: 'sterling.cooley@gmail.com',
      displayName: 'Sterling Cooley',
      isOnline: clientOnlineStatus.get('client-sterling') || false,
      lastSeen: clientLastSeen.get('client-sterling') || new Date().toISOString(),
      activeRoomId: null,
    });
  }
  
  return Array.from(clientMap.values());
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
    const defaultCoachId = getDefaultCoachId();
    let rawAppointments = getAppointmentsForCoach(user.id);
    
    // Also check if this is the default coach email (ultradaoto@gmail.com)
    if (user.email === 'ultradaoto@gmail.com') {
      const defaultAppointments = getAppointmentsForCoach(defaultCoachId);
      const seen = new Set(rawAppointments.map(a => a.id));
      for (const appt of defaultAppointments) {
        if (!seen.has(appt.id)) {
          rawAppointments.push(appt);
        }
      }
    }
    
    // Format for coach view
    const appointments = rawAppointments
      .filter(a => a.status !== 'cancelled')
      .map(formatAppointmentForCoach);

    // Get active rooms for this coach
    const rooms = getActiveRoomsForCoach(user.id);
    
    // Get assigned clients
    const assignedClients = getAssignedClients(user.id);
    
    // Calculate stats
    const stats = {
      totalClients: assignedClients.length,
      totalSessions: 0, // Would come from session history DB
      upcomingAppointments: appointments.filter(a => a.status === 'scheduled').length,
      activeNow: rooms.length,
    };

    console.log('[Coach Dashboard]', user.email, '- appointments:', appointments.length, 'active rooms:', rooms.length, 'clients:', assignedClients.length);

    return jsonResponse({
      success: true,
      data: {
        user: coachUser,
        calendarConnected: false,
        appointments,
        activeRooms: rooms,
        assignedClients,
        stats,
      },
    });
  }

  // Create instant room
  if (path === '/api/coach/room/create' && method === 'POST') {
    const roomId = crypto.randomUUID();
    console.log('[Coach] Created room:', roomId, 'by coach:', user.email);
    return jsonResponse({ success: true, data: { roomId, joinPath: `/room/${roomId}` } });
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
