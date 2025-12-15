import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Radio,
  FileText,
  Terminal,
  Activity,
  Bug,
  Settings,
  LogOut,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/users', icon: Users, label: 'Users' },
  { to: '/coaches', icon: UserCheck, label: 'Coaches' },
  { to: '/rooms', icon: Radio, label: 'Active Rooms' },
  { to: '/transcripts', icon: FileText, label: 'Transcripts' },
  { to: '/logs', icon: Terminal, label: 'Logs' },
  { to: '/health', icon: Activity, label: 'Health' },
  { to: '/bugs', icon: Bug, label: 'Bug Reports' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  const logout = useAuthStore((s) => s.logout);
  
  return (
    <aside className="w-64 bg-admin-card border-r border-admin-border h-screen flex flex-col">
      {/* Logo */}
      <div className="p-4 border-b border-admin-border">
        <h1 className="text-xl font-bold text-admin-accent">
          MyUltra Admin
        </h1>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                isActive
                  ? 'bg-admin-accent text-white'
                  : 'text-gray-400 hover:bg-admin-border hover:text-white'
              }`
            }
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      
      {/* Logout */}
      <div className="p-4 border-t border-admin-border">
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2 w-full text-gray-400 hover:text-red-400 transition-colors"
        >
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
