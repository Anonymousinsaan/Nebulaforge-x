/**
 * NebulaCore Global Event Bus
 * 
 * High-performance event system for inter-module communication with support for
 * event prioritization, namespacing, wildcard subscriptions, and middleware.
 */

import { EventEmitter } from 'events';
import { EventBusInterface } from '../../types/core.types.js';
import { Logger } from './logger.js';

interface EventMiddleware {
  name: string;
  priority: number;
  handler: (event: string, args: any[], next: () => void) => void;
}

interface EventSubscription {
  event: string;
  listener: (...args: any[]) => void;
  priority: number;
  namespace?: string;
  once: boolean;
}

interface EventMetrics {
  emitted: number;
  listeners: number;
  errors: number;
  lastEmitted?: Date;
  averageExecutionTime: number;
}

export class GlobalEventBus extends EventEmitter implements EventBusInterface {
  private logger: Logger;
  private subscriptions: Map<string, EventSubscription[]> = new Map();
  private middleware: EventMiddleware[] = [];
  private metrics: Map<string, EventMetrics> = new Map();
  private enableMetrics: boolean = true;
  private maxListeners: number = 50;
  private namespaces: Set<string> = new Set();

  constructor(logger?: Logger) {
    super();
    this.logger = logger || new Logger({ level: 'info' }, 'EventBus');
    this.setMaxListeners(this.maxListeners);
    
    // Set up internal error handling
    this.on('error', (error) => {
      this.logger.error('Event bus error', error);
    });

    this.logger.info('Global event bus initialized');
  }

  /**
   * Add middleware to process events before they're emitted to listeners
   */
  addMiddleware(middleware: EventMiddleware): void {
    this.middleware.push(middleware);
    this.middleware.sort((a, b) => b.priority - a.priority);
    this.logger.debug('Middleware added', { name: middleware.name, priority: middleware.priority });
  }

  /**
   * Remove middleware by name
   */
  removeMiddleware(name: string): void {
    this.middleware = this.middleware.filter(m => m.name !== name);
    this.logger.debug('Middleware removed', { name });
  }

  /**
   * Enhanced emit with middleware processing and metrics
   */
  emit(event: string, ...args: any[]): boolean {
    const startTime = performance.now();
    
    try {
      // Update metrics
      this.updateEmitMetrics(event, startTime);
      
      // Process through middleware chain
      this.processMiddleware(event, args, () => {
        // Call the original emit method
        super.emit(event, ...args);
        
        // Log high-frequency events at debug level only
        if (this.shouldLogEvent(event)) {
          this.logger.debug('Event emitted', { event, argsCount: args.length });
        }
      });

      return true;
    } catch (error) {
      this.updateErrorMetrics(event);
      this.logger.error(`Error emitting event: ${event}`, error as Error);
      super.emit('error', error);
      return false;
    }
  }

  /**
   * Enhanced on with priority support and namespacing
   */
  on(event: string, listener: (...args: any[]) => void, priority: number = 0, namespace?: string): this {
    const wrappedListener = this.wrapListener(event, listener, namespace);
    super.on(event, wrappedListener);
    
    this.addSubscription({
      event,
      listener: wrappedListener,
      priority,
      namespace,
      once: false
    });
    
    this.updateListenerMetrics(event);
    this.logger.debug('Event listener added', { event, priority, namespace });
    
    return this;
  }

  /**
   * Enhanced once with priority support
   */
  once(event: string, listener: (...args: any[]) => void, priority: number = 0, namespace?: string): this {
    const wrappedListener = this.wrapListener(event, (...args: any[]) => {
      this.removeSubscription(event, wrappedListener);
      listener(...args);
    }, namespace);
    
    super.once(event, wrappedListener);
    
    this.addSubscription({
      event,
      listener: wrappedListener,
      priority,
      namespace,
      once: true
    });
    
    this.updateListenerMetrics(event);
    this.logger.debug('Event listener added (once)', { event, priority, namespace });
    
    return this;
  }

