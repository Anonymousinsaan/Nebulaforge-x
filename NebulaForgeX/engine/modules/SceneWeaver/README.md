# SceneWeaver

**Scene Management & Rendering Pipeline Module**

SceneWeaver is the visual engine of NebulaForge X, providing advanced scene management, rendering pipelines, and visual effects for creating stunning interactive experiences.

## 🎯 Purpose

SceneWeaver delivers comprehensive visual capabilities:
- **Scene Graph Management**: Hierarchical scene organization with transforms
- **Rendering Pipelines**: Forward, deferred, and hybrid rendering strategies
- **Material System**: PBR materials with shader customization
- **Lighting & Shadows**: Dynamic lighting with real-time shadow mapping
- **Post-Processing**: Screen-space effects and image enhancement
- **Performance Optimization**: Frustum culling, LOD, instancing

## 🏗️ Architecture

```
SceneWeaver/
├── src/
│   ├── scene/           # Scene graph and node management
│   ├── rendering/       # Core rendering pipeline
│   ├── materials/       # Material and shader system
│   ├── lighting/        # Lighting and shadow systems
│   ├── cameras/         # Camera and viewport management
│   ├── effects/         # Visual effects and post-processing
│   ├── optimization/    # Culling, LOD, and performance systems
│   └── platforms/       # WebGL, WebGPU, Vulkan backends
├── shaders/            # GLSL/WGSL shader library
├── materials/          # Pre-built material presets
├── types/              # TypeScript type definitions
└── tests/             # Rendering tests and benchmarks
```

## 🚀 Key Features

- **Multi-API Support**: WebGL 2.0, WebGPU, future Vulkan integration
- **Advanced Materials**: PBR workflows with IBL and advanced shading
- **Dynamic Lighting**: Real-time lights with soft shadows
- **Scene Management**: Efficient hierarchical scene graphs
- **Visual Effects**: Particle systems, post-processing chains
- **Performance**: Automatic LOD, frustum culling, draw call batching

## 📚 Usage

```typescript
import { SceneWeaver } from '@modules/SceneWeaver';

const renderer = new SceneWeaver({
  canvas: '#canvas',
  renderer: 'webgl2',
  enableShadows: true,
  enablePostProcessing: true
});

await renderer.initialize();

// Create scene
const scene = renderer.createScene('main');

// Add camera
const camera = renderer.cameras.createPerspective({
  fov: 75,
  aspect: window.innerWidth / window.innerHeight,
  near: 0.1,
  far: 1000
});

scene.setActiveCamera(camera);

// Create materials
const material = renderer.materials.createPBR({
  albedo: [1.0, 0.8, 0.6],
  metallic: 0.0,
  roughness: 0.5,
  normalMap: 'assets/normal.jpg'
});

// Add objects to scene
const cube = scene.createNode('cube')
  .setGeometry(renderer.geometry.createBox(1, 1, 1))
  .setMaterial(material)
  .setPosition(0, 0, 0);

// Add lighting
const directionalLight = scene.createLight('directional', {
  color: [1, 1, 1],
  intensity: 3.0,
  direction: [-1, -1, -1],
  castShadows: true
});

// Render loop
renderer.render(scene, camera);
```

## 🎨 Rendering Features

### Scene Graph
- **Hierarchical Transforms**: Parent-child relationships with inheritance
- **Node Types**: Mesh, light, camera, empty nodes
- **Culling**: Frustum and occlusion culling
- **Spatial Indexing**: Octrees and spatial hashing for optimization

### Materials & Shaders
- **PBR Materials**: Metallic-roughness workflow
- **Shader System**: Custom GLSL/WGSL shader support
- **Material Editor**: Visual node-based material creation
- **Texture Management**: Automatic texture loading and optimization

### Lighting System
- **Light Types**: Directional, point, spot, area lights
- **Shadow Mapping**: PCF, PCSS, cascaded shadow maps
- **Image-Based Lighting**: HDR environment maps and IBL
- **Light Probes**: Reflection and irradiance probes

### Post-Processing
- **Tone Mapping**: Various tone mapping operators
- **Anti-Aliasing**: FXAA, TAA, MSAA support
- **Screen Effects**: Bloom, depth of field, motion blur
- **Color Grading**: LUT-based color correction

## 🎮 Built-in Geometries

### Primitives
- **Basic Shapes**: Box, sphere, cylinder, plane, torus
- **Parametric**: Knot, mobius strip, klein bottle
- **Text**: 3D text generation with font support
- **Splines**: Bezier and NURBS curve geometries

### Loaders
- **3D Formats**: glTF, OBJ, FBX, 3DS, PLY
- **Scene Formats**: USD, Alembic (roadmap)
- **Texture Formats**: PNG, JPG, HDR, EXR, KTX
- **Streaming**: Progressive mesh loading

## 🔧 Configuration

Module configuration in `engine.config.json`:

```json
{
  "SceneWeaver": {
    "config": {
      "renderer": {
        "api": "webgl2",
        "antialias": true,
        "shadows": true,
        "maxLights": 16
      },
      "sceneGraph": {
        "maxNodes": 10000,
        "enableCulling": true,
        "cullingDistance": 1000
      },
      "materials": {
        "enablePBR": true,
        "maxTextures": 64,
        "textureCompression": true
      },
      "performance": {
        "enableLOD": true,
        "enableInstancing": true,
        "batchDrawCalls": true
      }
    }
  }
}
```

## 🤝 Dependencies

- **External**: Three.js (optional), Babylon.js (optional), custom WebGL/WebGPU
- **Internal**: NebulaCore (events, logging), EntityForge (components, systems)

## 🎮 Use Cases

### Game Development
- **3D Games**: First-person, third-person, strategy games
- **2D Games**: Sprite-based games with 3D effects
- **VR/AR**: Immersive virtual and augmented reality
- **UI Rendering**: 3D user interfaces and HUDs

### Visualization
- **Data Visualization**: 3D charts, graphs, scientific visualization
- **Architectural**: Building and interior visualization
- **Product**: 3D product configurators and viewers
- **Educational**: Interactive 3D learning experiences

### Creative Tools
- **Content Creation**: 3D editors and modeling tools
- **Animation**: Keyframe and procedural animation systems
- **Simulation**: Physics-based visual simulations
- **Art**: Digital art and creative coding platforms

## 🚀 Performance Features

### Optimization Techniques
- **Frustum Culling**: Only render visible objects
- **Occlusion Culling**: Hide objects behind others
- **Level of Detail**: Automatic mesh simplification
- **Draw Call Batching**: Combine similar draw calls

### Memory Management
- **Texture Streaming**: Load textures on demand
- **Geometry Compression**: Compressed vertex data
- **Buffer Management**: Efficient GPU buffer allocation
- **Garbage Collection**: Automatic cleanup of unused resources

### Advanced Rendering
- **Instanced Rendering**: Efficient rendering of multiple objects
- **Compute Shaders**: GPU-accelerated computations
- **Multi-threaded**: Parallel command buffer generation
- **Adaptive Quality**: Dynamic quality scaling based on performance

## 🧪 Development Status

- [ ] Basic structure setup
- [ ] WebGL 2.0 backend implementation
- [ ] Scene graph system
- [ ] Material and shader system
- [ ] Lighting and shadow system
- [ ] Camera management
- [ ] Post-processing pipeline
- [ ] Geometry loading and management
- [ ] Performance optimization systems
- [ ] WebGPU backend (roadmap)
- [ ] Unit tests
- [ ] Documentation