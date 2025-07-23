/**
 * NebulaForge X - Inter-Tool Communication Bus
 * 
 * Centralized communication system that enables isolated tools to exchange
 * data, requests, and notifications while maintaining strict boundaries.
 */

import { EventEmitter } from 'events';
import { GlobalEventBus } from '../../engine/modules/NebulaCore/index.js';

// Tool identification and permissions
export enum ToolNamespace {
  // External Tools
  CURSOR_ORCHESTRATOR = 'cursor-orchestrator',
  AUGMENT_CODE = 'augment-code', 
  VON_DEV = 'von-dev',
  KIRO_DEV = 'kiro-dev',
  KIMA_AI = 'kima-ai',
  ORCHIDS_APP = 'orchids-app',
  CLAUDE_DOCS = 'claude-docs',
  FIREBASE_STUDIO = 'firebase-studio',
  DATABUTTON_AI = 'databutton-ai',
  
  // Inbuilt AI Tools
  VOID_SENTINEL = 'void-sentinel',
  NEBULA_MIND = 'nebula-mind',
  ECHO_FORGE = 'echo-forge',
  MORPHO_X = 'morpho-x',
  ANIMUS_CORE = 'animus-core',
  FORGE_WEAVER = 'forge-weaver'
}

// Communication message types
export interface BusMessage {
  id: string;
  timestamp: Date;
  from: ToolNamespace;
  to: ToolNamespace | 'broadcast';
  type: MessageType;
  payload: any;
  priority: Priority;
  requiresResponse?: boolean;
  correlationId?: string;
}

export enum MessageType {
  // Request types
  REQUEST_ASSET = 'request:asset',
  REQUEST_CODE = 'request:code',
  REQUEST_UI = 'request:ui',
  REQUEST_ANIMATION = 'request:animation',
  REQUEST_AUDIO = 'request:audio',
  REQUEST_DOCUMENTATION = 'request:documentation',
  REQUEST_DEPLOYMENT = 'request:deployment',
  REQUEST_ANALYSIS = 'request:analysis',
  
  // Response types
  RESPONSE_SUCCESS = 'response:success',
  RESPONSE_ERROR = 'response:error',
  RESPONSE_PARTIAL = 'response:partial',
  
  // Notification types
  NOTIFY_READY = 'notify:ready',
  NOTIFY_ERROR = 'notify:error',
  NOTIFY_PROGRESS = 'notify:progress',
  NOTIFY_COMPLETE = 'notify:complete',
  
  // System types
  SYSTEM_HEALTH_CHECK = 'system:health-check',
  SYSTEM_SHUTDOWN = 'system:shutdown',
  SYSTEM_RESTART = 'system:restart'
}

export enum Priority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3,
  SYSTEM = 4
}

// Tool capabilities and permissions
export interface ToolCapabilities {
  namespace: ToolNamespace;
  name: string;
  description: string;
  version: string;
  responsibilities: string[];
  canReceive: MessageType[];
  canSend: MessageType[];
  dependencies: ToolNamespace[];
  maxConcurrentRequests: number;
  isolated: boolean;
}

// Request/Response patterns
export interface AssetRequest {
  type: 'image' | 'model' | 'texture' | 'audio' | 'animation';
  description: string;
  specifications: Record<string, any>;
  format: string;
  quality: 'low' | 'medium' | 'high' | 'ultra';
  deadline?: Date;
}

export interface CodeRequest {
  language: 'typescript' | 'python' | 'rust' | 'glsl' | 'wgsl';
  module: string;
  functionality: string;
  requirements: string[];
  tests?: boolean;
  documentation?: boolean;
}

export interface UIRequest {
  component: string;
  framework: 'react' | 'vue' | 'svelte' | 'native';
  responsive: boolean;
  theme: string;
  interactions: string[];
}

export interface AnimationRequest {
  target: string;
  duration: number;
  easing: string;
  properties: Record<string, any>;
  triggers: string[];
}

// Main Bus System
export class NebulaForgeBus extends EventEmitter {
  private tools: Map<ToolNamespace, ToolCapabilities> = new Map();
  private messageQueue: BusMessage[] = [];
  private processingMessages = new Map<string, BusMessage>();
  private messageHistory: BusMessage[] = [];
  private globalEventBus: GlobalEventBus;
  
  constructor(globalEventBus: GlobalEventBus) {
    super();
    this.globalEventBus = globalEventBus;
    this.setupInternalHandlers();
  }

  /**
   * Register a tool with the bus system
   */
  registerTool(capabilities: ToolCapabilities): void {
    if (this.tools.has(capabilities.namespace)) {
      throw new Error(`Tool ${capabilities.namespace} is already registered`);
    }

    this.tools.set(capabilities.namespace, capabilities);
    this.emit('tool:registered', capabilities);
    
    console.log(`🔗 Tool registered: ${capabilities.name} (${capabilities.namespace})`);
  }

  /**
   * Send a message through the bus system
   */
  async sendMessage(message: Omit<BusMessage, 'id' | 'timestamp'>): Promise<string> {
    const fullMessage: BusMessage = {
      id: this.generateMessageId(),
      timestamp: new Date(),
      ...message
    };

    // Validate sender permissions
    if (!this.validateSendPermissions(fullMessage)) {
      throw new Error(`Tool ${message.from} cannot send message type ${message.type}`);
    }

    // Validate receiver capabilities
    if (message.to !== 'broadcast' && !this.validateReceivePermissions(fullMessage)) {
      throw new Error(`Tool ${message.to} cannot receive message type ${message.type}`);
    }

    // Add to queue and process
    this.messageQueue.push(fullMessage);
    this.messageHistory.push(fullMessage);
    this.processMessageQueue();

    return fullMessage.id;
  }

