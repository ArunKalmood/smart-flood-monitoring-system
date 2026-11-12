import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authAPI, userAPI } from '../services/api';
import { can as canDo } from '../config/permissions';
import { translate } from '../i18n';
import toast from '../utils/toast';

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

function readStoredUser() {
  try {
    const stored = localStorage.getItem('user');
    return stored && localStorage.getItem('access_token') ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function storeSession({ access_token, refresh_token }, account) {
  localStorage.setItem('access_token', access_token);
  localStorage.setItem('refresh_token', refresh_token);
  localStorage.setItem('user', JSON.stringify(account));
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser);
  const loading = false;

  // Refresh the stored profile from the server so roles/preferences are current.
  useEffect(() => {
    if (!readStoredUser()) return;
    userAPI.getProfile()
      .then((res) => {
        localStorage.setItem('user', JSON.stringify(res.data));
        setUser(res.data);
      })
      .catch(() => {}); // a 401 is handled globally (session cleared, redirect to login)
  }, []);

  const startSession = useCallback((tokens, account) => {
    storeSession(tokens, account);
    setUser(account);
    return account;
  }, []);

  const login = useCallback(async (credentials) => {
    const res = await authAPI.login(credentials);
    return startSession(res.data, res.data.user);
  }, [startSession]);

  const register = useCallback(async (data) => {
    const res = await authAPI.register(data);
    return startSession(res.data, res.data.user);
  }, [startSession]);

  const googleLogin = useCallback(async (credential) => {
    const res = await authAPI.googleLogin(credential);
    return startSession(res.data, res.data.user);
  }, [startSession]);

  const adminLogin = useCallback(async (credentials) => {
    const res = await authAPI.adminLogin(credentials);
    return startSession(res.data, res.data.admin);
  }, [startSession]);

  const adminRegister = useCallback(async (data) => {
    const res = await authAPI.adminRegister(data);
    return startSession(res.data, res.data.admin);
  }, [startSession]);

  const logout = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    setUser(null);
    toast.success(translate('auth_logged_out'));
  }, []);

  const updateUser = useCallback((account) => {
    localStorage.setItem('user', JSON.stringify(account));
    setUser(account);
  }, []);

  const can = useCallback((permission) => canDo(user, permission), [user]);

  return (
    <AuthContext.Provider value={{
      user, loading, login, register, googleLogin, adminLogin, adminRegister, logout, updateUser, can,
      isAdmin: user?.user_type === 'admin',
      isAuthenticated: !!user,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
