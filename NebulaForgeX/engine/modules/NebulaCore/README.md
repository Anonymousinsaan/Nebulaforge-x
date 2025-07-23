# NebulaCore

**Foundation Systems Module**

NebulaCore is the foundational module of the NebulaForge X engine, providing essential systems that all other modules depend on.

## 🎯 Purpose

NebulaCore serves as the backbone of the engine, providing:
- **Logging System**: Structured, multi-level logging with customizable output
- **Event System**: High-performance event emission and handling
- **Lifecycle Management**: Engine initialization, update loops, and shutdown
- **Configuration Management**: Dynamic configuration loading and validation
- **Error Handling**: Centralized error management and recovery
- **Performance Monitoring**: FPS tracking, memory usage, and profiling

## 🏗️ Architecture

```
NebulaCore/
├── src/
│   ├── logging/           # Winston-based logging system
│   ├── events/           # EventEmitter3-based event system
│   ├── lifecycle/        # Engine lifecycle management
│   ├── config/           # Configuration management
│   ├── errors/           # Error handling utilities
│   └── performance/      # Performance monitoring tools
├── types/                # TypeScript type definitions
└── tests/               # Unit tests
```

## 🚀 Key Features

- **Zero Dependencies**: Only depends on well-established libraries
- **High Performance**: Optimized for real-time applications
- **Type Safety**: Full TypeScript support with strict typing
- **Extensible**: Plugin architecture for extending functionality
- **Cross-Platform**: Works in browser, Node.js, and mobile environments

## 📚 Usage

```typescript
import { NebulaCore } from '@modules/NebulaCore';

const core = new NebulaCore({
  logLevel: 'info',
  enablePerformanceMonitoring: true
});

await core.initialize();

// Access subsystems
core.logger.info('Engine started');
core.events.emit('engine:started');
core.performance.startFrame();
```

## 🔧 Configuration

Module configuration in `engine.config.json`:

```json
{
  "NebulaCore": {
    "config": {
      "logging": {
        "level": "info",
        "outputs": ["console", "file"]
      },
      "events": {
        "maxListeners": 100
      },
      "lifecycle": {
        "targetFPS": 60,
        "enableVSync": true
      }
    }
  }
}
```

## 🤝 Dependencies

- **External**: None (only peer dependencies like winston, eventemitter3)
- **Internal**: None (this is the foundation module)

## 🧪 Development Status

- [ ] Basic structure setup
- [ ] Logging system implementation
- [ ] Event system implementation
- [ ] Lifecycle management
- [ ] Configuration system
- [ ] Performance monitoring
- [ ] Error handling
- [ ] Unit tests
- [ ] Documentation