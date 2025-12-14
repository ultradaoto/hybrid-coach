/**
 * Shared Appointments Store
 * 
 * In-memory store for appointments that links clients and coaches.
 * This allows both the client and coach to see the same appointments.
 */

export type AppointmentStatus = 'scheduled' | 'cancelled' | 'completed';

export type Appointment = {
  id: string;
  roomId: string;
  scheduledFor: string;
  status: AppointmentStatus;
  createdAt: string;
  clientId: string;
  clientEmail?: string;
  clientName?: string;
  coachId?: string;  // Assigned coach (null = unassigned / AI-only)
  coachEmail?: string;
  coachName?: string;
};

// Global appointments store - shared between client and coach routes
const appointments = new Map<string, Appointment>();

// ============================================================================
// Core CRUD Operations
// ============================================================================

export function createAppointment(data: Omit<Appointment, 'id' | 'createdAt'>): Appointment {
  const id = crypto.randomUUID();
  const appointment: Appointment = {
    ...data,
    id,
    createdAt: new Date().toISOString(),
  };
  appointments.set(id, appointment);
  console.log('[Appointments] Created:', id, 'for client:', data.clientId, 'with coach:', data.coachId || 'AI-only');
  return appointment;
}

export function getAppointment(id: string): Appointment | undefined {
  return appointments.get(id);
}

export function updateAppointment(id: string, updates: Partial<Appointment>): Appointment | undefined {
  const existing = appointments.get(id);
  if (!existing) return undefined;
  
  const updated = { ...existing, ...updates };
  appointments.set(id, updated);
  console.log('[Appointments] Updated:', id, updates);
  return updated;
}

export function deleteAppointment(id: string): boolean {
  return appointments.delete(id);
}

// ============================================================================
// Query Operations
// ============================================================================

/**
 * Get all appointments for a client (sorted by scheduledFor)
 */
export function getAppointmentsForClient(clientId: string): Appointment[] {
  const result: Appointment[] = [];
  appointments.forEach((appt) => {
    if (appt.clientId === clientId) {
      result.push(appt);
    }
  });
  return result.sort((a, b) => 
    new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime()
  );
}

/**
 * Get all appointments for a coach (sorted by scheduledFor)
 */
export function getAppointmentsForCoach(coachId: string): Appointment[] {
  const result: Appointment[] = [];
  appointments.forEach((appt) => {
    if (appt.coachId === coachId) {
      result.push(appt);
    }
  });
  return result.sort((a, b) => 
    new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime()
  );
}

/**
 * Get all unassigned appointments (for coach pool / assignment UI)
 */
export function getUnassignedAppointments(): Appointment[] {
  const result: Appointment[] = [];
  appointments.forEach((appt) => {
    if (!appt.coachId && appt.status === 'scheduled') {
      result.push(appt);
    }
  });
  return result.sort((a, b) => 
    new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime()
  );
}

/**
 * Get all appointments (for admin / debugging)
 */
export function getAllAppointments(): Appointment[] {
  return Array.from(appointments.values()).sort((a, b) => 
    new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime()
  );
}

// ============================================================================
// Assignment Operations
// ============================================================================

/**
 * Assign a coach to an appointment
 */
export function assignCoachToAppointment(
  appointmentId: string, 
  coachId: string, 
  coachEmail?: string, 
  coachName?: string
): Appointment | undefined {
  return updateAppointment(appointmentId, { coachId, coachEmail, coachName });
}

/**
 * Remove coach assignment (return to pool)
 */
export function unassignCoachFromAppointment(appointmentId: string): Appointment | undefined {
  return updateAppointment(appointmentId, { coachId: undefined, coachEmail: undefined, coachName: undefined });
}

// ============================================================================
// Helpers for getting default coach assignment
// ============================================================================

// In development, we can assign all appointments to the first available coach
// In production, this would use proper assignment logic

const SEED_COACH_ID = 'coach-ultradaoto'; // Default coach for dev

/**
 * Get the default coach ID for new appointments
 * In dev mode, assigns to the seed coach account
 */
export function getDefaultCoachId(): string {
  return SEED_COACH_ID;
}

/**
 * Check if a user is a coach
 */
export function isCoachUser(userId: string): boolean {
  return userId.startsWith('coach-') || userId === SEED_COACH_ID;
}
