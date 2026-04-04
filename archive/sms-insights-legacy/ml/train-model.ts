import { SentimentClassifier, SentimentCategory, IntentCategory } from './sentiment-classifier';
import { getPrisma } from '../services/prisma';

async function prepareTrainingData() {
  const prisma = getPrisma();

  // Fetch historical SMS events for training
  const smsEvents = await prisma.smsEvent.findMany({
    where: {
      // Only use events with clear classification or sentiment
      NOT: {
        ai_classification: null,
        sentiment_score: null
      }
    },
    select: {
      body: true,
      ai_classification: true,
      sentiment_score: true
    },
    take: 10000 // Limit to prevent overwhelming memory
  });

  // Transform data for ML training
  const trainingData = {
    text: smsEvents.map(event => event.body || ''),
    sentimentLabels: smsEvents.map(event => {
      if (event.sentiment_score === null) return SentimentCategory.NEUTRAL;
      
      const score = event.sentiment_score;
      if (score <= -0.75) return SentimentCategory.VERY_NEGATIVE;
      if (score < 0) return SentimentCategory.NEGATIVE;
      if (score === 0) return SentimentCategory.NEUTRAL;
      if (score > 0 && score <= 0.75) return SentimentCategory.POSITIVE;
      return SentimentCategory.VERY_POSITIVE;
    }),
    intentLabels: smsEvents.map(event => {
      switch (event.ai_classification) {
        case 'booking_intent':
          return IntentCategory.BOOKING;
        case 'support_request':
          return IntentCategory.SUPPORT;
        case 'conversion_inquiry':
          return IntentCategory.SALES;
        case 'hard_opt_out':
        case 'soft_opt_out':
          return IntentCategory.OPT_OUT;
        default:
          return IntentCategory.GENERAL_INQUIRY;
      }
    })
  };

  return trainingData;
}

async function trainSentimentModel() {
  console.log('🚀 Starting SMS Sentiment Model Training');
  
  const classifier = new SentimentClassifier();
  
  try {
    const trainingData = await prepareTrainingData();
    
    console.log('📊 Training Data Summary:');
    console.log(`   Total Samples: ${trainingData.text.length}`);
    console.log(`   Sentiment Distribution: ${JSON.stringify(
      trainingData.sentimentLabels.reduce((acc, label) => {
        acc[SentimentCategory[label]] = (acc[SentimentCategory[label]] || 0) + 1;
        return acc;
      }, {})
    )}`);
    console.log(`   Intent Distribution: ${JSON.stringify(
      trainingData.intentLabels.reduce((acc, label) => {
        acc[IntentCategory[label]] = (acc[IntentCategory[label]] || 0) + 1;
        return acc;
      }, {})
    )}`);

    // Train the model
    await classifier.trainModel(trainingData);
    
    console.log('✅ Model Training Completed Successfully');
    
    // Optional: Save the trained model
    await classifier.saveModel('./trained-model');
    
  } catch (error) {
    console.error('❌ Model Training Failed:', error);
    process.exit(1);
  }
}

// Run training script
trainSentimentModel();