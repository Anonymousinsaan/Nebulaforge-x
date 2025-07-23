/**
 * NebulaForge X - Registry Manager
 * 
 * 🗂️ SYSTEM OBJECT REGISTRY
 * 
 * Central registry system that manages:
 * - All system components and modules
 * - Service discovery and dependency resolution
 * - Component lifecycle and metadata
 * - Plugin registration and management
 * - Cross-system object references
 */

import { EventEmitter } from 'events';
import { CoreControllerImpl } from '../engine/modules/NebulaCore/core.controller.js';

export enum RegistryItemType {
  MODULE = 'module',
  SERVICE = 'service',
  PLUGIN = 'plugin',
  COMPONENT = 'component',
  TOOL = 'tool',
  THEME = 'theme',
  SYSTEM = 'system'
}

export enum RegistryItemStatus {
  REGISTERED = 'registered',
  INITIALIZING = 'initializing',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ERROR = 'error',
  DEPRECATED = 'deprecated',
  REMOVED = 'removed'
}

export interface RegistryItem {
  id: string;
  name: string;
  version: string;
  type: RegistryItemType;
  status: RegistryItemStatus;
  description: string;
  metadata: Record<string, any>;
  dependencies: string[];
  dependents: string[];
  instance?: any;
  factory?: () => Promise<any>;
  registeredAt: Date;
  lastAccessed: Date;
  accessCount: number;
  tags: string[];
  namespace: string;
  author?: string;
  license?: string;
}

export interface RegistryQuery {
  type?: RegistryItemType;
  status?: RegistryItemStatus;
  namespace?: string;
  tags?: string[];
  name?: string;
  version?: string;
  metadata?: Record<string, any>;
}

export interface DependencyGraph {
  nodes: Map<string, RegistryItem>;
  edges: Map<string, string[]>;
  cycles: string[][];
  resolved: string[];
  unresolved: string[];
}

export class RegistryManager extends EventEmitter {
  private registry: Map<string, RegistryItem> = new Map();
  private typeIndex: Map<RegistryItemType, Set<string>> = new Map();
  private namespaceIndex: Map<string, Set<string>> = new Map();
  private tagIndex: Map<string, Set<string>> = new Map();
  private dependencyGraph: DependencyGraph;
  private coreController: CoreControllerImpl;
  private isInitialized = false;

  constructor(coreController: CoreControllerImpl) {
    super();
    this.coreController = coreController;
    this.initializeIndexes();
    this.setupEventHandlers();
  }

  /**
   * Initialize the registry manager
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      throw new Error('RegistryManager already initialized');
    }

    console.log('🗂️ Initializing Registry Manager...');

    // Register core system components
    await this.registerCoreComponents();
    
    // Build initial dependency graph
    this.rebuildDependencyGraph();
    
    // Setup periodic maintenance
    this.setupPeriodicMaintenance();
    
    this.isInitialized = true;
    this.emit('registry:initialized');

    console.log('✅ Registry Manager initialized');
  }

  /**
   * Shutdown the registry manager
   */
  public async shutdown(): Promise<void> {
    console.log('🛑 Registry Manager shutting down...');
    
    // Deactivate all registered items
    for (const item of this.registry.values()) {
      if (item.status === RegistryItemStatus.ACTIVE) {
        await this.deactivateItem(item.id);
      }
    }
    
    this.registry.clear();
    this.clearIndexes();
    this.isInitialized = false;
    
    this.emit('registry:shutdown');
    console.log('✅ Registry Manager shutdown complete');
  }

