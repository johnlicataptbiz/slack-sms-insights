import React, { lazy, Suspense } from 'react'
import { 
  createBrowserRouter, 
  createRoutesFromElements, 
  Route, 
  RouterProvider,
  Navigate,
  Outlet
} from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

// Layouts
import RootLayout from '@/layouts/RootLayout'
import AuthLayout from '@/layouts/AuthLayout'

// Pages (Lazy Loaded)
const HomePage = lazy(() => import('@/pages/HomePage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const InboxPage = lazy(() => import('@/pages/InboxPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))
const LoginPage = lazy(() => import('@/pages/LoginPage'))
const RegisterPage = lazy(() => import('@/pages/RegisterPage'))

// Loading Fallback
const PageLoader: React.FC = () => (
  <div className="flex justify-center items-center min-h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-primary"></div>
  </div>
)

// Protected Route Component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

const AppRoutes: React.FC = () => {
  const router = createBrowserRouter(
    createRoutesFromElements(
      <Route element={<RootLayout />}>
        {/* Public Routes */}
        <Route path="/login" element={<AuthLayout />}>
          <Route 
            index 
            element={
              <Suspense fallback={<PageLoader />}>
                <LoginPage />
              </Suspense>
            } 
          />
          <Route 
            path="register" 
            element={
              <Suspense fallback={<PageLoader />}>
                <RegisterPage />
              </Suspense>
            } 
          />
        </Route>

        {/* Protected Routes */}
        <Route 
          element={
            <ProtectedRoute>
              <Outlet />
            </ProtectedRoute>
          }
        >
          <Route 
            index 
            element={<Navigate to="/dashboard" replace />} 
          />
          <Route 
            path="dashboard" 
            element={
              <Suspense fallback={<PageLoader />}>
                <DashboardPage />
              </Suspense>
            } 
          />
          <Route 
            path="inbox" 
            element={
              <Suspense fallback={<PageLoader />}>
                <InboxPage />
              </Suspense>
            } 
          />
          <Route 
            path="settings" 
            element={
              <Suspense fallback={<PageLoader />}>
                <SettingsPage />
              </Suspense>
            } 
          />
        </Route>

        {/* 404 Route */}
        <Route 
          path="*" 
          element={
            <Suspense fallback={<PageLoader />}>
              <NotFoundPage />
            </Suspense>
          } 
        />
      </Route>
    )
  )

  return <RouterProvider router={router} />
}

export default AppRoutes