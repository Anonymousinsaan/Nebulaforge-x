/**
 * NebulaForge X - Tool Manager
 * 
 * Central coordinator for all tools in the NebulaForge X ecosystem.
 * Manages tool lifecycle, dependencies, and communication.
 */

import { 
  ToolNamespace, 
  NebulaForgeBus,
  createBusInstance,
  ToolCapabilities,
  MessageType
} from './bus.module.js';
import { 
  BaseTool, 
  BaseToolConfig, 
  ToolState 
} from './base-tool.js';
import { GlobalEventBus } from '../../engine/modules/NebulaCore/index.js';

// Import tool implementations
import { CursorOrchestrator } from './cursor-orchestrator/index.js';
import { VoidSentinel } from './inbuilt-ai-tools/void-sentinel/index.js';

interface ToolDefinition {
  namespace: ToolNamespace;
  name: string;
  description: string;
  implementation: new () => BaseTool;
  autoStart: boolean;
  dependencies: ToolNamespace[];
  priority: number;
}

interface ToolInstance {
  tool: BaseTool;
  definition: ToolDefinition;
  state: ToolState;
  lastActivity: Date;
  metrics: any;
}

export class ToolManager {
  private bus: NebulaForgeBus;
  private tools: Map<ToolNamespace, ToolInstance> = new Map();
  private toolDefinitions: Map<ToolNamespace, ToolDefinition> = new Map();
  private initializationOrder: ToolNamespace[] = [];
  private isInitialized = false;

  constructor(globalEventBus: GlobalEventBus) {
    this.bus = createBusInstance(globalEventBus);
    this.registerToolDefinitions();
    this.calculateInitializationOrder();
  }

  /**
   * Initialize the tool management system
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      throw new Error('ToolManager already initialized');
    }

    console.log('🔧 Initializing NebulaForge X Tool Manager...');

    // Initialize tools in dependency order
    for (const namespace of this.initializationOrder) {
      const definition = this.toolDefinitions.get(namespace);
      if (definition && definition.autoStart) {
        try {
          await this.startTool(namespace);
          console.log(`✅ Tool started: ${definition.name}`);
        } catch (error) {
          console.error(`❌ Failed to start tool ${definition.name}:`, error);
          // Continue with other tools even if one fails
        }
      }
    }

    this.setupSystemMonitoring();
    this.isInitialized = true;

    console.log('✅ NebulaForge X Tool Manager initialized');
  }

  /**
   * Shutdown all tools gracefully
   */
  public async shutdown(): Promise<void> {
    console.log('🛑 Shutting down Tool Manager...');

    // Shutdown tools in reverse order
    const shutdownOrder = [...this.initializationOrder].reverse();
    
    for (const namespace of shutdownOrder) {
      const instance = this.tools.get(namespace);
      if (instance && instance.state !== ToolState.SHUTDOWN) {
        try {
          await instance.tool.shutdown();
          instance.state = ToolState.SHUTDOWN;
          console.log(`✅ Tool shut down: ${instance.definition.name}`);
        } catch (error) {
          console.error(`❌ Error shutting down ${instance.definition.name}:`, error);
        }
      }
    }

    this.isInitialized = false;
    console.log('✅ Tool Manager shutdown complete');
  }

  /**
   * Start a specific tool
   */
  public async startTool(namespace: ToolNamespace): Promise<void> {
    const definition = this.toolDefinitions.get(namespace);
    if (!definition) {
      throw new Error(`Tool definition not found: ${namespace}`);
    }

    // Check if already running
    const existing = this.tools.get(namespace);
    if (existing && existing.state === ToolState.READY) {
      console.log(`Tool ${definition.name} is already running`);
      return;
    }

    // Start dependencies first
    for (const dep of definition.dependencies) {
      const depInstance = this.tools.get(dep);
      if (!depInstance || depInstance.state !== ToolState.READY) {
        await this.startTool(dep);
      }
    }

    // Create and initialize tool
    const tool = new definition.implementation();
    const instance: ToolInstance = {
      tool,
      definition,
      state: ToolState.UNINITIALIZED,
      lastActivity: new Date(),
      metrics: {}
    };

    this.tools.set(namespace, instance);

    // Initialize the tool
    await tool.initialize();
    instance.state = ToolState.READY;

    console.log(`🚀 Tool started: ${definition.name} (${namespace})`);
  }

