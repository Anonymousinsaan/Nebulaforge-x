/**
 * NebulaCore Plugin Manager
 * 
 * Manages external plugins with manifest-based loading, sandboxed execution,
 * version compatibility checking, and lifecycle management.
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import { 
  PluginInterface, 
  PluginManager, 
  PluginManifest, 
  CoreController 
} from '../../types/core.types.js';
import { Logger } from './logger.js';
import { GlobalEventBus } from './global.events.js';
import { NebulaError } from '../../types/core.types.js';

interface PluginEntry {
  plugin: PluginInterface;
  manifest: PluginManifest;
  active: boolean;
  loadTime: Date;
  lastError?: Error;
  sandboxContext?: any;
}

interface PluginSecurityPolicy {
  allowFileSystem: boolean;
  allowNetwork: boolean;
  allowNodeModules: boolean;
  maxMemoryUsage: number; // in MB
  maxExecutionTime: number; // in milliseconds
  allowedModules: string[];
  restrictedPaths: string[];
}

export class PluginManagerImpl implements PluginManager {
  private plugins: Map<string, PluginEntry> = new Map();
  private logger: Logger;
  private eventBus: GlobalEventBus;
  private core: CoreController;
  private securityPolicy: PluginSecurityPolicy;
  private pluginPaths: string[] = [];

  constructor(
    core: CoreController,
    logger?: Logger,
    eventBus?: GlobalEventBus
  ) {
    this.core = core;
    this.logger = logger || new Logger({ level: 'info' }, 'PluginManager');
    this.eventBus = eventBus || new GlobalEventBus(this.logger);

    // Default security policy
    this.securityPolicy = {
      allowFileSystem: false,
      allowNetwork: false,
      allowNodeModules: true,
      maxMemoryUsage: 100, // 100MB
      maxExecutionTime: 5000, // 5 seconds
      allowedModules: [
        'path', 'url', 'util', 'events', 'stream',
        'crypto', 'buffer', 'string_decoder'
      ],
      restrictedPaths: [
        '/etc/', '/root/', '/home/', '/usr/bin/',
        'C:\\Windows\\', 'C:\\Program Files\\'
      ]
    };

    this.logger.info('Plugin manager initialized');
  }

  /**
   * Install a plugin from a plugin instance
   */
  async install(plugin: PluginInterface): Promise<void> {
    const { name, version } = plugin;

    // Check if plugin is already installed
    if (this.plugins.has(name)) {
      const existing = this.plugins.get(name);
      if (existing && existing.plugin.version === version) {
        throw new NebulaError(
          `Plugin '${name}' version ${version} is already installed`,
          'PLUGIN_ALREADY_INSTALLED',
          'PluginManager'
        );
      }
    }

    this.validatePluginInterface(plugin);

    try {
      // Create plugin entry
      const entry: PluginEntry = {
        plugin,
        manifest: this.createDefaultManifest(plugin),
        active: false,
        loadTime: new Date()
      };

      // Install the plugin
      await plugin.install(this.core);
      entry.active = true;

      this.plugins.set(name, entry);
      
      this.eventBus.emit('plugin:installed', name, plugin);
      this.logger.info(`Plugin '${name}' v${version} installed successfully`);
    } catch (error) {
      this.logger.error(`Failed to install plugin '${name}'`, error as Error);
      this.eventBus.emit('plugin:error', name, error as Error);
      throw new NebulaError(
        `Failed to install plugin '${name}': ${(error as Error).message}`,
        'PLUGIN_INSTALLATION_FAILED',
        'PluginManager',
        { pluginName: name }
      );
    }
  }

  /**
   * Uninstall a plugin
   */
  async uninstall(name: string): Promise<void> {
    const entry = this.plugins.get(name);
    if (!entry) {
      throw new NebulaError(
        `Plugin '${name}' is not installed`,
        'PLUGIN_NOT_FOUND',
        'PluginManager'
      );
    }

    try {
      // Uninstall the plugin
      await entry.plugin.uninstall();
      entry.active = false;

      // Clean up sandbox context if it exists
      if (entry.sandboxContext) {
        entry.sandboxContext = null;
      }

      this.plugins.delete(name);
      
      this.eventBus.emit('plugin:uninstalled', name);
      this.logger.info(`Plugin '${name}' uninstalled successfully`);
    } catch (error) {
      entry.lastError = error as Error;
      this.logger.error(`Failed to uninstall plugin '${name}'`, error as Error);
      this.eventBus.emit('plugin:error', name, error as Error);
      throw new NebulaError(
        `Failed to uninstall plugin '${name}': ${(error as Error).message}`,
        'PLUGIN_UNINSTALL_FAILED',
        'PluginManager',
        { pluginName: name }
      );
    }
  }

  /**
   * Get an installed plugin
   */
  get(name: string): PluginInterface | undefined {
    const entry = this.plugins.get(name);
    return entry ? entry.plugin : undefined;
  }

  /**
   * Get all installed plugins
   */
  getAll(): PluginInterface[] {
    return Array.from(this.plugins.values()).map(entry => entry.plugin);
  }

  /**
   * Get all active plugins
   */
  getActive(): PluginInterface[] {
    return Array.from(this.plugins.values())
      .filter(entry => entry.active)
      .map(entry => entry.plugin);
  }

  /**
   * Check if a plugin is installed
   */
  isInstalled(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * Check if a plugin is active
   */
  isActive(name: string): boolean {
    const entry = this.plugins.get(name);
    return entry ? entry.active && entry.plugin.isActive() : false;
  }

  /**
   * Load a plugin from a file path
   */
  async loadFromPath(pluginPath: string): Promise<PluginInterface> {
    try {
      this.logger.debug(`Loading plugin from path: ${pluginPath}`);

      // Check if path is secure
      this.validatePluginPath(pluginPath);

      // Load the plugin module
      const pluginModule = await this.loadPluginModule(pluginPath);
      
      // Validate and create plugin instance
      const plugin = this.createPluginInstance(pluginModule);
      
      return plugin;
    } catch (error) {
      this.logger.error(`Failed to load plugin from path: ${pluginPath}`, error as Error);
      throw new NebulaError(
        `Failed to load plugin from ${pluginPath}: ${(error as Error).message}`,
        'PLUGIN_LOAD_FAILED',
        'PluginManager',
        { pluginPath }
      );
    }
  }

  /**
   * Load a plugin from a manifest file
   */
  async loadFromManifest(manifest: PluginManifest): Promise<PluginInterface> {
    this.validateManifest(manifest);

    // Check engine compatibility
    this.checkEngineCompatibility(manifest);

    // Determine plugin main file path
    const pluginDir = path.dirname(this.findManifestPath(manifest));
    const mainPath = path.resolve(pluginDir, manifest.main);

    const plugin = await this.loadFromPath(mainPath);
    
    // Override plugin metadata with manifest data
    plugin.name = manifest.name;
    plugin.version = manifest.version;
    plugin.description = manifest.description;

    return plugin;
  }

  /**
   * Load plugins from a directory
   */
  async loadPluginsFromDirectory(pluginDir: string): Promise<void> {
    this.logger.info('Loading plugins from directory', { path: pluginDir });

    try {
      const entries = await fs.readdir(pluginDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pluginPath = path.join(pluginDir, entry.name);
          await this.loadPluginFromDirectory(pluginPath);
        }
      }
    } catch (error) {
      this.logger.error('Failed to load plugins from directory', error as Error, { path: pluginDir });
    }
  }

  /**
   * Set plugin search paths
   */
  setPluginPaths(paths: string[]): void {
    this.pluginPaths = paths;
    this.logger.info('Plugin search paths updated', { paths });
  }

  /**
   * Update security policy for plugins
   */
  setSecurityPolicy(policy: Partial<PluginSecurityPolicy>): void {
    this.securityPolicy = { ...this.securityPolicy, ...policy };
    this.logger.info('Plugin security policy updated', policy);
  }

  /**
   * Get plugin status information
   */
  getPluginStatus(): Record<string, any> {
    const status: Record<string, any> = {};

    for (const [name, entry] of this.plugins) {
      status[name] = {
        version: entry.plugin.version,
        active: entry.active,
        isActive: entry.plugin.isActive(),
        loadTime: entry.loadTime,
        description: entry.plugin.description,
        manifest: entry.manifest,
        lastError: entry.lastError?.message
      };
    }

    return status;
  }

  /**
   * Scan for plugins in configured paths
   */
  async scanForPlugins(): Promise<void> {
    for (const pluginPath of this.pluginPaths) {
      if (await fs.pathExists(pluginPath)) {
        await this.loadPluginsFromDirectory(pluginPath);
      }
    }
  }

  // Private helper methods

  private validatePluginInterface(plugin: PluginInterface): void {
    if (!plugin.name) {
      throw new NebulaError('Plugin name is required', 'INVALID_PLUGIN', 'PluginManager');
    }

    if (!plugin.version) {
      throw new NebulaError('Plugin version is required', 'INVALID_PLUGIN', 'PluginManager');
    }

    if (typeof plugin.install !== 'function') {
      throw new NebulaError('Plugin must implement install method', 'INVALID_PLUGIN', 'PluginManager');
    }

    if (typeof plugin.uninstall !== 'function') {
      throw new NebulaError('Plugin must implement uninstall method', 'INVALID_PLUGIN', 'PluginManager');
    }

    if (typeof plugin.isActive !== 'function') {
      throw new NebulaError('Plugin must implement isActive method', 'INVALID_PLUGIN', 'PluginManager');
    }
  }

  private validateManifest(manifest: PluginManifest): void {
    const required = ['name', 'version', 'description', 'main', 'engines'];
    
    for (const field of required) {
      if (!manifest[field as keyof PluginManifest]) {
        throw new NebulaError(
          `Plugin manifest missing required field: ${field}`,
          'INVALID_MANIFEST',
          'PluginManager'
        );
      }
    }

    if (!manifest.engines.nebulaforge) {
      throw new NebulaError(
        'Plugin manifest must specify nebulaforge engine version',
        'INVALID_MANIFEST',
        'PluginManager'
      );
    }
  }

  private validatePluginPath(pluginPath: string): void {
    const absolutePath = path.resolve(pluginPath);
    
    // Check if path is in restricted directories
    for (const restrictedPath of this.securityPolicy.restrictedPaths) {
      if (absolutePath.startsWith(restrictedPath)) {
        throw new NebulaError(
          `Plugin path '${absolutePath}' is in restricted directory`,
          'RESTRICTED_PATH',
          'PluginManager'
        );
      }
    }

    // Check if file system access is allowed
    if (!this.securityPolicy.allowFileSystem && !pluginPath.startsWith('node_modules')) {
      throw new NebulaError(
        'File system access is not allowed by security policy',
        'SECURITY_VIOLATION',
        'PluginManager'
      );
    }
  }

  private async loadPluginModule(pluginPath: string): Promise<any> {
    try {
      // Create a sandbox context for the plugin if security is enabled
      if (!this.securityPolicy.allowNodeModules) {
        return await this.loadPluginInSandbox(pluginPath);
      } else {
        return await import(pluginPath);
      }
    } catch (error) {
      throw new NebulaError(
        `Failed to load plugin module: ${(error as Error).message}`,
        'MODULE_LOAD_FAILED',
        'PluginManager'
      );
    }
  }

  private async loadPluginInSandbox(pluginPath: string): Promise<any> {
    // This is a simplified sandbox implementation
    // In production, you might want to use a more robust solution like vm2
    const { VM } = await import('vm2');
    
    const code = await fs.readFile(pluginPath, 'utf8');
    
    const vm = new VM({
      timeout: this.securityPolicy.maxExecutionTime,
      sandbox: {
        require: this.createSandboxRequire(),
        module: { exports: {} },
        exports: {},
        console: this.logger,
        Buffer,
        process: {
          env: {},
          version: process.version,
          versions: process.versions
        }
      }
    });

    return vm.run(code);
  }

  private createSandboxRequire(): (id: string) => any {
    return (id: string) => {
      if (this.securityPolicy.allowedModules.includes(id)) {
        return require(id);
      } else {
        throw new Error(`Module '${id}' is not allowed by security policy`);
      }
    };
  }

  private createPluginInstance(pluginModule: any): PluginInterface {
    const PluginClass = pluginModule.default || pluginModule;
    
    if (typeof PluginClass === 'function') {
      return new PluginClass();
    } else if (typeof PluginClass === 'object' && PluginClass !== null) {
      return PluginClass;
    } else {
      throw new NebulaError(
        'Plugin module must export a class or object',
        'INVALID_PLUGIN_MODULE',
        'PluginManager'
      );
    }
  }

  private checkEngineCompatibility(manifest: PluginManifest): void {
    const engineVersion = this.core.config.engine.version;
    const requiredVersion = manifest.engines.nebulaforge;
    
    // Simple version compatibility check
    // In production, use a proper semver library
    if (!this.isVersionCompatible(engineVersion, requiredVersion)) {
      throw new NebulaError(
        `Plugin requires NebulaForge ${requiredVersion}, but ${engineVersion} is installed`,
        'VERSION_INCOMPATIBLE',
        'PluginManager'
      );
    }
  }

  private isVersionCompatible(current: string, required: string): boolean {
    // Simplified version check - in production use semver
    const currentParts = current.split('.').map(n => parseInt(n));
    const requiredParts = required.replace(/[^\d.]/g, '').split('.').map(n => parseInt(n));
    
    // Check major version compatibility
    return currentParts[0] === requiredParts[0];
  }

  private findManifestPath(manifest: PluginManifest): string {
    // This is a placeholder - in reality, you'd track where manifests come from
    return `./plugins/${manifest.name}/plugin.json`;
  }

  private createDefaultManifest(plugin: PluginInterface): PluginManifest {
    return {
      name: plugin.name,
      version: plugin.version,
      description: plugin.description || 'No description provided',
      main: 'index.js',
      engines: {
        nebulaforge: this.core.config.engine.version
      }
    };
  }

  private async loadPluginFromDirectory(pluginDir: string): Promise<void> {
    try {
      // Look for plugin manifest
      const manifestPath = path.join(pluginDir, 'plugin.json');
      
      if (await fs.pathExists(manifestPath)) {
        const manifest = await fs.readJson(manifestPath);
        const plugin = await this.loadFromManifest(manifest);
        await this.install(plugin);
      } else {
        // Look for index file
        const indexPaths = [
          path.join(pluginDir, 'index.js'),
          path.join(pluginDir, 'index.ts'),
          path.join(pluginDir, 'plugin.js'),
          path.join(pluginDir, 'plugin.ts')
        ];

        for (const indexPath of indexPaths) {
          if (await fs.pathExists(indexPath)) {
            const plugin = await this.loadFromPath(indexPath);
            await this.install(plugin);
            break;
          }
        }
      }
    } catch (error) {
      this.logger.error(`Failed to load plugin from directory: ${pluginDir}`, error as Error);
    }
  }
}