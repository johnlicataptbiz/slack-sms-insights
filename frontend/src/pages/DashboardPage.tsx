import React from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/Card'
import Typography from '@/components/Typography'
import Button from '@/components/Button'

const NotFoundPage: React.FC = () => {
  return (
    <div className="flex items-center justify-center min-h-screen bg-neutral-50">
      <Card className="max-w-md w-full text-center">
        <CardContent className="space-y-6">
          <Typography as="h1" variant="h1" className="text-primary-500">
            404
          </Typography>
          
          <Typography variant="h2" className="text-neutral-800">
            Page Not Found
          </Typography>
          
          <Typography variant="p" className="text-neutral-600 mb-6">
            The page you are looking for might have been removed, 
            had its name changed, or is temporarily unavailable.
          </Typography>
          
          <div className="flex justify-center space-x-4">
            <Link to="/dashboard">
              <Button variant="default">
                Go to Dashboard
              </Button>
            </Link>
            
            <Link to="/">
              <Button variant="outline">
                Home
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default NotFoundPage