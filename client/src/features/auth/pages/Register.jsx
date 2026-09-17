import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import logo from '../../../shared/assets/logo-light.png';
import { register, verifyOtp, resendOtp, googleLoginUrl } from '../api/auth.api';

const Register = ({ onSwitchToLogin }) => {

  // ── All States ──────────────────────────────
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const navigate = useNavigate();

  // ── Mount animation ─────────────────────────
  useEffect(() => {
    setTimeout(() => setMounted(true), 50);
  }, []);

  // ── Password strength ───────────────────────
  const getStrength = (p) => {
    if (!p) return 0;
    let s = 0;
    if (p.length >= 8) s++;
    if (/[A-Z]/.test(p)) s++;
    if (/[0-9]/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return s;
  };
  const strengthLabel = ['', '😟 Too weak', '😐 Weak', '🙂 Good', '💪 Strong'];
  const strengthColor = ['', '#EF4444', '#F59E0B', '#3B82F6', '#22C55E'];
  const strength = getStrength(form.password);

  // ── Validation ──────────────────────────────
  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.email.includes('@')) e.email = 'Enter a valid email';
    if (form.password.length < 8) e.password = 'Minimum 8 characters';
    if (form.password !== form.confirm) e.confirm = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Register ────────────────────────────────
  const handleRegister = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setError('');
    try {
      await register(form.name, form.email, form.password);
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  // ── OTP Input ───────────────────────────────
  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    if (value && index < 5) document.getElementById(`otp-${index + 1}`).focus();
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0)
      document.getElementById(`otp-${index - 1}`).focus();
  };

  // ── Verify OTP ──────────────────────────────
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (otp.join('').length < 6) return;
    setLoading(true);
    setError('');
    try {
      await verifyOtp(form.email, otp.join(''));
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  // ── Resend OTP ──────────────────────────────
  const handleResendOtp = async () => {
    setResendLoading(true);
    setResendSuccess(false);
    setError('');
    try {
      await resendOtp(form.email);
      setResendSuccess(true);
      setOtp(['', '', '', '', '', '']);
      setTimeout(() => document.getElementById('otp-0')?.focus(), 100);
      setTimeout(() => setResendSuccess(false), 4000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to resend OTP');
    } finally {
      setResendLoading(false);
    }
  };

  // ── Shared input classes ────────────────────
  const inputClass = (field) =>
    `w-full pl-10 pr-4 py-3 rounded-xl border bg-[var(--surface)]/70 text-[var(--text-primary)] text-sm outline-none transition-all duration-200 focus:ring-4 focus:ring-[var(--primary)]/15 placeholder:text-[var(--text-muted)] ${
      errors[field]
        ? 'border-[var(--danger)] focus:border-[var(--danger)]'
        : 'border-[var(--border)] focus:border-[var(--border-focus)]'
    }`;

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center overflow-hidden bg-[var(--background)] p-4 md:p-8">

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
            Join thousands of<br />smart job seekers
          </h2>
          <p
            className="text-white/70 text-center text-[15px] max-w-[320px] leading-relaxed"
            style={{ animation: 'fadeInUp 0.7s ease 0.2s both' }}
          >
            Stop losing track of applications. EyeOJob reads your Gmail and builds your job pipeline automatically.
          </p>

          <div
            className="mt-12 flex flex-col gap-4 w-full max-w-[300px]"
            style={{ animation: 'fadeInUp 0.7s ease 0.3s both' }}
          >
            {[
              { icon: '📧', text: 'Connect your Gmail securely' },
              { icon: '🤖', text: 'AI detects job emails automatically' },
              { icon: '📊', text: 'Track status on your Kanban board' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center text-base shrink-0">
                  {item.icon}
                </div>
                <span className="text-white/85 text-sm">{item.text}</span>
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

            {/* ── STEP 1: Form ── */}
            {step === 1 ? (
              <div key="step1" style={{ animation: 'fadeInUp 0.5s ease both' }}>
                <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-1">
                  Create your account 🚀
                </h2>
                <p className="text-[var(--text-secondary)] text-sm mb-7">
                  It's free. No credit card needed.
                </p>

                {error && (
                  <div
                    className="flex items-center gap-2 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-3.5 py-2.5 text-[13px] text-[var(--danger)] mb-4"
                    style={{ animation: 'shake 0.4s ease' }}
                  >
                    ❌ {error}
                  </div>
                )}

                <form onSubmit={handleRegister} className="space-y-4">

                  {/* Name */}
                  <div>
                    <label className="block text-[13px] font-semibold text-[var(--text-secondary)] mb-1.5">
                      Full Name
                    </label>
                    <div className="relative group">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-[var(--primary)] transition-colors">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="8" r="4" />
                          <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
                        </svg>
                      </span>
                      <input
                        type="text"
                        placeholder="Rahul Sharma"
                        value={form.name}
                        onChange={e => setForm({ ...form, name: e.target.value })}
                        className={inputClass('name')}
                      />
                    </div>
                    {errors.name && <p className="text-xs text-[var(--danger)] mt-1">{errors.name}</p>}
                  </div>

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
                        placeholder="you@gmail.com"
                        value={form.email}
                        onChange={e => setForm({ ...form, email: e.target.value })}
                        className={inputClass('email')}
                      />
                    </div>
                    {errors.email && <p className="text-xs text-[var(--danger)] mt-1">{errors.email}</p>}
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-[13px] font-semibold text-[var(--text-secondary)] mb-1.5">
                      Password
                    </label>
                    <div className="relative group">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-[var(--primary)] transition-colors">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="5" y="11" width="14" height="9" rx="2" />
                          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                        </svg>
                      </span>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Min. 8 characters"
                        value={form.password}
                        onChange={e => setForm({ ...form, password: e.target.value })}
                        className={`${inputClass('password')} pr-11`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-base text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        {showPassword ? '🙈' : '👁️'}
                      </button>
                    </div>

                    {form.password && (
                      <div className="mt-2">
                        <div className="flex gap-1 mb-1">
                          {[1, 2, 3, 4].map(i => (
                            <div
                              key={i}
                              className="flex-1 h-[3px] rounded-full transition-colors duration-300"
                              style={{ background: strength >= i ? strengthColor[strength] : 'var(--border)' }}
                            />
                          ))}
                        </div>
                        <p className="text-[11px]" style={{ color: strengthColor[strength] }}>
                          {strengthLabel[strength]}
                        </p>
                      </div>
                    )}
                    {errors.password && <p className="text-xs text-[var(--danger)] mt-1">{errors.password}</p>}
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label className="block text-[13px] font-semibold text-[var(--text-secondary)] mb-1.5">
                      Confirm Password
                    </label>
                    <div className="relative group">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-[var(--primary)] transition-colors">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="5" y="11" width="14" height="9" rx="2" />
                          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                        </svg>
                      </span>
                      <input
                        type={showConfirm ? 'text' : 'password'}
                        placeholder="Re-enter password"
                        value={form.confirm}
                        onChange={e => setForm({ ...form, confirm: e.target.value })}
                        className={`${inputClass('confirm')} pr-11`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm(!showConfirm)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-base text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        {showConfirm ? '🙈' : '👁️'}
                      </button>
                    </div>
                    {form.confirm && (
                      <p
                        className="text-[11px] mt-1"
                        style={{ color: form.password === form.confirm ? 'var(--success)' : 'var(--danger)' }}
                      >
                        {form.password === form.confirm ? '✅ Passwords match' : '❌ Passwords do not match'}
                      </p>
                    )}
                    {errors.confirm && <p className="text-xs text-[var(--danger)] mt-1">{errors.confirm}</p>}
                  </div>

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
                          Sending OTP...
                        </span>
                      ) : 'Create Account →'}
                    </span>
                  </button>
                </form>

                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px bg-[var(--border)]" />
                  <span className="text-xs text-[var(--text-muted)]">or</span>
                  <div className="flex-1 h-px bg-[var(--border)]" />
                </div>

                <button
                  onClick={() => window.location.href = googleLoginUrl}
                  className="w-full py-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]/70 flex items-center justify-center gap-2.5 text-sm font-medium text-[var(--text-primary)] transition-all duration-200 hover:border-[var(--border-hover)] hover:shadow-md hover:-translate-y-0.5"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Sign up with Google
                </button>

                <p className="text-center text-[13px] text-[var(--text-secondary)] mt-5">
                  Already have an account?{' '}
                  <Link to="/login" className="text-[var(--primary)] font-semibold hover:underline">
                    Sign in
                  </Link>
                </p>
              </div>

            ) : (
              /* ── STEP 2: OTP ── */
              <div key="step2" className="text-center" style={{ animation: 'fadeInUp 0.5s ease both' }}>
                <div
                  className="w-[72px] h-[72px] rounded-full bg-[var(--primary)]/10 flex items-center justify-center text-3xl mx-auto mb-5"
                  style={{ animation: 'bounceIn 0.6s ease 0.1s both' }}
                >
                  📩
                </div>
                <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
                  Check your email
                </h2>
                <p className="text-[var(--text-secondary)] text-sm mb-1">
                  We sent a 6-digit OTP to
                </p>
                <p className="text-[var(--primary)] font-semibold text-sm mb-7">
                  {form.email}
                </p>

                {error && (
                  <div
                    className="flex items-center gap-2 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-3.5 py-2.5 text-[13px] text-[var(--danger)] mb-4"
                    style={{ animation: 'shake 0.4s ease' }}
                  >
                    ❌ {error}
                  </div>
                )}

                {resendSuccess && (
                  <div
                    className="flex items-center gap-2 rounded-lg border border-[var(--success)]/30 bg-[var(--success)]/10 px-3.5 py-2.5 text-[13px] text-[var(--success)] mb-4"
                    style={{ animation: 'fadeInUp 0.3s ease' }}
                  >
                    ✅ New OTP sent to {form.email}
                  </div>
                )}

                <form onSubmit={handleVerifyOtp}>
                  <div className="flex gap-2 justify-center mb-6">
                    {otp.map((digit, index) => (
                      <input
                        key={index}
                        id={`otp-${index}`}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={e => handleOtpChange(index, e.target.value)}
                        onKeyDown={e => handleOtpKeyDown(index, e)}
                        className={`w-[46px] h-[52px] text-center text-xl font-bold rounded-xl border-2 outline-none transition-all duration-150 text-[var(--text-primary)] ${
                          digit
                            ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                            : 'border-[var(--border)] bg-[var(--surface)]/70'
                        } focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary)]/15`}
                      />
                    ))}
                  </div>

                  <button
                    type="submit"
                    disabled={loading || otp.join('').length < 6}
                    className="group relative w-full py-3.5 rounded-xl font-semibold text-sm text-white overflow-hidden transition-transform duration-300 disabled:cursor-not-allowed disabled:opacity-70 hover:scale-[1.015] active:scale-[0.98] shadow-lg shadow-[var(--primary)]/25 mb-4"
                    style={{
                      background: otp.join('').length < 6
                        ? 'var(--primary-active)'
                        : 'linear-gradient(135deg, var(--primary), var(--cyan))'
                    }}
                  >
                    <span className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                    <span className="relative">
                      {loading ? (
                        <span className="flex items-center justify-center gap-2">
                          <span
                            className="w-4 h-4 rounded-full border-2 border-white inline-block"
                            style={{ borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }}
                          />
                          Verifying...
                        </span>
                      ) : 'Verify Email ✅'}
                    </span>
                  </button>
                </form>

                <p className="text-[13px] text-[var(--text-secondary)] mb-2">
                  Didn't receive it?{' '}
                  <button
                    onClick={handleResendOtp}
                    disabled={resendLoading}
                    className="font-semibold transition-colors"
                    style={{ color: resendLoading ? 'var(--text-muted)' : 'var(--primary)' }}
                  >
                    {resendLoading ? 'Sending...' : 'Resend OTP'}
                  </button>
                </p>

                <button
                  onClick={() => setStep(1)}
                  className="w-full py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)]/70 text-[13px] text-[var(--text-secondary)] transition-all duration-200 hover:border-[var(--border-hover)] hover:-translate-y-0.5 mt-2"
                >
                  ← Back to registration
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;