  /**
   * Enhanced off with namespace support
   */
  off(event: string, listener: (...args: any[]) => void): this {
    super.off(event, listener);
    this.removeSubscription(event, listener);
    this.updateListenerMetrics(event);
    this.logger.debug('Event listener removed', { event });
    
    return this;
  }

  /**
   * Remove all listeners for an event or namespace
   */
  removeAllListeners(eventOrNamespace?: string): this {
    if (eventOrNamespace) {
      if (this.namespaces.has(eventOrNamespace)) {
        // Remove by namespace
        this.removeListenersByNamespace(eventOrNamespace);
      } else {
        // Remove by event
        super.removeAllListeners(eventOrNamespace);
        this.subscriptions.delete(eventOrNamespace);
      }
    } else {
      super.removeAllListeners();
      this.subscriptions.clear();
    }
    
    this.logger.debug('Event listeners removed', { eventOrNamespace });
    return this;
  }

  /**
   * Wildcard event subscription (e.g., "module.*" matches "module.loaded", "module.error")
   */
  onWildcard(pattern: string, listener: (...args: any[]) => void, priority: number = 0): this {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    const wildcardListener = (event: string, ...args: any[]) => {
      if (regex.test(event)) {
        listener(...args);
      }
    };

    this.on('*', wildcardListener, priority);
    return this;
  }

  /**
   * Emit to all events matching a wildcard pattern
   */
  emitWildcard(pattern: string, ...args: any[]): void {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    const events = Array.from(this.subscriptions.keys());
    
    for (const event of events) {
      if (regex.test(event)) {
        this.emit(event, ...args);
      }
    }
  }

  /**
   * Create a namespaced event emitter
   */
  namespace(name: string): NamespacedEventBus {
    this.namespaces.add(name);
    return new NamespacedEventBus(this, name);
  }

  /**
   * Get event metrics
   */
  getMetrics(event?: string): EventMetrics | Map<string, EventMetrics> {
    if (event) {
      return this.metrics.get(event) || this.createDefaultMetrics();
    }
    return new Map(this.metrics);
  }

  /**
   * Reset metrics for an event or all events
   */
  resetMetrics(event?: string): void {
    if (event) {
      this.metrics.delete(event);
    } else {
      this.metrics.clear();
    }
    this.logger.debug('Event metrics reset', { event });
  }

  /**
   * Enable or disable metrics collection
   */
  setMetricsEnabled(enabled: boolean): void {
    this.enableMetrics = enabled;
    this.logger.info('Event metrics', { enabled });
  }

  /**
   * Get all active event subscriptions
   */
  getSubscriptions(): Map<string, EventSubscription[]> {
    return new Map(this.subscriptions);
  }

  /**
   * Get listener count for an event
   */
  listenerCount(event: string): number {
    return super.listenerCount(event);
  }

  /**
   * Set maximum listeners (overrides EventEmitter default)
   */
  setMaxListeners(n: number): this {
    this.maxListeners = n;
    return super.setMaxListeners(n);
  }

  /**
   * Get maximum listeners
   */
  getMaxListeners(): number {
    return this.maxListeners;
  }

  // Private helper methods

  private processMiddleware(event: string, args: any[], final: () => void): void {
    let index = 0;
    
    const next = (): void => {
      if (index >= this.middleware.length) {
        final();
        return;
      }
      
      const middleware = this.middleware[index++];
      try {
        middleware.handler(event, args, next);
      } catch (error) {
        this.logger.error(`Middleware error: ${middleware.name}`, error as Error);
        next(); // Continue to next middleware
      }
    };
    
    next();
  }

  private wrapListener(event: string, listener: (...args: any[]) => void, namespace?: string): (...args: any[]) => void {
    return (...args: any[]) => {
      const startTime = performance.now();
      
      try {
        listener(...args);
      } catch (error) {
        this.logger.error(`Listener error for event: ${event}`, error as Error, { namespace });
        this.updateErrorMetrics(event);
      } finally {
        if (this.enableMetrics) {
          const executionTime = performance.now() - startTime;
          this.updateListenerExecutionTime(event, executionTime);
        }
      }
    };
  }

