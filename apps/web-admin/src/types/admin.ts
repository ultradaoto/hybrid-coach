export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'superadmin';
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'client' | 'coach';
  createdAt: string;
  lastSeen: string;
  totalSessions: number;
  totalMinutes: number;
}

export interface Coach extends User {
  role: 'coach';
  clientCount: number;
  weeklyHours: number;
}

export interface Room {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  participants: Participant[];
}

export interface Participant {
  id: string;
  userId: string;
  userName: string;
  role: 'client' | 'coach' | 'ai';
  joinedAt: string;
  isSpeaking?: boolean;
}
