/**
 * NebulaCore Test Suite
 * 
 * Basic tests for the NebulaCore foundation systems
 */

import { createCoreController, Logger, GlobalEventBus, StateManager } from '../engine/modules/NebulaCore/index.js';

describe('NebulaCore Foundation Systems', () => {
  beforeEach(() => {
    global.silenceConsole();
  });

  afterEach(() => {
    global.restoreConsole();
  });

  describe('Logger', () => {
    test('should create logger with default config', () => {
      const logger = new Logger();
      expect(logger).toBeDefined();
      expect(logger.getLevel()).toBe('info');
    });

    test('should log messages at different levels', () => {
      const logger = new Logger({ level: 'debug', enableConsole: false, enableFile: false });
      
      expect(() => {
        logger.debug('Debug message');
        logger.info('Info message');
        logger.warn('Warning message');
        logger.error('Error message');
      }).not.toThrow();
    });

    test('should create child loggers', () => {
      const logger = new Logger({ level: 'info', enableConsole: false, enableFile: false });
      const childLogger = logger.createChild('TestModule');
      
      expect(childLogger).toBeDefined();
      expect(childLogger.getLevel()).toBe('info');
    });
  });

  describe('GlobalEventBus', () => {
    test('should create event bus', () => {
      const eventBus = new GlobalEventBus();
      expect(eventBus).toBeDefined();
    });

    test('should emit and receive events', (done) => {
      const eventBus = new GlobalEventBus();
      
      eventBus.on('test:event', (data) => {
        expect(data).toBe('test data');
        done();
      });
      
      eventBus.emit('test:event', 'test data');
    });

    test('should support event priorities', (done) => {
      const eventBus = new GlobalEventBus();
      const results: string[] = [];
      
      eventBus.on('priority:test', () => results.push('normal'), 0);
      eventBus.on('priority:test', () => results.push('high'), 10);
      eventBus.on('priority:test', () => {
        expect(results).toEqual(['high', 'normal']);
        done();
      }, -10);
      
      eventBus.emit('priority:test');
    });

    test('should create namespaced event buses', () => {
      const eventBus = new GlobalEventBus();
      const namespacedBus = eventBus.namespace('TestModule');
      
      expect(namespacedBus).toBeDefined();
      expect(typeof namespacedBus.emit).toBe('function');
    });
  });

  describe('StateManager', () => {
    test('should create state manager', () => {
      const stateManager = new StateManager({ enablePersistence: false });
      expect(stateManager).toBeDefined();
    });

    test('should store and retrieve values', () => {
      const stateManager = new StateManager({ enablePersistence: false });
      
      stateManager.set('test:key', 'test value');
      expect(stateManager.get('test:key')).toBe('test value');
      expect(stateManager.has('test:key')).toBe(true);
    });

    test('should support subscriptions', (done) => {
      const stateManager = new StateManager({ enablePersistence: false });
      
      const unsubscribe = stateManager.subscribe('subscription:test', (value, oldValue) => {
        expect(value).toBe('new value');
        expect(oldValue).toBeUndefined();
        unsubscribe();
        done();
      });
      
      stateManager.set('subscription:test', 'new value');
    });

    test('should provide change history', () => {
      const stateManager = new StateManager({ 
        enablePersistence: false,
        enableChangeTracking: true 
      });
      
      stateManager.set('history:test', 'initial');
      stateManager.set('history:test', 'updated');
      
      const history = stateManager.getHistory('history:test');
      expect(history).toHaveLength(2);
      expect(history[1].newValue).toBe('updated');
    });
  });

  describe('CoreController', () => {
    test('should create core controller', () => {
      const controller = createCoreController({
        logLevel: 'error' // Reduce noise in tests
      });
      
      expect(controller).toBeDefined();
      expect(controller.state).toBe('boot');
    });

    test('should initialize successfully', async () => {
      const controller = createCoreController({
        logLevel: 'error'
      });
      
      await controller.initialize();
      expect(controller.state).toBe('init');
    });

    test('should provide access to all subsystems', () => {
      const controller = createCoreController({
        logLevel: 'error'
      });
      
      expect(controller.logger).toBeDefined();
      expect(controller.events).toBeDefined();
      expect(controller.stateManager).toBeDefined();
      expect(controller.modules).toBeDefined();
      expect(controller.plugins).toBeDefined();
    });

    test('should manage engine lifecycle', async () => {
      const controller = createCoreController({
        logLevel: 'error'
      });
      
      // Test initialization
      await controller.initialize();
      expect(controller.state).toBe('init');
      
      // Test start
      await controller.start();
      expect(controller.state).toBe('run');
      
      // Test pause
      await controller.pause();
      expect(controller.state).toBe('pause');
      
      // Test resume
      await controller.resume();
      expect(controller.state).toBe('run');
      
      // Test shutdown
      await controller.shutdown();
      expect(controller.state).toBe('terminate');
    }, 10000); // Allow extra time for lifecycle operations
  });

  describe('Module System', () => {
    test('should register and manage modules', async () => {
      const controller = createCoreController({
        logLevel: 'error'
      });

      // Create a mock module
      const mockModule = {
        metadata: {
          name: 'TestModule',
          version: '1.0.0',
          description: 'Test module',
          author: 'Test',
          dependencies: [],
          priority: 1,
          enabled: true,
          autoLoad: true
        },
        initialize: jest.fn().mockResolvedValue(undefined),
        shutdown: jest.fn().mockResolvedValue(undefined),
        getState: jest.fn().mockReturnValue('ready')
      };

      await controller.registerModule(mockModule);
      expect(controller.modules.isRegistered('TestModule')).toBe(true);
      
      const retrievedModule = controller.getModule('TestModule');
      expect(retrievedModule).toBe(mockModule);
    });
  });
});