  /**
   * Send a request and wait for response
   */
  async sendRequest<T = any>(
    from: ToolNamespace,
    to: ToolNamespace,
    type: MessageType,
    payload: any,
    timeout: number = 30000
  ): Promise<T> {
    const correlationId = this.generateMessageId();
    
    const messageId = await this.sendMessage({
      from,
      to,
      type,
      payload,
      priority: Priority.NORMAL,
      requiresResponse: true,
      correlationId
    });

    return new Promise((resolve, reject) => {
      const timeoutHandler = setTimeout(() => {
        this.removeAllListeners(`response:${correlationId}`);
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);

      this.once(`response:${correlationId}`, (response: BusMessage) => {
        clearTimeout(timeoutHandler);
        
        if (response.type === MessageType.RESPONSE_SUCCESS) {
          resolve(response.payload);
        } else {
          reject(new Error(response.payload.error || 'Request failed'));
        }
      });
    });
  }

  /**
   * Send a response to a request
   */
  async sendResponse(
    originalMessage: BusMessage,
    success: boolean,
    payload: any
  ): Promise<void> {
    if (!originalMessage.requiresResponse || !originalMessage.correlationId) {
      return;
    }

    await this.sendMessage({
      from: originalMessage.to as ToolNamespace,
      to: originalMessage.from,
      type: success ? MessageType.RESPONSE_SUCCESS : MessageType.RESPONSE_ERROR,
      payload,
      priority: Priority.HIGH,
      correlationId: originalMessage.correlationId
    });
  }

  /**
   * Subscribe to messages for a specific tool
   */
  subscribeToMessages(
    namespace: ToolNamespace,
    handler: (message: BusMessage) => Promise<void>
  ): void {
    this.on(`message:${namespace}`, handler);
  }

  /**
   * Broadcast system-wide notifications
   */
  async broadcastNotification(
    from: ToolNamespace,
    type: MessageType,
    payload: any
  ): Promise<void> {
    await this.sendMessage({
      from,
      to: 'broadcast',
      type,
      payload,
      priority: Priority.NORMAL
    });
  }

  /**
   * Get tool information
   */
  getToolInfo(namespace: ToolNamespace): ToolCapabilities | undefined {
    return this.tools.get(namespace);
  }

  /**
   * Get all registered tools
   */
  getAllTools(): ToolCapabilities[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get system health status
   */
  getSystemHealth(): Record<string, any> {
    return {
      registeredTools: this.tools.size,
      queuedMessages: this.messageQueue.length,
      processingMessages: this.processingMessages.size,
      totalMessages: this.messageHistory.length,
      tools: Array.from(this.tools.keys())
    };
  }

  /**
   * Clear message history (for memory management)
   */
  clearHistory(olderThan?: Date): void {
    if (olderThan) {
      this.messageHistory = this.messageHistory.filter(msg => msg.timestamp > olderThan);
    } else {
      this.messageHistory = [];
    }
  }

  // Private methods

  private setupInternalHandlers(): void {
    this.on('message:received', this.handleMessage.bind(this));
    
    // Health check responses
    this.on('system:health-check', () => {
      this.emit('system:health-response', this.getSystemHealth());
    });
  }

  private async processMessageQueue(): Promise<void> {
    if (this.messageQueue.length === 0) {
      return;
    }

    // Sort by priority
    this.messageQueue.sort((a, b) => b.priority - a.priority);
    
    const message = this.messageQueue.shift()!;
    this.processingMessages.set(message.id, message);

    try {
      await this.deliverMessage(message);
    } catch (error) {
      console.error('Error delivering message:', error);
    } finally {
      this.processingMessages.delete(message.id);
      
      // Process next message
      if (this.messageQueue.length > 0) {
        setImmediate(() => this.processMessageQueue());
      }
    }
  }

  private async deliverMessage(message: BusMessage): Promise<void> {
    if (message.to === 'broadcast') {
      // Deliver to all tools except sender
      for (const namespace of this.tools.keys()) {
        if (namespace !== message.from) {
          this.emit(`message:${namespace}`, message);
        }
      }
    } else {
      // Deliver to specific tool
      this.emit(`message:${message.to}`, message);
    }

    // Handle responses
    if (message.correlationId && message.type.startsWith('response:')) {
      this.emit(`response:${message.correlationId}`, message);
    }
  }

  private async handleMessage(message: BusMessage): Promise<void> {
    // Log message for debugging
    console.log(`📨 Bus message: ${message.from} → ${message.to} [${message.type}]`);
    
    // Emit to global event bus for system-wide notifications
    this.globalEventBus.emit('bus:message', message);
  }

  private validateSendPermissions(message: BusMessage): boolean {
    const tool = this.tools.get(message.from);
    return tool ? tool.canSend.includes(message.type) : false;
  }

  private validateReceivePermissions(message: BusMessage): boolean {
    if (message.to === 'broadcast') return true;
    
    const tool = this.tools.get(message.to as ToolNamespace);
    return tool ? tool.canReceive.includes(message.type) : false;
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

// Singleton instance factory
let busInstance: NebulaForgeBus | null = null;

export function createBusInstance(globalEventBus: GlobalEventBus): NebulaForgeBus {
  if (!busInstance) {
    busInstance = new NebulaForgeBus(globalEventBus);
  }
  return busInstance;
}

export function getBusInstance(): NebulaForgeBus {
  if (!busInstance) {
    throw new Error('Bus instance not created. Call createBusInstance() first.');
  }
  return busInstance;
}