import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AppLayout from './components/layout/AppLayout';
import LoginPage from './pages/LoginPage';
import ExecutiveDashboard    from './pages/ExecutiveDashboard';
import RegulatoryDashboard   from './pages/RegulatoryDashboard';
import OperationalDashboard  from './pages/OperationalDashboard';

const Guard = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Spin size="large" tip="Connecting…" />
    </div>
  );
  return user ? children : <Navigate to="/login" replace />;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/" element={<Guard><AppLayout /></Guard>}>
      <Route index element={<Navigate to="/executive" replace />} />
      <Route path="executive"   element={<ExecutiveDashboard />} />
      <Route path="regulatory"  element={<RegulatoryDashboard />} />
      <Route path="operational" element={<OperationalDashboard />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
