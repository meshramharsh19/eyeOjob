import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../../../shared/lib/axios';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('token') || null);
  const [loading, setLoading] = useState(true);

  // Fetch initial user profile on app load if token exists
  useEffect(() => {
    const savedToken = localStorage.getItem('token');

    if (savedToken) {
      api
        .get('/auth/me', {
          headers: { Authorization: `Bearer ${savedToken}` },
        })
        .then((res) => {
          setUser(res.data.user);
          setToken(savedToken);
        })
        .catch(() => {
          localStorage.removeItem('token');
          setUser(null);
          setToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // Stable login function wrapper
  const login = useCallback((newToken, userData) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(userData);
  }, []);

  // Stable logout function wrapper
  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
