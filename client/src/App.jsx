import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import Layout from './components/Layout.jsx';
import AuthPage from './pages/AuthPage.jsx';
import ThreadsPage from './pages/ThreadsPage.jsx';
import MapPage from './pages/MapPage.jsx';
import JoinPage from './pages/JoinPage.jsx';

function ProtectedRoute({ children }) {
  const { isAuthed } = useAuth();
  return isAuthed ? children : <Navigate to="/login" replace />;
}

function AppRoutes() {
  const { isAuthed } = useAuth();

  // After login, complete a pending join if one was stored
  if (isAuthed) {
    const pendingJoin = sessionStorage.getItem('joinToken');
    if (pendingJoin) {
      sessionStorage.removeItem('joinToken');
      return <Navigate to={`/join/${pendingJoin}`} replace />;
    }
  }

  return (
    <Routes>
      <Route path="/login" element={isAuthed ? <Navigate to="/map" replace /> : <AuthPage />} />
      <Route path="/join/:token" element={<ProtectedRoute><JoinPage /></ProtectedRoute>} />
      <Route
        path="/map"
        element={
          <ProtectedRoute>
            <Layout><MapPage /></Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/threads"
        element={
          <ProtectedRoute>
            <Layout><ThreadsPage /></Layout>
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/map" replace />} />
      <Route path="*" element={<Navigate to="/map" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
