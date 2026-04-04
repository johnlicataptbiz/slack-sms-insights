// Enhanced Sentiment and Intent Keywords

export const BOOKING_KEYWORDS: string[] = [
  // Existing keywords
  'book', 'schedule', 'appointment', 'call', 'meeting', 'demo', 'consultation', 
  'calendar', 'time', 'available', 'slot', 'reserve', 'confirm',
  
  // Expanded contextual keywords
  'when can we', 'looking to schedule', 'interested in meeting', 
  'want to book', 'need to arrange', 'planning to discuss',
  'free for a', 'can we set up', 'would like to schedule',
  
  // Specific domain keywords (customize based on your business)
  'consultation call', 'product demo', 'strategy session', 
  'quick chat', 'discuss details', 'availability check'
];

export const POSITIVE_KEYWORDS: string[] = [
  // Existing positive keywords
  'great', 'awesome', 'excellent', 'perfect', 'thank', 'thanks', 
  'appreciate', 'love', 'yes', 'interested', 'ready',
  
  // Expanded emotional and engagement keywords
  'excited', 'looking forward', 'sounds good', 'fantastic', 
  'wonderful', 'amazing', 'can\'t wait', 'thrilled', 
  'absolutely', 'definitely', 'super helpful', 'impressed',
  
  // Conversational positive signals
  'sounds like a plan', 'that works', 'perfect timing', 
  'exactly what I needed', 'just what I was looking for'
];

export const NEGATIVE_KEYWORDS: string[] = [
  // Existing negative keywords
  'not interested', 'no thanks', 'stop', 'remove', 'unsubscribe', 
  'opt out', 'dont contact', 'dont call',
  
  // Expanded negative intent keywords
  'waste of time', 'not now', 'never mind', 'not relevant', 
  'not what I want', 'wrong information', 'misleading',
  
  // Emotional negative signals
  'frustrated', 'annoyed', 'disappointed', 'angry', 
  'terrible service', 'not helpful', 'completely unhelpful',
  
  // Opt-out and disengagement signals
  'leave me alone', 'stop messaging', 'do not contact', 
  'remove from list', 'not interested anymore'
];

export const URGENCY_KEYWORDS: string[] = [
  'asap', 'urgent', 'immediately', 'right now', 
  'time sensitive', 'critical', 'emergency', 
  'need ASAP', 'can\'t wait', 'time is of the essence'
];

export const SUPPORT_KEYWORDS: string[] = [
  'help', 'support', 'issue', 'problem', 'question', 
  'need assistance', 'can you help', 'having trouble', 
  'not working', 'confused', 'need clarification'
];

export const CONVERSION_KEYWORDS: string[] = [
  'pricing', 'cost', 'how much', 'investment', 'budget', 
  'quote', 'rates', 'package', 'pricing details', 
  'what does it cost', 'interested in pricing'
];

// Advanced Classification Result Interface
export interface AdvancedClassificationResult {
  ai_classification: string | null;
  sentiment_score: number | null;
  is_booking_signal: boolean;
  urgency_level: number;
  support_signal: boolean;
  conversion_signal: boolean;
}

// Comprehensive classification function
export function advancedClassifyMessage(body: string | null): AdvancedClassificationResult {
  // Handle empty or null messages
  if (!body || body.trim().length === 0) {
    return {
      ai_classification: 'empty_message',
      sentiment_score: null,
      is_booking_signal: false,
      urgency_level: 0,
      support_signal: false,
      conversion_signal: false
    };
  }

  const lowerBody = body.toLowerCase();
  
  // Booking signal detection
  const isBookingSignal = BOOKING_KEYWORDS.some(keyword => 
    lowerBody.includes(keyword)
  );

  // Sentiment scoring with more nuanced calculation
  const positiveMatches = POSITIVE_KEYWORDS.filter(keyword => 
    lowerBody.includes(keyword)
  );
  
  const negativeMatches = NEGATIVE_KEYWORDS.filter(keyword => 
    lowerBody.includes(keyword)
  );

  // Advanced sentiment scoring
  let sentimentScore = 0;
  if (positiveMatches.length > 0 || negativeMatches.length > 0) {
    sentimentScore = (positiveMatches.length - negativeMatches.length) / 
                     (positiveMatches.length + negativeMatches.length);
    sentimentScore = Math.round(sentimentScore * 1000) / 1000;
  }

  // Urgency detection
  const urgencyLevel = URGENCY_KEYWORDS.filter(keyword => 
    lowerBody.includes(keyword)
  ).length;

  // Support and conversion signals
  const supportSignal = SUPPORT_KEYWORDS.some(keyword => 
    lowerBody.includes(keyword)
  );

  const conversionSignal = CONVERSION_KEYWORDS.some(keyword => 
    lowerBody.includes(keyword)
  );

  // Advanced classification logic
  let aiClassification: string | null = null;
  if (isBookingSignal) {
    aiClassification = 'booking_intent';
  } else if (negativeMatches.length > 0) {
    aiClassification = sentimentScore < -0.5 ? 'hard_opt_out' : 'soft_opt_out';
  } else if (positiveMatches.length > 0 && lowerBody.includes('?')) {
    aiClassification = 'positive_inquiry';
  } else if (body.trim().length > 200) {
    aiClassification = 'detailed_message';
  } else if (body.trim().length < 10) {
    aiClassification = 'short_response';
  }

  return {
    ai_classification: aiClassification,
    sentiment_score: sentimentScore !== 0 ? sentimentScore : null,
    is_booking_signal: isBookingSignal,
    urgency_level,
    support_signal,
    conversion_signal
  };
}