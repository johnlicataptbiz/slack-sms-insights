import React from 'react'
import { cn } from '@/lib/utils'
import Button from '@/components/Button'
import { Card, CardHeader, CardContent } from '@/components/Card'
import Typography from '@/components/Typography'
import { Form, FormField, Input } from '@/components/Form'
import { useForm } from '@/hooks/use-form'
import { validateEmail } from '@/lib/validation'
import ErrorBoundary from '@/components/ErrorBoundary'

const App: React.FC = () => {
  const { values, errors, handleChange, handleSubmit } = useForm(
    { email: '' },
    (values) => {
      const errors: Record<string, string> = {}
      if (!validateEmail(values.email as string)) {
        errors.email = 'Please enter a valid email address'
      }
      return errors
    }
  )

  const onSubmit = (formValues: typeof values) => {
    console.log('Form submitted:', formValues)
    // Implement actual submission logic
  }

  return (
    <ErrorBoundary>
      <div className={cn(
        'min-h-screen',
        'bg-gray-100',
        'flex',
        'flex-col',
        'items-center',
        'justify-center',
        'p-4'
      )}>
        <Card className="max-w-md w-full">
          <CardHeader 
            title="PT Biz SMS Dashboard" 
            subtitle="Your SMS insights at a glance"
          />
          <CardContent>
            <Typography variant="p" className="mb-4">
              Sign up to get started with your SMS performance dashboard.
            </Typography>
            <Form onSubmit={(e) => handleSubmit(e, onSubmit)}>
              <FormField 
                label="Email" 
                error={errors.email as string}
              >
                <Input
                  type="email"
                  name="email"
                  value={values.email}
                  onChange={handleChange}
                  variant={errors.email ? 'error' : 'default'}
                  placeholder="you@example.com"
                />
              </FormField>
              <Button type="submit" className="w-full">
                Get Started
              </Button>
            </Form>
          </CardContent>
        </Card>
      </div>
    </ErrorBoundary>
  )
}

export default App