  /**
   * Register a new item in the registry
   */
  public async register(item: Partial<RegistryItem>): Promise<string> {
    if (!item.name || !item.type) {
      throw new Error('Name and type are required for registry items');
    }

    const id = item.id || this.generateItemId(item.name, item.type);
    
    // Check for existing registration
    if (this.registry.has(id)) {
      throw new Error(`Item already registered: ${id}`);
    }

    const registryItem: RegistryItem = {
      id,
      name: item.name,
      version: item.version || '1.0.0',
      type: item.type,
      status: RegistryItemStatus.REGISTERED,
      description: item.description || '',
      metadata: item.metadata || {},
      dependencies: item.dependencies || [],
      dependents: [],
      instance: item.instance,
      factory: item.factory,
      registeredAt: new Date(),
      lastAccessed: new Date(),
      accessCount: 0,
      tags: item.tags || [],
      namespace: item.namespace || 'default',
      author: item.author,
      license: item.license
    };

    // Store in registry
    this.registry.set(id, registryItem);
    
    // Update indexes
    this.updateIndexes(registryItem);
    
    // Update dependency relationships
    this.updateDependencies(registryItem);
    
    // Rebuild dependency graph
    this.rebuildDependencyGraph();

    this.emit('registry:item-registered', registryItem);
    console.log(`📝 Registered: ${registryItem.name} (${id})`);

    return id;
  }

  /**
   * Unregister an item from the registry
   */
  public async unregister(id: string): Promise<void> {
    const item = this.registry.get(id);
    if (!item) {
      throw new Error(`Item not found: ${id}`);
    }

    // Check for dependents
    if (item.dependents.length > 0) {
      throw new Error(`Cannot unregister ${id} - has dependents: ${item.dependents.join(', ')}`);
    }

    // Deactivate if active
    if (item.status === RegistryItemStatus.ACTIVE) {
      await this.deactivateItem(id);
    }

    // Remove from indexes
    this.removeFromIndexes(item);
    
    // Update dependency relationships
    this.removeDependencies(item);
    
    // Remove from registry
    this.registry.delete(id);
    
    // Rebuild dependency graph
    this.rebuildDependencyGraph();

    this.emit('registry:item-unregistered', item);
    console.log(`🗑️ Unregistered: ${item.name} (${id})`);
  }

  /**
   * Get an item from the registry
   */
  public get(id: string): RegistryItem | null {
    const item = this.registry.get(id);
    if (item) {
      item.lastAccessed = new Date();
      item.accessCount++;
    }
    return item || null;
  }

  /**
   * Get an item instance (creates if needed)
   */
  public async getInstance<T = any>(id: string): Promise<T | null> {
    const item = this.registry.get(id);
    if (!item) {
      return null;
    }

    // Return existing instance
    if (item.instance) {
      item.lastAccessed = new Date();
      item.accessCount++;
      return item.instance as T;
    }

    // Create instance if factory exists
    if (item.factory) {
      try {
        item.status = RegistryItemStatus.INITIALIZING;
        item.instance = await item.factory();
        item.status = RegistryItemStatus.ACTIVE;
        
        this.emit('registry:instance-created', item);
        return item.instance as T;
        
      } catch (error) {
        item.status = RegistryItemStatus.ERROR;
        this.emit('registry:instance-error', item, error);
        throw error;
      }
    }

    return null;
  }

  /**
   * Query the registry for items
   */
  public query(query: RegistryQuery): RegistryItem[] {
    let results = Array.from(this.registry.values());

    // Filter by type
    if (query.type) {
      results = results.filter(item => item.type === query.type);
    }

    // Filter by status
    if (query.status) {
      results = results.filter(item => item.status === query.status);
    }

    // Filter by namespace
    if (query.namespace) {
      results = results.filter(item => item.namespace === query.namespace);
    }

    // Filter by name
    if (query.name) {
      results = results.filter(item => 
        item.name.toLowerCase().includes(query.name!.toLowerCase())
      );
    }

    // Filter by version
    if (query.version) {
      results = results.filter(item => item.version === query.version);
    }

    // Filter by tags
    if (query.tags && query.tags.length > 0) {
      results = results.filter(item => 
        query.tags!.some(tag => item.tags.includes(tag))
      );
    }

    // Filter by metadata
    if (query.metadata) {
      results = results.filter(item => {
        return Object.entries(query.metadata!).every(([key, value]) => 
          item.metadata[key] === value
        );
      });
    }

    return results;
  }

