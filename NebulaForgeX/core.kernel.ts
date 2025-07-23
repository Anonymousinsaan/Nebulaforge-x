/**
 * NebulaForge X - Core Kernel System
 * 
 * 🚀 SYSTEM HEARTBEAT & RUNTIME LOOP
 * 
 * The foundational kernel that manages:
 * - System lifecycle and runtime loop
 * - Memory management and allocation
 * - Process scheduling and task execution
 * - Core system services and health monitoring
 * - Multi-language runtime coordination
 */

import { EventEmitter } from 'events';
import { CoreControllerImpl } from './engine/modules/NebulaCore/core.controller.js';
import { createToolManager, ToolManager } from './src/tools/tool-manager.js';
import { RegistryManager } from './core/registry.manager.js';
import { ErrorsHandler } from './systems/errors.handler.js';
import { ObserverGuard } from './observer.guard.js';
import { CommGateway } from './comm/gateway.js';

export enum KernelState {
  UNINITIALIZED = 'uninitialized',
  BOOTING = 'booting',
  INITIALIZING = 'initializing',
  RUNNING = 'running',
  PAUSED = 'paused',
  SHUTTING_DOWN = 'shutting_down',
  CRASHED = 'crashed',
  MAINTENANCE = 'maintenance'
}

export enum RuntimeMode {
  DEVELOPMENT = 'development',
  PRODUCTION = 'production',
  TESTING = 'testing',
  DEBUG = 'debug',
  SANDBOX = 'sandbox'
}

export interface KernelConfig {
  mode: RuntimeMode;
  tickRate: number; // Hz
  maxMemoryMB: number;
  enableAutoHealing: boolean;
  enableMultiLang: boolean;
  supportedLanguages: ('typescript' | 'javascript' | 'python' | 'cpp')[];
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  autoSaveInterval: number; // seconds
}

export interface SystemMetrics {
  uptime: number;
  memoryUsage: {
    used: number;
    allocated: number;
    peak: number;
    limit: number;
  };
  cpuUsage: number;
  tickRate: number;
  activeProcesses: number;
  errorCount: number;
  healingActions: number;
  lastHeartbeat: Date;
}

export class NebulaKernel extends EventEmitter {
  private state: KernelState = KernelState.UNINITIALIZED;
  private config: KernelConfig;
  private startTime: Date;
  private lastTick: Date;
  private tickCount: number = 0;
  private runLoop: NodeJS.Timeout | null = null;
  
  // Core Systems
  private coreController: CoreControllerImpl;
  private toolManager: ToolManager;
  private registryManager: RegistryManager;
  private errorsHandler: ErrorsHandler;
  private observerGuard: ObserverGuard;
  private commGateway: CommGateway;
  
  // Memory Management
  private memoryAllocator: MemoryAllocator;
  private processQueue: KernelProcess[] = [];
  private activeProcesses: Map<string, KernelProcess> = new Map();
  
  // Runtime Metrics
  private metrics: SystemMetrics;
  private healthHistory: SystemHealth[] = [];

  constructor(config: Partial<KernelConfig> = {}) {
    super();
    
    this.config = {
      mode: RuntimeMode.DEVELOPMENT,
      tickRate: 60, // 60 Hz default
      maxMemoryMB: 2048, // 2GB default
      enableAutoHealing: true,
      enableMultiLang: true,
      supportedLanguages: ['typescript', 'javascript', 'python', 'cpp'],
      logLevel: 'info',
      autoSaveInterval: 30,
      ...config
    };
    
    this.startTime = new Date();
    this.lastTick = new Date();
    
    this.initializeMetrics();
    this.initializeCoreComponents();
    
    console.log('🌌 NebulaForge X Kernel initialized');
  }

  /**
   * Boot the kernel and start all core systems
   */
  public async boot(): Promise<void> {
    if (this.state !== KernelState.UNINITIALIZED) {
      throw new Error(`Cannot boot kernel from state: ${this.state}`);
    }

    try {
      this.setState(KernelState.BOOTING);
      console.log('🚀 NebulaForge X Kernel booting...');

      // Phase 1: Initialize core systems
      await this.initializeCoreController();
      await this.initializeToolManager();
      await this.initializeRegistryManager();
      
      // Phase 2: Initialize support systems
      await this.initializeErrorsHandler();
      await this.initializeObserverGuard();
      await this.initializeCommGateway();
      
      // Phase 3: Initialize memory allocator
      await this.initializeMemoryAllocator();
      
      // Phase 4: Start runtime systems
      this.setState(KernelState.INITIALIZING);
      await this.startRuntimeLoop();
      await this.startAutoSaveSystem();
      await this.startHealthMonitoring();
      
      this.setState(KernelState.RUNNING);
      
      console.log('✅ NebulaForge X Kernel successfully booted');
      this.emit('kernel:booted');
      
    } catch (error) {
      this.setState(KernelState.CRASHED);
      console.error('❌ Kernel boot failed:', error);
      this.emit('kernel:crash', error);
      throw error;
    }
  }

