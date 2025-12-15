import { Bell, Search, User } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

export default function Header() {
  const user = useAuthStore((s) => s.user);
  
  return (
    <header className="h-16 bg-admin-card border-b border-admin-border px-6 flex items-center justify-between">
      {/* Search */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <input
          type="text"
          placeholder="Search..."
          className="w-full pl-10 pr-4 py-2 bg-admin-bg border border-admin-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-admin-accent focus:border-transparent"
        />
      </div>
      
      {/* Right side */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <button className="relative p-2 text-gray-400 hover:text-white hover:bg-admin-border rounded-lg transition-colors">
          <Bell size={20} />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        </button>
        
        {/* User */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium text-white">{user?.name || 'Admin'}</p>
            <p className="text-xs text-gray-400">{user?.role || 'admin'}</p>
          </div>
          <div className="w-10 h-10 bg-admin-accent rounded-full flex items-center justify-center">
            <User size={20} className="text-white" />
          </div>
        </div>
      </div>
    </header>
  );
}
