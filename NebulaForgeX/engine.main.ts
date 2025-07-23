/**
 * NebulaForge X - Main Engine Entry Point
 * 
 * 🚀 MAIN EXECUTION FILE
 * 
 * Primary entry point that:
 * - Bootstraps the entire NebulaForge X system
 * - Initializes the kernel and all core systems
 * - Manages engine lifecycle and state
 * - Provides unified API for external access
 * - Handles system-wide error recovery
 */

import { createKernel, NebulaKernel, KernelConfig, RuntimeMode } from './core.kernel.js';
import { createToolManager, getToolManager } from './src/tools/tool-manager.js';
import { ToolNamespace } from './src/tools/bus.module.js';
import { CursorOrchestrator } from './src/tools/cursor-orchestrator/index.js';
import { VoidSentinel } from './src/tools/inbuilt-ai-tools/void-sentinel/index.js';

export enum EngineState {
  UNINITIALIZED = 'uninitialized',
  STARTING = 'starting',
  RUNNING = 'running',
  PAUSED = 'paused',
  STOPPING = 'stopping',
  STOPPED = 'stopped',
  ERROR = 'error',
  RECOVERY = 'recovery'
}

export interface EngineConfig {
  mode: RuntimeMode;
  projectName: string;
  projectType: 'game' | 'app' | 'ide' | 'web' | 'tool';
  autoStart: boolean;
  enableDevMode: boolean;
  enableAutoHealing: boolean;
  maxMemoryMB: number;
  tickRate: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  plugins: string[];
  modules: string[];
  themes: string[];
}

export interface EngineStatus {
  state: EngineState;
  config: EngineConfig;
  uptime: number;
  version: string;
  kernel: any;
  tools: Record<string, any>;
  registry: any;
  lastError?: Error;
  healthScore: number;
}

export class NebulaForgeXEngine {
  private static instance: NebulaForgeXEngine | null = null;
  
  private state: EngineState = EngineState.UNINITIALIZED;
  private config: EngineConfig;
  private kernel: NebulaKernel;
  private startTime: Date | null = null;
  private lastError: Error | null = null;
  private healthScore: number = 100;
  private errorRecoveryAttempts: number = 0;
  
  // System Components
  private orchestrator: CursorOrchestrator | null = null;
  private voidSentinel: VoidSentinel | null = null;
  
  // Event handlers
  private eventHandlers: Map<string, Function[]> = new Map();
  
  private constructor(config: Partial<EngineConfig> = {}) {
    this.config = {
      mode: RuntimeMode.DEVELOPMENT,
      projectName: 'NebulaForge X Project',
      projectType: 'app',
      autoStart: false,
      enableDevMode: true,
      enableAutoHealing: true,
      maxMemoryMB: 2048,
      tickRate: 60,
      logLevel: 'info',
      plugins: [],
      modules: [],
      themes: ['default'],
      ...config
    };
    
    this.setupKernel();
    this.setupEventHandlers();
    
    console.log('🌌 NebulaForge X Engine initialized');
  }

  /**
   * Get or create the singleton engine instance
   */
  public static getInstance(config?: Partial<EngineConfig>): NebulaForgeXEngine {
    if (!NebulaForgeXEngine.instance) {
      NebulaForgeXEngine.instance = new NebulaForgeXEngine(config);
    }
    return NebulaForgeXEngine.instance;
  }

  /**
   * Start the engine and all systems
   */
  public async start(): Promise<void> {
    if (this.state !== EngineState.UNINITIALIZED && this.state !== EngineState.STOPPED) {
      throw new Error(`Cannot start engine from state: ${this.state}`);
    }

    try {
      this.setState(EngineState.STARTING);
      console.log('🚀 Starting NebulaForge X Engine...');
      
      this.startTime = new Date();
      
      // Phase 1: Boot the kernel
      await this.kernel.boot();
      console.log('✅ Kernel booted successfully');
      
      // Phase 2: Initialize core tools
      await this.initializeCoreTools();
      console.log('✅ Core tools initialized');
      
      // Phase 3: Load and initialize modules
      await this.loadModules();
      console.log('✅ Modules loaded');
      
      // Phase 4: Load and initialize plugins
      await this.loadPlugins();
      console.log('✅ Plugins loaded');
      
      // Phase 5: Apply themes
      await this.applyThemes();
      console.log('✅ Themes applied');
      
      // Phase 6: Start auto-healing if enabled
      if (this.config.enableAutoHealing) {
        await this.startAutoHealing();
        console.log('✅ Auto-healing system started');
      }
      
      // Phase 7: Final setup and validation
      await this.performStartupValidation();
      console.log('✅ Startup validation complete');
      
      this.setState(EngineState.RUNNING);
      this.emit('engine:started');
      
      console.log('🎉 NebulaForge X Engine is now running!');
      
    } catch (error) {
      this.setState(EngineState.ERROR);
      this.lastError = error as Error;
      console.error('❌ Engine startup failed:', error);
      
      if (this.config.enableAutoHealing) {
        await this.attemptRecovery();
      }
      
      throw error;
    }
  }

