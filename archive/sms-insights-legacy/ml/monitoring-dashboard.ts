import { PrismaClient } from '@prisma/client'
import { logger } from '@/lib/logger'
import * as prometheus from 'prom-client'

// Define custom Prometheus metrics for ML system monitoring
export class MLMonitoringDashboard {
  private prisma: PrismaClient
  private registry: prometheus.Registry

  // Performance Metrics
  private modelAccuracyGauge: prometheus.Gauge<string>
  private modelPrecisionGauge: prometheus.Gauge<string>
  private modelRecallGauge: prometheus.Gauge<string>
  private modelF1ScoreGauge: prometheus.Gauge<string>

  // Bias Metrics
  private biaDeviationGauge: prometheus.Gauge<string>

  // Retraining Metrics
  private modelRetrainingCounter: prometheus.Counter<string>
  private trainingDataSizeGauge: prometheus.Gauge<string>

  // Performance Thresholds
  private performanceThresholds = {
    accuracy: 0.85,
    precision: 0.82,
    recall: 0.80,
    f1Score: 0.82,
    biasDeviation: 0.15
  }

  constructor() {
    this.prisma = new PrismaClient()
    this.registry = new prometheus.Registry()

    // Initialize Prometheus metrics
    this.initializeMetrics()
  }

  private initializeMetrics(): void {
    // Performance Metrics
    this.modelAccuracyGauge = new prometheus.Gauge({
      name: 'ml_model_accuracy',
      help: 'Current ML model accuracy',
      labelNames: ['model_version'],
      registers: [this.registry]
    })

    this.modelPrecisionGauge = new prometheus.Gauge({
      name: 'ml_model_precision',
      help: 'Current ML model precision',
      labelNames: ['model_version'],
      registers: [this.registry]
    })

    this.modelRecallGauge = new prometheus.Gauge({
      name: 'ml_model_recall',
      help: 'Current ML model recall',
      labelNames: ['model_version'],
      registers: [this.registry]
    })

    this.modelF1ScoreGauge = new prometheus.Gauge({
      name: 'ml_model_f1_score',
      help: 'Current ML model F1 score',
      labelNames: ['model_version'],
      registers: [this.registry]
    })

    // Bias Metrics
    this.biaDeviationGauge = new prometheus.Gauge({
      name: 'ml_bias_deviation',
      help: 'Bias deviation across different attributes',
      labelNames: ['attribute'],
      registers: [this.registry]
    })

    // Retraining Metrics
    this.modelRetrainingCounter = new prometheus.Counter({
      name: 'ml_model_retraining_total',
      help: 'Total number of model retraining events',
      labelNames: ['trigger_reason'],
      registers: [this.registry]
    })

    this.trainingDataSizeGauge = new prometheus.Gauge({
      name: 'ml_training_data_size',
      help: 'Size of training dataset',
      labelNames: ['model_version'],
      registers: [this.registry]
    })
  }

  async updatePerformanceMetrics(): Promise<void> {
    try {
      // Fetch latest model performance from database
      const latestPerformance = await this.prisma.mlModelPerformance.findFirst({
        orderBy: { timestamp: 'desc' },
        select: {
          modelVersion: true,
          accuracy: true,
          precision: true,
          recall: true,
          f1Score: true
        }
      })

      if (latestPerformance) {
        const { modelVersion, accuracy, precision, recall, f1Score } = latestPerformance

        // Update Prometheus gauges
        this.modelAccuracyGauge.set(
          { model_version: modelVersion || 'unknown' }, 
          accuracy
        )
        this.modelPrecisionGauge.set(
          { model_version: modelVersion || 'unknown' }, 
          precision
        )
        this.modelRecallGauge.set(
          { model_version: modelVersion || 'unknown' }, 
          recall
        )
        this.modelF1ScoreGauge.set(
          { model_version: modelVersion || 'unknown' }, 
          f1Score
        )

        // Check performance thresholds and log warnings
        this.checkPerformanceThresholds(latestPerformance)
      }
    } catch (error) {
      logger.error('Error updating performance metrics', { error })
    }
  }

