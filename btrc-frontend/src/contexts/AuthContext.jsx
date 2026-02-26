import React, { createContext, useContext, useState, useEffect } from 'react';
import { metabaseAPI } from '../api/metabase';

const AuthContext = createContext(null);

const CREDS_KEY   = 'btrc_v4_session';
const GROUPS_KEY  = 'btrc_v4_groups';
const GROUPS_TTL  = 30 * 60 * 1000; // 30 min

// Role priority: highest to lowest
const ROLE_MAP = {
  'BTRC_ADMIN':           'admin',
  'Administrators':       'admin',
  'Regulatory Officers':  'regulatory_officer',
  'Regional Officers':    'regional_officer',
  'ISP Users':            'isp_user',
};
const ROLE_LABELS = {
  admin:              'Admin',
  regulatory_officer: 'Regulatory Officer',
  regional_officer:   'Regional Officer',
  isp_user:           'ISP User',
};
const ROLE_COLORS = {
  admin:              '#dc2626',
  regulatory_officer: '#1890ff',
  regional_officer:   '#f97316',
  isp_user:           '#22c55e',
};

/** Resolve role from user's group IDs + list of all groups */
const resolveRole = (groupIds, allGroups) => {
  const myGroupNames = allGroups
    .filter(g => groupIds.includes(g.id))
    .map(g => g.name);
  // Pick highest-priority role
  for (const [groupName, role] of Object.entries(ROLE_MAP)) {
    if (myGroupNames.includes(groupName)) return role;
  }
  return 'viewer'; // default
};

const readCachedGroups = () => {
  try {
    const raw = sessionStorage.getItem(GROUPS_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    return Date.now() - ts < GROUPS_TTL ? data : null;
  } catch { return null; }
};

export { ROLE_LABELS, ROLE_COLORS };

export const AuthProvider = ({ children }) => {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [role,    setRole]    = useState(null);

  /** Fetch permission groups (cached 30 min), resolve + store role for user u */
  const resolveAndSetRole = async (u) => {
    try {
      let groups = readCachedGroups();
      if (!groups) {
        groups = await metabaseAPI.getPermissionGroups();
        try {
          sessionStorage.setItem(GROUPS_KEY, JSON.stringify({ data: groups, ts: Date.now() }));
        } catch {}
      }
      setRole(resolveRole(u.groupIds, groups));
    } catch {
      setRole('viewer');
    }
  };

  // Try restoring saved session on mount
  useEffect(() => {
    const saved = localStorage.getItem(CREDS_KEY);
    if (saved) {
      const { token } = JSON.parse(saved);
      metabaseAPI.sessionToken = token;
      metabaseAPI.getCurrentUser()
        .then(u => { setUser(u); return resolveAndSetRole(u); })
        .catch(() => { localStorage.removeItem(CREDS_KEY); metabaseAPI.sessionToken = null; })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []); // eslint-disable-line

  // Listen for 401 session-expired events fired by the metabaseAPI interceptor.
  // This handles Metabase restarts or token expiry while the dashboard is open.
  useEffect(() => {
    const onExpired = () => {
      localStorage.removeItem(CREDS_KEY);
      setUser(null);
      setRole(null);
      // Guard in App.jsx will redirect to /login automatically.
    };
    window.addEventListener('mb-session-expired', onExpired);
    return () => window.removeEventListener('mb-session-expired', onExpired);
  }, []);

  const login = async (email, password) => {
    setError(null);
    try {
      const token = await metabaseAPI.login(email, password);
      const u     = await metabaseAPI.getCurrentUser();
      localStorage.setItem(CREDS_KEY, JSON.stringify({ token }));
      setUser(u);
      await resolveAndSetRole(u);
      return u;
    } catch (e) {
      const msg = e?.response?.data?.errors?.password
        || e?.response?.data?.message
        || 'Login failed. Check credentials.';
      setError(msg);
      throw new Error(msg);
    }
  };

  const logout = () => {
    metabaseAPI.logout();
    localStorage.removeItem(CREDS_KEY);
    setUser(null);
    setRole(null);
  };

  const roleLabel = ROLE_LABELS[role] || 'Viewer';
  const roleColor = ROLE_COLORS[role] || '#6b7280';

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout, role, roleLabel, roleColor }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
};
