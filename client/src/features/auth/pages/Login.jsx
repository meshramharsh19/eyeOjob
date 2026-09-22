import { useState, useEffect } from 'react';
import logo from '../../../shared/assets/logo-light.png';
import { useNavigate, Link } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../../../shared/context/ThemeContext';
import { login as loginRequest, googleLoginUrl } from '../api/auth.api';

const Login = ({ onSwitchToRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  useEffect(() => {
    setTimeout(() => setMounted(true), 50);
  }, []);


const handleLogin = async (e) => {
  e.preventDefault();
  setLoading(true);
  setError('');
  
  try {
    const res = await loginRequest(email, password);
    login(res.data.token, res.data.user);
    navigate('/', res.data.reactivated ? { state: { reactivated: true } } : undefined);
  } catch (err) {
    setError(err.response?.data?.error || 'Login failed');
  } finally {
    setLoading(false);
  }
};
const [error, setError] = useState('');

  const handleGoogleLogin = () => {
    window.location.href = googleLoginUrl;
  };

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center overflow-hidden bg-[var(--background)] p-4 md:p-8">
      {/* Theme toggle in top right */}
      <div className="absolute top-5 right-5 z-20">
        <button
          type="button"
          onClick={toggleTheme}
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] shadow-sm backdrop-blur-md transition-all hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
        >
          {isDark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-slate-700" />}
        </button>
      </div>

      {/* Ambient animated blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full blur-3xl opacity-30"
          style={{ background: 'var(--primary)', animation: 'floatBlob 16s ease-in-out infinite' }}
        />
        <div
          className="absolute top-1/3 -right-40 w-[380px] h-[380px] rounded-full blur-3xl opacity-25"
          style={{ background: 'var(--cyan)', animation: 'floatBlob 20s ease-in-out infinite reverse' }}
        />
        <div
          className="absolute -bottom-40 left-1/4 w-[360px] h-[360px] rounded-full blur-3xl opacity-20"
          style={{ background: 'var(--purple)', animation: 'floatBlob 18s ease-in-out infinite' }}
        />
      </div>

      {/* Glass card shell */}
      <div
        className={`relative z-10 w-full max-w-5xl grid md:grid-cols-2 rounded-[28px] overflow-hidden border border-[var(--glass-border)] shadow-[var(--glass-shadow)] transition-all duration-700 ease-out ${
          mounted ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-[0.97]'
        }`}
      >
        {/* ── Left brand panel ── */}
        <div
          className="hidden md:flex relative flex-col items-center justify-center p-12 overflow-hidden"
          style={{
            background: 'linear-gradient(145deg, var(--primary-active) 0%, var(--primary) 50%, var(--cyan) 100%)',
            backgroundSize: '200% 200%',
            animation: 'gradientShift 12s ease infinite',
          }}
        >
          <div className="absolute w-[400px] h-[400px] rounded-full border border-white/10 -top-24 -left-24" />
          <div className="absolute w-[300px] h-[300px] rounded-full border border-white/10 -bottom-12 -right-20" />
          <div
            className="absolute w-[200px] h-[200px] rounded-full bg-cyan-300/10 top-1/3 -right-16"
            style={{ animation: 'floatBlob 10s ease-in-out infinite' }}
          />

          <img
            src={logo}
            alt="EyeOJob"
            className="w-[190px] mb-10 brightness-0 invert drop-shadow-xl"
            style={{ animation: 'fadeInUp 0.7s ease both' }}
          />

          <h2
            className="text-white text-[28px] font-bold text-center mb-4 leading-snug"
            style={{ animation: 'fadeInUp 0.7s ease 0.1s both' }}
          >
            Your Job Hunt,<br />Our Tracking
          </h2>
          <p
            className="text-white/70 text-center text-[15px] max-w-[320px] leading-relaxed"
            style={{ animation: 'fadeInUp 0.7s ease 0.2s both' }}
          >
            Connect your Gmail and we'll automatically track every application, reply, and update — so you never miss an opportunity.
          </p>

          <div className="flex gap-8 mt-12" style={{ animation: 'fadeInUp 0.7s ease 0.3s both' }}>
            {[
              { num: '100%', label: 'Auto Tracking' },
              { num: '₹0', label: 'Forever Free' },
              { num: '10x', label: 'More Organized' },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <div className="text-white text-2xl font-extrabold">{s.num}</div>
                <div className="text-white/60 text-xs mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right glass form panel ── */}
        <div className="relative flex items-center justify-center p-6 sm:p-10 md:p-12 backdrop-blur-2xl bg-[var(--glass-bg)]">
          <div className="w-full max-w-sm">

            {/* Mobile logo */}
            <div className="text-center mb-8 md:hidden">
              <img src={logo} alt="EyeOJob" className="h-12 mx-auto" />
            </div>

            <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-1">
              Welcome back 👋
            </h2>
            <p className="text-[var(--text-secondary)] text-sm mb-7">
              Sign in to continue tracking your applications
            </p>

            <form onSubmit={handleLogin} className="space-y-4">

              {/* Email */}
              <div>
                <label className="block text-[13px] font-semibold text-[var(--text-secondary)] mb-1.5">
                  Email address
                </label>
                <div className="relative group">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-[var(--primary)] transition-colors">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11Z" />
                      <path d="m3 7 9 6 9-6" />
                    </svg>
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@gmail.com"
                    required
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]/70 text-[var(--text-primary)] text-sm outline-none transition-all duration-200 focus:border-[var(--border-focus)] focus:ring-4 focus:ring-[var(--primary)]/15 placeholder:text-[var(--text-muted)]"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[13px] font-semibold text-[var(--text-secondary)]">
                    Password
                  </label>
                  <Link to="/forgot-password"
  style={{ fontSize: '13px', color: '#2563EB', fontWeight: '500', textDecoration: 'none' }}>
  Forgot password?
</Link>
                </div>
                <div className="relative group">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-[var(--primary)] transition-colors">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="5" y="11" width="14" height="9" rx="2" />
                      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    </svg>
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full pl-10 pr-11 py-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]/70 text-[var(--text-primary)] text-sm outline-none transition-all duration-200 focus:border-[var(--border-focus)] focus:ring-4 focus:ring-[var(--primary)]/15 placeholder:text-[var(--text-muted)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-base text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div
                  className="flex items-center gap-2 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-3.5 py-2.5 text-[13px] text-[var(--danger)]"
                  style={{ animation: 'shake 0.4s ease' }}
                >
                  ❌ {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full py-3.5 rounded-xl font-semibold text-sm text-white overflow-hidden transition-transform duration-300 disabled:cursor-not-allowed disabled:opacity-70 hover:scale-[1.015] active:scale-[0.98] shadow-lg shadow-[var(--primary)]/25"
                style={{ background: loading ? 'var(--primary-active)' : 'linear-gradient(135deg, var(--primary), var(--cyan))' }}
              >
                <span className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                <span className="relative">
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span
                        className="w-4 h-4 rounded-full border-2 border-white inline-block"
                        style={{ borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }}
                      />
                      Signing in...
                    </span>
                  ) : 'Sign in →'}
                </span>
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-[var(--border)]" />
              <span className="text-xs text-[var(--text-muted)]">or continue with</span>
              <div className="flex-1 h-px bg-[var(--border)]" />
            </div>

            {/* Google */}
            <button
              onClick={handleGoogleLogin}
              className="w-full py-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]/70 flex items-center justify-center gap-2.5 text-sm font-medium text-[var(--text-primary)] transition-all duration-200 hover:border-[var(--border-hover)] hover:shadow-md hover:-translate-y-0.5"
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>

            <p className="text-center text-[13px] text-[var(--text-secondary)] mt-6">
              Don't have an account?{' '}
              <Link to="/register" className="text-[var(--primary)] font-semibold hover:underline">
                Create account
              </Link>
            </p>

            <p className="text-center text-[11px] text-[var(--text-muted)] mt-6">
              🔒 We only read your emails — never send or delete anything
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;