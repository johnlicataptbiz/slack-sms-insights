import { PrismaClient } from '@prisma/client'
import { logger } from '@/lib/logger'

export interface FeatureImportance {
  feature: string
  importance: number
}

export interface PredictionExplanation {
  sentiment: string
  topFeatures: FeatureImportance[]
  confidenceScore: number
  decisionBoundary: string
}

export class ExplainabilityToolkit {
  private prisma: PrismaClient

  constructor() {
    this.prisma = new PrismaClient()
  }

  async explainPrediction(message: string): Promise<PredictionExplanation> {
    try {
      // Simulate feature extraction and importance calculation
      const features = this.extractFeatures(message)
      const topFeatures = this.calculateFeatureImportance(features)
      
      // Simulate sentiment prediction
      const sentiment = this.predictSentiment(message)
      
      // Simulate confidence score calculation
      const confidenceScore = this.calculateConfidenceScore(topFeatures)
      
      // Determine decision boundary
      const decisionBoundary = this.determineDecisionBoundary(sentiment, topFeatures)

      // Log explanation for audit purposes
      this.logExplanation(message, sentiment, topFeatures)

      return {
        sentiment,
        topFeatures,
        confidenceScore,
        decisionBoundary
      }
    } catch (error) {
      logger.error('Error in prediction explanation', { error, message })
      throw error
    }
  }

  private extractFeatures(message: string): Record<string, number> {
    // Advanced feature extraction
    const features: Record<string, number> = {
      positiveWordCount: this.countPositiveWords(message),
      negativeWordCount: this.countNegativeWords(message),
      punctuationIntensity: this.calculatePunctuationIntensity(message),
      messageLength: message.length,
      capitalizedWordRatio: this.calculateCapitalizedWordRatio(message),
      sentenceComplexity: this.calculateSentenceComplexity(message)
    }

    return features
  }

  private calculateFeatureImportance(features: Record<string, number>): FeatureImportance[] {
    return Object.entries(features)
      .map(([feature, value]) => ({
        feature,
        importance: Math.abs(value) // Simplified importance calculation
      }))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 5) // Top 5 features
  }

  private predictSentiment(message: string): string {
    // Simplified sentiment prediction logic
    const positiveWords = this.countPositiveWords(message)
    const negativeWords = this.countNegativeWords(message)

    if (positiveWords > negativeWords) return 'positive'
    if (negativeWords > positiveWords) return 'negative'
    return 'neutral'
  }

  private calculateConfidenceScore(topFeatures: FeatureImportance[]): number {
    // Calculate confidence based on feature importance
    const totalImportance = topFeatures.reduce((sum, feature) => sum + feature.importance, 0)
    return Math.min(totalImportance / 10, 1) // Normalize to 0-1 range
  }

  private determineDecisionBoundary(sentiment: string, topFeatures: FeatureImportance[]): string {
    // Explain the key factors that led to the sentiment classification
    const keyFeatures = topFeatures
      .map(f => `${f.feature}: ${f.importance.toFixed(2)}`)
      .join(', ')

    return `Sentiment determined by: ${keyFeatures}`
  }

  private countPositiveWords(message: string): number {
    const positiveWordList = [
      'good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 
      'happy', 'pleased', 'delighted', 'satisfied', 'awesome'
    ]
    return positiveWordList.filter(word => 
      message.toLowerCase().includes(word)
    ).length
  }

  private countNegativeWords(message: string): number {
    const negativeWordList = [
      'bad', 'terrible', 'awful', 'horrible', 'disappointing', 
      'unhappy', 'frustrated', 'angry', 'worst', 'poor'
    ]
    return negativeWordList.filter(word => 
      message.toLowerCase().includes(word)
    ).length
  }

  private calculatePunctuationIntensity(message: string): number {
    const punctuationMarks = message.match(/[!?\.]/g) || []
    return punctuationMarks.length
  }

  private calculateCapitalizedWordRatio(message: string): number {
    const words = message.split(/\s+/)
    const capitalizedWords = words.filter(word => 
      word.length > 1 && word[0] === word[0].toUpperCase()
    )
    return capitalizedWords.length / words.length
  }

  private calculateSentenceComplexity(message: string): number {
    const words = message.split(/\s+/)
    const averageWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length
    return averageWordLength
  }

  private async logExplanation(
    message: string, 
    sentiment: string, 
    topFeatures: FeatureImportance[]
  ): Promise<void> {
    try {
      await this.prisma.mlPredictionExplanation.create({
        data: {
          timestamp: new Date(),
          message,
          sentiment,
          topFeatures: JSON.stringify(topFeatures)
        }
      })
    } catch (error) {
      logger.error('Error logging prediction explanation', { error })
    }
  }

  async getHistoricalExplanations(limit: number = 100): Promise<any[]> {
    try {
      return await this.prisma.mlPredictionExplanation.findMany({
        orderBy: { timestamp: 'desc' },
        take: limit
      })
    } catch (error) {
      logger.error('Error retrieving historical explanations', { error })
      return []
    }
  }
}

// Export a singleton instance for easy use
export const explainabilityToolkit = new ExplainabilityToolkit()