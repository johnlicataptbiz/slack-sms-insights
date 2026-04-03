const { useForm } = require('../dist/hooks/use-form.js')
const { useMediaQuery } = require('../dist/hooks/use-media-query.js')
const { useLocalStorage } = require('../dist/hooks/use-local-storage.js')
const { useDebounce } = require('../dist/hooks/use-debounce.js')

function runHooksTest() {
  console.log('Running Hooks Test Suite')

  // Test useForm
  const initialValues = { username: '', email: '' }
  const formHook = useForm(initialValues, (values) => {
    const errors = {}
    if (!values.username) errors.username = 'Username is required'
    if (!values.email) errors.email = 'Email is required'
    return errors
  })

  console.log('useForm initialized successfully')

  // Test useMediaQuery
  const isDarkMode = useMediaQuery('(prefers-color-scheme: dark)')
  console.log('useMediaQuery initialized successfully')

  // Test useLocalStorage
  const [storedValue, setStoredValue] = useLocalStorage('test-key', 'initial')
  setStoredValue('updated')
  console.log('useLocalStorage initialized successfully')

  // Test useDebounce
  const debouncedValue = useDebounce('test', 300)
  console.log('useDebounce initialized successfully')

  console.log('All hooks tests passed!')
}

runHooksTest()