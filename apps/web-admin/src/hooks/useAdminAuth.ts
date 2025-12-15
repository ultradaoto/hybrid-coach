import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/services/api';

interface LoginCredentials {
  email: string;
  password: string;
}

interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: 'admin' | 'superadmin';
  };
}

export function useAdminAuth() {
  const { isAuthenticated, user, token, login: storeLogin, logout: storeLogout } = useAuthStore();
  const navigate = useNavigate();
  
  const login = useCallback(async (credentials: LoginCredentials) => {
    const response = await api.post<LoginResponse>('/admin/login', credentials);
    storeLogin(response.token, response.user);
    navigate('/dashboard');
    return response.user;
  }, [storeLogin, navigate]);
  
  const logout = useCallback(() => {
    storeLogout();
    navigate('/login');
  }, [storeLogout, navigate]);
  
  return {
    isAuthenticated,
    user,
    token,
    login,
    logout,
  };
}