  /**
   * Shutdown the kernel gracefully
   */
  public async shutdown(): Promise<void> {
    console.log('🛑 NebulaForge X Kernel shutting down...');
    this.setState(KernelState.SHUTTING_DOWN);

    try {
      // Stop runtime loop
      if (this.runLoop) {
        clearInterval(this.runLoop);
        this.runLoop = null;
      }

      // Cancel all active processes
      for (const process of this.activeProcesses.values()) {
        await this.cancelProcess(process.id);
      }

      // Shutdown core systems in reverse order
      await this.commGateway?.shutdown();
      await this.observerGuard?.shutdown();
      await this.errorsHandler?.shutdown();
      await this.registryManager?.shutdown();
      await this.toolManager?.shutdown();
      await this.coreController?.terminate();

      this.emit('kernel:shutdown');
      console.log('✅ NebulaForge X Kernel shutdown complete');
      
    } catch (error) {
      console.error('❌ Error during kernel shutdown:', error);
      throw error;
    }
  }

  /**
   * Schedule a process for execution
   */
  public async scheduleProcess(process: Partial<KernelProcess>): Promise<string> {
    const fullProcess: KernelProcess = {
      id: this.generateProcessId(),
      name: process.name || 'unnamed',
      priority: process.priority || ProcessPriority.NORMAL,
      type: process.type || ProcessType.TASK,
      handler: process.handler!,
      payload: process.payload,
      timeout: process.timeout || 30000,
      retries: process.retries || 3,
      status: ProcessStatus.QUEUED,
      createdAt: new Date(),
      scheduledFor: process.scheduledFor || new Date()
    };

    this.processQueue.push(fullProcess);
    this.processQueue.sort((a, b) => b.priority - a.priority);
    
    this.emit('process:scheduled', fullProcess);
    return fullProcess.id;
  }

  /**
   * Get current kernel state and metrics
   */
  public getStatus(): KernelStatus {
    return {
      state: this.state,
      config: this.config,
      metrics: this.updateMetrics(),
      uptime: Date.now() - this.startTime.getTime(),
      processQueue: this.processQueue.length,
      activeProcesses: this.activeProcesses.size,
      memoryUsage: this.memoryAllocator?.getUsage() || { used: 0, allocated: 0, peak: 0, limit: 0 }
    };
  }

  /**
   * Force garbage collection and memory cleanup
   */
  public async performMaintenance(): Promise<void> {
    console.log('🔧 Performing kernel maintenance...');
    
    const oldState = this.state;
    this.setState(KernelState.MAINTENANCE);
    
    try {
      // Memory cleanup
      await this.memoryAllocator.garbageCollect();
      
      // Process cleanup
      await this.cleanupCompletedProcesses();
      
      // Registry cleanup
      await this.registryManager.performMaintenance();
      
      // Health history cleanup
      this.cleanupHealthHistory();
      
      console.log('✅ Kernel maintenance complete');
      
    } finally {
      this.setState(oldState);
    }
  }

  // Private Methods

  private initializeMetrics(): void {
    this.metrics = {
      uptime: 0,
      memoryUsage: { used: 0, allocated: 0, peak: 0, limit: this.config.maxMemoryMB * 1024 * 1024 },
      cpuUsage: 0,
      tickRate: 0,
      activeProcesses: 0,
      errorCount: 0,
      healingActions: 0,
      lastHeartbeat: new Date()
    };
  }

  private initializeCoreComponents(): void {
    // Core components will be initialized during boot phase
    console.log('🔧 Core components structure prepared');
  }

  private async initializeCoreController(): Promise<void> {
    this.coreController = new CoreControllerImpl();
    await this.coreController.boot();
    console.log('✅ Core Controller initialized');
  }

  private async initializeToolManager(): Promise<void> {
    this.toolManager = createToolManager(this.coreController.globalEventBus);
    await this.toolManager.initialize();
    console.log('✅ Tool Manager initialized');
  }

  private async initializeRegistryManager(): Promise<void> {
    this.registryManager = new RegistryManager(this.coreController);
    await this.registryManager.initialize();
    console.log('✅ Registry Manager initialized');
  }

  private async initializeErrorsHandler(): Promise<void> {
    this.errorsHandler = new ErrorsHandler(this.config, this.coreController);
    await this.errorsHandler.initialize();
    console.log('✅ Errors Handler initialized');
  }

