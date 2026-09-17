// client/src/pages/AuthSuccess.jsx
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const AuthSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    const token = searchParams.get('token');
    const userDataRaw = searchParams.get('user');

    if (token && userDataRaw) {
      try {
        const user = JSON.parse(decodeURIComponent(userDataRaw));
        login(token, user);
        navigate('/');
      } catch (err) {
        console.error('Failed to parse auth user:', err);
        navigate('/login');
      }
    } else {
      navigate('/login');
    }
  }, [searchParams, login, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] text-[var(--text-primary)]">
      <p>Logging you in via Google...</p>
    </div>
  );
};

export default AuthSuccess;