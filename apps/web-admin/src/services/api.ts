import { useAuthStore } from '@/stores/authStore';

const API_BASE = '/api';

class ApiClient {
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    
    const token = useAuthStore.getState().token;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    return headers;
  }
  
  async get<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        useAuthStore.getState().logout();
      }
      throw new Error(`API error: ${response.status}`);
    }
    
    const json = await response.json();
    return json.data ?? json;
  }
  
  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        useAuthStore.getState().logout();
      }
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `API error: ${response.status}`);
    }
    
    const json = await response.json();
    return json.data ?? json;
  }
  
  async patch<T>(endpoint: string, data?: unknown): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        useAuthStore.getState().logout();
      }
      throw new Error(`API error: ${response.status}`);
    }
    
    const json = await response.json();
    return json.data ?? json;
  }
  
  async delete<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        useAuthStore.getState().logout();
      }
      throw new Error(`API error: ${response.status}`);
    }
    
    const json = await response.json();
    return json.data ?? json;
  }
}

export const api = new ApiClient();
