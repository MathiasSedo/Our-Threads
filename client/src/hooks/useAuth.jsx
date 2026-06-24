import { useState, useEffect, createContext, useContext } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ot_user')); } catch { return null; }
  });
  const [token, setToken] = useState(() => localStorage.getItem('ot_token'));

  function login(userData, tokenData) {
    setUser(userData);
    setToken(tokenData);
    localStorage.setItem('ot_user', JSON.stringify(userData));
    localStorage.setItem('ot_token', tokenData);
  }

  function logout() {
    setUser(null);
    setToken(null);
    localStorage.removeItem('ot_user');
    localStorage.removeItem('ot_token');
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAuthed: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
