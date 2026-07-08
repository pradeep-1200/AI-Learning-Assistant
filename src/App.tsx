import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { initSDK } from './runanywhere';
import { ChatTab } from './components/ChatTab';
import { ProfilePage } from './pages/ProfilePage';

function AppShell() {
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);

  useEffect(() => {
    initSDK()
      .then(() => setSdkReady(true))
      .catch((err) => setSdkError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (sdkError) {
    return (
      <div className="app-loading">
        <h2>SDK Error</h2>
        <p className="error-text">{sdkError}</p>
      </div>
    );
  }

  if (!sdkReady) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <h2>Loading AI Engine...</h2>
        <p>Initializing on-device AI</p>
      </div>
    );
  }

  return (
    <div className="app" style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      <main className="tab-content" style={{ flex: 1, position: 'relative' }}>
        <Routes>
          <Route path="profile" element={<ProfilePage />} />
          <Route path="chat" element={<ChatTab />} />
          <Route path="*" element={<Navigate to="profile" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