  /**
   * Get all items of a specific type
   */
  public getByType(type: RegistryItemType): RegistryItem[] {
    const ids = this.typeIndex.get(type) || new Set();
    return Array.from(ids).map(id => this.registry.get(id)!).filter(Boolean);
  }

  /**
   * Get all items in a namespace
   */
  public getByNamespace(namespace: string): RegistryItem[] {
    const ids = this.namespaceIndex.get(namespace) || new Set();
    return Array.from(ids).map(id => this.registry.get(id)!).filter(Boolean);
  }

  /**
   * Get all items with a specific tag
   */
  public getByTag(tag: string): RegistryItem[] {
    const ids = this.tagIndex.get(tag) || new Set();
    return Array.from(ids).map(id => this.registry.get(id)!).filter(Boolean);
  }

  /**
   * Resolve dependencies for an item
   */
  public async resolveDependencies(id: string): Promise<Map<string, any>> {
    const item = this.registry.get(id);
    if (!item) {
      throw new Error(`Item not found: ${id}`);
    }

    const resolved = new Map<string, any>();
    const resolving = new Set<string>();

    const resolve = async (itemId: string): Promise<void> => {
      if (resolved.has(itemId) || resolving.has(itemId)) {
        return;
      }

      resolving.add(itemId);
      const currentItem = this.registry.get(itemId);
      
      if (!currentItem) {
        throw new Error(`Dependency not found: ${itemId}`);
      }

      // Resolve dependencies first
      for (const depId of currentItem.dependencies) {
        await resolve(depId);
      }

      // Get instance
      const instance = await this.getInstance(itemId);
      resolved.set(itemId, instance);
      resolving.delete(itemId);
    };

    await resolve(id);
    return resolved;
  }

  /**
   * Check for circular dependencies
   */
  public checkCircularDependencies(): string[][] {
    return this.dependencyGraph.cycles;
  }

  /**
   * Get dependency graph
   */
  public getDependencyGraph(): DependencyGraph {
    return { ...this.dependencyGraph };
  }

  /**
   * Activate an item and its dependencies
   */
  public async activateItem(id: string): Promise<void> {
    const item = this.registry.get(id);
    if (!item) {
      throw new Error(`Item not found: ${id}`);
    }

    if (item.status === RegistryItemStatus.ACTIVE) {
      return; // Already active
    }

    // Activate dependencies first
    for (const depId of item.dependencies) {
      await this.activateItem(depId);
    }

    // Activate this item
    await this.getInstance(id);
    
    this.emit('registry:item-activated', item);
    console.log(`▶️ Activated: ${item.name} (${id})`);
  }

  /**
   * Deactivate an item
   */
  public async deactivateItem(id: string): Promise<void> {
    const item = this.registry.get(id);
    if (!item) {
      throw new Error(`Item not found: ${id}`);
    }

    if (item.status !== RegistryItemStatus.ACTIVE) {
      return; // Not active
    }

    // Check for active dependents
    const activeDependents = item.dependents.filter(depId => {
      const dep = this.registry.get(depId);
      return dep && dep.status === RegistryItemStatus.ACTIVE;
    });

    if (activeDependents.length > 0) {
      throw new Error(`Cannot deactivate ${id} - has active dependents: ${activeDependents.join(', ')}`);
    }

    // Deactivate instance if it has a shutdown method
    if (item.instance && typeof item.instance.shutdown === 'function') {
      await item.instance.shutdown();
    }

    item.instance = undefined;
    item.status = RegistryItemStatus.INACTIVE;
    
    this.emit('registry:item-deactivated', item);
    console.log(`⏸️ Deactivated: ${item.name} (${id})`);
  }

