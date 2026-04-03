import { PrismaClient } from '@prisma/client'
import { logger } from '@/lib/logger'
import { ModelMetrics } from './performance-monitor'
import { AnomalyDetector } from './anomaly-detector'

export interface PerformanceTrackingConfig {
  historicalDataRetentionDays: number
  performanceSnapshotInterval: number
  criticalMetricsThresholds: {
    accuracyDecline: number
    precisionDecline: number
    recallDecline: number
    f1ScoreDecline: number
  }
}

export class ModelPerformanceTrackingSystem {
  private prisma: PrismaClient
  private anomalyDetector: AnomalyDetector
  private config: PerformanceTrackingConfig

  constructor(config?: Partial<PerformanceTrackingConfig>) {
    this.prisma = new PrismaClient()
    this.anomalyDetector = new AnomalyDetector()
    
    this.config = {
      historicalDataRetentionDays: 90,
      performanceSnapshotInterval: 24 * 60 * 60 * 1000, // Daily
      criticalMetricsThresholds: {
        accuracyDecline: 0.1, // 10% decline
        precisionDecline: 0.1,
        recallDecline: 0.1,
        f1ScoreDecline: 0.1
      },
      ...config
    }
  }

  async capturePerformanceSnapshot(): Promise<void> {
    try {
      // Fetch latest performance metrics
      const latestMetrics = await this.prisma.mlModelPerformance.findFirst({
        orderBy: { timestamp: 'desc' }
      })

      if (!latestMetrics) {
        logger.warn('No performance metrics available for snapshot')
        return
      }

      // Create performance snapshot
      await this.prisma.mlModelPerformanceSnapshot.create({
        data: {
          timestamp: new Date(),
          accuracy: latestMetrics.accuracy,
          precision: latestMetrics.precision,
          recall: latestMetrics.recall,
          f1Score: latestMetrics.f1Score,
          confusionMatrix: latestMetrics.confusionMatrix as any
        }
      })

      logger.info('Performance snapshot captured successfully')
    } catch (error) {
      logger.error('Error capturing performance snapshot', { error })
    }
  }

  async analyzePerformanceTrend(): Promise<{
    performanceTrend: string
    criticalIssuesDetected: boolean
    trendDetails: {
      accuracyTrend: number
      precisionTrend: number
      recallTrend: number
      f1ScoreTrend: number
    }
  }> {
    try {
      // Fetch historical performance snapshots
      const historicalSnapshots = await this.prisma.mlModelPerformanceSnapshot.findMany({
        orderBy: { timestamp: 'desc' },
        take: 30 // Last 30 days
      })

      if (historicalSnapshots.length < 2) {
        return {
          performanceTrend: 'Insufficient data',
          criticalIssuesDetected: false,
          trendDetails: {
            accuracyTrend: 0,
            precisionTrend: 0,
            recallTrend: 0,
            f1ScoreTrend: 0
          }
        }
      }

      // Calculate performance trends
      const calculateTrend = (metric: keyof Pick<ModelMetrics, 'accuracy' | 'precision' | 'recall' | 'f1Score'>) => {
        const oldestSnapshot = historicalSnapshots[historicalSnapshots.length - 1]
        const newestSnapshot = historicalSnapshots[0]
        
        return (newestSnapshot[metric] - oldestSnapshot[metric]) / oldestSnapshot[metric]
      }

      const trendDetails = {
        accuracyTrend: calculateTrend('accuracy'),
        precisionTrend: calculateTrend('precision'),
        recallTrend: calculateTrend('recall'),
        f1ScoreTrend: calculateTrend('f1Score')
      }

      // Check for critical performance decline
      const criticalIssuesDetected = 
        Math.abs(trendDetails.accuracyTrend) > this.config.criticalMetricsThresholds.accuracyDecline ||
        Math.abs(trendDetails.precisionTrend) > this.config.criticalMetricsThresholds.precisionDecline ||
        Math.abs(trendDetails.recallTrend) > this.config.criticalMetricsThresholds.recallDecline ||
        Math.abs(trendDetails.f1ScoreTrend) > this.config.criticalMetricsThresholds.f1ScoreDecline

      // Determine performance trend description
      let performanceTrend = 'Stable'
      if (criticalIssuesDetected) {
        performanceTrend = 'Significant Performance Decline'
      } else if (Object.values(trendDetails).some(trend => trend > 0.05)) {
        performanceTrend = 'Gradual Improvement'
      } else if (Object.values(trendDetails).some(trend => trend < -0.05)) {
        performanceTrend = 'Gradual Decline'
      }

      return {
        performanceTrend,
        criticalIssuesDetected,
        trendDetails
      }
    } catch (error) {
      logger.error('Error analyzing performance trend', { error })
      throw error
    }
  }

  async cleanupHistoricalData(): Promise<void> {
    try {
      // Calculate the cutoff date for data retention
      const cutoffDate = new Date(Date.now() - (this.config.historicalDataRetentionDays * 24 * 60 * 60 * 1000))

      // Delete performance snapshots older than retention period
      const { count } = await this.prisma.mlModelPerformanceSnapshot.deleteMany({
        where: {
          timestamp: {
            lt: cutoffDate
          }
        }
      })

      logger.info(`Cleaned up ${count} old performance snapshots`)
    } catch (error) {
      logger.error('Error cleaning up historical performance data', { error })
    }
  }

  async triggerPerformanceReview(): Promise<void> {
    try {
      // Capture performance snapshot
      await this.capturePerformanceSnapshot()

      // Analyze performance trend
      const performanceAnalysis = await this.analyzePerformanceTrend()

      // If critical issues detected, trigger remediation
      if (performanceAnalysis.criticalIssuesDetected) {
        await this.prisma.mlModelRetrainingQueue.create({
          data: {
            timestamp: new Date(),
            reason: 'Critical performance decline',
            details: JSON.stringify(performanceAnalysis.trendDetails)
          }
        })

        logger.warn('Critical performance issues detected. Retraining triggered.', {
          performanceAnalysis
        })
      }

      // Clean up old historical data
      await this.cleanupHistoricalData()
    } catch (error) {
      logger.error('Error in performance review process', { error })
    }
  }

  // Set up periodic performance tracking
  startPeriodicTracking() {
    // Run performance review at configured interval
    setInterval(() => {
      this.triggerPerformanceReview()
        .catch(error => logger.error('Error in periodic performance tracking', { error }))
    }, this.config.performanceSnapshotInterval)

    logger.info('Periodic model performance tracking started')
  }
}

// Export a singleton instance for easy use
export const modelPerformanceTrackingSystem = new ModelPerformanceTrackingSystem()