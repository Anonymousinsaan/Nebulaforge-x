/**
 * NebulaForge X - Observer Guard
 * 
 * 👁️ LOGIC MONITOR & FALLBACK ENGINE
 * 
 * Autonomous monitoring system that:
 * - Continuously monitors system behavior and performance
 * - Detects anomalies and unexpected behavior patterns
 * - Provides automated fallback mechanisms for system failures
 * - Guards against infinite loops and resource exhaustion
 * - Implements circuit breaker patterns for system protection
 * - Monitors tool isolation boundaries and prevents violations
 */

import { EventEmitter } from 'events';
import { NebulaKernel } from './core.kernel.js';
import { CoreControllerImpl } from './engine/modules/NebulaCore/core.controller.js';

export enum ObserverLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum GuardAction {
  MONITOR = 'monitor',
  WARN = 'warn',
  THROTTLE = 'throttle',
  BLOCK = 'block',
  FALLBACK = 'fallback',
  SHUTDOWN = 'shutdown'
}

export enum SystemState {
  NORMAL = 'normal',
  WARNING = 'warning',
  DEGRADED = 'degraded',
  CRITICAL = 'critical',
  EMERGENCY = 'emergency'
}

export interface ObservationRule {
  id: string;
  name: string;
  description: string;
  level: ObserverLevel;
  pattern: string | RegExp;
  threshold: number;
  timeWindow: number; // milliseconds
  action: GuardAction;
  enabled: boolean;
  target: 'memory' | 'cpu' | 'events' | 'errors' | 'performance' | 'network' | 'disk';
  fallbackStrategy?: FallbackStrategy;
}

export interface FallbackStrategy {
  type: 'graceful_degradation' | 'safe_mode' | 'emergency_stop' | 'alternative_path';
  actions: string[];
  timeout: number;
  retryAttempts: number;
  escalationRules: EscalationRule[];
}

export interface EscalationRule {
  condition: string;
  action: GuardAction;
  delay: number;
  maxAttempts: number;
}

export interface SystemAnomaly {
  id: string;
  timestamp: Date;
  type: 'performance' | 'memory' | 'logic' | 'security' | 'isolation' | 'infinite_loop';
  severity: ObserverLevel;
  source: string;
  description: string;
  metrics: Record<string, any>;
  duration: number;
  resolved: boolean;
  resolvedAt?: Date;
  actions: GuardAction[];
}

export interface CircuitBreaker {
  id: string;
  name: string;
  target: string;
  state: 'closed' | 'open' | 'half_open';
  failureCount: number;
  threshold: number;
  timeout: number;
  lastFailure?: Date;
  lastSuccess?: Date;
}

export class ObserverGuard extends EventEmitter {
  private kernel: NebulaKernel;
  private coreController: CoreControllerImpl;
  private isInitialized = false;
  private isMonitoring = false;
  
  // Monitoring state
  private currentSystemState: SystemState = SystemState.NORMAL;
  private observationRules: Map<string, ObservationRule> = new Map();
  private activeAnomalies: Map<string, SystemAnomaly> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  
  // Monitoring intervals
  private monitoringInterval: NodeJS.Timeout | null = null;
  private performanceMonitor: NodeJS.Timeout | null = null;
  private memoryMonitor: NodeJS.Timeout | null = null;
  
  // Metrics tracking
  private metricsHistory: Map<string, number[]> = new Map();
  private eventPatterns: Map<string, Date[]> = new Map();
  private performanceBaseline: Map<string, number> = new Map();
  
  // Guard configuration
  private config = {
    monitoringInterval: 1000, // 1 second
    performanceWindow: 30000, // 30 seconds
    memoryThreshold: 0.85, // 85% of available memory
    cpuThreshold: 0.90, // 90% CPU usage
    eventRateThreshold: 1000, // events per second
    maxAnomaliesBeforeEmergency: 10,
    circuitBreakerEnabled: true
  };

  constructor(kernel: NebulaKernel, coreController: CoreControllerImpl) {
    super();
    this.kernel = kernel;
    this.coreController = coreController;
    this.setupDefaultRules();
  }