  /**
   * Get registry statistics
   */
  public getStats(): RegistryStats {
    const stats: RegistryStats = {
      totalItems: this.registry.size,
      byType: {},
      byStatus: {},
      byNamespace: {},
      totalDependencies: 0,
      circularDependencies: this.dependencyGraph.cycles.length,
      mostAccessed: null,
      leastAccessed: null
    };

    let mostAccessed: RegistryItem | null = null;
    let leastAccessed: RegistryItem | null = null;

    for (const item of this.registry.values()) {
      // Count by type
      stats.byType[item.type] = (stats.byType[item.type] || 0) + 1;
      
      // Count by status
      stats.byStatus[item.status] = (stats.byStatus[item.status] || 0) + 1;
      
      // Count by namespace
      stats.byNamespace[item.namespace] = (stats.byNamespace[item.namespace] || 0) + 1;
      
      // Count dependencies
      stats.totalDependencies += item.dependencies.length;
      
      // Track access patterns
      if (!mostAccessed || item.accessCount > mostAccessed.accessCount) {
        mostAccessed = item;
      }
      if (!leastAccessed || item.accessCount < leastAccessed.accessCount) {
        leastAccessed = item;
      }
    }

    stats.mostAccessed = mostAccessed;
    stats.leastAccessed = leastAccessed;

    return stats;
  }

  /**
   * Perform maintenance tasks
   */
  public async performMaintenance(): Promise<void> {
    console.log('🔧 Performing registry maintenance...');
    
    // Clean up unused instances
    await this.cleanupUnusedInstances();
    
    // Update dependency graph
    this.rebuildDependencyGraph();
    
    // Check for orphaned items
    await this.checkOrphanedItems();
    
    console.log('✅ Registry maintenance complete');
  }

  // Private Methods

  private initializeIndexes(): void {
    // Initialize type index
    for (const type of Object.values(RegistryItemType)) {
      this.typeIndex.set(type, new Set());
    }
    
    // Initialize other indexes
    this.namespaceIndex.clear();
    this.tagIndex.clear();
    
    // Initialize dependency graph
    this.dependencyGraph = {
      nodes: new Map(),
      edges: new Map(),
      cycles: [],
      resolved: [],
      unresolved: []
    };
  }

  private setupEventHandlers(): void {
    this.on('registry:item-registered', (item: RegistryItem) => {
      console.log(`📋 Registry: ${item.name} registered`);
    });
    
    this.on('registry:item-unregistered', (item: RegistryItem) => {
      console.log(`📋 Registry: ${item.name} unregistered`);
    });
  }

  private async registerCoreComponents(): Promise<void> {
    // Register NebulaCore components
    await this.register({
      name: 'NebulaCore',
      type: RegistryItemType.SYSTEM,
      namespace: 'core',
      description: 'Core engine controller',
      instance: this.coreController,
      tags: ['core', 'system']
    });

    console.log('📋 Core components registered');
  }

  private updateIndexes(item: RegistryItem): void {
    // Update type index
    const typeSet = this.typeIndex.get(item.type) || new Set();
    typeSet.add(item.id);
    this.typeIndex.set(item.type, typeSet);
    
    // Update namespace index
    const namespaceSet = this.namespaceIndex.get(item.namespace) || new Set();
    namespaceSet.add(item.id);
    this.namespaceIndex.set(item.namespace, namespaceSet);
    
    // Update tag index
    for (const tag of item.tags) {
      const tagSet = this.tagIndex.get(tag) || new Set();
      tagSet.add(item.id);
      this.tagIndex.set(tag, tagSet);
    }
  }

  private removeFromIndexes(item: RegistryItem): void {
    // Remove from type index
    const typeSet = this.typeIndex.get(item.type);
    if (typeSet) {
      typeSet.delete(item.id);
    }
    
    // Remove from namespace index
    const namespaceSet = this.namespaceIndex.get(item.namespace);
    if (namespaceSet) {
      namespaceSet.delete(item.id);
    }
    
    // Remove from tag index
    for (const tag of item.tags) {
      const tagSet = this.tagIndex.get(tag);
      if (tagSet) {
        tagSet.delete(item.id);
      }
    }
  }

  private clearIndexes(): void {
    this.typeIndex.clear();
    this.namespaceIndex.clear();
    this.tagIndex.clear();
  }

