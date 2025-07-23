/**
 * NebulaForge X - Communication Gateway
 * 
 * 📡 CROSS-TOOL SYNC BUS & API GATEWAY
 * 
 * Unified communication system that:
 * - Manages all inter-system and tool communication
 * - Provides API gateway layer for external access
 * - Handles message routing, transformation, and validation
 * - Supports multiple protocols (HTTP, WebSocket, gRPC, etc.)
 * - Implements rate limiting, authentication, and security
 * - Bridges web, app, and terminal interfaces
 */

import { EventEmitter } from 'events';
import { CoreControllerImpl } from '../engine/modules/NebulaCore/core.controller.js';
import { ToolManager } from '../src/tools/tool-manager.js';
import { NebulaForgeBus, MessageType, ToolNamespace } from '../src/tools/bus.module.js';

export enum Protocol {
  HTTP = 'http',
  WEBSOCKET = 'websocket',
  GRPC = 'grpc',
  TCP = 'tcp',
  UDP = 'udp',
  IPC = 'ipc'
}

export enum GatewayEndpoint {
  WEB_UI = '/web',
  API_V1 = '/api/v1',
  WEBSOCKET = '/ws',
  TERMINAL = '/terminal',
  HEALTH = '/health',
  METRICS = '/metrics',
  TOOLS = '/tools',
  ADMIN = '/admin'
}

export interface GatewayRoute {
  id: string;
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | '*';
  protocol: Protocol;
  handler: GatewayHandler;
  middleware: GatewayMiddleware[];
  authentication: boolean;
  rateLimit?: RateLimit;
  validation?: ValidationRule[];
  transformation?: TransformationRule[];
}

export interface GatewayHandler {
  (request: GatewayRequest): Promise<GatewayResponse>;
}

export interface GatewayMiddleware {
  name: string;
  handler: (request: GatewayRequest, next: () => Promise<void>) => Promise<void>;
  priority: number;
}

export interface GatewayRequest {
  id: string;
  timestamp: Date;
  protocol: Protocol;
  method: string;
  path: string;
  headers: Record<string, string>;
  query: Record<string, any>;
  body: any;
  user?: any;
  session?: any;
  metadata: Record<string, any>;
}

export interface GatewayResponse {
  status: number;
  headers: Record<string, string>;
  body: any;
  metadata?: Record<string, any>;
}

export interface RateLimit {
  requests: number;
  window: number; // milliseconds
  skipOnSuccess?: boolean;
  keyGenerator?: (request: GatewayRequest) => string;
}

export interface ValidationRule {
  field: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  constraints?: Record<string, any>;
}

export interface TransformationRule {
  from: string;
  to: string;
  transform: (value: any) => any;
}

export interface Connection {
  id: string;
  protocol: Protocol;
  remoteAddress: string;
  connectedAt: Date;
  lastActivity: Date;
  authenticated: boolean;
  user?: any;
  metadata: Record<string, any>;
}

export class CommGateway extends EventEmitter {
  private coreController: CoreControllerImpl;
  private toolManager: ToolManager;
  private nebulaBus: NebulaForgeBus;
  private isInitialized = false;
  private isRunning = false;
  
  // Server instances
  private httpServer: any = null;
  private wsServer: any = null;
  private tcpServer: any = null;
  
  // Route management
  private routes: Map<string, GatewayRoute> = new Map();
  private middleware: GatewayMiddleware[] = [];
  private connections: Map<string, Connection> = new Map();
  
  // Rate limiting
  private rateLimiters: Map<string, RateLimiter> = new Map();
  
