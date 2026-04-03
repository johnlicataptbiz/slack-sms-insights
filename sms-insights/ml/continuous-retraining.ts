import { PrismaClient } from '@prisma/client'
import { SentimentClassifier } from './sentiment-classifier'
import { PerformanceMonitor } from './performance-monitor'
import { BiasDetector } from './bias-detector'
import { MLModelStorage } from './model-storage'
import { logger } from '@/lib/logger'

interface RetrainingConfig {
  performanceThreshold: {
    accuracy: number
    f1Score: number
  }
  biasTolerance: {
    maxBiasDeviation: number
    protectedAttributes: string[]
  }
  retrainingFrequency: {
    intervalHours: number
    minSampleSize: number
  }
}

export class ContinuousModelRetrainer {
  private prisma: PrismaClient
  private classifier: SentimentClassifier
  private performanceMonitor: PerformanceMonitor
  private biasDetector: BiasDetector
  private modelStorage: MLModelStorage
  private config: RetrainingConfig

  constructor(config?: Partial<RetrainingConfig>) {
    this.prisma = new PrismaClient()
    this.classifier = new SentimentClassifier()
    this.performanceMonitor = new PerformanceMonitor()
    this.biasDetector = new BiasDetector()
    this.modelStorage = new MLModelStorage()
    
    this.config = {
      performanceThreshold: {
        accuracy: 0.85,
        f1Score: 0.82
      },
      biasTolerance: {
        maxBiasDeviation: 0.15,
        protectedAttributes: ['language', 'sentiment_origin']
      },
      retrainingFrequency: {
        intervalHours: 24,
        minSampleSize: 10000
      },
      ...config
    }
  }

  async shouldRetrain(): Promise<boolean> {
    try {
      // Check performance metrics
      const performanceMetrics = await this.performanceMonitor.getLatestMetrics()
      const performanceCondition = 
        performanceMetrics.accuracy < this.config.performanceThreshold.accuracy ||
        performanceMetrics.f1Score < this.config.performanceThreshold.f1Score

      // Check bias metrics
      const biasMetrics = await this.biasDetector.detectBiasDeviation()
      const biasCondition = biasMetrics.some(
        bias => bias.deviation > this.config.biasTolerance.maxBiasDeviation
      )

      // Check sample size and time since last training
      const sampleSize = await this.getSampleSize()
      const timeSinceLastTraining = await this.getTimeSinceLastTraining()

      return performanceCondition || 
             biasCondition || 
             (sampleSize >= this.config.retrainingFrequency.minSampleSize && 
              timeSinceLastTraining >= this.config.retrainingFrequency.intervalHours)
    } catch (error) {
      logger.error('Error checking retraining conditions', { error })
      return false
    }
  }

  async prepareTrainingData(): Promise<Array<{text: string, label: string}>> {
    // Fetch recent SMS events with manual corrections or high confidence intervals
    const trainingData = await this.prisma.smsEvent.findMany({
      where: {
        OR: [
          { manuallyReviewed: true },
          { aiConfidenceScore: { gt: 0.9 } }
        ]
      },
      select: {
        body: true,
        aiSentimentLabel: true
      },
      take: 50000 // Limit to prevent memory issues
    })

    return trainingData.map(event => ({
      text: event.body || '',
      label: event.aiSentimentLabel || 'neutral'
    }))
  }

  async retrain(): Promise<void> {
    try {
      // Check if retraining is necessary
      if (!(await this.shouldRetrain())) {
        logger.info('Retraining not required at this time')
        return
      }

      // Prepare training data
      const trainingData = await this.prepareTrainingData()

      // Retrain the model
      const newModel = await this.classifier.train(trainingData)

      // Evaluate new model
      const evaluationMetrics = await this.performanceMonitor.evaluate(newModel)

      // Check if new model meets performance criteria
      if (
        evaluationMetrics.accuracy >= this.config.performanceThreshold.accuracy &&
        evaluationMetrics.f1Score >= this.config.performanceThreshold.f1Score
      ) {
        // Store the new model version
        await this.modelStorage.saveModel(newModel, {
          timestamp: new Date(),
          trainingDataSize: trainingData.length,
          metrics: evaluationMetrics
        })

        // Update active model
        this.classifier.loadModel(newModel)

        logger.info('Model successfully retrained', { 
          accuracy: evaluationMetrics.accuracy,
          f1Score: evaluationMetrics.f1Score 
        })
      } else {
        logger.warn('New model did not meet performance criteria', evaluationMetrics)
      }
    } catch (error) {
      logger.error('Model retraining failed', { error })
    }
  }

  private async getSampleSize(): Promise<number> {
    return this.prisma.smsEvent.count({
      where: { 
        createdAt: { 
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) 
        } 
      }
    })
  }

  private async getTimeSinceLastTraining(): Promise<number> {
    // Retrieve last training timestamp from model storage
    const lastTraining = await this.modelStorage.getLatestModelTimestamp()
    
    // Calculate hours since last training
    return lastTraining 
      ? (Date.now() - lastTraining.getTime()) / (1000 * 60 * 60)
      : Infinity
  }

  // Scheduled retraining method
  async scheduleRetraining(): Promise<void> {
    // This could be integrated with a job scheduler like node-cron
    setInterval(async () => {
      await this.retrain()
    }, this.config.retrainingFrequency.intervalHours * 60 * 60 * 1000)
  }
}

// Export a singleton instance for easy import
export const continuousModelRetrainer = new ContinuousModelRetrainer()