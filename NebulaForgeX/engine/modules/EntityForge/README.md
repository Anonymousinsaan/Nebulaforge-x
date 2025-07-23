# EntityForge

**Entity-Component-System (ECS) Architecture Module**

EntityForge provides a high-performance, flexible Entity-Component-System architecture that serves as the backbone for game objects, UI elements, and application entities.

## 🎯 Purpose

EntityForge delivers modern ECS architecture with:
- **Entity Management**: Lightweight entity creation, destruction, and lifecycle
- **Component System**: Data-driven components with automatic serialization
- **System Processing**: High-performance systems with parallel execution support
- **World Management**: Multiple worlds/scenes with entity isolation
- **Query System**: Fast entity queries with filtering and caching
- **Event Integration**: Seamless integration with NebulaCore's event system

## 🏗️ Architecture

```
EntityForge/
├── src/
│   ├── entities/         # Entity management and lifecycle
│   ├── components/       # Component definitions and registry
│   ├── systems/         # System processing and scheduling
│   ├── world/           # World/scene management
│   ├── queries/         # Entity query system
│   └── serialization/   # Save/load functionality
├── components/          # Built-in component library
├── systems/            # Built-in system library
├── types/              # TypeScript type definitions
└── tests/             # Unit and performance tests
```

## 🚀 Key Features

- **High Performance**: Optimized for 10,000+ entities in real-time
- **Memory Efficient**: Component pooling and memory management
- **Type Safety**: Full TypeScript support with generic components
- **Parallel Processing**: Multi-threaded system execution
- **Hot Reloading**: Runtime component and system updates
- **Serialization**: Complete save/load state management

## 📚 Usage

```typescript
import { EntityForge } from '@modules/EntityForge';

const ecs = new EntityForge({
  maxEntities: 10000,
  enablePooling: true
});

await ecs.initialize();

// Create entity with components
const player = ecs.entities.create()
  .add('Transform', { x: 0, y: 0, z: 0 })
  .add('Renderer', { mesh: 'player.obj', texture: 'player.png' })
  .add('Health', { current: 100, max: 100 });

// Create systems
class MovementSystem extends ecs.System {
  query = ecs.query(['Transform', 'Velocity']);
  
  update(deltaTime: number) {
    for (const entity of this.query.entities) {
      const transform = entity.get('Transform');
      const velocity = entity.get('Velocity');
      
      transform.x += velocity.x * deltaTime;
      transform.y += velocity.y * deltaTime;
    }
  }
}

ecs.systems.add(new MovementSystem());
```

## 🧩 Built-in Components

### Core Components
- **Transform**: Position, rotation, scale
- **Hierarchy**: Parent-child relationships
- **Tags**: String-based entity categorization
- **Metadata**: Custom key-value data storage

### Rendering Components
- **Renderer**: Mesh, texture, material references
- **Camera**: Projection, view matrices
- **Light**: Directional, point, spot lights
- **Animation**: Keyframe and skeletal animations

### Physics Components
- **RigidBody**: Mass, velocity, forces
- **Collider**: Shape definitions and collision data
- **Trigger**: Event-based collision detection

### Game Components
- **Health**: HP, damage, healing systems
- **Inventory**: Item storage and management
- **AI**: Behavior trees and state machines

## ⚙️ System Types

### Update Systems
- Execute every frame with delta time
- Handle movement, animation, input processing

### Fixed Systems
- Execute at fixed intervals
- Handle physics, network updates

### Render Systems
- Execute during render phase
- Handle graphics, UI, effects

### Event Systems
- React to specific events
- Handle collision, user input, triggers

## 🔧 Configuration

Module configuration in `engine.config.json`:

```json
{
  "EntityForge": {
    "config": {
      "maxEntities": 10000,
      "componentPooling": {
        "enabled": true,
        "initialSize": 100,
        "growthFactor": 1.5
      },
      "systemsParallel": {
        "enabled": false,
        "workerCount": 4
      },
      "serialization": {
        "autoSave": true,
        "saveInterval": 60000,
        "compression": true
      }
    }
  }
}
```

## 🤝 Dependencies

- **External**: None (self-contained)
- **Internal**: NebulaCore (logging, events, performance)

## 🎮 Example Use Cases

### Game Development
- Player characters with health, inventory, movement
- NPCs with AI behaviors and dialogue systems
- Environment objects with physics and interactions
- UI elements with event handling and animations

### Application Development
- Form elements with validation and state management
- Data visualization with interactive components
- Workflow systems with state transitions
- Plugin architectures with dynamic component loading

## 🚀 Performance Features

- **Archetype Storage**: Contiguous memory layout for cache efficiency
- **Change Detection**: Minimal updates when components haven't changed
- **Batch Processing**: Process similar entities together
- **Sparse Sets**: Efficient component storage for large entity counts
- **System Scheduling**: Automatic dependency resolution and parallel execution

## 🧪 Development Status

- [ ] Basic structure setup
- [ ] Entity management system
- [ ] Component registry and storage
- [ ] System processing pipeline
- [ ] Query system with filtering
- [ ] World/scene management
- [ ] Serialization system
- [ ] Built-in components library
- [ ] Built-in systems library
- [ ] Performance optimization
- [ ] Unit tests
- [ ] Documentation