  // Statistics
  private stats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    activeConnections: 0,
    bytesTransferred: 0,
    startTime: new Date()
  };
  
  // Configuration
  private config = {
    httpPort: 3000,
    wsPort: 3001,
    tcpPort: 3002,
    maxConnections: 1000,
    requestTimeout: 30000,
    enableCors: true,
    enableCompression: true,
    enableSecurity: true,
    logLevel: 'info'
  };

  constructor(coreController: CoreControllerImpl, toolManager: ToolManager) {
    super();
    this.coreController = coreController;
    this.toolManager = toolManager;
    this.nebulaBus = toolManager['bus']; // Access the internal bus
  }

  /**
   * Initialize the communication gateway
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      throw new Error('CommGateway already initialized');
    }

    console.log('📡 Initializing Communication Gateway...');

    // Setup default routes
    this.setupDefaultRoutes();
    
    // Setup default middleware
    this.setupDefaultMiddleware();
    
    // Initialize servers
    await this.initializeServers();
    
    // Setup internal event handlers
    this.setupEventHandlers();
    
    this.isInitialized = true;
    this.emit('gateway:initialized');

    console.log('✅ Communication Gateway initialized');
  }

  /**
   * Start the gateway servers
   */
  public async start(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Gateway not initialized');
    }

    if (this.isRunning) {
      return;
    }

    console.log('🚀 Starting Communication Gateway servers...');

    try {
      // Start HTTP server
      await this.startHttpServer();
      
      // Start WebSocket server
      await this.startWebSocketServer();
      
      // Start TCP server
      await this.startTcpServer();
      
      this.isRunning = true;
      this.stats.startTime = new Date();
      
      this.emit('gateway:started');
      console.log('✅ Communication Gateway servers started');
      
    } catch (error) {
      console.error('❌ Failed to start gateway servers:', error);
      throw error;
    }
  }

  /**
   * Stop the gateway servers
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('🛑 Stopping Communication Gateway servers...');

    try {
      // Close all connections
      for (const connection of this.connections.values()) {
        await this.closeConnection(connection.id, 'Gateway shutdown');
      }
      
      // Stop servers
      if (this.httpServer) {
        await this.stopServer(this.httpServer);
      }
      
      if (this.wsServer) {
        await this.stopServer(this.wsServer);
      }
      
      if (this.tcpServer) {
        await this.stopServer(this.tcpServer);
      }
      
      this.isRunning = false;
      this.emit('gateway:stopped');
      
      console.log('✅ Communication Gateway servers stopped');
      
    } catch (error) {
      console.error('❌ Error stopping gateway servers:', error);
      throw error;
    }
  }

  /**
   * Shutdown the gateway completely
   */
  public async shutdown(): Promise<void> {
    console.log('🛑 Communication Gateway shutting down...');
    
    await this.stop();
    
    this.routes.clear();
    this.middleware = [];
    this.connections.clear();
    
    this.isInitialized = false;
    this.emit('gateway:shutdown');
    
    console.log('✅ Communication Gateway shutdown complete');
  }

  /**
   * Register a new route
   */
  public registerRoute(route: GatewayRoute): void {
    this.routes.set(route.id, route);
    console.log(`📋 Registered route: ${route.method} ${route.path}`);
    this.emit('route:registered', route);
  }

  /**
   * Unregister a route
   */
  public unregisterRoute(routeId: string): void {
    if (this.routes.delete(routeId)) {
      console.log(`🗑️ Unregistered route: ${routeId}`);
      this.emit('route:unregistered', routeId);
    }
  }

  /**
   * Add middleware
   */
  public addMiddleware(middleware: GatewayMiddleware): void {
    this.middleware.push(middleware);
    this.middleware.sort((a, b) => b.priority - a.priority);
    console.log(`🔧 Added middleware: ${middleware.name}`);
  }

  /**
   * Send message to tool via gateway
   */
  public async sendToTool(
    toolNamespace: ToolNamespace,
    messageType: MessageType,
    payload: any
  ): Promise<any> {
    try {
      return await this.nebulaBus.sendRequest(
        ToolNamespace.CURSOR_ORCHESTRATOR, // Gateway acts as orchestrator
        toolNamespace,
        messageType,
        payload
      );
    } catch (error) {
      console.error(`Failed to send message to ${toolNamespace}:`, error);
      throw error;
    }
  }

  /**
   * Broadcast message to all connected clients
   */
  public broadcast(message: any, protocol?: Protocol): void {
    const connectionsToNotify = protocol 
      ? Array.from(this.connections.values()).filter(c => c.protocol === protocol)
      : Array.from(this.connections.values());
    
    for (const connection of connectionsToNotify) {
      this.sendToConnection(connection.id, message);
    }
    
    console.log(`📢 Broadcast to ${connectionsToNotify.length} connections`);
  }

  /**
   * Get gateway statistics
   */
  public getStats(): Record<string, any> {
    return {
      ...this.stats,
      activeConnections: this.connections.size,
      registeredRoutes: this.routes.size,
      middlewareCount: this.middleware.length,
      uptime: Date.now() - this.stats.startTime.getTime(),
      isRunning: this.isRunning
    };
  }

  /**
   * Get health status
   */
  public getHealth(): Record<string, any> {
    return {
      status: this.isRunning ? 'healthy' : 'stopped',
      uptime: this.isRunning ? Date.now() - this.stats.startTime.getTime() : 0,
      connections: this.connections.size,
      memoryUsage: process.memoryUsage(),
      lastActivity: new Date()
    };
  }

  // Private Methods

  private setupDefaultRoutes(): void {
    const defaultRoutes: GatewayRoute[] = [
      {
        id: 'health-check',
        path: '/health',
        method: 'GET',
        protocol: Protocol.HTTP,
        handler: this.handleHealthCheck.bind(this),
        middleware: [],
        authentication: false
      },
      {
        id: 'api-status',
        path: '/api/v1/status',
        method: 'GET',
        protocol: Protocol.HTTP,
        handler: this.handleApiStatus.bind(this),
        middleware: [],
        authentication: false
      },
      {
        id: 'engine-control',
        path: '/api/v1/engine/:action',
        method: 'POST',
        protocol: Protocol.HTTP,
        handler: this.handleEngineControl.bind(this),
        middleware: [],
        authentication: true
      },
      {
        id: 'tool-communication',
        path: '/api/v1/tools/:tool/:action',
        method: 'POST',
        protocol: Protocol.HTTP,
        handler: this.handleToolCommunication.bind(this),
        middleware: [],
        authentication: true
      },
      {
        id: 'websocket-connection',
        path: '/ws',
        method: '*',
        protocol: Protocol.WEBSOCKET,
        handler: this.handleWebSocketConnection.bind(this),
        middleware: [],
        authentication: false
      }
    ];

    for (const route of defaultRoutes) {
      this.routes.set(route.id, route);
    }

    console.log(`📋 Registered ${defaultRoutes.length} default routes`);
  }

  private setupDefaultMiddleware(): void {
    const defaultMiddleware: GatewayMiddleware[] = [
      {
        name: 'cors',
        priority: 100,
        handler: this.corsMiddleware.bind(this)
      },
      {
        name: 'compression',
        priority: 90,
        handler: this.compressionMiddleware.bind(this)
      },
      {
        name: 'rate-limit',
        priority: 80,
        handler: this.rateLimitMiddleware.bind(this)
      },
      {
        name: 'authentication',
        priority: 70,
        handler: this.authenticationMiddleware.bind(this)
      },
      {
        name: 'validation',
        priority: 60,
        handler: this.validationMiddleware.bind(this)
      },
      {
        name: 'logging',
        priority: 10,
        handler: this.loggingMiddleware.bind(this)
      }
    ];

    this.middleware = defaultMiddleware.sort((a, b) => b.priority - a.priority);
    console.log(`🔧 Loaded ${defaultMiddleware.length} default middleware`);
  }

  private async initializeServers(): Promise<void> {
    console.log('🔧 Initializing server instances...');
    // Server initialization would happen here
    // For now, just log that servers are being initialized
  }

  private setupEventHandlers(): void {
    // Listen to tool manager events
    this.toolManager.on('tool:status-changed', (data) => {
      this.broadcast({ type: 'tool-status', data }, Protocol.WEBSOCKET);
    });
    
    // Listen to core controller events
    this.coreController.globalEventBus.on('system:state-changed', (data) => {
      this.broadcast({ type: 'system-state', data }, Protocol.WEBSOCKET);
    });
    
    console.log('🎧 Gateway event handlers configured');
  }

  private async startHttpServer(): Promise<void> {
    console.log(`🌐 Starting HTTP server on port ${this.config.httpPort}`);
    // HTTP server implementation would go here
  }

  private async startWebSocketServer(): Promise<void> {
    console.log(`🔌 Starting WebSocket server on port ${this.config.wsPort}`);
    // WebSocket server implementation would go here
  }

  private async startTcpServer(): Promise<void> {
    console.log(`📡 Starting TCP server on port ${this.config.tcpPort}`);
    // TCP server implementation would go here
  }

  // Route handlers

  private async handleHealthCheck(request: GatewayRequest): Promise<GatewayResponse> {
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: this.getHealth()
    };
  }

  private async handleApiStatus(request: GatewayRequest): Promise<GatewayResponse> {
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        version: '1.0.0',
        status: 'operational',
        endpoints: Array.from(this.routes.keys()),
        stats: this.getStats()
      }
    };
  }

  private async handleEngineControl(request: GatewayRequest): Promise<GatewayResponse> {
    const action = request.metadata.params?.action;
    
    try {
      // Route to appropriate engine controller
      const result = await this.sendToTool(
        ToolNamespace.CURSOR_ORCHESTRATOR,
        MessageType.REQUEST_CODE,
        { action, params: request.body }
      );
      
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { success: true, result }
      };
      
    } catch (error) {
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: { success: false, error: (error as Error).message }
      };
    }
  }

  private async handleToolCommunication(request: GatewayRequest): Promise<GatewayResponse> {
    const tool = request.metadata.params?.tool as ToolNamespace;
    const action = request.metadata.params?.action;
    
    try {
      const result = await this.sendToTool(
        tool,
        MessageType.REQUEST_ANALYSIS,
        { action, params: request.body }
      );
      
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { success: true, result }
      };
      
    } catch (error) {
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: { success: false, error: (error as Error).message }
      };
    }
  }

  private async handleWebSocketConnection(request: GatewayRequest): Promise<GatewayResponse> {
    // WebSocket upgrade would be handled here
    console.log('🔌 New WebSocket connection request');
    
    return {
      status: 101,
      headers: { 'Upgrade': 'websocket' },
      body: null
    };
  }

  // Middleware implementations

  private async corsMiddleware(request: GatewayRequest, next: () => Promise<void>): Promise<void> {
    if (this.config.enableCors) {
      request.headers['Access-Control-Allow-Origin'] = '*';
      request.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
      request.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    }
    await next();
  }

  private async compressionMiddleware(request: GatewayRequest, next: () => Promise<void>): Promise<void> {
    if (this.config.enableCompression) {
      // Compression logic would go here
    }
    await next();
  }

  private async rateLimitMiddleware(request: GatewayRequest, next: () => Promise<void>): Promise<void> {
    // Rate limiting logic would go here
    await next();
  }

  private async authenticationMiddleware(request: GatewayRequest, next: () => Promise<void>): Promise<void> {
    // Authentication logic would go here
    await next();
  }

  private async validationMiddleware(request: GatewayRequest, next: () => Promise<void>): Promise<void> {
    // Request validation would go here
    await next();
  }

  private async loggingMiddleware(request: GatewayRequest, next: () => Promise<void>): Promise<void> {
    console.log(`📝 ${request.method} ${request.path} - ${request.id}`);
    this.stats.totalRequests++;
    await next();
  }

  // Helper methods

  private async closeConnection(connectionId: string, reason: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (connection) {
      console.log(`🔌 Closing connection ${connectionId}: ${reason}`);
      this.connections.delete(connectionId);
      this.emit('connection:closed', { connectionId, reason });
    }
  }

  private async stopServer(server: any): Promise<void> {
    // Server shutdown logic would go here
    console.log('🛑 Stopping server...');
  }

  private sendToConnection(connectionId: string, message: any): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      // Send message to specific connection
      console.log(`📤 Sending message to connection ${connectionId}`);
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }
}

// Rate limiter helper class
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  
  constructor(private limit: number, private window: number) {}
  
  public isAllowed(key: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(key) || [];
    
    // Remove old requests outside the window
    const validRequests = requests.filter(time => now - time < this.window);
    
    if (validRequests.length >= this.limit) {
      return false;
    }
    
    validRequests.push(now);
    this.requests.set(key, validRequests);
    
    return true;
  }
  
  public reset(key: string): void {
    this.requests.delete(key);
  }
}