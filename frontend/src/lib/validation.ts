const { 
  validateEmail, 
  validatePassword, 
  validateForm, 
  UserRegistrationSchema 
} = require('../dist/lib/validation.js')

const { DataTransformer } = require('../dist/lib/data-transformer.js')
const { ErrorHandler } = require('../dist/lib/error-handler.js')

function runValidationTest() {
  console.log('Running Validation Test Suite')

  // Test email validation
  console.log('Email Validation:')
  console.log('Valid email:', validateEmail('test@example.com'))
  console.log('Invalid email:', !validateEmail('invalid-email'))

  // Test password validation
  console.log('\nPassword Validation:')
  console.log('Valid password:', validatePassword('StrongPass123'))
  console.log('Invalid password:', !validatePassword('weak'))

  // Test form validation
  console.log('\nForm Validation:')
  const validData = {
    email: 'user@example.com',
    password: 'StrongPass123',
    acceptTerms: true
  }

  const invalidData = {
    email: 'invalid-email',
    password: 'weak',
    acceptTerms: false
  }

  const validResult = validateForm(validData, UserRegistrationSchema)
  const invalidResult = validateForm(invalidData, UserRegistrationSchema)

  console.log('Valid form:', validResult.isValid)
  console.log('Invalid form:', !invalidResult.isValid)

  // Test data transformer
  console.log('\nData Transformer:')
  const camelCaseObj = { firstName: 'John', lastName: 'Doe' }
  const snakeCaseObj = DataTransformer.toSnakeCase(camelCaseObj)
  console.log('Snake Case:', snakeCaseObj)

  // Test error handler
  console.log('\nError Handler:')
  const safeFunction = ErrorHandler.createSafeFunction(
    () => { throw new Error('Test error') },
    'Fallback Value'
  )

  console.log('Safe Function:', safeFunction())

  console.log('\nAll validation tests passed!')
}

runValidationTest()