  /**
   * Initialize the observer guard system
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      throw new Error('ObserverGuard already initialized');
    }

    console.log('👁️ Initializing Observer Guard...');

    // Setup event listeners
    this.setupEventListeners();
    
    // Initialize circuit breakers
    this.initializeCircuitBreakers();
    
    // Setup performance baselines
    await this.establishPerformanceBaselines();
    
    // Start monitoring
    await this.startMonitoring();
    
    this.isInitialized = true;
    this.emit('observer:initialized');

    console.log('✅ Observer Guard initialized and monitoring');
  }

  /**
   * Shutdown the observer guard
   */
  public async shutdown(): Promise<void> {
    console.log('🛑 Observer Guard shutting down...');
    
    await this.stopMonitoring();
    
    this.isInitialized = false;
    this.emit('observer:shutdown');
    
    console.log('✅ Observer Guard shutdown complete');
  }

  /**
   * Start monitoring system behavior
   */
  public async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      return;
    }

    console.log('🔍 Starting system monitoring...');
    
    this.isMonitoring = true;
    
    // Main monitoring loop
    this.monitoringInterval = setInterval(() => {
      this.performMonitoringCycle();
    }, this.config.monitoringInterval);
    
    // Performance monitoring
    this.performanceMonitor = setInterval(() => {
      this.monitorPerformance();
    }, 5000); // Every 5 seconds
    
    // Memory monitoring
    this.memoryMonitor = setInterval(() => {
      this.monitorMemoryUsage();
    }, 2000); // Every 2 seconds
    
    this.emit('monitoring:started');
  }

  /**
   * Stop monitoring
   */
  public async stopMonitoring(): Promise<void> {
    if (!this.isMonitoring) {
      return;
    }

    console.log('⏹️ Stopping system monitoring...');
    
    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    if (this.performanceMonitor) {
      clearInterval(this.performanceMonitor);
      this.performanceMonitor = null;
    }
    
    if (this.memoryMonitor) {
      clearInterval(this.memoryMonitor);
      this.memoryMonitor = null;
    }
    
    this.emit('monitoring:stopped');
  }

  /**
   * Add a custom observation rule
   */
  public addObservationRule(rule: ObservationRule): void {
    this.observationRules.set(rule.id, rule);
    console.log(`📋 Added observation rule: ${rule.name}`);
    this.emit('rule:added', rule);
  }

  /**
   * Remove an observation rule
   */
  public removeObservationRule(ruleId: string): void {
    if (this.observationRules.delete(ruleId)) {
      console.log(`🗑️ Removed observation rule: ${ruleId}`);
      this.emit('rule:removed', ruleId);
    }
  }

  /**
   * Trigger fallback for a specific system
   */
  public async triggerFallback(system: string, strategy: FallbackStrategy): Promise<void> {
    console.log(`🚨 Triggering fallback for system: ${system}`);
    
    try {
      switch (strategy.type) {
        case 'graceful_degradation':
          await this.executeGracefulDegradation(system, strategy);
          break;
        case 'safe_mode':
          await this.enterSafeMode(system, strategy);
          break;
        case 'emergency_stop':
          await this.executeEmergencyStop(system, strategy);
          break;
        case 'alternative_path':
          await this.activateAlternativePath(system, strategy);
          break;
      }
      
      this.emit('fallback:executed', { system, strategy });
      
    } catch (error) {
      console.error(`❌ Fallback failed for ${system}:`, error);
      this.emit('fallback:failed', { system, strategy, error });
    }
  }

  /**
   * Get current system health overview
   */
  public getSystemHealth(): Record<string, any> {
    return {
      state: this.currentSystemState,
      activeAnomalies: this.activeAnomalies.size,
      circuitBreakers: Array.from(this.circuitBreakers.values()).map(cb => ({
        name: cb.name,
        state: cb.state,
        failureCount: cb.failureCount
      })),
      observationRules: this.observationRules.size,
      monitoringActive: this.isMonitoring,
      lastUpdate: new Date()
    };
  }

  /**
   * Force system state change
   */
  public setSystemState(newState: SystemState, reason: string): void {
    const oldState = this.currentSystemState;
    this.currentSystemState = newState;
    
    console.log(`🔄 System state changed: ${oldState} → ${newState} (${reason})`);
    this.emit('system:state-changed', { oldState, newState, reason });
    
    // Take action based on state change
    this.handleSystemStateChange(newState, reason);
  }

  // Private Methods

  private setupDefaultRules(): void {
    const defaultRules: ObservationRule[] = [
      {
        id: 'memory-usage-high',
        name: 'High Memory Usage',
        description: 'Monitor for excessive memory consumption',
        level: ObserverLevel.HIGH,
        pattern: 'memory',
        threshold: this.config.memoryThreshold,
        timeWindow: 10000,
        action: GuardAction.THROTTLE,
        enabled: true,
        target: 'memory',
        fallbackStrategy: {
          type: 'graceful_degradation',
          actions: ['reduce_cache', 'pause_non_critical'],
          timeout: 30000,
          retryAttempts: 3,
          escalationRules: []
        }
      },
      {
        id: 'cpu-usage-critical',
        name: 'Critical CPU Usage',
        description: 'Monitor for CPU exhaustion',
        level: ObserverLevel.CRITICAL,
        pattern: 'cpu',
        threshold: this.config.cpuThreshold,
        timeWindow: 5000,
        action: GuardAction.FALLBACK,
        enabled: true,
        target: 'cpu',
        fallbackStrategy: {
          type: 'safe_mode',
          actions: ['reduce_processing', 'emergency_save'],
          timeout: 15000,
          retryAttempts: 2,
          escalationRules: []
        }
      },
      {
        id: 'infinite-loop-detection',
        name: 'Infinite Loop Detection',
        description: 'Detect potential infinite loops',
        level: ObserverLevel.CRITICAL,
        pattern: /same_function_call_\d+_times/,
        threshold: 1000,
        timeWindow: 1000,
        action: GuardAction.BLOCK,
        enabled: true,
        target: 'events',
        fallbackStrategy: {
          type: 'emergency_stop',
          actions: ['terminate_process', 'save_state'],
          timeout: 5000,
          retryAttempts: 1,
          escalationRules: []
        }
      },
      {
        id: 'error-rate-high',
        name: 'High Error Rate',
        description: 'Monitor for excessive error conditions',
        level: ObserverLevel.HIGH,
        pattern: 'error',
        threshold: 50, // errors per minute
        timeWindow: 60000,
        action: GuardAction.WARN,
        enabled: true,
        target: 'errors'
      }
    ];

    for (const rule of defaultRules) {
      this.observationRules.set(rule.id, rule);
    }

    console.log(`📋 Loaded ${defaultRules.length} default observation rules`);
  }

  private setupEventListeners(): void {
    // Listen to kernel events
    this.kernel.on('kernel:crash', (error) => {
      this.handleCriticalEvent('kernel_crash', error);
    });
    
    this.kernel.on('kernel:health-warning', (health) => {
      this.analyzeHealthWarning(health);
    });
    
    this.kernel.on('process:failed', (process) => {
      this.trackFailedProcess(process);
    });
    
    // Listen to core controller events
    this.coreController.globalEventBus.on('error', (error) => {
      this.trackSystemError(error);
    });
    
    console.log('🎧 Event listeners configured');
  }

  private initializeCircuitBreakers(): void {
    const breakerConfigs = [
      { id: 'kernel-operations', name: 'Kernel Operations', threshold: 5, timeout: 30000 },
      { id: 'tool-communication', name: 'Tool Communication', threshold: 10, timeout: 15000 },
      { id: 'file-operations', name: 'File Operations', threshold: 3, timeout: 60000 },
      { id: 'memory-allocation', name: 'Memory Allocation', threshold: 5, timeout: 20000 }
    ];

    for (const config of breakerConfigs) {
      const breaker: CircuitBreaker = {
        id: config.id,
        name: config.name,
        target: config.id,
        state: 'closed',
        failureCount: 0,
        threshold: config.threshold,
        timeout: config.timeout
      };
      
      this.circuitBreakers.set(breaker.id, breaker);
    }

    console.log(`⚡ Initialized ${breakerConfigs.length} circuit breakers`);
  }

  private async establishPerformanceBaselines(): Promise<void> {
    console.log('📊 Establishing performance baselines...');
    
    // Collect initial metrics
    const metrics = [
      'memory_usage',
      'cpu_usage',
      'event_rate',
      'response_time',
      'throughput'
    ];
    
    for (const metric of metrics) {
      this.performanceBaseline.set(metric, 0);
      this.metricsHistory.set(metric, []);
    }
    
    // Allow time for baseline establishment
    setTimeout(() => {
      this.calculateBaselines();
    }, 10000);
  }

  private performMonitoringCycle(): void {
    // Check all observation rules
    for (const rule of this.observationRules.values()) {
      if (rule.enabled) {
        this.checkObservationRule(rule);
      }
    }
    
    // Update circuit breakers
    this.updateCircuitBreakers();
    
    // Check for anomaly patterns
    this.detectAnomalyPatterns();
    
    // Update system state
    this.updateSystemState();
  }

  private monitorPerformance(): void {
    const kernelStatus = this.kernel.getStatus();
    
    // Track performance metrics
    this.recordMetric('memory_usage', kernelStatus.memoryUsage.used / kernelStatus.memoryUsage.limit);
    this.recordMetric('active_processes', kernelStatus.activeProcesses);
    this.recordMetric('process_queue', kernelStatus.processQueue);
    
    // Check performance thresholds
    this.checkPerformanceThresholds();
  }

  private monitorMemoryUsage(): void {
    const kernelStatus = this.kernel.getStatus();
    const memoryUsage = kernelStatus.memoryUsage.used / kernelStatus.memoryUsage.limit;
    
    this.recordMetric('memory_usage', memoryUsage);
    
    if (memoryUsage > this.config.memoryThreshold) {
      this.reportAnomaly({
        type: 'memory',
        severity: ObserverLevel.HIGH,
        source: 'memory_monitor',
        description: `Memory usage at ${(memoryUsage * 100).toFixed(1)}%`,
        metrics: { memoryUsage, threshold: this.config.memoryThreshold }
      });
    }
  }

  private checkObservationRule(rule: ObservationRule): void {
    // Implementation would check specific rule conditions
    // For now, just log that rules are being checked
    if (Math.random() < 0.001) { // Simulate occasional rule triggers
      console.log(`🔍 Checking rule: ${rule.name}`);
    }
  }

  private updateCircuitBreakers(): void {
    for (const breaker of this.circuitBreakers.values()) {
      if (breaker.state === 'open') {
        // Check if timeout has passed
        const now = Date.now();
        if (breaker.lastFailure && now - breaker.lastFailure.getTime() > breaker.timeout) {
          breaker.state = 'half_open';
          console.log(`⚡ Circuit breaker ${breaker.name} entering half-open state`);
        }
      }
    }
  }

  private detectAnomalyPatterns(): void {
    // Look for patterns in recent anomalies
    const recentAnomalies = Array.from(this.activeAnomalies.values())
      .filter(a => Date.now() - a.timestamp.getTime() < 300000); // Last 5 minutes
    
    if (recentAnomalies.length > this.config.maxAnomaliesBeforeEmergency) {
      this.setSystemState(SystemState.EMERGENCY, 'Too many anomalies detected');
    }
  }

  private updateSystemState(): void {
    const activeCount = this.activeAnomalies.size;
    const criticalCount = Array.from(this.activeAnomalies.values())
      .filter(a => a.severity === ObserverLevel.CRITICAL).length;
    
    let newState = SystemState.NORMAL;
    
    if (criticalCount > 0) {
      newState = SystemState.CRITICAL;
    } else if (activeCount > 5) {
      newState = SystemState.DEGRADED;
    } else if (activeCount > 0) {
      newState = SystemState.WARNING;
    }
    
    if (newState !== this.currentSystemState) {
      this.setSystemState(newState, `Anomaly count: ${activeCount}, Critical: ${criticalCount}`);
    }
  }

  private recordMetric(name: string, value: number): void {
    const history = this.metricsHistory.get(name) || [];
    history.push(value);
    
    // Keep only last 100 values
    if (history.length > 100) {
      history.shift();
    }
    
    this.metricsHistory.set(name, history);
  }

  private checkPerformanceThresholds(): void {
    const memoryHistory = this.metricsHistory.get('memory_usage') || [];
    if (memoryHistory.length > 0) {
      const avgMemory = memoryHistory.reduce((a, b) => a + b, 0) / memoryHistory.length;
      
      if (avgMemory > this.config.memoryThreshold) {
        this.reportAnomaly({
          type: 'performance',
          severity: ObserverLevel.HIGH,
          source: 'performance_monitor',
          description: `Average memory usage exceeds threshold: ${(avgMemory * 100).toFixed(1)}%`,
          metrics: { averageMemoryUsage: avgMemory }
        });
      }
    }
  }

  private reportAnomaly(anomalyData: {
    type: SystemAnomaly['type'];
    severity: ObserverLevel;
    source: string;
    description: string;
    metrics: Record<string, any>;
  }): void {
    const anomaly: SystemAnomaly = {
      id: this.generateAnomalyId(),
      timestamp: new Date(),
      type: anomalyData.type,
      severity: anomalyData.severity,
      source: anomalyData.source,
      description: anomalyData.description,
      metrics: anomalyData.metrics,
      duration: 0,
      resolved: false,
      actions: []
    };
    
    this.activeAnomalies.set(anomaly.id, anomaly);
    
    console.log(`🚨 Anomaly detected: ${anomaly.description}`);
    this.emit('anomaly:detected', anomaly);
    
    // Take immediate action if critical
    if (anomaly.severity === ObserverLevel.CRITICAL) {
      this.handleCriticalAnomaly(anomaly);
    }
  }

  private handleCriticalAnomaly(anomaly: SystemAnomaly): void {
    console.log(`🆘 Handling critical anomaly: ${anomaly.id}`);
    
    // Find applicable fallback strategy
    const rule = Array.from(this.observationRules.values())
      .find(r => r.target === anomaly.type);
    
    if (rule && rule.fallbackStrategy) {
      this.triggerFallback(anomaly.source, rule.fallbackStrategy);
    } else {
      // Default emergency action
      this.setSystemState(SystemState.EMERGENCY, `Critical anomaly: ${anomaly.description}`);
    }
  }

  private handleSystemStateChange(newState: SystemState, reason: string): void {
    switch (newState) {
      case SystemState.EMERGENCY:
        this.handleEmergencyState(reason);
        break;
      case SystemState.CRITICAL:
        this.handleCriticalState(reason);
        break;
      case SystemState.DEGRADED:
        this.handleDegradedState(reason);
        break;
    }
  }

  private async handleEmergencyState(reason: string): Promise<void> {
    console.log('🚨 EMERGENCY STATE - Taking protective actions');
    
    // Emergency protocols
    await this.kernel.performMaintenance();
    
    // Notify all systems
    this.emit('system:emergency', { reason, timestamp: new Date() });
  }

  private handleCriticalState(reason: string): void {
    console.log('⚠️ CRITICAL STATE - Monitoring closely');
    this.emit('system:critical', { reason, timestamp: new Date() });
  }

  private handleDegradedState(reason: string): void {
    console.log('⚡ DEGRADED STATE - Performance may be affected');
    this.emit('system:degraded', { reason, timestamp: new Date() });
  }

  // Fallback strategy implementations
  private async executeGracefulDegradation(system: string, strategy: FallbackStrategy): Promise<void> {
    console.log(`📉 Executing graceful degradation for ${system}`);
    // Implementation would reduce system load gracefully
  }

  private async enterSafeMode(system: string, strategy: FallbackStrategy): Promise<void> {
    console.log(`🛡️ Entering safe mode for ${system}`);
    // Implementation would switch to minimal functionality
  }

  private async executeEmergencyStop(system: string, strategy: FallbackStrategy): Promise<void> {
    console.log(`🛑 Emergency stop for ${system}`);
    // Implementation would safely halt the system
  }

  private async activateAlternativePath(system: string, strategy: FallbackStrategy): Promise<void> {
    console.log(`🔄 Activating alternative path for ${system}`);
    // Implementation would switch to backup systems
  }

  // Helper methods
  private handleCriticalEvent(type: string, data: any): void {
    this.reportAnomaly({
      type: 'logic',
      severity: ObserverLevel.CRITICAL,
      source: type,
      description: `Critical event: ${type}`,
      metrics: { eventData: data }
    });
  }

  private analyzeHealthWarning(health: any): void {
    console.log('⚠️ Analyzing health warning:', health);
  }

  private trackFailedProcess(process: any): void {
    console.log('📊 Tracking failed process:', process.name);
  }

  private trackSystemError(error: any): void {
    console.log('🐛 Tracking system error:', error.message);
  }

  private calculateBaselines(): void {
    console.log('📊 Calculating performance baselines');
  }

  private generateAnomalyId(): string {
    return `anomaly_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }
}