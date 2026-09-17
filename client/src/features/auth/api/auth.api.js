import api from '../../../shared/lib/axios';
import { API_URL } from '../../../config/env';

export const login = (email, password) => api.post('/auth/login', { email, password });

export const register = (name, email, password) => api.post('/auth/register', { name, email, password });

export const verifyOtp = (email, otp) => api.post('/auth/verify-otp', { email, otp });

export const resendOtp = (email) => api.post('/auth/resend-otp', { email });

export const forgotPassword = (email) => api.post('/auth/forgot-password', { email });

export const verifyResetOtp = (email, otp) => api.post('/auth/verify-reset-otp', { email, otp });

export const resendResetOtp = (email) => api.post('/auth/resend-reset-otp', { email });

export const resetPassword = (email, password) => api.post('/auth/reset-password', { email, password });

export const googleLoginUrl = `${API_URL}/auth/google`;
