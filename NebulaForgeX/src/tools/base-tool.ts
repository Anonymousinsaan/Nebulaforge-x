/**
 * NebulaForge X - Base Tool Interface
 * 
 * Abstract base class and interfaces that all tools must implement
 * to ensure proper integration with the NebulaForge X ecosystem.
 */

import { EventEmitter } from 'events';
import { 
  ToolNamespace, 
  ToolCapabilities, 
  BusMessage, 
  MessageType, 
  Priority,
  getBusInstance 
} from './bus.module.js';

// Tool states
export enum ToolState {
  UNINITIALIZED = 'uninitialized',
  INITIALIZING = 'initializing',
  READY = 'ready',
  BUSY = 'busy',
  ERROR = 'error',
  SHUTDOWN = 'shutdown'
}

// Base tool configuration
export interface BaseToolConfig {
  namespace: ToolNamespace;
  name: string;
  version: string;
  description: string;
  workspaceRoot: string;
  maxConcurrentTasks: number;
  timeouts: {
    initialization: number;
    taskExecution: number;
    shutdown: number;
  };
  dependencies?: ToolNamespace[];
  isolated?: boolean;
}

// Task management
export interface ToolTask {
  id: string;
  type: string;
  priority: Priority;
  payload: any;
  startTime: Date;
  timeout: number;
  retries: number;
  maxRetries: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
  progress?: number;
  result?: any;
  error?: Error;
}

// Tool metrics
export interface ToolMetrics {
  tasksCompleted: number;
  tasksFailed: number;
  averageExecutionTime: number;
  uptime: number;
  memoryUsage: number;
  cpuUsage: number;
  lastActivity: Date;
  errorRate: number;
}

/**
 * Abstract base class for all NebulaForge X tools
 */
export abstract class BaseTool extends EventEmitter {
  protected config: BaseToolConfig;
  protected state: ToolState = ToolState.UNINITIALIZED;
  protected capabilities: ToolCapabilities;
  protected activeTasks: Map<string, ToolTask> = new Map();
  protected taskHistory: ToolTask[] = [];
  protected metrics: ToolMetrics;
  protected startTime: Date;
  protected workspaceProtection = true; // Prevents cross-tool contamination

  constructor(config: BaseToolConfig) {
    super();
    this.config = config;
    this.startTime = new Date();
    this.capabilities = this.defineCapabilities();
    this.metrics = this.initializeMetrics();
    
    this.setupEventHandlers();
    this.setupWorkspaceProtection();
  }

  /**
   * Each tool must define its capabilities
   */
  protected abstract defineCapabilities(): ToolCapabilities;

  /**
   * Tool-specific initialization logic
   */
  protected abstract async initializeTool(): Promise<void>;

  /**
   * Tool-specific shutdown logic
   */
  protected abstract async shutdownTool(): Promise<void>;

  /**
   * Handle incoming messages from the bus
   */
  protected abstract async handleMessage(message: BusMessage): Promise<void>;

  /**
   * Validate if the tool can handle a specific task
   */
  protected abstract canHandleTask(taskType: string, payload: any): boolean;

  /**
   * Execute a task (tool-specific implementation)
   */
  protected abstract async executeTask(task: ToolTask): Promise<any>;

  /**
   * Initialize the tool and register with the bus system
   */
  public async initialize(): Promise<void> {
    if (this.state !== ToolState.UNINITIALIZED) {
      throw new Error(`Tool ${this.config.name} is already initialized`);
    }

    try {
      this.setState(ToolState.INITIALIZING);
      
      // Tool-specific initialization
      await this.initializeTool();
      
      // Register with bus system
      const bus = getBusInstance();
      bus.registerTool(this.capabilities);
      bus.subscribeToMessages(this.config.namespace, this.handleMessage.bind(this));
      
      this.setState(ToolState.READY);
      this.emit('tool:ready', this.config.namespace);
      
      console.log(`✅ ${this.config.name} initialized successfully`);
    } catch (error) {
      this.setState(ToolState.ERROR);
      this.emit('tool:error', error);
      throw error;
    }
  }

  /**
   * Shutdown the tool gracefully
   */
  public async shutdown(): Promise<void> {
    try {
      this.setState(ToolState.SHUTDOWN);
      
      // Cancel all active tasks
      for (const task of this.activeTasks.values()) {
        task.status = 'failed';
        task.error = new Error('Tool shutdown');
        this.emit('task:cancelled', task);
      }
      this.activeTasks.clear();
      
      // Tool-specific shutdown
      await this.shutdownTool();
      
      this.emit('tool:shutdown', this.config.namespace);
      console.log(`🛑 ${this.config.name} shut down successfully`);
    } catch (error) {
      console.error(`Error shutting down ${this.config.name}:`, error);
      throw error;
    }
  }

  /**
   * Create and queue a new task
   */
  protected async createTask(
    type: string,
    payload: any,
    priority: Priority = Priority.NORMAL,
    timeout: number = this.config.timeouts.taskExecution
  ): Promise<ToolTask> {
    const task: ToolTask = {
      id: this.generateTaskId(),
      type,
      priority,
      payload,
      startTime: new Date(),
      timeout,
      retries: 0,
      maxRetries: 3,
      status: 'pending',
      progress: 0
    };

    if (this.activeTasks.size >= this.config.maxConcurrentTasks) {
      throw new Error(`Tool ${this.config.name} is at maximum capacity`);
    }

    this.activeTasks.set(task.id, task);
    this.emit('task:created', task);
    
    // Start task execution
    setImmediate(() => this.runTask(task));
    
    return task;
  }

