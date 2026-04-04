import { AdvancedClassificationResult } from '../data/enhanced-keywords';
import * as tf from '@tensorflow/tfjs-node';

// Enum for classification categories
export enum SentimentCategory {
  VERY_NEGATIVE = -2,
  NEGATIVE = -1,
  NEUTRAL = 0,
  POSITIVE = 1,
  VERY_POSITIVE = 2
}

export enum IntentCategory {
  BOOKING,
  SUPPORT,
  SALES,
  GENERAL_INQUIRY,
  OPT_OUT
}

// Machine Learning Sentiment Classifier
export class SentimentClassifier {
  private model: tf.Sequential | null = null;
  private tokenizer: Map<string, number> = new Map();
  private maxSequenceLength: number = 50;

  constructor() {
    this.initializeTokenizer();
  }

  private initializeTokenizer() {
    // Pre-populate with common SMS-related tokens
    const initialTokens = [
      'book', 'schedule', 'help', 'support', 'pricing', 
      'interested', 'not interested', 'urgent', 'cancel', 
      'confirm', 'question', 'problem', 'great', 'thanks'
    ];

    initialTokens.forEach((token, index) => {
      this.tokenizer.set(token, index + 1);
    });
  }

  // Tokenize input text
  private tokenize(text: string): number[] {
    const words = text.toLowerCase().split(/\s+/);
    const tokenized = words.map(word => {
      if (!this.tokenizer.has(word)) {
        // Dynamically expand tokenizer
        const newIndex = this.tokenizer.size + 1;
        this.tokenizer.set(word, newIndex);
      }
      return this.tokenizer.get(word) || 0;
    });

    // Pad or truncate to fixed length
    return tokenized.length > this.maxSequenceLength 
      ? tokenized.slice(0, this.maxSequenceLength)
      : [...tokenized, ...Array(this.maxSequenceLength - tokenized.length).fill(0)];
  }

  // Build neural network model
  private buildModel() {
    const model = tf.sequential();
    
    // Embedding layer
    model.add(tf.layers.embedding({
      inputDim: this.tokenizer.size + 1,
      outputDim: 16,
      inputLength: this.maxSequenceLength
    }));

    // Flatten layer
    model.add(tf.layers.flatten());

    // Dense layers for classification
    model.add(tf.layers.dense({
      units: 64,
      activation: 'relu'
    }));

    model.add(tf.layers.dense({
      units: 32,
      activation: 'relu'
    }));

    // Sentiment output layer
    model.add(tf.layers.dense({
      units: Object.keys(SentimentCategory).length / 2,
      activation: 'softmax'
    }));

    model.compile({
      optimizer: 'adam',
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy']
    });

    return model;
  }

  // Train model with historical SMS data
  async trainModel(trainingData: {
    text: string[], 
    sentimentLabels: SentimentCategory[], 
    intentLabels: IntentCategory[]
  }) {
    // Convert text to numerical sequences
    const sequences = trainingData.text.map(text => this.tokenize(text));
    
    // Convert labels to one-hot encoded tensors
    const sentimentTensors = tf.oneHot(
      tf.tensor1d(
        trainingData.sentimentLabels.map(label => label), 
        'int32'
      ), 
      Object.keys(SentimentCategory).length / 2
    );

    const intentTensors = tf.oneHot(
      tf.tensor1d(
        trainingData.intentLabels.map(label => label), 
        'int32'
      ), 
      Object.keys(IntentCategory).length
    );

    // Create model if not exists
    this.model = this.buildModel();

    // Train the model
    await this.model.fit(
      tf.tensor2d(sequences), 
      sentimentTensors, 
      {
        epochs: 50,
        batchSize: 32,
        validationSplit: 0.2
      }
    );
  }

  // Predict sentiment and intent
  predict(text: string): {
    sentiment: SentimentCategory,
    intent: IntentCategory,
    confidence: number
  } {
    if (!this.model) {
      throw new Error('Model not trained. Call trainModel first.');
    }

    const sequence = this.tokenize(text);
    const inputTensor = tf.tensor2d([sequence]);

    const prediction = this.model.predict(inputTensor) as tf.Tensor;
    const sentimentPrediction = prediction.argMax(-1).dataSync()[0];
    
    return {
      sentiment: sentimentPrediction as SentimentCategory,
      intent: IntentCategory.GENERAL_INQUIRY, // Placeholder
      confidence: 0.85 // Placeholder
    };
  }

  // Hybrid classification method
  hybridClassify(text: string): AdvancedClassificationResult {
    const mlPrediction = this.predict(text);

    // Map ML prediction to existing classification structure
    return {
      ai_classification: this.mapIntentToClassification(mlPrediction.intent),
      sentiment_score: this.mapSentimentToScore(mlPrediction.sentiment),
      is_booking_signal: mlPrediction.intent === IntentCategory.BOOKING,
      urgency_level: 0, // TODO: Implement urgency detection
      support_signal: mlPrediction.intent === IntentCategory.SUPPORT,
      conversion_signal: mlPrediction.intent === IntentCategory.SALES
    };
  }

  // Utility methods to map between ML and existing classification
  private mapIntentToClassification(intent: IntentCategory): string | null {
    switch (intent) {
      case IntentCategory.BOOKING: return 'booking_intent';
      case IntentCategory.SUPPORT: return 'support_request';
      case IntentCategory.SALES: return 'conversion_inquiry';
      case IntentCategory.OPT_OUT: return 'hard_opt_out';
      default: return 'general_message';
    }
  }

  private mapSentimentToScore(sentiment: SentimentCategory): number | null {
    switch (sentiment) {
      case SentimentCategory.VERY_NEGATIVE: return -1;
      case SentimentCategory.NEGATIVE: return -0.5;
      case SentimentCategory.NEUTRAL: return 0;
      case SentimentCategory.POSITIVE: return 0.5;
      case SentimentCategory.VERY_POSITIVE: return 1;
      default: return null;
    }
  }
}