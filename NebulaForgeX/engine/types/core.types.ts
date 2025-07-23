/**
 * Core Type Definitions for NebulaForge X Engine
 * 
 * Shared interfaces and types used across the entire engine system.
 */

import { EventEmitter } from 'events';

// Engine Lifecycle States
export type EngineState = 'boot' | 'init' | 'run' | 'pause' | 'terminate';

export interface LifecycleHooks {
  onBoot?: () => Promise<void>;
  onInit?: () => Promise<void>;
  onRun?: () => Promise<void>;
  onPause?: () => Promise<void>;
  onTerminate?: () => Promise<void>;
}

// Module System
export interface ModuleMetadata {
  name: string;
  version: string;
  description?: string;
  author?: string;
  dependencies: string[];
  priority: number;
  enabled: boolean;
  autoLoad: boolean;
}

export interface ModuleInterface {
  metadata: ModuleMetadata;
  initialize(core: CoreController): Promise<void>;
  start?(): Promise<void>;
  update?(deltaTime: number): void;
  pause?(): Promise<void>;
  resume?(): Promise<void>;
  shutdown(): Promise<void>;
  getState(): 'uninitialized' | 'initializing' | 'ready' | 'running' | 'paused' | 'error';
}

// Plugin System
export interface PluginInterface {
  name: string;
  version: string;
  description?: string;
  install(core: CoreController): Promise<void>;
  uninstall(): Promise<void>;
  isActive(): boolean;
}

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  main: string;
  author?: string;
  license?: string;
  keywords?: string[];
  engines: {
    nebulaforge: string;
  };
  dependencies?: Record<string, string>;
}

// Event System
export interface EventBusInterface {
  emit(event: string, ...args: any[]): boolean;
  on(event: string, listener: (...args: any[]) => void): this;
  once(event: string, listener: (...args: any[]) => void): this;
  off(event: string, listener: (...args: any[]) => void): this;
  removeAllListeners(event?: string): this;
  listenerCount(event: string): number;
  getMaxListeners(): number;
  setMaxListeners(n: number): this;
}

// Logging System
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  module?: string;
  context?: Record<string, any>;
  error?: Error;
}

export interface LoggerInterface {
  debug(message: string, context?: Record<string, any>): void;
  info(message: string, context?: Record<string, any>): void;
  warn(message: string, context?: Record<string, any>): void;
  error(message: string, error?: Error, context?: Record<string, any>): void;
  setLevel(level: LogLevel): void;
  getLevel(): LogLevel;
  createChild(module: string): LoggerInterface;
}

// State Management
export interface StateManagerInterface {
  get<T = any>(key: string): T | undefined;
  set<T = any>(key: string, value: T): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  keys(): string[];
  subscribe(key: string, callback: (value: any, oldValue: any) => void): () => void;
  getAll(): Record<string, any>;
}

// Core Controller Interface
export interface CoreController {
  readonly state: EngineState;
  readonly modules: ModuleRegistry;
  readonly plugins: PluginManager;
  readonly events: EventBusInterface;
  readonly logger: LoggerInterface;
  readonly stateManager: StateManagerInterface;
  readonly config: EngineConfig;
  
  initialize(): Promise<void>;
  start(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  shutdown(): Promise<void>;
  
  registerModule(module: ModuleInterface): Promise<void>;
  unregisterModule(name: string): Promise<void>;
  getModule<T extends ModuleInterface>(name: string): T | undefined;
  
  installPlugin(plugin: PluginInterface): Promise<void>;
  uninstallPlugin(name: string): Promise<void>;
}

// Configuration
export interface EngineConfig {
  engine: {
    name: string;
    version: string;
    target: string;
    environment: string;
    debug: boolean;
    logLevel: LogLevel;
    maxFPS: number;
    autoSave: boolean;
  };
  runtime: {
    typescript: {
      enabled: boolean;
      strict: boolean;
      target: string;
    };
    python: {
      enabled: boolean;
      version: string;
      venv: string;
    };
    rust: {
      enabled: boolean;
      edition: string;
      target: string;
    };
  };
  modules: Record<string, {
    enabled: boolean;
    priority: number;
    autoLoad: boolean;
    language: string;
    dependencies: string[];
    config: Record<string, any>;
  }>;
  build: {
    outputDir: string;
    sourceMap: boolean;
    minify: boolean;
    bundler: string;
    target: string;
    format: string;
  };
  paths: {
    modules: string;
    assets: string;
    config: string;
    temp: string;
    logs: string;
  };
}

// Registry Interfaces
export interface ModuleRegistry {
  register(module: ModuleInterface): Promise<void>;
  unregister(name: string): Promise<void>;
  get<T extends ModuleInterface>(name: string): T | undefined;
  getAll(): ModuleInterface[];
  getEnabled(): ModuleInterface[];
  enable(name: string): Promise<void>;
  disable(name: string): Promise<void>;
  isRegistered(name: string): boolean;
  isEnabled(name: string): boolean;
}

export interface PluginManager {
  install(plugin: PluginInterface): Promise<void>;
  uninstall(name: string): Promise<void>;
  get(name: string): PluginInterface | undefined;
  getAll(): PluginInterface[];
  getActive(): PluginInterface[];
  isInstalled(name: string): boolean;
  isActive(name: string): boolean;
  loadFromPath(path: string): Promise<PluginInterface>;
  loadFromManifest(manifest: PluginManifest): Promise<PluginInterface>;
}

// Performance and Metrics
export interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  memoryUsage: {
    used: number;
    total: number;
    heapUsed: number;
    heapTotal: number;
  };
  moduleMetrics: Record<string, {
    updateTime: number;
    renderTime: number;
    memoryUsage: number;
  }>;
}

// Error Handling
export interface EngineError extends Error {
  code: string;
  module?: string;
  context?: Record<string, any>;
  timestamp: Date;
}

export class NebulaError extends Error implements EngineError {
  public readonly code: string;
  public readonly module?: string;
  public readonly context?: Record<string, any>;
  public readonly timestamp: Date;

  constructor(
    message: string,
    code: string = 'ENGINE_ERROR',
    module?: string,
    context?: Record<string, any>
  ) {
    super(message);
    this.name = 'NebulaError';
    this.code = code;
    this.module = module;
    this.context = context;
    this.timestamp = new Date();
  }
}

// Event Types
export interface EngineEvents {
  'engine:boot': [];
  'engine:init': [];
  'engine:start': [];
  'engine:pause': [];
  'engine:resume': [];
  'engine:shutdown': [];
  'engine:error': [EngineError];
  
  'module:registered': [string, ModuleInterface];
  'module:unregistered': [string];
  'module:enabled': [string];
  'module:disabled': [string];
  'module:error': [string, Error];
  
  'plugin:installed': [string, PluginInterface];
  'plugin:uninstalled': [string];
  'plugin:error': [string, Error];
  
  'state:changed': [string, any, any]; // key, newValue, oldValue
  
  'performance:update': [PerformanceMetrics];
}