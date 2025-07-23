/**
 * NebulaForge X - Tools Entry Bridge
 * 
 * 🌉 BRIDGE TO AI TOOLS WORKSPACE
 * 
 * Communication bridge that connects the NebulaForge X engine
 * with external AI tools workspace including:
 * - Tool registration and discovery
 * - Message routing and transformation
 * - External tool lifecycle management
 * - Protocol translation and adaptation
 * - Security and authentication for tool access
 */

import { EventEmitter } from 'events';
import { ToolManager } from '../src/tools/tool-manager.js';
import { 
  ToolNamespace, 
  NebulaForgeBus, 
  MessageType, 
  BusMessage 
} from '../src/tools/bus.module.js';
import { CoreControllerImpl } from '../engine/modules/NebulaCore/core.controller.js';

export enum ExternalToolType {
  AUGMENT_CODE = 'augment-code',
  VON_DEV = 'von-dev',
  KIRO_DEV = 'kiro-dev',
  KIMA_AI = 'kima-ai',
  ORCHIDS_APP = 'orchids-app',
  CLAUDE_DOCS = 'claude-docs',
  FIREBASE_STUDIO = 'firebase-studio',
  DATABUTTON_AI = 'databutton-ai'
}

export enum BridgeProtocol {
  HTTP_REST = 'http-rest',
  WEBSOCKET = 'websocket',
  GRPC = 'grpc',
  WEBHOOK = 'webhook',
  MQTT = 'mqtt',
  DIRECT_API = 'direct-api'
}

export enum ToolConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  AUTHENTICATED = 'authenticated',
  ERROR = 'error',
  TIMEOUT = 'timeout'
}

export interface ExternalToolConnection {
  id: string;
  type: ExternalToolType;
  namespace: ToolNamespace;
  protocol: BridgeProtocol;
  endpoint: string;
  status: ToolConnectionStatus;
  lastPing: Date;
  latency: number;
  authToken?: string;
  capabilities: string[];
  version: string;
  metadata: Record<string, any>;
}

export interface BridgeRequest {
  id: string;
  timestamp: Date;
  source: 'engine' | 'external-tool';
  targetTool: ExternalToolType;
  messageType: MessageType;
  payload: any;
  timeout: number;
  retries: number;
  priority: number;
}

export interface BridgeResponse {
  requestId: string;
  timestamp: Date;
  success: boolean;
  data?: any;
  error?: string;
  metadata?: Record<string, any>;
}

export interface ToolAdapter {
  toolType: ExternalToolType;
  transformRequest: (request: BridgeRequest) => Promise<any>;
  transformResponse: (response: any) => Promise<BridgeResponse>;
  healthCheck: () => Promise<boolean>;
  authenticate: (credentials: any) => Promise<string>;
}

export class ToolsEntryBridge extends EventEmitter {
  private toolManager: ToolManager;
  private coreController: CoreControllerImpl;
  private nebulaBus: NebulaForgeBus;
  private isInitialized = false;
  
  // Connection management
  private connections: Map<string, ExternalToolConnection> = new Map();
  private adapters: Map<ExternalToolType, ToolAdapter> = new Map();
  private pendingRequests: Map<string, BridgeRequest> = new Map();
  
