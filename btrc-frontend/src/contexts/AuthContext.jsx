import React, { createContext, useContext, useState, useEffect } from 'react';
import { metabaseAPI } from '../api/metabase';

const AuthContext = createContext(null);

const CREDS_KEY = 'btrc_v4_session';

export const AuthProvider = ({ children }) => {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  // Try restoring saved session on mount
  useEffect(() => {
    const saved = localStorage.getItem(CREDS_KEY);
    if (saved) {
      const { token } = JSON.parse(saved);
      metabaseAPI.sessionToken = token;
      metabaseAPI.getCurrentUser()
        .then(setUser)
        .catch(() => { localStorage.removeItem(CREDS_KEY); metabaseAPI.sessionToken = null; })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // Listen for 401 session-expired events fired by the metabaseAPI interceptor.
  // This handles Metabase restarts or token expiry while the dashboard is open.
  useEffect(() => {
    const onExpired = () => {
      localStorage.removeItem(CREDS_KEY);
      setUser(null);
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
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
};
