import { SentimentClassifier, SentimentCategory, IntentCategory } from './sentiment-classifier';
import { detect } from 'langdetect';

// Language-specific keyword lists
export const MULTILINGUAL_KEYWORDS: Record<string, {
  positive: string[];
  negative: string[];
  booking: string[];
  support: string[];
}> = {
  en: {
    positive: ['great', 'awesome', 'excellent', 'perfect', 'thank', 'thanks'],
    negative: ['bad', 'terrible', 'awful', 'horrible', 'stop', 'cancel'],
    booking: ['book', 'schedule', 'appointment', 'meeting'],
    support: ['help', 'support', 'problem', 'issue']
  },
  es: {
    positive: ['genial', 'excelente', 'perfecto', 'gracias', 'gracias'],
    negative: ['malo', 'terrible', 'horrible', 'parar', 'cancelar'],
    booking: ['reservar', 'programar', 'cita', 'reunión'],
    support: ['ayuda', 'soporte', 'problema', 'asunto']
  },
  fr: {
    positive: ['génial', 'excellent', 'parfait', 'merci', 'merci beaucoup'],
    negative: ['mauvais', 'terrible', 'horrible', 'arrêter', 'annuler'],
    booking: ['réserver', 'programmer', 'rendez-vous', 'réunion'],
    support: ['aide', 'support', 'problème', 'question']
  }
};

export class MultilingualSentimentClassifier extends SentimentClassifier {
  // Language detection
  detectLanguage(text: string): string {
    try {
      return detect(text)[0].lang;
    } catch {
      return 'en'; // Default to English if detection fails
    }
  }

  // Enhanced classification with multilingual support
  hybridClassify(text: string) {
    const language = this.detectLanguage(text);
    const languageKeywords = MULTILINGUAL_KEYWORDS[language] || MULTILINGUAL_KEYWORDS['en'];

    // Extend base classification with language-specific keywords
    const baseClassification = super.hybridClassify(text);

    // Language-specific sentiment scoring
    const lowerText = text.toLowerCase();
    const positiveMatches = languageKeywords.positive.filter(keyword => 
      lowerText.includes(keyword)
    );
    
    const negativeMatches = languageKeywords.negative.filter(keyword => 
      lowerText.includes(keyword)
    );

    const bookingMatches = languageKeywords.booking.filter(keyword => 
      lowerText.includes(keyword)
    );

    const supportMatches = languageKeywords.support.filter(keyword => 
      lowerText.includes(keyword)
    );

    // Adjust sentiment score based on language-specific keywords
    let adjustedSentimentScore = baseClassification.sentiment_score || 0;
    if (positiveMatches.length > 0) adjustedSentimentScore += 0.2;
    if (negativeMatches.length > 0) adjustedSentimentScore -= 0.2;

    // Enhance classification with language-specific insights
    return {
      ...baseClassification,
      sentiment_score: adjustedSentimentScore,
      language_detected: language,
      language_specific_signals: {
        positive_keywords: positiveMatches,
        negative_keywords: negativeMatches,
        booking_keywords: bookingMatches,
        support_keywords: supportMatches
      }
    };
  }

  // Add new language support
  addLanguageSupport(
    languageCode: string, 
    keywords: {
      positive: string[];
      negative: string[];
      booking: string[];
      support: string[];
    }
  ) {
    MULTILINGUAL_KEYWORDS[languageCode] = keywords;
  }

  // Translate classification results
  translateClassification(
    classification: ReturnType<typeof this.hybridClassify>, 
    targetLanguage: string = 'en'
  ) {
    // Placeholder for translation logic
    // In a real-world scenario, this would use a translation service
    const translationMap: Record<string, Record<string, string>> = {
      'booking_intent': {
        'es': 'intención de reserva',
        'fr': 'intention de réservation'
      },
      'support_request': {
        'es': 'solicitud de soporte',
        'fr': 'demande de support'
      }
    };

    return {
      ...classification,
      ai_classification_translated: translationMap[classification.ai_classification]?.[targetLanguage] 
        || classification.ai_classification
    };
  }
}