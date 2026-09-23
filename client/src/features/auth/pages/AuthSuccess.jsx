// client/src/pages/AuthSuccess.jsx
import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../../shared/lib/axios';
import { useAuth } from '../context/AuthContext';

const AuthSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  // The Google callback redirects here with a one-time code, not the JWT
  // itself — keeps the real token out of the URL/history/referrer/logs. This
  // effect exchanges it for the token+user via a POST body. StrictMode double
  // -invokes effects in dev, and the code is single-use server-side, so guard
  // against firing the exchange twice.
  const exchanged = useRef(false);

  useEffect(() => {
    const code = searchParams.get('code');

    if (!code) {
      navigate('/login');
      return;
    }
    if (exchanged.current) return;
    exchanged.current = true;

    api
      .post('/auth/oauth/exchange', { code })
      .then(({ data }) => {
        login(data.token, data.user);
        navigate('/');
      })
      .catch((err) => {
        console.error('Failed to exchange OAuth code:', err);
        navigate('/login?error=auth_failed');
      });
  }, [searchParams, login, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] text-[var(--text-primary)]">
      <p>Logging you in via Google...</p>
    </div>
  );
};

export default AuthSuccess;