  async updateBiasMetrics(): Promise<void> {
    try {
      // Fetch latest bias detection results
      const latestBiasMetrics = await this.prisma.mlBiasDetection.findFirst({
        orderBy: { timestamp: 'desc' },
        select: { biasMetrics: true }
      })

      if (latestBiasMetrics?.biasMetrics) {
        const biasMetrics = latestBiasMetrics.biasMetrics as any[]

        biasMetrics.forEach(metric => {
          this.biaDeviationGauge.set(
            { attribute: metric.attribute }, 
            metric.deviation
          )

          // Check bias thresholds
          this.checkBiasThresholds(metric)
        })
      }
    } catch (error) {
      logger.error('Error updating bias metrics', { error })
    }
  }

  async updateRetrainingMetrics(): Promise<void> {
    try {
      // Fetch latest model storage information
      const latestModel = await this.prisma.mlModel.findFirst({
        orderBy: { timestamp: 'desc' },
        select: {
          version: true,
          trainingDataSize: true
        }
      })

      if (latestModel) {
        // Update training data size gauge
        this.trainingDataSizeGauge.set(
          { model_version: latestModel.version || 'unknown' }, 
          latestModel.trainingDataSize || 0
        )
      }
    } catch (error) {
      logger.error('Error updating retraining metrics', { error })
    }
  }

  private checkPerformanceThresholds(performance: {
    accuracy: number
    precision: number
    recall: number
    f1Score: number
  }): void {
    const { accuracy, precision, recall, f1Score } = performance
    const { 
      accuracy: accuracyThreshold,
      precision: precisionThreshold,
      recall: recallThreshold,
      f1Score: f1ScoreThreshold 
    } = this.performanceThresholds

    if (accuracy < accuracyThreshold) {
      logger.warn('Model accuracy below threshold', { 
        current: accuracy, 
        threshold: accuracyThreshold 
      })
    }

    if (precision < precisionThreshold) {
      logger.warn('Model precision below threshold', { 
        current: precision, 
        threshold: precisionThreshold 
      })
    }

    if (recall < recallThreshold) {
      logger.warn('Model recall below threshold', { 
        current: recall, 
        threshold: recallThreshold 
      })
    }

    if (f1Score < f1ScoreThreshold) {
      logger.warn('Model F1 score below threshold', { 
        current: f1Score, 
        threshold: f1ScoreThreshold 
      })
    }
  }

  private checkBiasThresholds(biasMetric: {
    attribute: string
    deviation: number
  }): void {
    const { attribute, deviation } = biasMetric
    const { biasDeviation: biasDeviationThreshold } = this.performanceThresholds

    if (deviation > biasDeviationThreshold) {
      logger.warn('Bias deviation above threshold', { 
        attribute, 
        current: deviation, 
        threshold: biasDeviationThreshold 
      })
    }
  }

  async triggerRetrainingEvent(reason: string): Promise<void> {
    try {
      // Increment retraining counter
      this.modelRetrainingCounter.inc({ trigger_reason: reason })

      logger.info('Model retraining triggered', { reason })
    } catch (error) {
      logger.error('Error logging retraining event', { error })
    }
  }

  async generateDashboardReport(): Promise<string> {
    try {
      // Fetch comprehensive metrics
      const [
        performanceMetrics,
        biasMetrics,
        modelInfo
      ] = await Promise.all([
        this.prisma.mlModelPerformance.findFirst({
          orderBy: { timestamp: 'desc' },
          select: {
            accuracy: true,
            precision: true,
            recall: true,
            f1Score: true
          }
        }),
        this.prisma.mlBiasDetection.findFirst({
          orderBy: { timestamp: 'desc' },
          select: { biasMetrics: true }
        }),
        this.prisma.mlModel.findFirst({
          orderBy: { timestamp: 'desc' },
          select: {
            version: true,
            trainingDataSize: true,
            timestamp: true
          }
        })
      ])

      // Generate human-readable report
      return JSON.stringify({
        timestamp: new Date().toISOString(),
        performance: performanceMetrics,
        bias: biasMetrics?.biasMetrics,
        model: {
          version: modelInfo?.version,
          trainingDataSize: modelInfo?.trainingDataSize,
          lastTrainedAt: modelInfo?.timestamp
        },
        thresholds: this.performanceThresholds
      }, null, 2)
    } catch (error) {
      logger.error('Error generating dashboard report', { error })
      return JSON.stringify({ error: 'Failed to generate report' })
    }
  }

  // Expose Prometheus metrics endpoint
  async getPrometheusMetrics(): Promise<string> {
    return this.registry.metrics()
  }
}