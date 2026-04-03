import { PrismaClient } from '@prisma/client'
import { logger } from '@/lib/logger'
import { ModelMetrics } from './performance-monitor'

export interface AnomalyDetectionConfig {
  accuracyThreshold: number
  precisionThreshold: number
  recallThreshold: number
  f1ScoreThreshold: number
  volatilityWindow: number
  deviationMultiplier: number
}

export class AnomalyDetector {
  private prisma: PrismaClient
  private config: AnomalyDetectionConfig

  constructor(config?: Partial<AnomalyDetectionConfig>) {
    this.prisma = new PrismaClient()
    this.config = {
      accuracyThreshold: 0.85,
      precisionThreshold: 0.80,
      recallThreshold: 0.80,
      f1ScoreThreshold: 0.82,
      volatilityWindow: 10, // Number of recent performance records to analyze
      deviationMultiplier: 2, // Standard deviations to consider an anomaly
      ...config
    }
  }

  async detectPerformanceAnomalies(): Promise<{
    hasAnomalies: boolean
    anomalyDetails: string[]
  }> {
    const anomalyDetails: string[] = []

    try {
      // Fetch recent performance metrics
      const recentMetrics = await this.prisma.mlModelPerformance.findMany({
        orderBy: { timestamp: 'desc' },
        take: this.config.volatilityWindow
      })

      // Check if metrics meet performance thresholds
      const latestMetrics = recentMetrics[0]
      if (!latestMetrics) {
        logger.warn('No performance metrics available for anomaly detection')
        return { hasAnomalies: false, anomalyDetails: [] }
      }

      // Performance threshold checks
      if (latestMetrics.accuracy < this.config.accuracyThreshold) {
        anomalyDetails.push(`Low accuracy: ${latestMetrics.accuracy.toFixed(4)} (threshold: ${this.config.accuracyThreshold})`)
      }

      if (latestMetrics.precision < this.config.precisionThreshold) {
        anomalyDetails.push(`Low precision: ${latestMetrics.precision.toFixed(4)} (threshold: ${this.config.precisionThreshold})`)
      }

      if (latestMetrics.recall < this.config.recallThreshold) {
        anomalyDetails.push(`Low recall: ${latestMetrics.recall.toFixed(4)} (threshold: ${this.config.recallThreshold})`)
      }

      if (latestMetrics.f1Score < this.config.f1ScoreThreshold) {
        anomalyDetails.push(`Low F1 Score: ${latestMetrics.f1Score.toFixed(4)} (threshold: ${this.config.f1ScoreThreshold})`)
      }

      // Volatility analysis
      const metricVolatility = this.analyzeMetricVolatility(recentMetrics)
      if (metricVolatility.hasVolatileMetrics) {
        anomalyDetails.push(...metricVolatility.volatileMetricDetails)
      }

      // Detect bias in confusion matrix
      const confusionMatrixBias = this.detectConfusionMatrixBias(latestMetrics.confusionMatrix)
      if (confusionMatrixBias.hasBias) {
        anomalyDetails.push(...confusionMatrixBias.biasDetails)
      }

      // Log anomalies
      if (anomalyDetails.length > 0) {
        logger.warn('Performance anomalies detected', { anomalies: anomalyDetails })
      }

      return {
        hasAnomalies: anomalyDetails.length > 0,
        anomalyDetails
      }
    } catch (error) {
      logger.error('Error in anomaly detection', { error })
      return { hasAnomalies: false, anomalyDetails: [] }
    }
  }

  private analyzeMetricVolatility(metrics: any[]): {
    hasVolatileMetrics: boolean
    volatileMetricDetails: string[]
  } {
    const volatileMetricDetails: string[] = []

    // Calculate mean and standard deviation for each metric
    const calculateMetricVolatility = (extractFn: (m: any) => number) => {
      const values = metrics.map(extractFn)
      const mean = values.reduce((a, b) => a + b, 0) / values.length
      const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length
      const stdDev = Math.sqrt(variance)

      return { mean, stdDev }
    }

    const metricChecks = [
      { name: 'Accuracy', extract: (m: any) => m.accuracy },
      { name: 'Precision', extract: (m: any) => m.precision },
      { name: 'Recall', extract: (m: any) => m.recall },
      { name: 'F1 Score', extract: (m: any) => m.f1Score }
    ]

    let hasVolatileMetrics = false

    metricChecks.forEach(({ name, extract }) => {
      const { mean, stdDev } = calculateMetricVolatility(extract)
      
      // Check if latest value deviates significantly from mean
      const latestValue = extract(metrics[0])
      const deviation = Math.abs(latestValue - mean)
      
      if (deviation > (stdDev * this.config.deviationMultiplier)) {
        volatileMetricDetails.push(
          `High volatility in ${name}: Latest value ${latestValue.toFixed(4)} deviates significantly from mean ${mean.toFixed(4)} (StdDev: ${stdDev.toFixed(4)})`
        )
        hasVolatileMetrics = true
      }
    })

    return { hasVolatileMetrics, volatileMetricDetails }
  }

  private detectConfusionMatrixBias(confusionMatrix: any): {
    hasBias: boolean
    biasDetails: string[]
  } {
    const biasDetails: string[] = []

    if (!confusionMatrix) {
      return { hasBias: false, biasDetails: [] }
    }

    const labels = Object.keys(confusionMatrix)
    
    // Check for class imbalance
    labels.forEach(label => {
      const totalForLabel = Object.values(confusionMatrix[label]).reduce((sum, val) => sum + val, 0)
      const correctPredictions = confusionMatrix[label][label]
      const incorrectPredictions = totalForLabel - correctPredictions

      const misclassificationRate = incorrectPredictions / totalForLabel

      if (misclassificationRate > 0.3) { // More than 30% misclassification
        biasDetails.push(
          `Potential bias for label '${label}': Misclassification rate ${(misclassificationRate * 100).toFixed(2)}%`
        )
      }
    })

    return {
      hasBias: biasDetails.length > 0,
      biasDetails
    }
  }

  async triggerRemediation(): Promise<void> {
    try {
      const anomalyResult = await this.detectPerformanceAnomalies()

      if (anomalyResult.hasAnomalies) {
        // Trigger model retraining or other remediation steps
        await this.prisma.mlModelRetrainingQueue.create({
          data: {
            timestamp: new Date(),
            reason: 'Performance anomalies detected',
            details: JSON.stringify(anomalyResult.anomalyDetails)
          }
        })

        logger.info('Remediation triggered due to performance anomalies', {
          anomalies: anomalyResult.anomalyDetails
        })
      }
    } catch (error) {
      logger.error('Error in anomaly remediation', { error })
    }
  }
}

// Export a singleton instance for easy use
export const anomalyDetector = new AnomalyDetector()