  // Communication stats
  private stats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageLatency: 0,
    activeConnections: 0
  };
  
  // Configuration
  private config = {
    connectionTimeout: 30000,
    requestTimeout: 60000,
    maxRetries: 3,
    healthCheckInterval: 30000,
    reconnectInterval: 5000,
    enableMetrics: true
  };

  constructor(toolManager: ToolManager, coreController: CoreControllerImpl) {
    super();
    this.toolManager = toolManager;
    this.coreController = coreController;
    this.nebulaBus = (toolManager as any).bus;
    
    this.setupEventHandlers();
  }

  /**
   * Initialize the tools entry bridge
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      throw new Error('ToolsEntryBridge already initialized');
    }

    console.log('🌉 Initializing Tools Entry Bridge...');

    // Register tool adapters
    this.registerToolAdapters();
    
    // Discover and connect to external tools
    await this.discoverExternalTools();
    
    // Start health monitoring
    this.startHealthMonitoring();
    
    // Register with internal bus
    this.registerBusHandlers();
    
    this.isInitialized = true;
    this.emit('bridge:initialized');

    console.log('✅ Tools Entry Bridge initialized');
  }

  /**
   * Shutdown the bridge
   */
  public async shutdown(): Promise<void> {
    console.log('🛑 Tools Entry Bridge shutting down...');
    
    // Disconnect all external tools
    for (const connection of this.connections.values()) {
      await this.disconnectTool(connection.id);
    }
    
    this.connections.clear();
    this.adapters.clear();
    this.pendingRequests.clear();
    
    this.isInitialized = false;
    this.emit('bridge:shutdown');
    
    console.log('✅ Tools Entry Bridge shutdown complete');
  }

  /**
   * Connect to an external tool
   */
  public async connectTool(toolConfig: {
    type: ExternalToolType;
    endpoint: string;
    protocol: BridgeProtocol;
    credentials?: any;
    metadata?: Record<string, any>;
  }): Promise<string> {
    const connectionId = this.generateConnectionId();
    
    console.log(`🔗 Connecting to external tool: ${toolConfig.type}`);
    
    const connection: ExternalToolConnection = {
      id: connectionId,
      type: toolConfig.type,
      namespace: this.mapToolTypeToNamespace(toolConfig.type),
      protocol: toolConfig.protocol,
      endpoint: toolConfig.endpoint,
      status: ToolConnectionStatus.CONNECTING,
      lastPing: new Date(),
      latency: 0,
      capabilities: [],
      version: '1.0.0',
      metadata: toolConfig.metadata || {}
    };
    
    this.connections.set(connectionId, connection);
    
    try {
      // Authenticate if needed
      if (toolConfig.credentials) {
        const adapter = this.adapters.get(toolConfig.type);
        if (adapter) {
          connection.authToken = await adapter.authenticate(toolConfig.credentials);
        }
      }
      
      // Perform handshake
      await this.performHandshake(connection);
      
      connection.status = ToolConnectionStatus.CONNECTED;
      this.stats.activeConnections++;
      
      this.emit('tool:connected', connection);
      console.log(`✅ Connected to ${toolConfig.type}: ${connectionId}`);
      
      return connectionId;
      
    } catch (error) {
      connection.status = ToolConnectionStatus.ERROR;
      console.error(`❌ Failed to connect to ${toolConfig.type}:`, error);
      this.emit('tool:connection-error', { connection, error });
      throw error;
    }
  }

  /**
   * Disconnect from an external tool
   */
  public async disconnectTool(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection not found: ${connectionId}`);
    }
    
    console.log(`🔌 Disconnecting from ${connection.type}: ${connectionId}`);
    
    try {
      // Perform cleanup
      await this.performDisconnection(connection);
      
      connection.status = ToolConnectionStatus.DISCONNECTED;
      this.connections.delete(connectionId);
      this.stats.activeConnections--;
      
      this.emit('tool:disconnected', connection);
      console.log(`✅ Disconnected from ${connection.type}`);
      
    } catch (error) {
      console.error(`❌ Error disconnecting from ${connection.type}:`, error);
      throw error;
    }
  }

  /**
   * Send request to external tool
   */
  public async sendToExternalTool(
    toolType: ExternalToolType,
    messageType: MessageType,
    payload: any,
    options: {
      timeout?: number;
      priority?: number;
      retries?: number;
    } = {}
  ): Promise<any> {
    const connection = this.findConnectionByType(toolType);
    if (!connection) {
      throw new Error(`No connection found for tool: ${toolType}`);
    }
    
    if (connection.status !== ToolConnectionStatus.CONNECTED) {
      throw new Error(`Tool ${toolType} is not connected (status: ${connection.status})`);
    }
    
    const request: BridgeRequest = {
      id: this.generateRequestId(),
      timestamp: new Date(),
      source: 'engine',
      targetTool: toolType,
      messageType,
      payload,
      timeout: options.timeout || this.config.requestTimeout,
      retries: options.retries || this.config.maxRetries,
      priority: options.priority || 1
    };
    
    this.pendingRequests.set(request.id, request);
    this.stats.totalRequests++;
    
    try {
      const startTime = Date.now();
      
      // Transform request for external tool
      const adapter = this.adapters.get(toolType);
      if (!adapter) {
        throw new Error(`No adapter found for tool: ${toolType}`);
      }
      
      const transformedRequest = await adapter.transformRequest(request);
      
      // Send request via appropriate protocol
      const rawResponse = await this.sendViaProtocol(connection, transformedRequest);
      
      // Transform response back to internal format
      const response = await adapter.transformResponse(rawResponse);
      
      // Update metrics
      const latency = Date.now() - startTime;
      this.updateLatencyMetrics(connection, latency);
      
      this.stats.successfulRequests++;
      this.emit('request:completed', { request, response, latency });
      
      return response.data;
      
    } catch (error) {
      this.stats.failedRequests++;
      this.emit('request:failed', { request, error });
      
      // Retry logic
      if (request.retries > 0) {
        request.retries--;
        console.log(`🔄 Retrying request ${request.id} (${request.retries} retries left)`);
        
        // Exponential backoff
        const delay = Math.pow(2, this.config.maxRetries - request.retries) * 1000;
        await this.delay(delay);
        
        return this.sendToExternalTool(toolType, messageType, payload, {
          ...options,
          retries: request.retries
        });
      }
      
      throw error;
      
    } finally {
      this.pendingRequests.delete(request.id);
    }
  }

  /**
   * Get bridge statistics
   */
  public getStats(): Record<string, any> {
    return {
      ...this.stats,
      activeConnections: this.connections.size,
      connectedTools: Array.from(this.connections.values()).map(c => ({
        type: c.type,
        status: c.status,
        latency: c.latency
      })),
      pendingRequests: this.pendingRequests.size
    };
  }

  /**
   * Get connection status for all tools
   */
  public getConnectionStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    
    for (const [id, connection] of this.connections) {
      status[connection.type] = {
        id,
        status: connection.status,
        latency: connection.latency,
        lastPing: connection.lastPing,
        capabilities: connection.capabilities,
        version: connection.version
      };
    }
    
    return status;
  }

  // Private Methods

  private setupEventHandlers(): void {
    // Listen to internal tool manager events
    this.toolManager.on('tool:status-changed', (data) => {
      this.handleInternalToolChange(data);
    });
    
    // Listen to core controller events
    this.coreController.globalEventBus.on('system:state-changed', (data) => {
      this.notifyExternalTools('system-state-change', data);
    });
  }

  private registerToolAdapters(): void {
    // Register adapters for each external tool type
    const adapterConfigs = [
      { type: ExternalToolType.AUGMENT_CODE, priority: 1 },
      { type: ExternalToolType.VON_DEV, priority: 2 },
      { type: ExternalToolType.KIRO_DEV, priority: 2 },
      { type: ExternalToolType.KIMA_AI, priority: 3 },
      { type: ExternalToolType.ORCHIDS_APP, priority: 3 },
      { type: ExternalToolType.CLAUDE_DOCS, priority: 4 },
      { type: ExternalToolType.FIREBASE_STUDIO, priority: 4 },
      { type: ExternalToolType.DATABUTTON_AI, priority: 4 }
    ];
    
    for (const config of adapterConfigs) {
      const adapter = this.createToolAdapter(config.type);
      this.adapters.set(config.type, adapter);
    }
    
    console.log(`🔧 Registered ${adapterConfigs.length} tool adapters`);
  }

  private createToolAdapter(toolType: ExternalToolType): ToolAdapter {
    return {
      toolType,
      
      transformRequest: async (request: BridgeRequest) => {
        // Transform internal request format to external tool format
        return {
          id: request.id,
          type: request.messageType,
          data: request.payload,
          timestamp: request.timestamp.toISOString()
        };
      },
      
      transformResponse: async (response: any) => {
        // Transform external tool response to internal format
        return {
          requestId: response.id || 'unknown',
          timestamp: new Date(),
          success: response.success !== false,
          data: response.data || response.result,
          error: response.error,
          metadata: response.metadata || {}
        };
      },
      
      healthCheck: async () => {
        // Perform health check for the external tool
        try {
          // This would make an actual health check request
          return true;
        } catch (error) {
          return false;
        }
      },
      
      authenticate: async (credentials: any) => {
        // Authenticate with the external tool
        try {
          // This would perform actual authentication
          return 'mock-auth-token';
        } catch (error) {
          throw new Error(`Authentication failed for ${toolType}`);
        }
      }
    };
  }

  private async discoverExternalTools(): Promise<void> {
    console.log('🔍 Discovering external tools...');
    
    // This would implement actual tool discovery
    // For now, just log that discovery is happening
    
    const discoveredTools = [
      { type: ExternalToolType.AUGMENT_CODE, endpoint: 'http://localhost:4001' },
      { type: ExternalToolType.KIRO_DEV, endpoint: 'http://localhost:4002' },
      { type: ExternalToolType.VOID_SENTINEL, endpoint: 'internal' }
    ];
    
    console.log(`🔍 Discovered ${discoveredTools.length} external tools`);
  }

  private startHealthMonitoring(): void {
    setInterval(async () => {
      for (const connection of this.connections.values()) {
        try {
          const adapter = this.adapters.get(connection.type);
          if (adapter) {
            const isHealthy = await adapter.healthCheck();
            
            if (!isHealthy && connection.status === ToolConnectionStatus.CONNECTED) {
              console.warn(`⚠️ Health check failed for ${connection.type}`);
              connection.status = ToolConnectionStatus.ERROR;
              this.emit('tool:health-warning', connection);
            }
          }
          
          connection.lastPing = new Date();
          
        } catch (error) {
          console.error(`❌ Health check error for ${connection.type}:`, error);
        }
      }
    }, this.config.healthCheckInterval);
    
    console.log('🏥 Health monitoring started');
  }

  private registerBusHandlers(): void {
    // Register to handle messages that need to be routed to external tools
    this.nebulaBus.on('external-tool-request', async (message: BusMessage) => {
      const toolType = message.metadata?.externalTool as ExternalToolType;
      
      if (toolType) {
        try {
          const result = await this.sendToExternalTool(
            toolType,
            message.type,
            message.payload
          );
          
          // Send response back through bus
          await this.nebulaBus.sendResponse(message, true, result);
          
        } catch (error) {
          await this.nebulaBus.sendResponse(message, false, { error: (error as Error).message });
        }
      }
    });
  }

  private async performHandshake(connection: ExternalToolConnection): Promise<void> {
    console.log(`🤝 Performing handshake with ${connection.type}`);
    
    // This would implement the actual handshake protocol
    // For now, just simulate a successful handshake
    
    connection.capabilities = ['code-generation', 'analysis', 'transformation'];
    connection.version = '1.0.0';
  }

  private async performDisconnection(connection: ExternalToolConnection): Promise<void> {
    console.log(`👋 Performing disconnection from ${connection.type}`);
    
    // This would implement graceful disconnection
    // Cancel any pending requests for this connection
    for (const [requestId, request] of this.pendingRequests) {
      if (request.targetTool === connection.type) {
        this.pendingRequests.delete(requestId);
        this.emit('request:cancelled', request);
      }
    }
  }

  private async sendViaProtocol(connection: ExternalToolConnection, request: any): Promise<any> {
    switch (connection.protocol) {
      case BridgeProtocol.HTTP_REST:
        return await this.sendHttpRequest(connection, request);
      
      case BridgeProtocol.WEBSOCKET:
        return await this.sendWebSocketMessage(connection, request);
      
      case BridgeProtocol.GRPC:
        return await this.sendGrpcRequest(connection, request);
      
      default:
        throw new Error(`Unsupported protocol: ${connection.protocol}`);
    }
  }

  private async sendHttpRequest(connection: ExternalToolConnection, request: any): Promise<any> {
    console.log(`📡 Sending HTTP request to ${connection.endpoint}`);
    
    // This would implement actual HTTP request
    // For now, return mock response
    return {
      success: true,
      data: { message: 'Mock HTTP response' },
      timestamp: new Date().toISOString()
    };
  }

  private async sendWebSocketMessage(connection: ExternalToolConnection, request: any): Promise<any> {
    console.log(`🔌 Sending WebSocket message to ${connection.endpoint}`);
    
    // This would implement actual WebSocket message
    return {
      success: true,
      data: { message: 'Mock WebSocket response' }
    };
  }

  private async sendGrpcRequest(connection: ExternalToolConnection, request: any): Promise<any> {
    console.log(`⚡ Sending gRPC request to ${connection.endpoint}`);
    
    // This would implement actual gRPC request
    return {
      success: true,
      data: { message: 'Mock gRPC response' }
    };
  }

  // Helper methods

  private findConnectionByType(toolType: ExternalToolType): ExternalToolConnection | null {
    for (const connection of this.connections.values()) {
      if (connection.type === toolType && connection.status === ToolConnectionStatus.CONNECTED) {
        return connection;
      }
    }
    return null;
  }

  private mapToolTypeToNamespace(toolType: ExternalToolType): ToolNamespace {
    const mapping: Record<ExternalToolType, ToolNamespace> = {
      [ExternalToolType.AUGMENT_CODE]: ToolNamespace.AUGMENT_CODE,
      [ExternalToolType.VON_DEV]: ToolNamespace.VON_DEV,
      [ExternalToolType.KIRO_DEV]: ToolNamespace.KIRO_DEV,
      [ExternalToolType.KIMA_AI]: ToolNamespace.KIMA_AI,
      [ExternalToolType.ORCHIDS_APP]: ToolNamespace.ORCHIDS_APP,
      [ExternalToolType.CLAUDE_DOCS]: ToolNamespace.CLAUDE_DOCS,
      [ExternalToolType.FIREBASE_STUDIO]: ToolNamespace.FIREBASE_STUDIO,
      [ExternalToolType.DATABUTTON_AI]: ToolNamespace.DATABUTTON_AI
    };
    
    return mapping[toolType] || ToolNamespace.CURSOR_ORCHESTRATOR;
  }

  private updateLatencyMetrics(connection: ExternalToolConnection, latency: number): void {
    connection.latency = latency;
    
    // Update average latency
    const totalLatency = this.stats.averageLatency * this.stats.successfulRequests + latency;
    this.stats.averageLatency = totalLatency / (this.stats.successfulRequests + 1);
  }

  private handleInternalToolChange(data: any): void {
    // Notify external tools about internal tool changes
    this.notifyExternalTools('internal-tool-change', data);
  }

  private notifyExternalTools(eventType: string, data: any): void {
    for (const connection of this.connections.values()) {
      if (connection.status === ToolConnectionStatus.CONNECTED) {
        // Send notification to external tool
        this.sendViaProtocol(connection, {
          type: 'notification',
          event: eventType,
          data
        }).catch(error => {
          console.error(`Failed to notify ${connection.type}:`, error);
        });
      }
    }
  }

  private generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}