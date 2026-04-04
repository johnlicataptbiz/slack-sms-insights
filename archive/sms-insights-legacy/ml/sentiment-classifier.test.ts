import { describe, it, expect, beforeAll } from 'vitest';
import { 
  SentimentClassifier, 
  SentimentCategory, 
  IntentCategory 
} from './sentiment-classifier';

describe('SentimentClassifier', () => {
  let classifier: SentimentClassifier;

  beforeAll(() => {
    classifier = new SentimentClassifier();
  });

  // Test sample training data
  const sampleTrainingData = {
    text: [
      'I want to book a meeting',
      'This service is amazing!',
      'I am not interested anymore',
      'Can you help me with a problem?',
      'How much does this cost?',
      'Stop messaging me',
      'Absolutely fantastic experience',
      'Terrible customer support'
    ],
    sentimentLabels: [
      SentimentCategory.NEUTRAL,
      SentimentCategory.VERY_POSITIVE,
      SentimentCategory.VERY_NEGATIVE,
      SentimentCategory.NEUTRAL,
      SentimentCategory.NEUTRAL,
      SentimentCategory.VERY_NEGATIVE,
      SentimentCategory.VERY_POSITIVE,
      SentimentCategory.VERY_NEGATIVE
    ],
    intentLabels: [
      IntentCategory.BOOKING,
      IntentCategory.GENERAL_INQUIRY,
      IntentCategory.OPT_OUT,
      IntentCategory.SUPPORT,
      IntentCategory.SALES,
      IntentCategory.OPT_OUT,
      IntentCategory.GENERAL_INQUIRY,
      IntentCategory.SUPPORT
    ]
  };

  it('should initialize without errors', () => {
    expect(classifier).toBeTruthy();
  });

  it('should train model with sample data', async () => {
    await expect(classifier.trainModel(sampleTrainingData)).resolves.not.toThrow();
  });

  describe('Prediction Tests', () => {
    beforeAll(async () => {
      // Ensure model is trained before predictions
      await classifier.trainModel(sampleTrainingData);
    });

    const testCases = [
      {
        text: 'I want to schedule a meeting',
        expectedIntent: IntentCategory.BOOKING,
        expectedSentiment: SentimentCategory.NEUTRAL
      },
      {
        text: 'This is absolutely amazing!',
        expectedIntent: IntentCategory.GENERAL_INQUIRY,
        expectedSentiment: SentimentCategory.VERY_POSITIVE
      },
      {
        text: 'Stop contacting me',
        expectedIntent: IntentCategory.OPT_OUT,
        expectedSentiment: SentimentCategory.VERY_NEGATIVE
      },
      {
        text: 'I need help with a technical issue',
        expectedIntent: IntentCategory.SUPPORT,
        expectedSentiment: SentimentCategory.NEUTRAL
      }
    ];

    testCases.forEach(({ text, expectedIntent, expectedSentiment }) => {
      it(`should correctly classify: "${text}"`, () => {
        const prediction = classifier.predict(text);
        
        expect(prediction.intent).toBe(expectedIntent);
        expect(prediction.sentiment).toBe(expectedSentiment);
        expect(prediction.confidence).toBeGreaterThan(0);
        expect(prediction.confidence).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('Hybrid Classification', () => {
    it('should provide advanced classification for booking intent', () => {
      const result = classifier.hybridClassify('I want to book a meeting');
      
      expect(result.ai_classification).toBe('booking_intent');
      expect(result.is_booking_signal).toBe(true);
      expect(result.sentiment_score).not.toBeNull();
    });

    it('should handle empty messages', () => {
      const result = classifier.hybridClassify('');
      
      expect(result.ai_classification).toBe('empty_message');
      expect(result.sentiment_score).toBeNull();
      expect(result.is_booking_signal).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very short messages', () => {
      const result = classifier.hybridClassify('k');
      
      expect(result.ai_classification).toBe('short_response');
    });

    it('should handle very long messages', () => {
      const longMessage = 'a'.repeat(250);
      const result = classifier.hybridClassify(longMessage);
      
      expect(result.ai_classification).toBe('detailed_message');
    });
  });
});