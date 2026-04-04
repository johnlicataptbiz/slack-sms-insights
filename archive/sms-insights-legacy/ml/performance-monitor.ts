import { PrismaClient } from '@prisma/client'
import { logger } from '@/lib/logger'

export interface ModelMetrics {
  accuracy: number
  precision: number
  recall: number
  f1Score: number
  confusionMatrix?: Record<string, Record<string, number>>
}

export class PerformanceMonitor {
  private prisma: PrismaClient

  constructor() {
    this.prisma = new PrismaClient()
  }

  async getLatestMetrics(): Promise<ModelMetrics> {
    try {
      // Fetch recent performance data from database
      const performanceRecord = await this.prisma.mlModelPerformance.findFirst({
        orderBy: { timestamp: 'desc' },
        select: {
          accuracy: true,
          precision: true,
          recall: true,
          f1Score: true,
          confusionMatrix: true
        }
      })

      // If no record exists, return default metrics
      if (!performanceRecord) {
        return {
          accuracy: 0.5,
          precision: 0.5,
          recall: 0.5,
          f1Score: 0.5
        }
      }

      return {
        accuracy: performanceRecord.accuracy,
        precision: performanceRecord.precision,
        recall: performanceRecord.recall,
        f1Score: performanceRecord.f1Score,
        confusionMatrix: performanceRecord.confusionMatrix as Record<string, Record<string, number>>
      }
    } catch (error) {
      logger.error('Error retrieving model performance metrics', { error })
      throw error
    }
  }

  async evaluate(model: any): Promise<ModelMetrics> {
    try {
      // Fetch test dataset
      const testData = await this.prisma.smsEvent.findMany({
        where: {
          manuallyReviewed: true,
          aiSentimentLabel: { not: null }
        },
        select: {
          body: true,
          aiSentimentLabel: true
        },
        take: 10000 // Limit test set size
      })

      // Prepare confusion matrix
      const confusionMatrix: Record<string, Record<string, number>> = {}
      const sentimentLabels = ['positive', 'negative', 'neutral']
      
      sentimentLabels.forEach(actual => {
        confusionMatrix[actual] = {}
        sentimentLabels.forEach(predicted => {
          confusionMatrix[actual][predicted] = 0
        })
      })

      // Evaluate model
      let correctPredictions = 0
      const totalPredictions = testData.length

      const predictions = await Promise.all(testData.map(async (event) => {
        const predictedLabel = await model.predict(event.body)
        const actualLabel = event.aiSentimentLabel

        // Update confusion matrix
        confusionMatrix[actualLabel][predictedLabel]++

        // Check if prediction is correct
        return predictedLabel === actualLabel
      }))

      correctPredictions = predictions.filter(Boolean).length

      // Calculate metrics
      const accuracy = correctPredictions / totalPredictions
      
      // More advanced metrics calculation would involve 
      // computing precision, recall, and F1 score for each label
      const metrics: ModelMetrics = {
        accuracy,
        precision: this.calculatePrecision(confusionMatrix),
        recall: this.calculateRecall(confusionMatrix),
        f1Score: this.calculateF1Score(confusionMatrix),
        confusionMatrix
      }

      // Persist performance metrics
      await this.persistMetrics(metrics)

      return metrics
    } catch (error) {
      logger.error('Error evaluating model performance', { error })
      throw error
    }
  }

  private calculatePrecision(confusionMatrix: Record<string, Record<string, number>>): number {
    // Calculate precision for each label and return average
    const precisions = Object.keys(confusionMatrix).map(label => {
      const truePositives = confusionMatrix[label][label]
      const totalPredicted = Object.values(confusionMatrix[label]).reduce((sum, val) => sum + val, 0)
      return truePositives / (totalPredicted || 1)
    })

    return precisions.reduce((sum, val) => sum + val, 0) / precisions.length
  }

  private calculateRecall(confusionMatrix: Record<string, Record<string, number>>): number {
    // Calculate recall for each label and return average
    const recalls = Object.keys(confusionMatrix).map(label => {
      const truePositives = confusionMatrix[label][label]
      const totalActual = Object.keys(confusionMatrix).reduce((sum, key) => 
        sum + confusionMatrix[key][label], 0)
      return truePositives / (totalActual || 1)
    })

    return recalls.reduce((sum, val) => sum + val, 0) / recalls.length
  }

  private calculateF1Score(confusionMatrix: Record<string, Record<string, number>>): number {
    const precision = this.calculatePrecision(confusionMatrix)
    const recall = this.calculateRecall(confusionMatrix)
    
    // Harmonic mean of precision and recall
    return 2 * (precision * recall) / (precision + recall || 1)
  }

  private async persistMetrics(metrics: ModelMetrics): Promise<void> {
    try {
      await this.prisma.mlModelPerformance.create({
        data: {
          timestamp: new Date(),
          accuracy: metrics.accuracy,
          precision: metrics.precision,
          recall: metrics.recall,
          f1Score: metrics.f1Score,
          confusionMatrix: metrics.confusionMatrix as any
        }
      })
    } catch (error) {
      logger.error('Error persisting model performance metrics', { error })
    }
  }
}