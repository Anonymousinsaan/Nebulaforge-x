/**
 * NebulaCore Module Registry
 * 
 * Manages registration, initialization, and lifecycle of all engine modules
 * with dependency resolution, priority-based loading, and state tracking.
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import { ModuleInterface, ModuleRegistry, CoreController, EngineConfig } from '../../types/core.types.js';
import { Logger } from './logger.js';
import { GlobalEventBus } from './global.events.js';
import { NebulaError } from '../../types/core.types.js';

interface ModuleEntry {
  module: ModuleInterface;
  enabled: boolean;
  initialized: boolean;
  loadOrder: number;
  lastError?: Error;
  dependencies: string[];
  dependents: Set<string>;
}

interface ModuleDependencyGraph {
  [moduleName: string]: string[];
}

export class ModuleRegistryImpl implements ModuleRegistry {
  private modules: Map<string, ModuleEntry> = new Map();
  private logger: Logger;
  private eventBus: GlobalEventBus;
  private core: CoreController;
  private config: EngineConfig;
  private initializationOrder: string[] = [];
  private isInitializing = false;

  constructor(
    core: CoreController,
    config: EngineConfig,
    logger?: Logger,
    eventBus?: GlobalEventBus
  ) {
    this.core = core;
    this.config = config;
    this.logger = logger || new Logger({ level: 'info' }, 'ModuleRegistry');
    this.eventBus = eventBus || new GlobalEventBus(this.logger);

    this.logger.info('Module registry initialized');
  }

  /**
   * Register a module with the registry
   */
  async register(module: ModuleInterface): Promise<void> {
    const { name } = module.metadata;

    // Check if module is already registered
    if (this.modules.has(name)) {
      throw new NebulaError(
        `Module '${name}' is already registered`,
        'MODULE_ALREADY_REGISTERED',
        'ModuleRegistry'
      );
    }

    // Validate module interface
    this.validateModuleInterface(module);

    // Check module configuration
    const moduleConfig = this.config.modules[name];
    if (!moduleConfig) {
      this.logger.warn(`No configuration found for module '${name}', using defaults`);
    }

    // Create module entry
    const entry: ModuleEntry = {
      module,
      enabled: moduleConfig?.enabled ?? true,
      initialized: false,
      loadOrder: moduleConfig?.priority ?? 999,
      dependencies: module.metadata.dependencies || [],
      dependents: new Set()
    };

    this.modules.set(name, entry);

    // Update dependency graph
    this.updateDependencyGraph(name);

    this.eventBus.emit('module:registered', name, module);
    this.logger.info(`Module '${name}' registered`, {
      version: module.metadata.version,
      enabled: entry.enabled,
      dependencies: entry.dependencies
    });
  }

  /**
   * Unregister a module from the registry
   */
  async unregister(name: string): Promise<void> {
    const entry = this.modules.get(name);
    if (!entry) {
      throw new NebulaError(
        `Module '${name}' is not registered`,
        'MODULE_NOT_FOUND',
        'ModuleRegistry'
      );
    }

    // Check if other modules depend on this one
    if (entry.dependents.size > 0) {
      const dependents = Array.from(entry.dependents).join(', ');
      throw new NebulaError(
        `Cannot unregister module '${name}' - it has dependents: ${dependents}`,
        'MODULE_HAS_DEPENDENTS',
        'ModuleRegistry'
      );
    }

    // Shutdown module if it's initialized
    if (entry.initialized) {
      try {
        await entry.module.shutdown();
      } catch (error) {
        this.logger.error(`Error shutting down module '${name}'`, error as Error);
      }
    }

    // Remove from dependency graph
    this.removeDependencyReferences(name);

    // Remove from registry
    this.modules.delete(name);

    this.eventBus.emit('module:unregistered', name);
    this.logger.info(`Module '${name}' unregistered`);
  }

  /**
   * Get a registered module
   */
  get<T extends ModuleInterface>(name: string): T | undefined {
    const entry = this.modules.get(name);
    return entry ? (entry.module as T) : undefined;
  }

  /**
   * Get all registered modules
   */
  getAll(): ModuleInterface[] {
    return Array.from(this.modules.values()).map(entry => entry.module);
  }

  /**
   * Get all enabled modules
   */
  getEnabled(): ModuleInterface[] {
    return Array.from(this.modules.values())
      .filter(entry => entry.enabled)
      .map(entry => entry.module);
  }

  /**
   * Enable a module
   */
  async enable(name: string): Promise<void> {
    const entry = this.modules.get(name);
    if (!entry) {
      throw new NebulaError(
        `Module '${name}' is not registered`,
        'MODULE_NOT_FOUND',
        'ModuleRegistry'
      );
    }

    if (entry.enabled) {
      return; // Already enabled
    }

    entry.enabled = true;

    // If the registry is not currently initializing, initialize this module
    if (!this.isInitializing) {
      await this.initializeModule(name);
    }

    this.eventBus.emit('module:enabled', name);
    this.logger.info(`Module '${name}' enabled`);
  }

  /**
   * Disable a module
   */
  async disable(name: string): Promise<void> {
    const entry = this.modules.get(name);
    if (!entry) {
      throw new NebulaError(
        `Module '${name}' is not registered`,
        'MODULE_NOT_FOUND',
        'ModuleRegistry'
      );
    }

    if (!entry.enabled) {
      return; // Already disabled
    }

    // Check if other enabled modules depend on this one
    const enabledDependents = Array.from(entry.dependents)
      .filter(dependent => {
        const dependentEntry = this.modules.get(dependent);
        return dependentEntry && dependentEntry.enabled;
      });

    if (enabledDependents.length > 0) {
      throw new NebulaError(
        `Cannot disable module '${name}' - enabled modules depend on it: ${enabledDependents.join(', ')}`,
        'MODULE_HAS_ENABLED_DEPENDENTS',
        'ModuleRegistry'
      );
    }

    // Shutdown module if it's initialized
    if (entry.initialized) {
      try {
        await entry.module.shutdown();
        entry.initialized = false;
      } catch (error) {
        this.logger.error(`Error shutting down module '${name}'`, error as Error);
        entry.lastError = error as Error;
      }
    }

    entry.enabled = false;

    this.eventBus.emit('module:disabled', name);
    this.logger.info(`Module '${name}' disabled`);
  }

  /**
   * Check if a module is registered
   */
  isRegistered(name: string): boolean {
    return this.modules.has(name);
  }

  /**
   * Check if a module is enabled
   */
  isEnabled(name: string): boolean {
    const entry = this.modules.get(name);
    return entry ? entry.enabled : false;
  }

  /**
   * Initialize all enabled modules in dependency order
   */
  async initializeModules(): Promise<void> {
    this.isInitializing = true;
    
    try {
      // Get enabled modules
      const enabledModules = Array.from(this.modules.entries())
        .filter(([, entry]) => entry.enabled)
        .map(([name]) => name);

      // Resolve initialization order
      this.initializationOrder = this.resolveDependencyOrder(enabledModules);

      this.logger.info('Initializing modules in dependency order', {
        modules: this.initializationOrder
      });

      // Initialize modules in order
      for (const moduleName of this.initializationOrder) {
        await this.initializeModule(moduleName);
      }

      this.logger.info('All modules initialized successfully');
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Shutdown all modules in reverse dependency order
   */
  async shutdownModules(): Promise<void> {
    const shutdownOrder = [...this.initializationOrder].reverse();

    this.logger.info('Shutting down modules in reverse order', {
      modules: shutdownOrder
    });

    for (const moduleName of shutdownOrder) {
      const entry = this.modules.get(moduleName);
      if (entry && entry.initialized) {
        try {
          await entry.module.shutdown();
          entry.initialized = false;
          this.logger.debug(`Module '${moduleName}' shut down`);
        } catch (error) {
          this.logger.error(`Error shutting down module '${moduleName}'`, error as Error);
          entry.lastError = error as Error;
        }
      }
    }

    this.logger.info('All modules shut down');
  }

  /**
   * Get module initialization order
   */
  getInitializationOrder(): string[] {
    return [...this.initializationOrder];
  }

  /**
   * Get module status information
   */
  getModuleStatus(): Record<string, any> {
    const status: Record<string, any> = {};

    for (const [name, entry] of this.modules) {
      status[name] = {
        enabled: entry.enabled,
        initialized: entry.initialized,
        state: entry.module.getState(),
        version: entry.module.metadata.version,
        dependencies: entry.dependencies,
        dependents: Array.from(entry.dependents),
        lastError: entry.lastError?.message
      };
    }

    return status;
  }

  /**
   * Load modules from the filesystem
   */
  async loadModulesFromPath(modulesPath: string): Promise<void> {
    this.logger.info('Loading modules from path', { path: modulesPath });

    try {
      const moduleDirectories = await fs.readdir(modulesPath);

      for (const moduleDir of moduleDirectories) {
        const modulePath = path.join(modulesPath, moduleDir);
        const stats = await fs.stat(modulePath);

        if (stats.isDirectory()) {
          await this.loadModuleFromDirectory(modulePath, moduleDir);
        }
      }
    } catch (error) {
      this.logger.error('Failed to load modules from path', error as Error, { path: modulesPath });
    }
  }

  // Private helper methods

  private validateModuleInterface(module: ModuleInterface): void {
    const { metadata } = module;

    if (!metadata.name) {
      throw new NebulaError('Module metadata.name is required', 'INVALID_MODULE', 'ModuleRegistry');
    }

    if (!metadata.version) {
      throw new NebulaError('Module metadata.version is required', 'INVALID_MODULE', 'ModuleRegistry');
    }

    if (typeof module.initialize !== 'function') {
      throw new NebulaError('Module must implement initialize method', 'INVALID_MODULE', 'ModuleRegistry');
    }

    if (typeof module.shutdown !== 'function') {
      throw new NebulaError('Module must implement shutdown method', 'INVALID_MODULE', 'ModuleRegistry');
    }

    if (typeof module.getState !== 'function') {
      throw new NebulaError('Module must implement getState method', 'INVALID_MODULE', 'ModuleRegistry');
    }
  }

  private async initializeModule(name: string): Promise<void> {
    const entry = this.modules.get(name);
    if (!entry || !entry.enabled || entry.initialized) {
      return;
    }

    try {
      // Verify dependencies are initialized
      await this.ensureDependenciesInitialized(name);

      this.logger.debug(`Initializing module '${name}'`);
      
      await entry.module.initialize(this.core);
      entry.initialized = true;
      entry.lastError = undefined;

      // Start the module if it has a start method
      if (entry.module.start) {
        await entry.module.start();
      }

      this.logger.info(`Module '${name}' initialized successfully`);
    } catch (error) {
      entry.lastError = error as Error;
      this.logger.error(`Failed to initialize module '${name}'`, error as Error);
      this.eventBus.emit('module:error', name, error as Error);
      throw new NebulaError(
        `Failed to initialize module '${name}': ${(error as Error).message}`,
        'MODULE_INITIALIZATION_FAILED',
        'ModuleRegistry',
        { moduleName: name }
      );
    }
  }

  private async ensureDependenciesInitialized(moduleName: string): Promise<void> {
    const entry = this.modules.get(moduleName);
    if (!entry) return;

    for (const dependency of entry.dependencies) {
      const depEntry = this.modules.get(dependency);
      
      if (!depEntry) {
        throw new NebulaError(
          `Module '${moduleName}' depends on '${dependency}' which is not registered`,
          'MISSING_DEPENDENCY',
          'ModuleRegistry'
        );
      }

      if (!depEntry.enabled) {
        throw new NebulaError(
          `Module '${moduleName}' depends on '${dependency}' which is disabled`,
          'DISABLED_DEPENDENCY',
          'ModuleRegistry'
        );
      }

      if (!depEntry.initialized) {
        await this.initializeModule(dependency);
      }
    }
  }

  private updateDependencyGraph(moduleName: string): void {
    const entry = this.modules.get(moduleName);
    if (!entry) return;

    // Add this module as a dependent of its dependencies
    for (const dependency of entry.dependencies) {
      const depEntry = this.modules.get(dependency);
      if (depEntry) {
        depEntry.dependents.add(moduleName);
      }
    }
  }

  private removeDependencyReferences(moduleName: string): void {
    // Remove this module from all dependents lists
    for (const [, entry] of this.modules) {
      entry.dependents.delete(moduleName);
    }
  }

  private resolveDependencyOrder(moduleNames: string[]): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: string[] = [];

    const visit = (name: string): void => {
      if (visited.has(name)) return;
      
      if (visiting.has(name)) {
        throw new NebulaError(
          `Circular dependency detected involving module '${name}'`,
          'CIRCULAR_DEPENDENCY',
          'ModuleRegistry'
        );
      }

      visiting.add(name);

      const entry = this.modules.get(name);
      if (entry) {
        // Visit dependencies first
        for (const dependency of entry.dependencies) {
          if (moduleNames.includes(dependency)) {
            visit(dependency);
          }
        }
      }

      visiting.delete(name);
      visited.add(name);
      order.push(name);
    };

    // Sort modules by priority first, then resolve dependencies
    const sortedModules = moduleNames.sort((a, b) => {
      const entryA = this.modules.get(a);
      const entryB = this.modules.get(b);
      const priorityA = entryA?.loadOrder ?? 999;
      const priorityB = entryB?.loadOrder ?? 999;
      return priorityA - priorityB;
    });

    for (const moduleName of sortedModules) {
      visit(moduleName);
    }

    return order;
  }

  private async loadModuleFromDirectory(modulePath: string, moduleDir: string): Promise<void> {
    try {
      const indexPath = path.join(modulePath, 'index.ts');
      const jsIndexPath = path.join(modulePath, 'index.js');
      
      let modulFile = '';
      if (await fs.pathExists(indexPath)) {
        modulFile = indexPath;
      } else if (await fs.pathExists(jsIndexPath)) {
        modulFile = jsIndexPath;
      } else {
        this.logger.debug(`No index file found for module directory: ${moduleDir}`);
        return;
      }

      // Dynamic import of module
      const moduleExports = await import(modulFile);
      const ModuleClass = moduleExports.default || moduleExports[moduleDir];

      if (ModuleClass && typeof ModuleClass === 'function') {
        const moduleInstance = new ModuleClass();
        
        // Check if it implements the ModuleInterface
        if (moduleInstance.metadata && typeof moduleInstance.initialize === 'function') {
          await this.register(moduleInstance);
        } else {
          this.logger.warn(`Module in ${moduleDir} does not implement ModuleInterface`);
        }
      } else {
        this.logger.warn(`No valid module class found in ${moduleDir}`);
      }
    } catch (error) {
      this.logger.error(`Failed to load module from ${moduleDir}`, error as Error);
    }
  }
}