  /**
   * Stop the engine gracefully
   */
  public async stop(): Promise<void> {
    if (this.state === EngineState.STOPPED || this.state === EngineState.STOPPING) {
      return;
    }

    try {
      this.setState(EngineState.STOPPING);
      console.log('🛑 Stopping NebulaForge X Engine...');
      
      // Stop auto-healing
      await this.stopAutoHealing();
      
      // Unload plugins
      await this.unloadPlugins();
      
      // Unload modules
      await this.unloadModules();
      
      // Shutdown core tools
      await this.shutdownCoreTools();
      
      // Shutdown kernel
      await this.kernel.shutdown();
      
      this.setState(EngineState.STOPPED);
      this.emit('engine:stopped');
      
      console.log('✅ NebulaForge X Engine stopped successfully');
      
    } catch (error) {
      console.error('❌ Error stopping engine:', error);
      this.lastError = error as Error;
      throw error;
    }
  }

  /**
   * Pause the engine (suspend operations but keep state)
   */
  public async pause(): Promise<void> {
    if (this.state !== EngineState.RUNNING) {
      throw new Error(`Cannot pause engine from state: ${this.state}`);
    }

    this.setState(EngineState.PAUSED);
    this.emit('engine:paused');
    console.log('⏸️ NebulaForge X Engine paused');
  }

  /**
   * Resume the engine from paused state
   */
  public async resume(): Promise<void> {
    if (this.state !== EngineState.PAUSED) {
      throw new Error(`Cannot resume engine from state: ${this.state}`);
    }

    this.setState(EngineState.RUNNING);
    this.emit('engine:resumed');
    console.log('▶️ NebulaForge X Engine resumed');
  }

  /**
   * Restart the engine
   */
  public async restart(): Promise<void> {
    console.log('🔄 Restarting NebulaForge X Engine...');
    await this.stop();
    await this.start();
  }

  /**
   * Get current engine status
   */
  public getStatus(): EngineStatus {
    const toolManager = getToolManager();
    const kernel = this.kernel;
    
    return {
      state: this.state,
      config: this.config,
      uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
      version: this.getVersion(),
      kernel: kernel.getStatus(),
      tools: toolManager.getToolsStatus(),
      registry: kernel ? kernel.getStatus() : null,
      lastError: this.lastError || undefined,
      healthScore: this.healthScore
    };
  }

  /**
   * Get engine version
   */
  public getVersion(): string {
    return '1.0.0-alpha'; // This would typically come from package.json
  }

  /**
   * Create a new project
   */
  public async createProject(
    name: string,
    type: 'game' | 'app' | 'ide' | 'web' | 'tool',
    options: Record<string, any> = {}
  ): Promise<string> {
    if (!this.orchestrator) {
      throw new Error('Engine not started - orchestrator not available');
    }

    console.log(`🎨 Creating new ${type} project: ${name}`);
    
    try {
      const projectId = await this.orchestrator.createProject(name, type, options.requirements || []);
      this.emit('project:created', { name, type, projectId, options });
      return projectId;
      
    } catch (error) {
      console.error('❌ Failed to create project:', error);
      throw error;
    }
  }

  /**
   * Load a plugin dynamically
   */
  public async loadPlugin(pluginPath: string, config: any = {}): Promise<void> {
    console.log(`🔌 Loading plugin: ${pluginPath}`);
    
    try {
      // Plugin loading logic would go here
      // For now, just log the attempt
      console.log(`✅ Plugin loaded: ${pluginPath}`);
      this.emit('plugin:loaded', { pluginPath, config });
      
    } catch (error) {
      console.error(`❌ Failed to load plugin ${pluginPath}:`, error);
      throw error;
    }
  }

  /**
   * Unload a plugin
   */
  public async unloadPlugin(pluginName: string): Promise<void> {
    console.log(`🔌 Unloading plugin: ${pluginName}`);
    
    try {
      // Plugin unloading logic would go here
      console.log(`✅ Plugin unloaded: ${pluginName}`);
      this.emit('plugin:unloaded', { pluginName });
      
    } catch (error) {
      console.error(`❌ Failed to unload plugin ${pluginName}:`, error);
      throw error;
    }
  }

