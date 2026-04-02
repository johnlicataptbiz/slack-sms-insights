import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { Provider } from 'react-redux';
import { Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Analytics from './pages/Analytics';
import Conversations from './pages/Conversations';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Settings from './pages/Settings';
import { store } from './store';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <ThemeProvider>
          <AuthProvider>
            <Router>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route
                  path="/*"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <Routes>
                          <Route path="/" element={<Dashboard />} />
                          <Route
                            path="/conversations"
                            element={<Conversations />}
                          />
                          <Route path="/analytics" element={<Analytics />} />
                          <Route path="/settings" element={<Settings />} />
                        </Routes>
                      </Layout>
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </Router>
          </AuthProvider>
        </ThemeProvider>
      </Provider>
    </QueryClientProvider>
  );
}

export default App;