  private async initializeObserverGuard(): Promise<void> {
    this.observerGuard = new ObserverGuard(this, this.coreController);
    await this.observerGuard.initialize();
    console.log('✅ Observer Guard initialized');
  }

  private async initializeCommGateway(): Promise<void> {
    this.commGateway = new CommGateway(this.coreController, this.toolManager);
    await this.commGateway.initialize();
    console.log('✅ Communication Gateway initialized');
  }

  private async initializeMemoryAllocator(): Promise<void> {
    this.memoryAllocator = new MemoryAllocator(this.config.maxMemoryMB);
    await this.memoryAllocator.initialize();
    console.log('✅ Memory Allocator initialized');
  }

  private async startRuntimeLoop(): Promise<void> {
    const tickInterval = 1000 / this.config.tickRate; // Convert Hz to ms
    
    this.runLoop = setInterval(() => {
      this.tick();
    }, tickInterval);
    
    console.log(`🔄 Runtime loop started at ${this.config.tickRate} Hz`);
  }

  private tick(): void {
    const now = new Date();
    this.tickCount++;
    this.lastTick = now;
    this.metrics.lastHeartbeat = now;

    // Process scheduled tasks
    this.processScheduledTasks();
    
    // Update metrics
    this.updateMetrics();
    
    // Emit heartbeat
    if (this.tickCount % this.config.tickRate === 0) { // Every second
      this.emit('kernel:heartbeat', {
        tickCount: this.tickCount,
        timestamp: now,
        metrics: this.metrics
      });
    }
  }

  private processScheduledTasks(): void {
    const now = new Date();
    const tasksToProcess = this.processQueue.filter(
      p => p.scheduledFor <= now && p.status === ProcessStatus.QUEUED
    );

    for (const task of tasksToProcess) {
      this.executeProcess(task);
    }
  }

  private async executeProcess(process: KernelProcess): Promise<void> {
    process.status = ProcessStatus.RUNNING;
    process.startedAt = new Date();
    
    this.activeProcesses.set(process.id, process);
    this.processQueue = this.processQueue.filter(p => p.id !== process.id);

    try {
      const result = await Promise.race([
        process.handler(process.payload),
        this.timeoutPromise(process.timeout)
      ]);
      
      process.status = ProcessStatus.COMPLETED;
      process.result = result;
      process.completedAt = new Date();
      
      this.emit('process:completed', process);
      
    } catch (error) {
      process.status = ProcessStatus.FAILED;
      process.error = error as Error;
      process.failedAt = new Date();
      
      // Retry logic
      if (process.retries > 0) {
        process.retries--;
        process.status = ProcessStatus.QUEUED;
        process.scheduledFor = new Date(Date.now() + 1000); // Retry in 1 second
        this.processQueue.push(process);
      }
      
      this.emit('process:failed', process);
    } finally {
      this.activeProcesses.delete(process.id);
    }
  }

