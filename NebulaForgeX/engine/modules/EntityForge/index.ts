/**
 * EntityForge - Entity-Component-System (ECS) Architecture Module
 * 
 * High-performance ECS implementation for managing game objects, UI elements,
 * and application entities with component-based architecture.
 */

export type EntityId = number;
export type ComponentType = string;
export type SystemType = string;

export interface Component {
  type: ComponentType;
  [key: string]: any;
}

export interface Entity {
  id: EntityId;
  components: Map<ComponentType, Component>;
  add<T extends Component>(type: ComponentType, data: Omit<T, 'type'>): Entity;
  get<T extends Component>(type: ComponentType): T;
  has(type: ComponentType): boolean;
  remove(type: ComponentType): boolean;
  destroy(): void;
}

export interface Query {
  entities: Entity[];
  with(componentTypes: ComponentType[]): Query;
  without(componentTypes: ComponentType[]): Query;
  execute(): Entity[];
}

export interface System {
  type: SystemType;
  priority: number;
  query?: Query;
  initialize?(world: World): Promise<void>;
  update?(deltaTime: number, world: World): void;
  render?(deltaTime: number, world: World): void;
  shutdown?(): void;
}

export interface World {
  name: string;
  entities: Map<EntityId, Entity>;
  systems: Map<SystemType, System>;
  createEntity(): Entity;
  getEntity(id: EntityId): Entity | undefined;
  destroyEntity(id: EntityId): void;
  addSystem(system: System): void;
  removeSystem(type: SystemType): void;
  query(componentTypes: ComponentType[]): Query;
  update(deltaTime: number): void;
}

export interface EntityForgeConfig {
  maxEntities?: number;
  enablePooling?: boolean;
  enableSerialization?: boolean;
  systemsParallel?: boolean;
}

export class EntityForge {
  private config: EntityForgeConfig;
  private worlds: Map<string, World> = new Map();
  private currentWorld: World | null = null;
  private nextEntityId = 1;
  private initialized = false;

  constructor(config: EntityForgeConfig = {}) {
    this.config = {
      maxEntities: 10000,
      enablePooling: true,
      enableSerialization: true,
      systemsParallel: false,
      ...config
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // TODO: Initialize component registry
    // TODO: Setup entity pooling system
    // TODO: Initialize system scheduler
    // TODO: Setup serialization system

    this.initialized = true;
    console.log('⚙️ EntityForge ECS system initialized');
  }

  createWorld(name: string): World {
    if (this.worlds.has(name)) {
      throw new Error(`World '${name}' already exists`);
    }

    const world: World = {
      name,
      entities: new Map(),
      systems: new Map(),

      createEntity: (): Entity => {
        const id = this.nextEntityId++;
        const entity: Entity = {
          id,
          components: new Map(),

          add<T extends Component>(type: ComponentType, data: Omit<T, 'type'>): Entity {
            const component = { type, ...data } as T;
            this.components.set(type, component);
            return this;
          },

          get<T extends Component>(type: ComponentType): T {
            const component = this.components.get(type);
            if (!component) {
              throw new Error(`Component '${type}' not found on entity ${id}`);
            }
            return component as T;
          },

          has(type: ComponentType): boolean {
            return this.components.has(type);
          },

          remove(type: ComponentType): boolean {
            return this.components.delete(type);
          },

          destroy(): void {
            world.destroyEntity(id);
          }
        };

        world.entities.set(id, entity);
        return entity;
      },

      getEntity: (id: EntityId) => world.entities.get(id),

      destroyEntity: (id: EntityId) => {
        world.entities.delete(id);
      },

      addSystem: (system: System) => {
        world.systems.set(system.type, system);
        system.initialize?.(world);
      },

      removeSystem: (type: SystemType) => {
        const system = world.systems.get(type);
        if (system) {
          system.shutdown?.();
          world.systems.delete(type);
        }
      },

      query: (componentTypes: ComponentType[]) => {
        const entities = Array.from(world.entities.values()).filter(entity =>
          componentTypes.every(type => entity.has(type))
        );

        const query: Query = {
          entities,
          with: (types: ComponentType[]) => world.query([...componentTypes, ...types]),
          without: (types: ComponentType[]) => {
            const filtered = entities.filter(entity =>
              !types.some(type => entity.has(type))
            );
            return { ...query, entities: filtered };
          },
          execute: () => entities
        };

        return query;
      },

      update: (deltaTime: number) => {
        const sortedSystems = Array.from(world.systems.values())
          .sort((a, b) => a.priority - b.priority);

        for (const system of sortedSystems) {
          system.update?.(deltaTime, world);
        }
      }
    };

    this.worlds.set(name, world);
    console.log(`World '${name}' created`);
    return world;
  }

  getWorld(name: string): World | undefined {
    return this.worlds.get(name);
  }

  setCurrentWorld(name: string): void {
    const world = this.worlds.get(name);
    if (!world) {
      throw new Error(`World '${name}' not found`);
    }
    this.currentWorld = world;
  }

  get world(): World {
    if (!this.currentWorld) {
      throw new Error('No current world set');
    }
    return this.currentWorld;
  }

  get entities() {
    return this.world;
  }

  get systems() {
    return this.world;
  }

  query(componentTypes: ComponentType[]): Query {
    return this.world.query(componentTypes);
  }

  update(deltaTime: number): void {
    if (this.currentWorld) {
      this.currentWorld.update(deltaTime);
    }
  }

  get isInitialized(): boolean {
    return this.initialized;
  }
}

export default EntityForge;