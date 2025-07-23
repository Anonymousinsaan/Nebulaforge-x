/**
 * NebulaCore - Foundation Systems Module
 * 
 * Core engine functionality including logging, events, lifecycle management,
 * configuration, error handling, and performance monitoring.
 */

export interface NebulaModuleConfig {
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  enablePerformanceMonitoring?: boolean;
  enableEvents?: boolean;
  enableLifecycle?: boolean;
}

export interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

export interface EventSystem {
  emit(event: string, ...args: any[]): void;
  on(event: string, handler: (...args: any[]) => void): void;
  off(event: string, handler: (...args: any[]) => void): void;
  once(event: string, handler: (...args: any[]) => void): void;
}

export interface PerformanceMonitor {
  startFrame(): void;
  endFrame(): void;
  getFPS(): number;
  getMemoryUsage(): number;
  startTimer(name: string): void;
  endTimer(name: string): number;
}

export interface LifecycleManager {
  initialize(): Promise<void>;
  start(): Promise<void>;
  update(deltaTime: number): void;
  shutdown(): Promise<void>;
  getState(): 'uninitialized' | 'initializing' | 'running' | 'paused' | 'shutdown';
}

export class NebulaCore {
  private config: NebulaModuleConfig;
  private _logger: Logger | null = null;
  private _events: EventSystem | null = null;
  private _performance: PerformanceMonitor | null = null;
  private _lifecycle: LifecycleManager | null = null;
  private initialized = false;

  constructor(config: NebulaModuleConfig = {}) {
    this.config = {
      logLevel: 'info',
      enablePerformanceMonitoring: true,
      enableEvents: true,
      enableLifecycle: true,
      ...config
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // TODO: Initialize logging system
    // TODO: Initialize event system  
    // TODO: Initialize performance monitoring
    // TODO: Initialize lifecycle management

    this.initialized = true;
    console.log('🌟 NebulaCore initialized successfully');
  }

  get logger(): Logger {
    if (!this._logger) {
      throw new Error('NebulaCore not initialized. Call initialize() first.');
    }
    return this._logger;
  }

  get events(): EventSystem {
    if (!this._events) {
      throw new Error('NebulaCore not initialized. Call initialize() first.');
    }
    return this._events;
  }

  get performance(): PerformanceMonitor {
    if (!this._performance) {
      throw new Error('NebulaCore not initialized. Call initialize() first.');
    }
    return this._performance;
  }

  get lifecycle(): LifecycleManager {
    if (!this._lifecycle) {
      throw new Error('NebulaCore not initialized. Call initialize() first.');
    }
    return this._lifecycle;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }
}

// Main engine class that other modules will use
export class NebulaForgeEngine {
  private core: NebulaCore;
  private modules: Map<string, any> = new Map();

  constructor(config: NebulaModuleConfig = {}) {
    this.core = new NebulaCore(config);
  }

  async initialize(): Promise<void> {
    await this.core.initialize();
    this.core.events.emit('engine:initialized');
  }

  registerModule(name: string, module: any): void {
    this.modules.set(name, module);
    this.core.logger.info(`Module '${name}' registered`);
  }

  getModule<T = any>(name: string): T {
    const module = this.modules.get(name);
    if (!module) {
      throw new Error(`Module '${name}' not found`);
    }
    return module as T;
  }

  get logger(): Logger {
    return this.core.logger;
  }

  get events(): EventSystem {
    return this.core.events;
  }

  get performance(): PerformanceMonitor {
    return this.core.performance;
  }
}

export default NebulaCore;