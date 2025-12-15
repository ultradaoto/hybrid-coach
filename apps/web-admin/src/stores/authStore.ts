import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'superadmin';
}

interface AuthState {
  token: string | null;
  user: AdminUser | null;
  isAuthenticated: boolean;
  _hasHydrated: boolean;
  login: (token: string, user: AdminUser) => void;
  logout: () => void;
  setHasHydrated: (state: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      _hasHydrated: false,
      
      login: (token, user) =>
        set({
          token,
          user,
          isAuthenticated: true,
        }),
      
      logout: () =>
        set({
          token: null,
          user: null,
          isAuthenticated: false,
        }),
        
      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: 'admin-auth',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

// Hook to check if store has hydrated
export const useHasHydrated = () => useAuthStore((s) => s._hasHydrated);
