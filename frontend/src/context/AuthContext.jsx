import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setToken } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    api
      .me()
      .then(({ business: found }) => {
        if (active) setBusiness(found);
      })
      .catch(() => {
        if (active) setBusiness(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (credentials) => {
    const { token, business: found } = await api.login(credentials);
    setToken(token);
    setBusiness(found);
    return found;
  }, []);

  const enterAsGuest = useCallback(async (phone) => {
    const { token, business: found } = await api.guest(phone ? { phone } : {});
    setToken(token);
    setBusiness(found);
    return found;
  }, []);

  const signup = useCallback(async (details) => {
    const { token, business: created } = await api.signup(details);
    setToken(token);
    setBusiness(created);
    return created;
  }, []);

  const updateBusiness = useCallback(async (changes) => {
    const { business: updated } = await api.updateBusiness(changes);
    setBusiness(updated);
    return updated;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setBusiness(null);
  }, []);

  const value = useMemo(
    () => ({ business, loading, login, signup, enterAsGuest, logout, updateBusiness }),
    [business, loading, login, signup, enterAsGuest, logout, updateBusiness]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