  private timeoutPromise(timeout: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Process timeout')), timeout);
    });
  }

  private async cancelProcess(processId: string): Promise<void> {
    const process = this.activeProcesses.get(processId);
    if (process) {
      process.status = ProcessStatus.CANCELLED;
      this.activeProcesses.delete(processId);
      this.emit('process:cancelled', process);
    }
  }

  private updateMetrics(): SystemMetrics {
    const now = Date.now();
    this.metrics.uptime = now - this.startTime.getTime();
    this.metrics.activeProcesses = this.activeProcesses.size;
    this.metrics.tickRate = this.tickCount / (this.metrics.uptime / 1000);
    
    if (this.memoryAllocator) {
      this.metrics.memoryUsage = this.memoryAllocator.getUsage();
    }
    
    return this.metrics;
  }

  private setState(newState: KernelState): void {
    const oldState = this.state;
    this.state = newState;
    this.emit('kernel:state-changed', oldState, newState);
    console.log(`🔄 Kernel state: ${oldState} → ${newState}`);
  }

  private generateProcessId(): string {
    return `proc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private async startAutoSaveSystem(): Promise<void> {
    setInterval(() => {
      this.emit('kernel:auto-save');
    }, this.config.autoSaveInterval * 1000);
  }

  private async startHealthMonitoring(): Promise<void> {
    setInterval(() => {
      const health = this.checkSystemHealth();
      this.healthHistory.push(health);
      
      // Keep only last 100 health checks
      if (this.healthHistory.length > 100) {
        this.healthHistory.shift();
      }
      
      if (health.status !== 'healthy') {
        this.emit('kernel:health-warning', health);
      }
    }, 10000); // Every 10 seconds
  }

  private checkSystemHealth(): SystemHealth {
    const metrics = this.updateMetrics();
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    const issues: string[] = [];

    // Memory check
    const memoryUsagePercent = (metrics.memoryUsage.used / metrics.memoryUsage.limit) * 100;
    if (memoryUsagePercent > 90) {
      status = 'critical';
      issues.push('Memory usage critically high');
    } else if (memoryUsagePercent > 75) {
      status = 'warning';
      issues.push('Memory usage high');
    }

    // Process queue check
    if (this.processQueue.length > 100) {
      status = status === 'critical' ? 'critical' : 'warning';
      issues.push('Process queue backlog');
    }

    // Error rate check
    if (metrics.errorCount > 10) {
      status = 'critical';
      issues.push('High error rate detected');
    }

    return {
      timestamp: new Date(),
      status,
      issues,
      metrics: { ...metrics }
    };
  }

  private async cleanupCompletedProcesses(): Promise<void> {
    // Remove old completed/failed processes from memory
    console.log('🧹 Cleaning up completed processes...');
  }

  private cleanupHealthHistory(): void {
    const oneHourAgo = new Date(Date.now() - 3600000);
    this.healthHistory = this.healthHistory.filter(h => h.timestamp > oneHourAgo);
  }
}

// Supporting Interfaces and Classes

export interface KernelProcess {
  id: string;
  name: string;
  priority: ProcessPriority;
  type: ProcessType;
  handler: (payload: any) => Promise<any>;
  payload?: any;
  timeout: number;
  retries: number;
  status: ProcessStatus;
  createdAt: Date;
  scheduledFor: Date;
  startedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  result?: any;
  error?: Error;
}

export enum ProcessPriority {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  CRITICAL = 4,
  SYSTEM = 5
}

export enum ProcessType {
  TASK = 'task',
  SERVICE = 'service',
  PLUGIN = 'plugin',
  SYSTEM = 'system'
}

export enum ProcessStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  TIMEOUT = 'timeout'
}

export interface KernelStatus {
  state: KernelState;
  config: KernelConfig;
  metrics: SystemMetrics;
  uptime: number;
  processQueue: number;
  activeProcesses: number;
  memoryUsage: {
    used: number;
    allocated: number;
    peak: number;
    limit: number;
  };
}

interface SystemHealth {
  timestamp: Date;
  status: 'healthy' | 'warning' | 'critical';
  issues: string[];
  metrics: SystemMetrics;
}

// Memory Allocator Class
class MemoryAllocator {
  private maxMemoryBytes: number;
  private allocatedMemory: Map<string, MemoryBlock> = new Map();
  private totalAllocated = 0;
  private peakUsage = 0;

  constructor(maxMemoryMB: number) {
    this.maxMemoryBytes = maxMemoryMB * 1024 * 1024;
  }

  async initialize(): Promise<void> {
    console.log(`💾 Memory allocator initialized with ${this.maxMemoryBytes / 1024 / 1024}MB limit`);
  }

  allocate(size: number, tag: string): string | null {
    if (this.totalAllocated + size > this.maxMemoryBytes) {
      return null; // Out of memory
    }

    const blockId = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const block: MemoryBlock = {
      id: blockId,
      size,
      tag,
      allocatedAt: new Date()
    };

    this.allocatedMemory.set(blockId, block);
    this.totalAllocated += size;
    this.peakUsage = Math.max(this.peakUsage, this.totalAllocated);

    return blockId;
  }

  deallocate(blockId: string): boolean {
    const block = this.allocatedMemory.get(blockId);
    if (!block) {
      return false;
    }

    this.allocatedMemory.delete(blockId);
    this.totalAllocated -= block.size;
    return true;
  }

  getUsage(): { used: number; allocated: number; peak: number; limit: number } {
    return {
      used: this.totalAllocated,
      allocated: this.allocatedMemory.size,
      peak: this.peakUsage,
      limit: this.maxMemoryBytes
    };
  }

  async garbageCollect(): Promise<void> {
    console.log('🗑️ Performing garbage collection...');
    // Implement garbage collection logic
  }
}

interface MemoryBlock {
  id: string;
  size: number;
  tag: string;
  allocatedAt: Date;
}

// Singleton instance
let kernelInstance: NebulaKernel | null = null;

export function createKernel(config?: Partial<KernelConfig>): NebulaKernel {
  if (!kernelInstance) {
    kernelInstance = new NebulaKernel(config);
  }
  return kernelInstance;
}

export function getKernel(): NebulaKernel {
  if (!kernelInstance) {
    throw new Error('Kernel not initialized. Call createKernel() first.');
  }
  return kernelInstance;
}