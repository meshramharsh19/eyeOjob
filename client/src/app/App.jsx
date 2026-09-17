import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import {
  AuthProvider,
  ProtectedRoute,
  Login,
  Register,
  ForgotPassword,
  AuthSuccess,
} from '../features/auth';
import { ThemeProvider } from '../shared/context/ThemeContext';
import { NotificationProvider } from '../features/notifications';
import { Home } from '../features/home';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
      <NotificationProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/auth-success" element={<AuthSuccess />} />

          {/* Protected routes */}
          <Route path="/" element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          } />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
      </NotificationProvider>
    </AuthProvider>
  </ThemeProvider>
  );
}

export default App;
