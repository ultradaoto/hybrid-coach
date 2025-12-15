import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/services/api';
import { Lock, Mail } from 'lucide-react';

interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: 'admin' | 'superadmin';
  };
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await api.post<LoginResponse>('/admin/login', { email, password });
      login(response.token, response.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-admin-bg flex items-center justify-center p-4">
      <div className="bg-admin-card border border-admin-border rounded-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-admin-accent mb-2">
            MyUltra Admin
          </h1>
          <p className="text-gray-400">Sign in to access the admin dashboard</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500 text-red-400 rounded-lg p-3 mb-6 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="admin@myultra.coach"
                autoComplete="email"
                className="w-full pl-10 pr-4 py-3 bg-admin-bg border border-admin-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-admin-accent focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full pl-10 pr-4 py-3 bg-admin-bg border border-admin-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-admin-accent focus:border-transparent"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-admin-accent hover:bg-admin-accent/80 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
