/**
 * Jest Test Setup for NebulaForge X
 * 
 * Global test configuration and utilities for the engine modules.
 */

// Mock console methods to reduce noise in tests unless explicitly testing logging
const originalConsole = { ...console };

beforeEach(() => {
  // Restore console methods before each test
  Object.assign(console, originalConsole);
});

// Global test utilities
global.createMockLogger = () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
});

global.createMockEventSystem = () => ({
  emit: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  once: jest.fn()
});

global.createMockPerformanceMonitor = () => ({
  startFrame: jest.fn(),
  endFrame: jest.fn(),
  getFPS: jest.fn(() => 60),
  getMemoryUsage: jest.fn(() => 100),
  startTimer: jest.fn(),
  endTimer: jest.fn(() => 16.67)
});

global.silenceConsole = () => {
  console.log = jest.fn();
  console.info = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
  console.debug = jest.fn();
};

global.restoreConsole = () => {
  Object.assign(console, originalConsole);
};

// Mock performance.now for consistent timing in tests
Object.defineProperty(global.performance, 'now', {
  writable: true,
  value: jest.fn(() => Date.now())
});

// Mock requestAnimationFrame for tests that need it
global.requestAnimationFrame = jest.fn(callback => {
  setTimeout(callback, 16); // Simulate 60 FPS
  return 1;
});

global.cancelAnimationFrame = jest.fn();

// Mock DOM elements for browser-dependent tests
global.document = {
  createElement: jest.fn(() => ({
    getContext: jest.fn(() => ({})),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
  })),
  getElementById: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
} as any;

global.window = {
  innerWidth: 1920,
  innerHeight: 1080,
  devicePixelRatio: 1,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
} as any;

// Increase timeout for async operations
jest.setTimeout(10000);