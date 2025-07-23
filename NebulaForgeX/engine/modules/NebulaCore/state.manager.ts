/**
 * NebulaCore State Manager
 * 
 * Global state management system with reactive updates, persistence,
 * change tracking, and subscription capabilities for cross-module state sharing.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { StateManagerInterface } from '../../types/core.types.js';
import { Logger } from './logger.js';
import { GlobalEventBus } from './global.events.js';

interface StateEntry {
  value: any;
  timestamp: Date;
  version: number;
  metadata?: Record<string, any>;
}

interface StateSubscription {
  key: string;
  callback: (value: any, oldValue: any) => void;
  once: boolean;
  filter?: (value: any, oldValue: any) => boolean;
}

interface StateManagerConfig {
  enablePersistence: boolean;
  persistenceFile: string;
  autoSave: boolean;
  saveInterval: number; // milliseconds
  enableHistory: boolean;
  historySize: number;
  enableChangeTracking: boolean;
}

interface StateChange {
  key: string;
  oldValue: any;
  newValue: any;
  timestamp: Date;
  version: number;
}

export class StateManager implements StateManagerInterface {
  private state: Map<string, StateEntry> = new Map();
  private subscriptions: Map<string, StateSubscription[]> = new Map();
  private history: StateChange[] = [];
  private config: StateManagerConfig;
  private logger: Logger;
  private eventBus: GlobalEventBus;
  private saveTimer?: NodeJS.Timeout;
  private globalVersion: number = 0;

  constructor(
    config: Partial<StateManagerConfig> = {},
    logger?: Logger,
    eventBus?: GlobalEventBus
  ) {
    this.config = {
      enablePersistence: true,
      persistenceFile: './state/engine.state.json',
      autoSave: true,
      saveInterval: 30000, // 30 seconds
      enableHistory: true,
      historySize: 1000,
      enableChangeTracking: true,
      ...config
    };

    this.logger = logger || new Logger({ level: 'info' }, 'StateManager');
    this.eventBus = eventBus || new GlobalEventBus(this.logger);

    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Load persisted state if enabled
      if (this.config.enablePersistence) {
        await this.loadState();
        
        // Set up auto-save if enabled
        if (this.config.autoSave) {
          this.startAutoSave();
        }
      }

      this.logger.info('State manager initialized', {
        persistence: this.config.enablePersistence,
        autoSave: this.config.autoSave,
        history: this.config.enableHistory
      });
    } catch (error) {
      this.logger.error('Failed to initialize state manager', error as Error);
    }
  }

  /**
   * Get a value from the state
   */
  get<T = any>(key: string): T | undefined {
    const entry = this.state.get(key);
    return entry ? entry.value as T : undefined;
  }

  /**
   * Set a value in the state
   */
  set<T = any>(key: string, value: T, metadata?: Record<string, any>): void {
    const oldEntry = this.state.get(key);
    const oldValue = oldEntry ? oldEntry.value : undefined;
    
    // Don't update if value hasn't changed (deep equality check for objects)
    if (this.isEqual(oldValue, value)) {
      return;
    }

    const newEntry: StateEntry = {
      value,
      timestamp: new Date(),
      version: ++this.globalVersion,
      metadata
    };

    this.state.set(key, newEntry);

    // Track change history
    if (this.config.enableChangeTracking) {
      this.addToHistory(key, oldValue, value, newEntry.version);
    }

    // Notify subscribers
    this.notifySubscribers(key, value, oldValue);

    // Emit global state change event
    this.eventBus.emit('state:changed', key, value, oldValue);

    this.logger.debug('State updated', { key, hasOldValue: oldValue !== undefined });
  }

  /**
   * Check if a key exists in the state
   */
  has(key: string): boolean {
    return this.state.has(key);
  }

  /**
   * Delete a key from the state
   */
  delete(key: string): boolean {
    const entry = this.state.get(key);
    if (!entry) {
      return false;
    }

    const deleted = this.state.delete(key);
    
    if (deleted) {
      // Track deletion in history
      if (this.config.enableChangeTracking) {
        this.addToHistory(key, entry.value, undefined, ++this.globalVersion);
      }

      // Notify subscribers
      this.notifySubscribers(key, undefined, entry.value);

      // Emit global state change event
      this.eventBus.emit('state:changed', key, undefined, entry.value);

      this.logger.debug('State deleted', { key });
    }

    return deleted;
  }

  /**
   * Clear all state
   */
  clear(): void {
    const oldState = new Map(this.state);
    this.state.clear();
    
    // Notify all subscribers of their key deletions
    for (const [key, entry] of oldState) {
      this.notifySubscribers(key, undefined, entry.value);
      this.eventBus.emit('state:changed', key, undefined, entry.value);
    }

    // Clear history
    if (this.config.enableChangeTracking) {
      this.history = [];
    }

    this.logger.info('State cleared');
  }

  /**
   * Get all state keys
   */
  keys(): string[] {
    return Array.from(this.state.keys());
  }

  /**
   * Get all state as a plain object
   */
  getAll(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, entry] of this.state) {
      result[key] = entry.value;
    }
    return result;
  }

  /**
   * Subscribe to changes on a specific key
   */
  subscribe(
    key: string, 
    callback: (value: any, oldValue: any) => void,
    filter?: (value: any, oldValue: any) => boolean
  ): () => void {
    const subscription: StateSubscription = {
      key,
      callback,
      once: false,
      filter
    };

    const subscriptions = this.subscriptions.get(key) || [];
    subscriptions.push(subscription);
    this.subscriptions.set(key, subscriptions);

    this.logger.debug('State subscription added', { key });

    // Return unsubscribe function
    return () => {
      const subs = this.subscriptions.get(key) || [];
      const index = subs.indexOf(subscription);
      if (index !== -1) {
        subs.splice(index, 1);
        if (subs.length === 0) {
          this.subscriptions.delete(key);
        }
        this.logger.debug('State subscription removed', { key });
      }
    };
  }

  /**
   * Subscribe to changes on a key, but only fire once
   */
  subscribeOnce(
    key: string,
    callback: (value: any, oldValue: any) => void
  ): () => void {
    const subscription: StateSubscription = {
      key,
      callback: (value, oldValue) => {
        callback(value, oldValue);
        // Remove subscription after first call
        const subs = this.subscriptions.get(key) || [];
        const index = subs.indexOf(subscription);
        if (index !== -1) {
          subs.splice(index, 1);
        }
      },
      once: true
    };

    const subscriptions = this.subscriptions.get(key) || [];
    subscriptions.push(subscription);
    this.subscriptions.set(key, subscriptions);

    // Return unsubscribe function
    return () => {
      const subs = this.subscriptions.get(key) || [];
      const index = subs.indexOf(subscription);
      if (index !== -1) {
        subs.splice(index, 1);
      }
    };
  }

  /**
   * Subscribe to changes matching a pattern (wildcard support)
   */
  subscribePattern(
    pattern: string,
    callback: (key: string, value: any, oldValue: any) => void
  ): () => void {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    
    const globalCallback = (key: string, value: any, oldValue: any) => {
      if (regex.test(key)) {
        callback(key, value, oldValue);
      }
    };

    this.eventBus.on('state:changed', globalCallback);

    // Return unsubscribe function
    return () => {
      this.eventBus.off('state:changed', globalCallback);
    };
  }

  /**
   * Get the change history for a specific key or all changes
   */
  getHistory(key?: string): StateChange[] {
    if (!this.config.enableChangeTracking) {
      return [];
    }

    if (key) {
      return this.history.filter(change => change.key === key);
    }

    return [...this.history];
  }

  /**
   * Get state entry with metadata
   */
  getEntry(key: string): StateEntry | undefined {
    return this.state.get(key);
  }

  /**
   * Get state version for a key
   */
  getVersion(key: string): number | undefined {
    const entry = this.state.get(key);
    return entry ? entry.version : undefined;
  }

  /**
   * Get global state version
   */
  getGlobalVersion(): number {
    return this.globalVersion;
  }

  /**
   * Merge an object into the state
   */
  merge(updates: Record<string, any>): void {
    for (const [key, value] of Object.entries(updates)) {
      this.set(key, value);
    }
  }

  /**
   * Create a snapshot of the current state
   */
  createSnapshot(): Record<string, any> {
    const snapshot: Record<string, any> = {};
    for (const [key, entry] of this.state) {
      snapshot[key] = this.deepClone(entry.value);
    }
    return snapshot;
  }

  /**
   * Restore state from a snapshot
   */
  restoreSnapshot(snapshot: Record<string, any>): void {
    this.clear();
    this.merge(snapshot);
    this.logger.info('State restored from snapshot', { keys: Object.keys(snapshot).length });
  }

  /**
   * Manually save state to persistence
   */
  async saveState(): Promise<void> {
    if (!this.config.enablePersistence) {
      return;
    }

    try {
      const stateData = {
        version: this.globalVersion,
        timestamp: new Date().toISOString(),
        state: this.createSnapshot()
      };

      await fs.ensureDir(path.dirname(this.config.persistenceFile));
      await fs.writeJson(this.config.persistenceFile, stateData, { spaces: 2 });
      
      this.logger.debug('State saved to persistence');
    } catch (error) {
      this.logger.error('Failed to save state', error as Error);
    }
  }

  /**
   * Load state from persistence
   */
  async loadState(): Promise<void> {
    if (!this.config.enablePersistence) {
      return;
    }

    try {
      if (await fs.pathExists(this.config.persistenceFile)) {
        const stateData = await fs.readJson(this.config.persistenceFile);
        
        this.globalVersion = stateData.version || 0;
        
        if (stateData.state) {
          this.merge(stateData.state);
        }

        this.logger.info('State loaded from persistence', {
          version: this.globalVersion,
          keys: Object.keys(stateData.state || {}).length
        });
      }
    } catch (error) {
      this.logger.error('Failed to load state', error as Error);
    }
  }

  /**
   * Start auto-save timer
   */
  private startAutoSave(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
    }

    this.saveTimer = setInterval(() => {
      this.saveState().catch(error => {
        this.logger.error('Auto-save failed', error);
      });
    }, this.config.saveInterval);
  }

  /**
   * Stop auto-save timer
   */
  stopAutoSave(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = undefined;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.stopAutoSave();
    
    if (this.config.enablePersistence && this.config.autoSave) {
      await this.saveState();
    }

    this.subscriptions.clear();
    this.logger.info('State manager cleaned up');
  }

  // Private helper methods

  private notifySubscribers(key: string, newValue: any, oldValue: any): void {
    const subscriptions = this.subscriptions.get(key) || [];
    
    for (const subscription of subscriptions) {
      try {
        // Apply filter if present
        if (subscription.filter && !subscription.filter(newValue, oldValue)) {
          continue;
        }

        subscription.callback(newValue, oldValue);
      } catch (error) {
        this.logger.error(`Subscription callback error for key: ${key}`, error as Error);
      }
    }
  }

  private addToHistory(key: string, oldValue: any, newValue: any, version: number): void {
    const change: StateChange = {
      key,
      oldValue: this.deepClone(oldValue),
      newValue: this.deepClone(newValue),
      timestamp: new Date(),
      version
    };

    this.history.push(change);

    // Trim history if it exceeds the configured size
    if (this.history.length > this.config.historySize) {
      this.history.splice(0, this.history.length - this.config.historySize);
    }
  }

  private isEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;

    if (typeof a === 'object') {
      if (Array.isArray(a) !== Array.isArray(b)) return false;
      
      if (Array.isArray(a)) {
        if (a.length !== b.length) return false;
        return a.every((val, i) => this.isEqual(val, b[i]));
      }

      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      
      return keysA.every(key => this.isEqual(a[key], b[key]));
    }

    return false;
  }

  private deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (obj instanceof Date) {
      return new Date(obj.getTime()) as unknown as T;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.deepClone(item)) as unknown as T;
    }

    const cloned = {} as T;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        cloned[key] = this.deepClone(obj[key]);
      }
    }

    return cloned;
  }
}