  /**
   * Send a request to another tool
   */
  protected async requestFromTool<T = any>(
    to: ToolNamespace,
    type: MessageType,
    payload: any,
    timeout?: number
  ): Promise<T> {
    const bus = getBusInstance();
    return bus.sendRequest<T>(this.config.namespace, to, type, payload, timeout);
  }

  /**
   * Send a notification to the bus
   */
  protected async notifyBus(type: MessageType, payload: any): Promise<void> {
    const bus = getBusInstance();
    await bus.broadcastNotification(this.config.namespace, type, payload);
  }

  /**
   * Get current tool status
   */
  public getStatus(): Record<string, any> {
    return {
      namespace: this.config.namespace,
      name: this.config.name,
      version: this.config.version,
      state: this.state,
      activeTasks: this.activeTasks.size,
      totalTasksCompleted: this.metrics.tasksCompleted,
      totalTasksFailed: this.metrics.tasksFailed,
      uptime: Date.now() - this.startTime.getTime(),
      errorRate: this.metrics.errorRate,
      lastActivity: this.metrics.lastActivity,
      memoryUsage: process.memoryUsage(),
      capabilities: this.capabilities
    };
  }

  /**
   * Get tool metrics
   */
  public getMetrics(): ToolMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  /**
   * Check if tool is healthy
   */
  public isHealthy(): boolean {
    return this.state === ToolState.READY || this.state === ToolState.BUSY;
  }

  // Protected helper methods

  protected setState(newState: ToolState): void {
    const oldState = this.state;
    this.state = newState;
    this.emit('state:changed', oldState, newState);
  }

  protected async runTask(task: ToolTask): Promise<void> {
    if (!this.canHandleTask(task.type, task.payload)) {
      task.status = 'failed';
      task.error = new Error(`Tool cannot handle task type: ${task.type}`);
      this.activeTasks.delete(task.id);
      this.taskHistory.push(task);
      return;
    }

    try {
      this.setState(ToolState.BUSY);
      task.status = 'running';
      this.emit('task:started', task);
      
      // Set timeout
      const timeoutHandler = setTimeout(() => {
        task.status = 'timeout';
        task.error = new Error('Task execution timeout');
        this.emit('task:timeout', task);
      }, task.timeout);

      // Execute task
      const result = await this.executeTask(task);
      clearTimeout(timeoutHandler);
      
      if (task.status !== 'timeout') {
        task.status = 'completed';
        task.result = result;
        task.progress = 100;
        this.metrics.tasksCompleted++;
        this.emit('task:completed', task);
      }
    } catch (error) {
      task.status = 'failed';
      task.error = error as Error;
      this.metrics.tasksFailed++;
      this.emit('task:failed', task);
      
      // Retry logic
      if (task.retries < task.maxRetries) {
        task.retries++;
        task.status = 'pending';
        setTimeout(() => this.runTask(task), 1000 * task.retries);
        return;
      }
    } finally {
      this.activeTasks.delete(task.id);
      this.taskHistory.push(task);
      this.setState(this.activeTasks.size > 0 ? ToolState.BUSY : ToolState.READY);
      this.updateMetrics();
    }
  }

  protected generateTaskId(): string {
    return `${this.config.namespace}_task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  protected setupEventHandlers(): void {
    this.on('task:completed', () => this.metrics.lastActivity = new Date());
    this.on('task:failed', () => this.updateErrorRate());
    this.on('error', (error) => console.error(`${this.config.name} error:`, error));
  }

  protected setupWorkspaceProtection(): void {
    if (!this.workspaceProtection) return;
    
    // Prevent access to other tool workspaces
    const protectedPaths = [
      '/src/tools/',
      '/engine/modules/',
      '/dist/',
      '/node_modules/'
    ];
    
    // This would be implemented with file system watchers and permissions
    // For now, it's a placeholder for the concept
    console.log(`🔒 Workspace protection enabled for ${this.config.name}`);
  }

  private initializeMetrics(): ToolMetrics {
    return {
      tasksCompleted: 0,
      tasksFailed: 0,
      averageExecutionTime: 0,
      uptime: 0,
      memoryUsage: 0,
      cpuUsage: 0,
      lastActivity: new Date(),
      errorRate: 0
    };
  }

  private updateMetrics(): void {
    this.metrics.uptime = Date.now() - this.startTime.getTime();
    
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const memory = process.memoryUsage();
      this.metrics.memoryUsage = memory.heapUsed / 1024 / 1024; // MB
    }
    
    // Calculate average execution time
    const completedTasks = this.taskHistory.filter(t => t.status === 'completed');
    if (completedTasks.length > 0) {
      const totalTime = completedTasks.reduce((sum, task) => {
        const duration = new Date().getTime() - task.startTime.getTime();
        return sum + duration;
      }, 0);
      this.metrics.averageExecutionTime = totalTime / completedTasks.length;
    }
  }

  private updateErrorRate(): void {
    const totalTasks = this.metrics.tasksCompleted + this.metrics.tasksFailed;
    this.metrics.errorRate = totalTasks > 0 ? this.metrics.tasksFailed / totalTasks : 0;
  }
}

/**
 * Utility function to create workspace-specific file paths
 */
export function createWorkspacePath(toolNamespace: ToolNamespace, ...pathSegments: string[]): string {
  const basePath = `/src/tools/${toolNamespace}`;
  return pathSegments.length > 0 ? `${basePath}/${pathSegments.join('/')}` : basePath;
}

/**
 * Workspace isolation decorator
 */
export function WorkspaceIsolated(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  
  descriptor.value = function(this: BaseTool, ...args: any[]) {
    // Add workspace validation logic here
    console.log(`🔒 Workspace-isolated method called: ${propertyKey}`);
    return originalMethod.apply(this, args);
  };
  
  return descriptor;
}