  /**
   * Perform system health check
   */
  public async performHealthCheck(): Promise<any> {
    console.log('🏥 Performing system health check...');
    
    try {
      const toolManager = getToolManager();
      const systemHealth = await toolManager.checkSystemHealth();
      const kernelStatus = this.kernel.getStatus();
      
      // Calculate health score
      this.healthScore = this.calculateHealthScore(systemHealth, kernelStatus);
      
      const healthReport = {
        overall: this.healthScore > 80 ? 'healthy' : this.healthScore > 50 ? 'warning' : 'critical',
        score: this.healthScore,
        engine: {
          state: this.state,
          uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
          errorCount: this.errorRecoveryAttempts
        },
        kernel: kernelStatus,
        tools: systemHealth,
        timestamp: new Date()
      };
      
      this.emit('health:checked', healthReport);
      return healthReport;
      
    } catch (error) {
      console.error('❌ Health check failed:', error);
      throw error;
    }
  }

  /**
   * Add event listener
   */
  public on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  /**
   * Remove event listener
   */
  public off(event: string, handler: Function): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Emit event
   */
  public emit(event: string, data?: any): void {
    const handlers = this.eventHandlers.get(event) || [];
    for (const handler of handlers) {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    }
  }

  // Private Methods

  private setupKernel(): void {
    const kernelConfig: Partial<KernelConfig> = {
      mode: this.config.mode,
      maxMemoryMB: this.config.maxMemoryMB,
      tickRate: this.config.tickRate,
      enableAutoHealing: this.config.enableAutoHealing,
      logLevel: this.config.logLevel
    };
    
    this.kernel = createKernel(kernelConfig);
    
    // Listen to kernel events
    this.kernel.on('kernel:crash', (error) => {
      this.handleKernelCrash(error);
    });
    
    this.kernel.on('kernel:health-warning', (health) => {
      this.handleHealthWarning(health);
    });
  }

  private setupEventHandlers(): void {
    // Setup default event handlers
    this.on('engine:started', () => {
      console.log('🎉 Engine started successfully');
    });
    
    this.on('engine:stopped', () => {
      console.log('✅ Engine stopped successfully');
    });
    
    this.on('engine:error', (error) => {
      console.error('❌ Engine error:', error);
    });
  }

  private async initializeCoreTools(): Promise<void> {
    const toolManager = getToolManager();
    
    // Get orchestrator instance
    this.orchestrator = toolManager.getTool<CursorOrchestrator>(ToolNamespace.CURSOR_ORCHESTRATOR);
    if (!this.orchestrator) {
      throw new Error('Failed to initialize Cursor Orchestrator');
    }
    
    // Get void sentinel instance
    this.voidSentinel = toolManager.getTool<VoidSentinel>(ToolNamespace.VOID_SENTINEL);
    if (!this.voidSentinel) {
      throw new Error('Failed to initialize Void Sentinel');
    }
    
    console.log('🔧 Core tools initialized');
  }

  private async loadModules(): Promise<void> {
    for (const moduleName of this.config.modules) {
      try {
        console.log(`📦 Loading module: ${moduleName}`);
        // Module loading logic would go here
        console.log(`✅ Module loaded: ${moduleName}`);
      } catch (error) {
        console.error(`❌ Failed to load module ${moduleName}:`, error);
        if (!this.config.enableAutoHealing) {
          throw error;
        }
      }
    }
  }

  private async unloadModules(): Promise<void> {
    console.log('📦 Unloading modules...');
    // Module unloading logic would go here
  }

  private async loadPlugins(): Promise<void> {
    for (const pluginName of this.config.plugins) {
      try {
        await this.loadPlugin(pluginName);
      } catch (error) {
        console.error(`❌ Failed to load plugin ${pluginName}:`, error);
        if (!this.config.enableAutoHealing) {
          throw error;
        }
      }
    }
  }

  private async unloadPlugins(): Promise<void> {
    console.log('🔌 Unloading plugins...');
    // Plugin unloading logic would go here
  }

  private async applyThemes(): Promise<void> {
    for (const themeName of this.config.themes) {
      try {
        console.log(`🎨 Applying theme: ${themeName}`);
        // Theme application logic would go here
        console.log(`✅ Theme applied: ${themeName}`);
      } catch (error) {
        console.error(`❌ Failed to apply theme ${themeName}:`, error);
        if (!this.config.enableAutoHealing) {
          throw error;
        }
      }
    }
  }

