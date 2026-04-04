import { PrismaClient } from '@prisma/client'
import { WebSocket, WebSocketServer } from 'ws'
import { createServer } from 'http'
import { logger } from '@/lib/logger'
import { PerformanceMonitor, ModelMetrics } from './performance-monitor'
import { AnomalyDetector } from './anomaly-detector'

export interface ModelMonitoringConfig {
  port: number
  updateInterval: number
  historicalDataLimit: number
}

export class ModelMonitoringDashboard {
  private prisma: PrismaClient
  private performanceMonitor: PerformanceMonitor
  private anomalyDetector: AnomalyDetector
  private config: ModelMonitoringConfig
  private wss: WebSocketServer
  private httpServer: ReturnType<typeof createServer>

  constructor(config?: Partial<ModelMonitoringConfig>) {
    this.prisma = new PrismaClient()
    this.performanceMonitor = new PerformanceMonitor()
    this.anomalyDetector = new AnomalyDetector()
    
    this.config = {
      port: 8080,
      updateInterval: 60000, // 1 minute
      historicalDataLimit: 100,
      ...config
    }

    this.initializeWebSocketServer()
  }

  private initializeWebSocketServer() {
    this.httpServer = createServer()
    this.wss = new WebSocketServer({ server: this.httpServer })

    this.wss.on('connection', (ws: WebSocket) => {
      logger.info('New WebSocket connection established')
      
      // Send initial dashboard state
      this.sendDashboardState(ws)
    })

    this.httpServer.listen(this.config.port, () => {
      logger.info(`Model Monitoring Dashboard WebSocket server running on port ${this.config.port}`)
    })

    // Start periodic updates
    setInterval(() => this.broadcastDashboardState(), this.config.updateInterval)
  }

  private async collectDashboardData(): Promise<{
    latestMetrics: ModelMetrics
    historicalMetrics: any[]
    anomalies: any[]
    retrainingQueue: any[]
    systemHealth: {
      cpuUsage: number
      memoryUsage: number
      diskUsage: number
    }
  }> {
    try {
      const [
        latestMetrics,
        historicalMetrics,
        anomaliesResult,
        retrainingQueue
      ] = await Promise.all([
        this.performanceMonitor.getLatestMetrics(),
        this.prisma.mlModelPerformance.findMany({
          orderBy: { timestamp: 'desc' },
          take: this.config.historicalDataLimit
        }),
        this.anomalyDetector.detectPerformanceAnomalies(),
        this.prisma.mlModelRetrainingQueue.findMany({
          orderBy: { timestamp: 'desc' },
          take: 10
        })
      ])

      // Simulate system health metrics (in a real-world scenario, these would come from system monitoring)
      const systemHealth = {
        cpuUsage: Math.random() * 100,
        memoryUsage: Math.random() * 100,
        diskUsage: Math.random() * 100
      }

      return {
        latestMetrics,
        historicalMetrics,
        anomalies: anomaliesResult.hasAnomalies ? anomaliesResult.anomalyDetails : [],
        retrainingQueue,
        systemHealth
      }
    } catch (error) {
      logger.error('Error collecting dashboard data', { error })
      throw error
    }
  }

  private async sendDashboardState(ws: WebSocket) {
    try {
      const dashboardData = await this.collectDashboardData()
      ws.send(JSON.stringify({
        type: 'dashboard_state',
        ...dashboardData
      }))
    } catch (error) {
      logger.error('Error sending dashboard state', { error })
    }
  }

  private async broadcastDashboardState() {
    try {
      const dashboardData = await this.collectDashboardData()
      
      this.wss.clients.forEach((client: WebSocket) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'dashboard_update',
            ...dashboardData
          }))
        }
      })
    } catch (error) {
      logger.error('Error broadcasting dashboard state', { error })
    }
  }

  async triggerManualRetraining() {
    try {
      await this.prisma.mlModelRetrainingQueue.create({
        data: {
          timestamp: new Date(),
          reason: 'Manual retraining triggered',
          details: 'Initiated by administrator through monitoring dashboard'
        }
      })

      logger.info('Manual model retraining triggered')
    } catch (error) {
      logger.error('Error triggering manual retraining', { error })
    }
  }

  async getModelVersionHistory() {
    try {
      return await this.prisma.mlModelVersion.findMany({
        orderBy: { timestamp: 'desc' },
        take: 20
      })
    } catch (error) {
      logger.error('Error retrieving model version history', { error })
      return []
    }
  }

  // Graceful shutdown method
  async shutdown() {
    return new Promise<void>((resolve, reject) => {
      // Close WebSocket server
      this.wss.close((err) => {
        if (err) {
          logger.error('Error closing WebSocket server', { error: err })
          reject(err)
          return
        }

        // Close HTTP server
        this.httpServer.close((serverErr) => {
          if (serverErr) {
            logger.error('Error closing HTTP server', { error: serverErr })
            reject(serverErr)
            return
          }

          logger.info('Model Monitoring Dashboard shut down successfully')
          resolve()
        })
      })
    })
  }
}

// Export a singleton instance for easy use
export const modelMonitoringDashboard = new ModelMonitoringDashboard()