# PT Biz SMS Dashboard Improvement TODO

## High Priority

### Error Handling
- [ ] Implement consistent error handling across all pages
- [ ] Add retry buttons on error states
- [ ] Improve error messages to be more user-friendly and actionable
- [ ] Add global error boundary with fallback UI

### Loading States
- [ ] Implement skeleton UI for all pages during loading
- [ ] Add progress indicators for long-running operations
- [ ] Ensure consistent loading state messaging across all pages

## Medium Priority

### Search & Filtering
- [ ] Enhance conversation search with advanced filters (date, content, status)
- [ ] Add filtering capabilities to Sequences page
- [ ] Implement saved searches/filters functionality

### Data Export
- [ ] Add CSV export for metrics data on Performance page
- [ ] Add PDF report generation for Daily Activity reports
- [ ] Add export functionality for conversation history

### User Experience
- [ ] Implement batch actions for conversations (assign, close, tag)
- [ ] Add tooltips explaining metrics calculations
- [ ] Improve message composer with formatting options
- [ ] Enhance templates functionality with categories and search

## Low Priority

### Date Handling
- [ ] Add custom date range selection across all pages
- [ ] Implement date comparison (current vs. previous period)
- [ ] Add calendar view option for Daily Activity

### Navigation
- [ ] Improve navigation with breadcrumbs
- [ ] Add quick navigation shortcuts
- [ ] Implement "recently viewed" functionality

### Visualization
- [ ] Enhance charts with interactive tooltips
- [ ] Add visual indicators for message age/urgency
- [ ] Implement performance comparison visualizations

## Technical Improvements
- [ ] Optimize API request batching to reduce network calls
- [ ] Implement proper 401 handling with automatic redirect to login
- [ ] Add offline support for critical functions
- [ ] Improve responsive design for mobile devices
