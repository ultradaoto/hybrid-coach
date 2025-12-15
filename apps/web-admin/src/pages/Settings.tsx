import { useState } from 'react';
import { Title, Text, Card } from '@tremor/react';
import { Bell, Mail, Shield, Save } from 'lucide-react';

export default function Settings() {
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [slackAlerts, setSlackAlerts] = useState(false);
  const [criticalOnly, setCriticalOnly] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <Title className="text-white">Settings</Title>
        <Text className="text-gray-400">
          Configure admin dashboard preferences
        </Text>
      </div>

      {/* Alert Preferences */}
      <Card className="bg-admin-card border-admin-border">
        <div className="flex items-center gap-3 mb-6">
          <Bell className="text-admin-accent" size={24} />
          <Title className="text-white text-lg">Alert Preferences</Title>
        </div>

        <div className="space-y-4">
          <SettingToggle
            label="Email Alerts"
            description="Receive alerts via email for system issues"
            icon={<Mail size={18} />}
            enabled={emailAlerts}
            onChange={setEmailAlerts}
          />

          <SettingToggle
            label="Slack Notifications"
            description="Send alerts to a Slack channel"
            enabled={slackAlerts}
            onChange={setSlackAlerts}
          />

          <SettingToggle
            label="Critical Alerts Only"
            description="Only receive notifications for critical issues"
            icon={<Shield size={18} />}
            enabled={criticalOnly}
            onChange={setCriticalOnly}
          />
        </div>
      </Card>

      {/* Admin Emails */}
      <Card className="bg-admin-card border-admin-border">
        <Title className="text-white text-lg mb-4">Admin Users</Title>
        <Text className="text-gray-400 mb-4">
          Manage who has access to this admin dashboard
        </Text>

        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 bg-admin-bg rounded-lg">
            <div>
              <p className="text-white">admin@myultra.coach</p>
              <p className="text-gray-500 text-sm">Super Admin</p>
            </div>
            <span className="px-2 py-1 bg-admin-accent/20 text-admin-accent text-xs rounded-full">
              Owner
            </span>
          </div>
        </div>
      </Card>

      {/* Save Button */}
      <button className="flex items-center gap-2 px-4 py-2 bg-admin-accent hover:bg-admin-accent/80 text-white rounded-lg transition-colors">
        <Save size={18} />
        Save Changes
      </button>
    </div>
  );
}

function SettingToggle({
  label,
  description,
  icon,
  enabled,
  onChange,
}: {
  label: string;
  description: string;
  icon?: React.ReactNode;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 bg-admin-bg rounded-lg">
      <div className="flex items-center gap-3">
        {icon && <span className="text-gray-400">{icon}</span>}
        <div>
          <p className="text-white">{label}</p>
          <p className="text-gray-500 text-sm">{description}</p>
        </div>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={`w-12 h-6 rounded-full transition-colors ${
          enabled ? 'bg-admin-accent' : 'bg-admin-border'
        }`}
      >
        <span
          className={`block w-5 h-5 bg-white rounded-full transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}
