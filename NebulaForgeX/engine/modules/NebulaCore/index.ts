/**
 * NebulaCore - Foundation Systems Module
 * 
 * Main entry point for the NebulaCore engine foundation systems including
 * logging, events, lifecycle management, module registry, plugin management,
 * and global state management.
 */

// Core Controller - Main engine controller
export { CoreControllerImpl, createCoreController } from './core.controller.js';

// Individual Components
export { Logger } from './logger.js';
export { GlobalEventBus, NamespacedEventBus } from './global.events.js';
export { StateManager } from './state.manager.js';
export { ModuleRegistryImpl } from './module.registry.js';
export { PluginManagerImpl } from './plugin.manager.js';

// Type Definitions
export * from '../../types/core.types.js';

// Legacy compatibility exports (for backward compatibility with existing code)
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

/**
 * Legacy NebulaCore class for backward compatibility
 */
export class NebulaCore {
  private controller: import('../../types/core.types.js').CoreController;

  constructor(config: NebulaModuleConfig = {}) {
    this.controller = createCoreController({
      logLevel: config.logLevel || 'info',
      enableAutoSave: true
    });
  }

  async initialize(): Promise<void> {
    await this.controller.initialize();
  }

  get logger(): Logger {
    return this.controller.logger;
  }

  get events(): EventSystem {
    return this.controller.events;
  }

  get performance(): PerformanceMonitor {
    // Simplified performance monitor for backward compatibility
    return {
      startFrame: () => {},
      endFrame: () => {},
      getFPS: () => 60,
      getMemoryUsage: () => 100,
      startTimer: () => {},
      endTimer: () => 16.67
    };
  }

  get lifecycle(): LifecycleManager {
    // Simplified lifecycle manager for backward compatibility
    return {
      initialize: () => this.controller.initialize(),
      start: () => this.controller.start(),
      update: (deltaTime: number) => {
        // Legacy update method - actual updates are handled by the controller
      },
      shutdown: () => this.controller.shutdown(),
      getState: () => {
        const state = this.controller.state;
        switch (state) {
          case 'boot': return 'uninitialized';
          case 'init': return 'initializing';
          case 'run': return 'running';
          case 'pause': return 'paused';
          case 'terminate': return 'shutdown';
          default: return 'uninitialized';
        }
      }
    };
  }

  get isInitialized(): boolean {
    return this.controller.state !== 'boot';
  }
}

/**
 * Main NebulaForge Engine class that other modules will use
 */
export class NebulaForgeEngine {
  private controller: import('../../types/core.types.js').CoreController;

  constructor(config: NebulaModuleConfig = {}) {
    this.controller = createCoreController({
      logLevel: config.logLevel || 'info',
      enableAutoSave: true
    });
  }

  async initialize(): Promise<void> {
    await this.controller.initialize();
    this.controller.events.emit('engine:initialized');
  }

  async start(): Promise<void> {
    await this.controller.start();
  }

  async pause(): Promise<void> {
    await this.controller.pause();
  }

  async resume(): Promise<void> {
    await this.controller.resume();
  }

  async shutdown(): Promise<void> {
    await this.controller.shutdown();
  }

  registerModule(name: string, module: any): void {
    this.controller.registerModule(module).then(() => {
      this.controller.logger.info(`Module '${name}' registered`);
    }).catch(error => {
      this.controller.logger.error(`Failed to register module '${name}'`, error);
    });
  }

  getModule<T = any>(name: string): T | undefined {
    const module = this.controller.getModule(name);
    return module as T;
  }

  get logger(): Logger {
    return this.controller.logger;
  }

  get events(): EventSystem {
    return this.controller.events;
  }

  get state(): string {
    return this.controller.state;
  }

  get config(): import('../../types/core.types.js').EngineConfig {
    return this.controller.config;
  }

  get stateManager(): import('../../types/core.types.js').StateManagerInterface {
    return this.controller.stateManager;
  }

  getStatus(): Record<string, any> {
    return this.controller.getStatus();
  }
}

/**
 * Factory function to create a new NebulaForge engine instance
 */
export function createNebulaForgeEngine(config?: NebulaModuleConfig): NebulaForgeEngine {
  return new NebulaForgeEngine(config);
}

/**
 * Factory function to create a new NebulaCore instance (legacy)
 */
export function createNebulaCore(config?: NebulaModuleConfig): NebulaCore {
  return new NebulaCore(config);
}

// Default export is the main engine
export default NebulaForgeEngine;