  private addSubscription(subscription: EventSubscription): void {
    const subscriptions = this.subscriptions.get(subscription.event) || [];
    subscriptions.push(subscription);
    subscriptions.sort((a, b) => b.priority - a.priority);
    this.subscriptions.set(subscription.event, subscriptions);
  }

  private removeSubscription(event: string, listener: (...args: any[]) => void): void {
    const subscriptions = this.subscriptions.get(event);
    if (subscriptions) {
      const index = subscriptions.findIndex(s => s.listener === listener);
      if (index !== -1) {
        subscriptions.splice(index, 1);
        if (subscriptions.length === 0) {
          this.subscriptions.delete(event);
        }
      }
    }
  }

  private removeListenersByNamespace(namespace: string): void {
    for (const [event, subscriptions] of this.subscriptions.entries()) {
      const filtered = subscriptions.filter(s => s.namespace !== namespace);
      if (filtered.length === 0) {
        this.subscriptions.delete(event);
        super.removeAllListeners(event);
      } else {
        this.subscriptions.set(event, filtered);
        // Remove listeners from EventEmitter
        super.removeAllListeners(event);
        // Re-add the remaining listeners
        filtered.forEach(s => super.on(event, s.listener));
      }
    }
  }

  private updateEmitMetrics(event: string, startTime: number): void {
    if (!this.enableMetrics) return;
    
    const metrics = this.metrics.get(event) || this.createDefaultMetrics();
    metrics.emitted++;
    metrics.lastEmitted = new Date();
    this.metrics.set(event, metrics);
  }

  private updateListenerMetrics(event: string): void {
    if (!this.enableMetrics) return;
    
    const metrics = this.metrics.get(event) || this.createDefaultMetrics();
    metrics.listeners = this.listenerCount(event);
    this.metrics.set(event, metrics);
  }

  private updateErrorMetrics(event: string): void {
    if (!this.enableMetrics) return;
    
    const metrics = this.metrics.get(event) || this.createDefaultMetrics();
    metrics.errors++;
    this.metrics.set(event, metrics);
  }

  private updateListenerExecutionTime(event: string, executionTime: number): void {
    if (!this.enableMetrics) return;
    
    const metrics = this.metrics.get(event) || this.createDefaultMetrics();
    metrics.averageExecutionTime = 
      (metrics.averageExecutionTime + executionTime) / Math.max(metrics.emitted, 1);
    this.metrics.set(event, metrics);
  }

  private createDefaultMetrics(): EventMetrics {
    return {
      emitted: 0,
      listeners: 0,
      errors: 0,
      averageExecutionTime: 0
    };
  }

  private shouldLogEvent(event: string): boolean {
    // Don't log high-frequency internal events at info level
    const highFrequencyEvents = ['performance:update', 'frame:update'];
    return !highFrequencyEvents.includes(event);
  }
}

/**
 * Namespaced event bus for module-specific events
 */
export class NamespacedEventBus {
  constructor(private globalBus: GlobalEventBus, private namespace: string) {}

  emit(event: string, ...args: any[]): boolean {
    return this.globalBus.emit(`${this.namespace}:${event}`, ...args);
  }

  on(event: string, listener: (...args: any[]) => void, priority?: number): void {
    this.globalBus.on(`${this.namespace}:${event}`, listener, priority, this.namespace);
  }

  once(event: string, listener: (...args: any[]) => void, priority?: number): void {
    this.globalBus.once(`${this.namespace}:${event}`, listener, priority, this.namespace);
  }

  off(event: string, listener: (...args: any[]) => void): void {
    this.globalBus.off(`${this.namespace}:${event}`, listener);
  }

  removeAllListeners(): void {
    this.globalBus.removeAllListeners(this.namespace);
  }
}