# PTBiz SMS Insights Machine Learning Classifier

## Overview

This module provides an advanced machine learning-based sentiment and intent classification system for SMS event analysis. It combines rule-based keyword matching with neural network-powered machine learning to provide nuanced, context-aware message classification.

## Features

- Multi-dimensional sentiment analysis
- Intent classification
- Hybrid keyword and ML-based approach
- Continuous learning capabilities
- Extensible classification framework

## Classification Categories

### Sentiment Categories
- Very Negative (-2)
- Negative (-1)
- Neutral (0)
- Positive (1)
- Very Positive (2)

### Intent Categories
- Booking
- Support
- Sales
- General Inquiry
- Opt-Out

## Installation

```bash
npm install @ptbiz/sms-ml-classifier
```

## Usage

### Basic Classification

```typescript
import { SentimentClassifier } from '@ptbiz/sms-ml-classifier';

const classifier = new SentimentClassifier();

// Classify a message
const result = classifier.hybridClassify('I want to book a meeting');
console.log(result);
// {
//   ai_classification: 'booking_intent',
//   sentiment_score: 0.5,
//   is_booking_signal: true,
//   urgency_level: 0,
//   support_signal: false,
//   conversion_signal: false
// }
```

### Training the Model

```bash
npm run train
```

## Development

### Scripts

- `npm run build`: Compile TypeScript
- `npm run train`: Train the ML model
- `npm test`: Run tests
- `npm run lint`: Run linter

## Performance Metrics

- Reduced NULL sentiment scores
- Increased classification accuracy
- Improved contextual understanding

## Ethical Considerations

- Privacy preservation
- Bias detection
- Transparent decision-making

## Future Improvements

1. Expand keyword lists
2. Implement continuous learning pipeline
3. Regular performance audits
4. Domain-specific fine-tuning

## Contributing

Please read our [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the UNLICENSED - see the [LICENSE.md](LICENSE.md) file for details.

## Acknowledgments

- TensorFlow.js for machine learning capabilities
- PTBiz SMS Insights Team for continuous innovation