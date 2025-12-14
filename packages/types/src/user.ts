export type UserRole = 'coach' | 'client' | 'admin';

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
}