  /**
   * Stop a specific tool
   */
  public async stopTool(namespace: ToolNamespace): Promise<void> {
    const instance = this.tools.get(namespace);
    if (!instance) {
      throw new Error(`Tool not found: ${namespace}`);
    }

    // Check if other tools depend on this one
    const dependentTools = this.findDependentTools(namespace);
    if (dependentTools.length > 0) {
      const toolNames = dependentTools.map(t => this.toolDefinitions.get(t)?.name).join(', ');
      throw new Error(`Cannot stop ${instance.definition.name} - dependent tools: ${toolNames}`);
    }

    await instance.tool.shutdown();
    instance.state = ToolState.SHUTDOWN;
    this.tools.delete(namespace);

    console.log(`🛑 Tool stopped: ${instance.definition.name}`);
  }

  /**
   * Get status of all tools
   */
  public getToolsStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    
    for (const [namespace, instance] of this.tools) {
      status[namespace] = {
        name: instance.definition.name,
        state: instance.state,
        lastActivity: instance.lastActivity,
        isHealthy: instance.tool.isHealthy(),
        metrics: instance.tool.getMetrics()
      };
    }

    return status;
  }

  /**
   * Get specific tool instance
   */
  public getTool<T extends BaseTool>(namespace: ToolNamespace): T | null {
    const instance = this.tools.get(namespace);
    return instance ? instance.tool as T : null;
  }

  /**
   * Check system health
   */
  public async checkSystemHealth(): Promise<any> {
    const health = {
      overall: 'healthy' as 'healthy' | 'warning' | 'critical',
      tools: {} as Record<string, any>,
      recommendations: [] as string[]
    };

    let unhealthyCount = 0;
    let warningCount = 0;

    for (const [namespace, instance] of this.tools) {
      const toolHealth = {
        name: instance.definition.name,
        state: instance.state,
        isHealthy: instance.tool.isHealthy(),
        status: instance.tool.getStatus()
      };

      if (!toolHealth.isHealthy) {
        unhealthyCount++;
        if (instance.state === ToolState.ERROR) {
          health.recommendations.push(`${toolHealth.name} is in error state`);
        }
      } else if (instance.state === ToolState.BUSY) {
        warningCount++;
      }

      health.tools[namespace] = toolHealth;
    }

    // Determine overall health
    if (unhealthyCount > 0) {
      health.overall = unhealthyCount > 2 ? 'critical' : 'warning';
    } else if (warningCount > 3) {
      health.overall = 'warning';
    }

    return health;
  }

  /**
   * Send a request through the tool system
   */
  public async requestFromTools(
    messageType: MessageType,
    payload: any,
    targetTool?: ToolNamespace
  ): Promise<any> {
    if (targetTool) {
      const instance = this.tools.get(targetTool);
      if (!instance) {
        throw new Error(`Target tool not found: ${targetTool}`);
      }
      
      // Send direct request to specific tool
      return await this.bus.sendRequest(
        ToolNamespace.CURSOR_ORCHESTRATOR, // Use orchestrator as sender
        targetTool,
        messageType,
        payload
      );
    } else {
      // Broadcast or route to appropriate tool based on message type
      return await this.routeMessage(messageType, payload);
    }
  }

  // Private methods

  private registerToolDefinitions(): void {
    // Register all available tools
    const definitions: ToolDefinition[] = [
      {
        namespace: ToolNamespace.CURSOR_ORCHESTRATOR,
        name: 'Cursor.sh Orchestrator',
        description: 'Primary orchestrator for framework and architecture',
        implementation: CursorOrchestrator,
        autoStart: true,
        dependencies: [],
        priority: 1 // Highest priority
      },
      {
        namespace: ToolNamespace.VOID_SENTINEL,
        name: 'Void Sentinel',
        description: 'Error detection and code healing system',
        implementation: VoidSentinel,
        autoStart: true,
        dependencies: [],
        priority: 2
      },
      // Additional tools would be registered here
      // {
      //   namespace: ToolNamespace.AUGMENT_CODE,
      //   name: 'Augment Code',
      //   description: 'Autonomous coding and logic writing',
      //   implementation: AugmentCode, // To be implemented
      //   autoStart: false,
      //   dependencies: [ToolNamespace.CURSOR_ORCHESTRATOR],
      //   priority: 3
      // },
      // ... other tools
    ];

    for (const definition of definitions) {
      this.toolDefinitions.set(definition.namespace, definition);
    }

    console.log(`📋 Registered ${definitions.length} tool definitions`);
  }

  private calculateInitializationOrder(): void {
    // Topological sort based on dependencies
    const visited = new Set<ToolNamespace>();
    const tempMarked = new Set<ToolNamespace>();
    const result: ToolNamespace[] = [];

    const visit = (namespace: ToolNamespace) => {
      if (tempMarked.has(namespace)) {
        throw new Error(`Circular dependency detected: ${namespace}`);
      }
      if (visited.has(namespace)) {
        return;
      }

      tempMarked.add(namespace);
      
      const definition = this.toolDefinitions.get(namespace);
      if (definition) {
        for (const dep of definition.dependencies) {
          visit(dep);
        }
      }

      tempMarked.delete(namespace);
      visited.add(namespace);
      result.push(namespace);
    };

    // Visit all tools
    for (const namespace of this.toolDefinitions.keys()) {
      if (!visited.has(namespace)) {
        visit(namespace);
      }
    }

    // Sort by priority within dependency constraints
    this.initializationOrder = result.sort((a, b) => {
      const defA = this.toolDefinitions.get(a);
      const defB = this.toolDefinitions.get(b);
      return (defA?.priority || 999) - (defB?.priority || 999);
    });

    console.log('📊 Tool initialization order calculated:', this.initializationOrder);
  }

  private findDependentTools(namespace: ToolNamespace): ToolNamespace[] {
    const dependents: ToolNamespace[] = [];
    
    for (const [otherNamespace, definition] of this.toolDefinitions) {
      if (definition.dependencies.includes(namespace)) {
        const instance = this.tools.get(otherNamespace);
        if (instance && instance.state === ToolState.READY) {
          dependents.push(otherNamespace);
        }
      }
    }
    
    return dependents;
  }

  private async routeMessage(messageType: MessageType, payload: any): Promise<any> {
    // Route messages to appropriate tools based on type
    switch (messageType) {
      case MessageType.REQUEST_CODE:
        return await this.bus.sendRequest(
          ToolNamespace.CURSOR_ORCHESTRATOR,
          ToolNamespace.AUGMENT_CODE,
          messageType,
          payload
        );
      
      case MessageType.REQUEST_ANALYSIS:
        return await this.bus.sendRequest(
          ToolNamespace.CURSOR_ORCHESTRATOR,
          ToolNamespace.VOID_SENTINEL,
          messageType,
          payload
        );
      
      // Add more routing logic as needed
      default:
        throw new Error(`No routing configured for message type: ${messageType}`);
    }
  }

  private setupSystemMonitoring(): void {
    // Monitor tool health and performance
    setInterval(async () => {
      try {
        const health = await this.checkSystemHealth();
        
        if (health.overall !== 'healthy') {
          console.warn('⚠️ System health warning:', health.recommendations);
        }

        // Update tool activity timestamps
        for (const instance of this.tools.values()) {
          if (instance.tool.isHealthy()) {
            instance.lastActivity = new Date();
          }
        }
      } catch (error) {
        console.error('❌ System monitoring error:', error);
      }
    }, 30000); // Every 30 seconds

    console.log('📊 System monitoring started');
  }
}

// Singleton instance
let toolManagerInstance: ToolManager | null = null;

export function createToolManager(globalEventBus: GlobalEventBus): ToolManager {
  if (!toolManagerInstance) {
    toolManagerInstance = new ToolManager(globalEventBus);
  }
  return toolManagerInstance;
}

export function getToolManager(): ToolManager {
  if (!toolManagerInstance) {
    throw new Error('ToolManager not initialized. Call createToolManager() first.');
  }
  return toolManagerInstance;
}