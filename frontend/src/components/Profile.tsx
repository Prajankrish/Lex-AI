import React, { useEffect, useState } from 'react';
import type { User } from '@/types';
import { getProfile, updateProfile, type Profile } from '@/services/api';

interface ProfileProps {
  user: User;
  open: boolean;
  onClose: () => void;
  onUpdateLocalUser?: (u: User) => void;
}

const ProfileModal: React.FC<ProfileProps> = ({ user, open, onClose, onUpdateLocalUser }) => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSuccess(null);
    setLoading(true);
    getProfile(user.id)
      .then((p) => {
        setProfile(p);
        setName(p.name || '');
      })
      .catch((e) => setError(e.message || 'Failed to load profile'))
      .finally(() => setLoading(false));
  }, [open, user.id]);

  const onSave = async () => {
    if (!profile) return;
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const updated = await updateProfile({
        userId: user.id,
        name: name !== profile.name ? name : undefined,
        oldPassword: oldPassword || undefined,
        newPassword: newPassword || undefined,
      });
      setProfile(updated);
      setName(updated.name || '');
      if (onUpdateLocalUser && updated.name && updated.name !== user.name) {
        onUpdateLocalUser({ ...user, name: updated.name });
      }
      setOldPassword('');
      setNewPassword('');
      setSuccess('Profile updated');
    } catch (e: any) {
      setError(e.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const isEmailProvider = (profile?.provider ?? 'email') === 'email';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-50 w-full max-w-md bg-charcoal-900 rounded-2xl border border-violet-900/30 p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Your Profile</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200">✕</button>
        </div>

        {error && <div className="mb-3 text-sm text-red-300 bg-red-900/30 border border-red-700/40 rounded px-3 py-2">{error}</div>}
        {success && <div className="mb-3 text-sm text-green-300 bg-green-900/30 border border-green-700/40 rounded px-3 py-2">{success}</div>}

        {loading || !profile ? (
          <div className="text-gray-400">Loading profile…</div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Name</label>
              <input
                className="w-full bg-charcoal-800 border border-violet-900/30 rounded-lg px-3 py-2 text-gray-100"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Email</label>
              <input
                className="w-full bg-charcoal-800 border border-violet-900/30 rounded-lg px-3 py-2 text-gray-400"
                value={profile.email || ''}
                disabled
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Provider</label>
                <input className="w-full bg-charcoal-800 border border-violet-900/30 rounded-lg px-3 py-2 text-gray-400" value={profile.provider || '—'} disabled />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Last login</label>
                <input className="w-full bg-charcoal-800 border border-violet-900/30 rounded-lg px-3 py-2 text-gray-400" value={profile.last_login || '—'} disabled />
              </div>
            </div>

            {isEmailProvider && (
              <div className="mt-2">
                <div className="text-sm font-semibold text-gray-200 mb-2">Change password</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="password"
                    placeholder="Current password"
                    className="w-full bg-charcoal-800 border border-violet-900/30 rounded-lg px-3 py-2 text-gray-100"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                  />
                  <input
                    type="password"
                    placeholder="New password (min 6)"
                    className="w-full bg-charcoal-800 border border-violet-900/30 rounded-lg px-3 py-2 text-gray-100"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={onClose} className="px-4 py-2 rounded-lg bg-charcoal-800 text-gray-300 hover:bg-charcoal-700">Close</button>
              <button onClick={onSave} disabled={loading} className="px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">Save</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfileModal;