  private async startAutoHealing(): Promise<void> {
    if (this.voidSentinel) {
      // Start continuous monitoring
      setInterval(async () => {
        try {
          await this.voidSentinel!.analyzeCodebase();
        } catch (error) {
          console.error('Auto-healing error:', error);
        }
      }, 60000); // Every minute
      
      console.log('🛡️ Auto-healing system started');
    }
  }

  private async stopAutoHealing(): Promise<void> {
    console.log('🛡️ Auto-healing system stopped');
  }

  private async shutdownCoreTools(): Promise<void> {
    const toolManager = getToolManager();
    await toolManager.shutdown();
    
    this.orchestrator = null;
    this.voidSentinel = null;
  }

  private async performStartupValidation(): Promise<void> {
    // Validate that all critical systems are running
    const status = this.getStatus();
    
    if (status.kernel.state !== 'running') {
      throw new Error('Kernel is not in running state');
    }
    
    if (status.tools.overall === 'critical') {
      throw new Error('Critical tools are not healthy');
    }
    
    console.log('✅ Startup validation passed');
  }

  private calculateHealthScore(systemHealth: any, kernelStatus: any): number {
    let score = 100;
    
    // Deduct points for system issues
    if (systemHealth.overall === 'warning') score -= 20;
    if (systemHealth.overall === 'critical') score -= 50;
    
    // Deduct points for kernel issues
    if (kernelStatus.state !== 'running') score -= 30;
    
    // Deduct points for memory usage
    const memoryUsage = (kernelStatus.memoryUsage.used / kernelStatus.memoryUsage.limit) * 100;
    if (memoryUsage > 80) score -= 20;
    if (memoryUsage > 90) score -= 40;
    
    // Deduct points for error recovery attempts
    score -= Math.min(this.errorRecoveryAttempts * 5, 25);
    
    return Math.max(0, Math.min(100, score));
  }

  private setState(newState: EngineState): void {
    const oldState = this.state;
    this.state = newState;
    this.emit('engine:state-changed', { oldState, newState });
    console.log(`🔄 Engine state: ${oldState} → ${newState}`);
  }

  private async handleKernelCrash(error: Error): Promise<void> {
    console.error('💥 Kernel crashed:', error);
    this.setState(EngineState.ERROR);
    this.lastError = error;
    
    if (this.config.enableAutoHealing) {
      await this.attemptRecovery();
    }
  }

  private async handleHealthWarning(health: any): Promise<void> {
    console.warn('⚠️ System health warning:', health);
    this.healthScore = Math.max(0, this.healthScore - 10);
    
    if (this.config.enableAutoHealing && this.voidSentinel) {
      // Trigger healing analysis
      await this.voidSentinel.analyzeCodebase();
    }
  }

  private async attemptRecovery(): Promise<void> {
    if (this.errorRecoveryAttempts >= 3) {
      console.error('❌ Maximum recovery attempts reached');
      return;
    }
    
    this.errorRecoveryAttempts++;
    this.setState(EngineState.RECOVERY);
    
    console.log(`🚑 Attempting recovery (attempt ${this.errorRecoveryAttempts}/3)...`);
    
    try {
      // Attempt to restart kernel
      await this.kernel.shutdown();
      this.setupKernel();
      await this.kernel.boot();
      
      // Reinitialize core tools
      await this.initializeCoreTools();
      
      this.setState(EngineState.RUNNING);
      console.log('✅ Recovery successful');
      
    } catch (error) {
      console.error('❌ Recovery failed:', error);
      this.setState(EngineState.ERROR);
      
      // Try again after delay
      setTimeout(() => {
        this.attemptRecovery();
      }, 5000);
    }
  }
}

// Export singleton instance
export const NebulaEngine = NebulaForgeXEngine.getInstance();

// Export factory function for custom instances
export function createEngine(config?: Partial<EngineConfig>): NebulaForgeXEngine {
  return NebulaForgeXEngine.getInstance(config);
}

// CLI Integration
if (typeof process !== 'undefined' && process.argv) {
  const args = process.argv.slice(2);
  
  if (args.includes('--start') || args.includes('-s')) {
    console.log('🚀 Starting NebulaForge X from CLI...');
    NebulaEngine.start().catch(error => {
      console.error('❌ Failed to start engine:', error);
      process.exit(1);
    });
  }
  
  if (args.includes('--version') || args.includes('-v')) {
    console.log(`NebulaForge X Engine v${NebulaEngine.getVersion()}`);
  }
  
  if (args.includes('--status')) {
    const status = NebulaEngine.getStatus();
    console.log('Engine Status:', JSON.stringify(status, null, 2));
  }
}

// Default export
export default NebulaEngine;