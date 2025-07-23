/**
 * NebulaCore Controller
 * 
 * Main controller class that manages the entire engine lifecycle, integrates all
 * core components, and provides the primary API for module and plugin interaction.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { 
  CoreController, 
  EngineState, 
  EngineConfig, 
  ModuleInterface, 
  PluginInterface,
  LifecycleHooks,
  ModuleRegistry,
  PluginManager,
  EventBusInterface,
  LoggerInterface,
  StateManagerInterface
} from '../../types/core.types.js';
import { Logger } from './logger.js';
import { GlobalEventBus } from './global.events.js';
import { StateManager } from './state.manager.js';
import { ModuleRegistryImpl } from './module.registry.js';
import { PluginManagerImpl } from './plugin.manager.js';
import { NebulaError } from '../../types/core.types.js';

interface CoreControllerConfig {
  configPath?: string;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  enableAutoSave?: boolean;
  lifecycleHooks?: LifecycleHooks;
}

export class CoreControllerImpl implements CoreController {
  private _state: EngineState = 'boot';
  private _config: EngineConfig;
  private _logger: Logger;
  private _events: GlobalEventBus;
  private _stateManager: StateManager;
  private _modules: ModuleRegistryImpl;
  private _plugins: PluginManagerImpl;
  
  private lifecycleHooks: LifecycleHooks;
  private performanceStartTime: number = 0;
  private updateLoop?: NodeJS.Timer;
  private isShuttingDown = false;
  private initializationPromise?: Promise<void>;

  constructor(config: CoreControllerConfig = {}) {
    this.performanceStartTime = performance.now();
    
    // Initialize logger first
    this._logger = new Logger({ 
      level: config.logLevel || 'info',
      enableFile: true,
      logDir: './logs'
    }, 'CoreController');

    // Initialize event bus
    this._events = new GlobalEventBus(this._logger);

    // Load engine configuration
    this._config = this.loadConfiguration(config.configPath || './engine.config.json');

    // Initialize state manager
    this._stateManager = new StateManager({
      enablePersistence: true,
      persistenceFile: './state/engine.state.json',
      autoSave: config.enableAutoSave ?? true
    }, this._logger, this._events);

    // Initialize module registry
    this._modules = new ModuleRegistryImpl(
      this as CoreController,
      this._config,
      this._logger,
      this._events
    );

    // Initialize plugin manager
    this._plugins = new PluginManagerImpl(
      this as CoreController,
      this._logger,
      this._events
    );

    // Set lifecycle hooks
    this.lifecycleHooks = config.lifecycleHooks || {};

    // Setup global error handling
    this.setupErrorHandling();

    // Setup graceful shutdown
    this.setupGracefulShutdown();

    this._logger.info('NebulaCore controller initialized', {
      version: this._config.engine.version,
      environment: this._config.engine.environment
    });

    this._events.emit('engine:boot');
  }

  // Getters for core components
  get state(): EngineState {
    return this._state;
  }

  get modules(): ModuleRegistry {
    return this._modules;
  }

  get plugins(): PluginManager {
    return this._plugins;
  }

  get events(): EventBusInterface {
    return this._events;
  }

  get logger(): LoggerInterface {
    return this._logger;
  }

  get stateManager(): StateManagerInterface {
    return this._stateManager;
  }

  get config(): EngineConfig {
    return this._config;
  }

  /**
   * Initialize the engine and all enabled modules
   */
  async initialize(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.doInitialize();
    return this.initializationPromise;
  }

  private async doInitialize(): Promise<void> {
    if (this._state !== 'boot') {
      throw new NebulaError(
        `Cannot initialize engine from state '${this._state}'`,
        'INVALID_STATE_TRANSITION',
        'CoreController'
      );
    }

    try {
      this.setState('init');
      this._logger.info('Initializing NebulaCore engine...');

      // Execute pre-init lifecycle hook
      if (this.lifecycleHooks.onInit) {
        await this.lifecycleHooks.onInit();
      }

      // Load and initialize modules from configured paths
      const modulesPath = path.resolve(this._config.paths.modules);
      if (await fs.pathExists(modulesPath)) {
        await this._modules.loadModulesFromPath(modulesPath);
      }

      // Initialize all enabled modules
      await this._modules.initializeModules();

      // Load and scan for plugins
      await this._plugins.scanForPlugins();

      // Set initial state values
      this._stateManager.set('engine:initialized', true);
      this._stateManager.set('engine:initTime', new Date());
      this._stateManager.set('engine:version', this._config.engine.version);

      const initTime = performance.now() - this.performanceStartTime;
      this._logger.info('NebulaCore engine initialized successfully', { 
        initTime: `${initTime.toFixed(2)}ms`,
        modules: this._modules.getInitializationOrder().length,
        plugins: this._plugins.getActive().length
      });

      this._events.emit('engine:init');

    } catch (error) {
      this._logger.error('Engine initialization failed', error as Error);
      this._events.emit('engine:error', error as EngineError);
      throw error;
    }
  }

  /**
   * Start the engine and begin the main loop
   */
  async start(): Promise<void> {
    if (this._state !== 'init') {
      if (this._state === 'boot') {
        await this.initialize();
      } else {
        throw new NebulaError(
          `Cannot start engine from state '${this._state}'`,
          'INVALID_STATE_TRANSITION',
          'CoreController'
        );
      }
    }

    try {
      this.setState('run');
      this._logger.info('Starting NebulaCore engine...');

      // Execute pre-start lifecycle hook
      if (this.lifecycleHooks.onRun) {
        await this.lifecycleHooks.onRun();
      }

      // Start all modules that have a start method
      const modules = this._modules.getEnabled();
      for (const module of modules) {
        if (module.start && typeof module.start === 'function') {
          try {
            await module.start();
            this._logger.debug(`Module '${module.metadata.name}' started`);
          } catch (error) {
            this._logger.error(`Failed to start module '${module.metadata.name}'`, error as Error);
            this._events.emit('module:error', module.metadata.name, error as Error);
          }
        }
      }

      // Start the main update loop if configured
      if (this._config.engine.maxFPS > 0) {
        this.startUpdateLoop();
      }

      // Update state
      this._stateManager.set('engine:running', true);
      this._stateManager.set('engine:startTime', new Date());

      this._logger.info('NebulaCore engine started successfully');
      this._events.emit('engine:start');

    } catch (error) {
      this._logger.error('Engine start failed', error as Error);
      this._events.emit('engine:error', error as EngineError);
      throw error;
    }
  }

  /**
   * Pause the engine
   */
  async pause(): Promise<void> {
    if (this._state !== 'run') {
      throw new NebulaError(
        `Cannot pause engine from state '${this._state}'`,
        'INVALID_STATE_TRANSITION',
        'CoreController'
      );
    }

    try {
      this.setState('pause');
      this._logger.info('Pausing NebulaCore engine...');

      // Execute pre-pause lifecycle hook
      if (this.lifecycleHooks.onPause) {
        await this.lifecycleHooks.onPause();
      }

      // Pause the update loop
      this.stopUpdateLoop();

      // Pause all modules that have a pause method
      const modules = this._modules.getEnabled();
      for (const module of modules) {
        if (module.pause && typeof module.pause === 'function') {
          try {
            await module.pause();
            this._logger.debug(`Module '${module.metadata.name}' paused`);
          } catch (error) {
            this._logger.error(`Failed to pause module '${module.metadata.name}'`, error as Error);
          }
        }
      }

      this._stateManager.set('engine:running', false);
      this._stateManager.set('engine:pauseTime', new Date());

      this._logger.info('NebulaCore engine paused');
      this._events.emit('engine:pause');

    } catch (error) {
      this._logger.error('Engine pause failed', error as Error);
      this._events.emit('engine:error', error as EngineError);
      throw error;
    }
  }

  /**
   * Resume the engine from pause
   */
  async resume(): Promise<void> {
    if (this._state !== 'pause') {
      throw new NebulaError(
        `Cannot resume engine from state '${this._state}'`,
        'INVALID_STATE_TRANSITION',
        'CoreController'
      );
    }

    try {
      this.setState('run');
      this._logger.info('Resuming NebulaCore engine...');

      // Resume all modules that have a resume method
      const modules = this._modules.getEnabled();
      for (const module of modules) {
        if (module.resume && typeof module.resume === 'function') {
          try {
            await module.resume();
            this._logger.debug(`Module '${module.metadata.name}' resumed`);
          } catch (error) {
            this._logger.error(`Failed to resume module '${module.metadata.name}'`, error as Error);
          }
        }
      }

      // Restart the update loop
      if (this._config.engine.maxFPS > 0) {
        this.startUpdateLoop();
      }

      this._stateManager.set('engine:running', true);
      this._stateManager.delete('engine:pauseTime');

      this._logger.info('NebulaCore engine resumed');
      this._events.emit('engine:resume');

    } catch (error) {
      this._logger.error('Engine resume failed', error as Error);
      this._events.emit('engine:error', error as EngineError);
      throw error;
    }
  }

  /**
   * Shutdown the engine and cleanup all resources
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return; // Already shutting down
    }

    this.isShuttingDown = true;

    try {
      this._logger.info('Shutting down NebulaCore engine...');

      // Execute pre-shutdown lifecycle hook
      if (this.lifecycleHooks.onTerminate) {
        await this.lifecycleHooks.onTerminate();
      }

      // Stop the update loop
      this.stopUpdateLoop();

      // Shutdown all modules
      await this._modules.shutdownModules();

      // Shutdown all plugins
      const activePlugins = this._plugins.getActive();
      for (const plugin of activePlugins) {
        try {
          await this._plugins.uninstall(plugin.name);
        } catch (error) {
          this._logger.error(`Failed to uninstall plugin '${plugin.name}'`, error as Error);
        }
      }

      // Cleanup state manager
      await this._stateManager.cleanup();

      // Close logger
      if (this._logger.close) {
        await this._logger.close();
      }

      this.setState('terminate');
      this._events.emit('engine:shutdown');

      console.log('NebulaCore engine shut down successfully');

    } catch (error) {
      this._logger.error('Engine shutdown failed', error as Error);
      this._events.emit('engine:error', error as EngineError);
      throw error;
    }
  }

  /**
   * Register a module with the engine
   */
  async registerModule(module: ModuleInterface): Promise<void> {
    await this._modules.register(module);
  }

  /**
   * Unregister a module from the engine
   */
  async unregisterModule(name: string): Promise<void> {
    await this._modules.unregister(name);
  }

  /**
   * Get a registered module
   */
  getModule<T extends ModuleInterface>(name: string): T | undefined {
    return this._modules.get<T>(name);
  }

  /**
   * Install a plugin
   */
  async installPlugin(plugin: PluginInterface): Promise<void> {
    await this._plugins.install(plugin);
  }

  /**
   * Uninstall a plugin
   */
  async uninstallPlugin(name: string): Promise<void> {
    await this._plugins.uninstall(name);
  }

  /**
   * Get engine status information
   */
  getStatus(): Record<string, any> {
    return {
      engine: {
        state: this._state,
        version: this._config.engine.version,
        environment: this._config.engine.environment,
        uptime: this.getUptime(),
        isShuttingDown: this.isShuttingDown
      },
      modules: this._modules.getModuleStatus(),
      plugins: this._plugins.getPluginStatus(),
      state: this._stateManager.getAll(),
      performance: this.getPerformanceMetrics()
    };
  }

  // Private helper methods

  private setState(newState: EngineState): void {
    const oldState = this._state;
    this._state = newState;
    this._stateManager.set('engine:state', newState);
    this._logger.debug(`Engine state changed: ${oldState} -> ${newState}`);
  }

  private loadConfiguration(configPath: string): EngineConfig {
    try {
      const absolutePath = path.resolve(configPath);
      if (fs.existsSync(absolutePath)) {
        const config = fs.readJsonSync(absolutePath);
        this._logger?.debug('Configuration loaded', { path: absolutePath });
        return config;
      } else {
        this._logger?.warn('Configuration file not found, using defaults', { path: absolutePath });
        return this.getDefaultConfig();
      }
    } catch (error) {
      this._logger?.error('Failed to load configuration, using defaults', error as Error);
      return this.getDefaultConfig();
    }
  }

  private getDefaultConfig(): EngineConfig {
    return {
      engine: {
        name: 'NebulaForge X',
        version: '1.0.0',
        target: 'universal',
        environment: 'development',
        debug: true,
        logLevel: 'info',
        maxFPS: 60,
        autoSave: true
      },
      runtime: {
        typescript: {
          enabled: true,
          strict: true,
          target: 'ES2020'
        },
        python: {
          enabled: false,
          version: '3.9+',
          venv: './venv'
        },
        rust: {
          enabled: false,
          edition: '2021',
          target: 'wasm32-unknown-unknown'
        }
      },
      modules: {},
      build: {
        outputDir: './dist',
        sourceMap: true,
        minify: false,
        bundler: 'esbuild',
        target: 'browser',
        format: 'esm'
      },
      paths: {
        modules: './engine/modules',
        assets: './assets',
        config: './config',
        temp: './temp',
        logs: './logs'
      }
    };
  }

  private startUpdateLoop(): void {
    if (this.updateLoop) {
      this.stopUpdateLoop();
    }

    const targetFPS = this._config.engine.maxFPS;
    const frameTime = 1000 / targetFPS;
    let lastTime = performance.now();

    const update = (): void => {
      if (this._state !== 'run') {
        return;
      }

      const currentTime = performance.now();
      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;

      // Update all modules
      const modules = this._modules.getEnabled();
      for (const module of modules) {
        if (module.update && typeof module.update === 'function') {
          try {
            module.update(deltaTime / 1000); // Convert to seconds
          } catch (error) {
            this._logger.error(`Error in module update: ${module.metadata.name}`, error as Error);
          }
        }
      }

      // Schedule next frame
      this.updateLoop = setTimeout(update, frameTime);
    };

    this.updateLoop = setTimeout(update, frameTime);
    this._logger.debug('Update loop started', { targetFPS, frameTime });
  }

  private stopUpdateLoop(): void {
    if (this.updateLoop) {
      clearTimeout(this.updateLoop);
      this.updateLoop = undefined;
      this._logger.debug('Update loop stopped');
    }
  }

  private setupErrorHandling(): void {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      this._logger.error('Uncaught exception', error);
      this._events.emit('engine:error', error as EngineError);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      this._logger.error('Unhandled promise rejection', new Error(String(reason)));
      this._events.emit('engine:error', new Error(String(reason)) as EngineError);
    });
  }

  private setupGracefulShutdown(): void {
    const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
    
    signals.forEach(signal => {
      process.on(signal, async () => {
        this._logger.info(`Received ${signal}, initiating graceful shutdown...`);
        try {
          await this.shutdown();
          process.exit(0);
        } catch (error) {
          this._logger.error('Graceful shutdown failed', error as Error);
          process.exit(1);
        }
      });
    });
  }

  private getUptime(): number {
    return performance.now() - this.performanceStartTime;
  }

  private getPerformanceMetrics(): Record<string, any> {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const memory = process.memoryUsage();
      return {
        uptime: this.getUptime(),
        memory: {
          rss: Math.round(memory.rss / 1024 / 1024 * 100) / 100,
          heapTotal: Math.round(memory.heapTotal / 1024 / 1024 * 100) / 100,
          heapUsed: Math.round(memory.heapUsed / 1024 / 1024 * 100) / 100,
          external: Math.round(memory.external / 1024 / 1024 * 100) / 100
        }
      };
    }
    
    return {
      uptime: this.getUptime()
    };
  }
}

// Export default instance factory
export function createCoreController(config?: CoreControllerConfig): CoreController {
  return new CoreControllerImpl(config);
}