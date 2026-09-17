import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import logo from '../../../shared/assets/logo-light.png';
import {
  forgotPassword,
  verifyResetOtp as verifyResetOtpRequest,
  resendResetOtp,
  resetPassword as resetPasswordRequest,
} from '../api/auth.api';

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState('email'); // email | otp | password | success
  const [mounted, setMounted] = useState(false);

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(0);

  const otpRefs = useRef([]);

  useEffect(() => {
    setTimeout(() => setMounted(true), 50);
  }, []);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setInterval(() => setResendTimer(s => s - 1), 1000);
    return () => clearInterval(t);
  }, [resendTimer]);

  // ── Step 1: Send OTP ─────────────────────────
  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!email.includes('@')) return setError('Enter a valid email address');
    setLoading(true);
    setError('');
    try {
      await forgotPassword(email);
      setStep('otp');
      setResendTimer(30);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: OTP input handlers ───────────────
  const handleOtpChange = (index, value) => {
    if (!/^[0-9]?$/.test(value)) return;
    const next = [...otp];
    next[index] = value;
    setOtp(next);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const next = [...otp];
    for (let i = 0; i < 6; i++) next[i] = pasted[i] || '';
    setOtp(next);
    otpRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    const otpValue = otp.join('');
    if (otpValue.length !== 6) return setError('Enter the complete 6-digit OTP');
    setLoading(true);
    setError('');
    try {
      await verifyResetOtpRequest(email, otpValue);
      setStep('password');
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendTimer > 0) return;
    setLoading(true);
    setError('');
    try {
      await resendResetOtp(email);
      setOtp(['', '', '', '', '', '']);
      setResendTimer(30);
      otpRefs.current[0]?.focus();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to resend OTP');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: Reset password ───────────────────
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
  const strength = getStrength(password);

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (password.length < 8) return setError('Password must be at least 8 characters');
    if (password !== confirm) return setError('Passwords do not match');
    setLoading(true);
    setError('');
    try {
      await resetPasswordRequest(email, password);
      setStep('success');
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError(err.response?.data?.error || 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    { key: 'email', icon: '📧', label: 'Enter your email' },
    { key: 'otp', icon: '🔢', label: 'Verify OTP' },
    { key: 'password', icon: '🔒', label: 'Set new password' },
  ];
  const stepOrder = ['email', 'otp', 'password', 'success'];
  const currentIndex = stepOrder.indexOf(step);

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center overflow-hidden bg-[var(--background)] p-4 md:p-8">

      {/* Ambient animated blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full blur-3xl opacity-30"
          style={{ background: 'var(--primary)', animation: 'floatBlob 16s ease-in-out infinite' }} />
        <div className="absolute top-1/3 -right-40 w-[380px] h-[380px] rounded-full blur-3xl opacity-25"
          style={{ background: 'var(--cyan)', animation: 'floatBlob 20s ease-in-out infinite reverse' }} />
        <div className="absolute -bottom-40 left-1/4 w-[360px] h-[360px] rounded-full blur-3xl opacity-20"
          style={{ background: 'var(--purple)', animation: 'floatBlob 18s ease-in-out infinite' }} />
      </div>

      {/* Glass card shell */}
      <div className={`relative z-10 w-full max-w-5xl grid md:grid-cols-2 rounded-[28px] overflow-hidden border border-[var(--glass-border)] shadow-[var(--glass-shadow)] transition-all duration-700 ease-out ${
        mounted ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-[0.97]'
      }`}>

        {/* ── Left brand panel ── */}
        <div className="hidden md:flex relative flex-col items-center justify-center p-12 overflow-hidden"
          style={{
            background: 'linear-gradient(145deg, var(--primary-active) 0%, var(--primary) 50%, var(--cyan) 100%)',
            backgroundSize: '200% 200%',
            animation: 'gradientShift 12s ease infinite',
          }}>
          <div className="absolute w-[400px] h-[400px] rounded-full border border-white/10 -top-24 -left-24" />
          <div className="absolute w-[300px] h-[300px] rounded-full border border-white/10 -bottom-12 -right-20" />
          <div className="absolute w-[200px] h-[200px] rounded-full bg-cyan-300/10 top-1/3 -right-16"
            style={{ animation: 'floatBlob 10s ease-in-out infinite' }} />

          <img src={logo} alt="EyeOJob" className="w-[190px] mb-10 brightness-0 invert drop-shadow-xl"
            style={{ animation: 'fadeInUp 0.7s ease both' }} />

          <h2 className="text-white text-[28px] font-bold text-center mb-4 leading-snug"
            style={{ animation: 'fadeInUp 0.7s ease 0.1s both' }}>
            Forgot your password?
          </h2>
          <p className="text-white/70 text-center text-[15px] max-w-[300px] leading-relaxed"
            style={{ animation: 'fadeInUp 0.7s ease 0.2s both' }}>
            No worries! We'll send you a One-Time Password to verify it's really you.
          </p>

          <div className="mt-12 flex flex-col gap-4 max-w-[300px] w-full" style={{ animation: 'fadeInUp 0.7s ease 0.3s both' }}>
            {steps.map((s, i) => {
              const isActive = step === s.key;
              const isDone = currentIndex > i || step === 'success';
              return (
                <div key={s.key} className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0 transition-all duration-300 ${
                    isDone ? 'bg-white text-[var(--primary)]' : isActive ? 'bg-white/25 ring-2 ring-white' : 'bg-white/15'
                  }`}>
                    {isDone ? '✓' : s.icon}
                  </div>
                  <span className={`text-sm transition-colors ${isActive || isDone ? 'text-white' : 'text-white/60'}`}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right glass form panel ── */}
        <div className="relative flex items-center justify-center p-6 sm:p-10 md:p-12 backdrop-blur-2xl bg-[var(--glass-bg)]">
          <div className="w-full max-w-sm">

            <div className="text-center mb-8 md:hidden">
              <img src={logo} alt="EyeOJob" className="h-12 mx-auto" />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-3.5 py-2.5 text-[13px] text-[var(--danger)] mb-5"
                style={{ animation: 'shake 0.4s ease' }}>
                ❌ {error}
              </div>
            )}

            {/* ── STEP 1: EMAIL ── */}
            {step === 'email' && (
              <>
                <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-1">Reset your password 🔑</h2>
                <p className="text-[var(--text-secondary)] text-sm mb-7">
                  Enter your registered email and we'll send you a 6-digit OTP.
                </p>
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div>
                    <label className="block text-[13px] font-semibold text-[var(--text-secondary)] mb-1.5">
                      Email address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@gmail.com"
                      required
                      className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]/70 text-[var(--text-primary)] text-sm outline-none transition-all duration-200 focus:border-[var(--border-focus)] focus:ring-4 focus:ring-[var(--primary)]/15 placeholder:text-[var(--text-muted)]"
                    />
                  </div>
                  <button type="submit" disabled={loading}
                    className="group relative w-full py-3.5 rounded-xl font-semibold text-sm text-white overflow-hidden transition-transform duration-300 disabled:cursor-not-allowed disabled:opacity-70 hover:scale-[1.015] active:scale-[0.98] shadow-lg shadow-[var(--primary)]/25"
                    style={{ background: loading ? 'var(--primary-active)' : 'linear-gradient(135deg, var(--primary), var(--cyan))' }}>
                    <span className="relative">
                      {loading ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 rounded-full border-2 border-white inline-block" style={{ borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                          Sending OTP...
                        </span>
                      ) : 'Send OTP →'}
                    </span>
                  </button>
                </form>
              </>
            )}

            {/* ── STEP 2: OTP ── */}
            {step === 'otp' && (
              <>
                <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-1">Enter OTP 🔢</h2>
                <p className="text-[var(--text-secondary)] text-sm mb-7">
                  We sent a 6-digit code to <span className="font-semibold text-[var(--primary)]">{email}</span>
                </p>
                <form onSubmit={handleVerifyOtp} className="space-y-5">
                  <div className="flex justify-between gap-2" onPaste={handleOtpPaste}>
                    {otp.map((digit, i) => (
                      <input
                        key={i}
                        ref={el => (otpRefs.current[i] = el)}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={e => handleOtpChange(i, e.target.value)}
                        onKeyDown={e => handleOtpKeyDown(i, e)}
                        className="w-full aspect-square text-center text-xl font-bold rounded-xl border border-[var(--border)] bg-[var(--surface)]/70 text-[var(--text-primary)] outline-none transition-all duration-200 focus:border-[var(--border-focus)] focus:ring-4 focus:ring-[var(--primary)]/15"
                      />
                    ))}
                  </div>

                  <button type="submit" disabled={loading}
                    className="group relative w-full py-3.5 rounded-xl font-semibold text-sm text-white overflow-hidden transition-transform duration-300 disabled:cursor-not-allowed disabled:opacity-70 hover:scale-[1.015] active:scale-[0.98] shadow-lg shadow-[var(--primary)]/25"
                    style={{ background: loading ? 'var(--primary-active)' : 'linear-gradient(135deg, var(--primary), var(--cyan))' }}>
                    <span className="relative">
                      {loading ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 rounded-full border-2 border-white inline-block" style={{ borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                          Verifying...
                        </span>
                      ) : 'Verify OTP →'}
                    </span>
                  </button>

                  <p className="text-center text-[13px] text-[var(--text-secondary)]">
                    Didn't get the code?{' '}
                    {resendTimer > 0 ? (
                      <span className="text-[var(--text-muted)]">Resend in {resendTimer}s</span>
                    ) : (
                      <button type="button" onClick={handleResendOtp} className="text-[var(--primary)] font-semibold hover:underline">
                        Resend OTP
                      </button>
                    )}
                  </p>
                </form>
              </>
            )}

            {/* ── STEP 3: NEW PASSWORD ── */}
            {step === 'password' && (
              <>
                <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-1">Set new password 🔒</h2>
                <p className="text-[var(--text-secondary)] text-sm mb-7">
                  Create a strong new password for <span className="font-semibold text-[var(--primary)]">{email}</span>
                </p>
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div>
                    <label className="block text-[13px] font-semibold text-[var(--text-secondary)] mb-1.5">New Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Min. 8 characters"
                        required
                        className="w-full pl-4 pr-11 py-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]/70 text-[var(--text-primary)] text-sm outline-none transition-all duration-200 focus:border-[var(--border-focus)] focus:ring-4 focus:ring-[var(--primary)]/15 placeholder:text-[var(--text-muted)]"
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-base text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                        {showPassword ? '🙈' : '👁️'}
                      </button>
                    </div>
                    {password && (
                      <div className="mt-2">
                        <div className="flex gap-1 mb-1">
                          {[1, 2, 3, 4].map(i => (
                            <div key={i} className="flex-1 h-[3px] rounded-full transition-colors"
                              style={{ background: strength >= i ? strengthColor[strength] : 'var(--border)' }} />
                          ))}
                        </div>
                        <p className="text-[11px]" style={{ color: strengthColor[strength] }}>{strengthLabel[strength]}</p>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[13px] font-semibold text-[var(--text-secondary)] mb-1.5">Confirm New Password</label>
                    <div className="relative">
                      <input
                        type={showConfirm ? 'text' : 'password'}
                        value={confirm}
                        onChange={e => setConfirm(e.target.value)}
                        placeholder="Re-enter new password"
                        required
                        className="w-full pl-4 pr-11 py-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]/70 text-[var(--text-primary)] text-sm outline-none transition-all duration-200 focus:border-[var(--border-focus)] focus:ring-4 focus:ring-[var(--primary)]/15 placeholder:text-[var(--text-muted)]"
                      />
                      <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-base text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                        {showConfirm ? '🙈' : '👁️'}
                      </button>
                    </div>
                    {confirm && (
                      <p className="text-[11px] mt-1" style={{ color: password === confirm ? '#22C55E' : '#EF4444' }}>
                        {password === confirm ? '✅ Passwords match' : '❌ Passwords do not match'}
                      </p>
                    )}
                  </div>

                  <button type="submit" disabled={loading}
                    className="group relative w-full py-3.5 rounded-xl font-semibold text-sm text-white overflow-hidden transition-transform duration-300 disabled:cursor-not-allowed disabled:opacity-70 hover:scale-[1.015] active:scale-[0.98] shadow-lg shadow-[var(--primary)]/25"
                    style={{ background: loading ? 'var(--primary-active)' : 'linear-gradient(135deg, var(--primary), var(--cyan))' }}>
                    <span className="relative">
                      {loading ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 rounded-full border-2 border-white inline-block" style={{ borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                          Resetting...
                        </span>
                      ) : 'Reset Password 🔒'}
                    </span>
                  </button>
                </form>
              </>
            )}

            {/* ── STEP 4: SUCCESS ── */}
            {step === 'success' && (
              <div className="text-center">
                <div className="w-20 h-20 rounded-full bg-[#DCFCE7] flex items-center justify-center text-4xl mx-auto mb-6">✅</div>
                <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Password reset!</h2>
                <p className="text-[var(--text-secondary)] text-sm mb-6">
                  Your password has been updated successfully. Redirecting to login...
                </p>
                <div className="w-10 h-10 border-[3px] border-[var(--border)] rounded-full mx-auto"
                  style={{ borderTopColor: 'var(--primary)', animation: 'spin 0.8s linear infinite' }} />
              </div>
            )}

            {step !== 'success' && (
              <p className="text-center text-[13px] text-[var(--text-secondary)] mt-6">
                Remember your password?{' '}
                <Link to="/login" className="text-[var(--primary)] font-semibold hover:underline">
                  Back to login
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;