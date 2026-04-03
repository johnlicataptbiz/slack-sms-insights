import React from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from '@/components/Sidebar'
import { useAuth } from '@/contexts/AuthContext'

const RootLayout: React.FC = () => {
  const { isAuthenticated } = useAuth()

  return (
    <div className="flex min-h-screen">
      {isAuthenticated && <Sidebar />}
      
      <main 
        className={`flex-1 ${isAuthenticated ? 'ml-64' : ''}`}
      >
        <Outlet />
      </main>
    </div>
  )
}

export default RootLayout