  private updateDependencies(item: RegistryItem): void {
    // Update dependents for dependencies
    for (const depId of item.dependencies) {
      const dep = this.registry.get(depId);
      if (dep && !dep.dependents.includes(item.id)) {
        dep.dependents.push(item.id);
      }
    }
  }

  private removeDependencies(item: RegistryItem): void {
    // Remove from dependents lists
    for (const depId of item.dependencies) {
      const dep = this.registry.get(depId);
      if (dep) {
        dep.dependents = dep.dependents.filter(id => id !== item.id);
      }
    }
  }

  private rebuildDependencyGraph(): void {
    const nodes = new Map<string, RegistryItem>();
    const edges = new Map<string, string[]>();
    
    // Build nodes and edges
    for (const item of this.registry.values()) {
      nodes.set(item.id, item);
      edges.set(item.id, [...item.dependencies]);
    }
    
    // Detect cycles
    const cycles = this.detectCycles(edges);
    
    // Topological sort for resolution order
    const { resolved, unresolved } = this.topologicalSort(edges);
    
    this.dependencyGraph = {
      nodes,
      edges,
      cycles,
      resolved,
      unresolved
    };
  }

  private detectCycles(edges: Map<string, string[]>): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const currentPath: string[] = [];

    const dfs = (node: string): void => {
      if (recursionStack.has(node)) {
        // Found cycle
        const cycleStart = currentPath.indexOf(node);
        cycles.push([...currentPath.slice(cycleStart), node]);
        return;
      }

      if (visited.has(node)) {
        return;
      }

      visited.add(node);
      recursionStack.add(node);
      currentPath.push(node);

      const deps = edges.get(node) || [];
      for (const dep of deps) {
        dfs(dep);
      }

      recursionStack.delete(node);
      currentPath.pop();
    };

    for (const node of edges.keys()) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }

    return cycles;
  }

  private topologicalSort(edges: Map<string, string[]>): { resolved: string[]; unresolved: string[] } {
    const resolved: string[] = [];
    const unresolved: string[] = [];
    const visited = new Set<string>();
    const tempMarked = new Set<string>();

    const visit = (node: string): void => {
      if (tempMarked.has(node)) {
        unresolved.push(node);
        return;
      }

      if (visited.has(node)) {
        return;
      }

      tempMarked.add(node);
      const deps = edges.get(node) || [];
      
      for (const dep of deps) {
        visit(dep);
      }

      tempMarked.delete(node);
      visited.add(node);
      resolved.push(node);
    };

    for (const node of edges.keys()) {
      if (!visited.has(node)) {
        visit(node);
      }
    }

    return { resolved, unresolved };
  }

  private generateItemId(name: string, type: RegistryItemType): string {
    const sanitized = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    return `${type}-${sanitized}-${Date.now()}`;
  }

  private setupPeriodicMaintenance(): void {
    setInterval(() => {
      this.performMaintenance().catch(error => {
        console.error('Registry maintenance error:', error);
      });
    }, 300000); // Every 5 minutes
  }

  private async cleanupUnusedInstances(): Promise<void> {
    const oneDayAgo = new Date(Date.now() - 86400000); // 24 hours
    
    for (const item of this.registry.values()) {
      if (item.instance && 
          item.status === RegistryItemStatus.ACTIVE &&
          item.lastAccessed < oneDayAgo &&
          item.dependents.length === 0) {
        
        console.log(`🧹 Cleaning up unused instance: ${item.name}`);
        await this.deactivateItem(item.id);
      }
    }
  }

  private async checkOrphanedItems(): Promise<void> {
    for (const item of this.registry.values()) {
      // Check for broken dependencies
      for (const depId of item.dependencies) {
        if (!this.registry.has(depId)) {
          console.warn(`⚠️ Orphaned dependency: ${item.name} depends on missing ${depId}`);
        }
      }
    }
  }
}

// Supporting interfaces
export interface RegistryStats {
  totalItems: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  byNamespace: Record<string, number>;
  totalDependencies: number;
  circularDependencies: number;
  mostAccessed: RegistryItem | null;
  leastAccessed: RegistryItem | null;
}