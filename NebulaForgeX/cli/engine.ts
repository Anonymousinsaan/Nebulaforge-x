/**
 * NebulaForge X Engine CLI Handler
 * 
 * CLI commands for engine lifecycle management using the NebulaCore controller
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { createCoreController, CoreController } from '../engine/modules/NebulaCore/index.js';

let engineInstance: CoreController | null = null;

/**
 * Initialize the engine instance
 */
async function getEngineInstance(): Promise<CoreController> {
  if (!engineInstance) {
    engineInstance = createCoreController({
      configPath: './engine.config.json',
      logLevel: 'info'
    });
  }
  return engineInstance;
}

/**
 * Run command - Initialize and start the engine
 */
export async function runEngine(): Promise<void> {
  try {
    console.log(chalk.blue('🚀 Starting NebulaForge X Engine...'));
    
    const engine = await getEngineInstance();
    
    // Initialize the engine
    await engine.initialize();
    console.log(chalk.green('✅ Engine initialized successfully'));
    
    // Start the engine
    await engine.start();
    console.log(chalk.green('✅ Engine started successfully'));
    
    // Keep process running
    console.log(chalk.yellow('Engine is running. Press Ctrl+C to stop.'));
    
    // Handle graceful shutdown
    const shutdown = async () => {
      try {
        console.log(chalk.blue('\n🛑 Shutting down engine...'));
        await engine.shutdown();
        console.log(chalk.green('✅ Engine shut down successfully'));
        process.exit(0);
      } catch (error) {
        console.error(chalk.red('❌ Error during shutdown:'), error);
        process.exit(1);
      }
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to start engine:'), error);
    process.exit(1);
  }
}

/**
 * Initialize command - Just initialize the engine without starting
 */
export async function initEngine(): Promise<void> {
  try {
    console.log(chalk.blue('🔧 Initializing NebulaForge X Engine...'));
    
    const engine = await getEngineInstance();
    await engine.initialize();
    
    console.log(chalk.green('✅ Engine initialized successfully'));
    console.log(chalk.yellow('Use "npm run forge run" to start the engine'));
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to initialize engine:'), error);
    process.exit(1);
  }
}

/**
 * Status command - Show engine and module status
 */
export async function statusEngine(): Promise<void> {
  try {
    const engine = await getEngineInstance();
    const status = engine.getStatus();
    
    console.log(chalk.blue('📊 NebulaForge X Engine Status\n'));
    
    // Engine status
    console.log(chalk.cyan('🏗️ Engine:'));
    console.log(`   State: ${getStateEmoji(status.engine.state)} ${status.engine.state}`);
    console.log(`   Version: ${status.engine.version}`);
    console.log(`   Environment: ${status.engine.environment}`);
    console.log(`   Uptime: ${(status.engine.uptime / 1000).toFixed(2)}s`);
    
    // Module status
    console.log(chalk.cyan('\n📦 Modules:'));
    const moduleEntries = Object.entries(status.modules);
    
    if (moduleEntries.length === 0) {
      console.log('   No modules registered');
    } else {
      moduleEntries.forEach(([name, moduleStatus]: [string, any]) => {
        const enabled = moduleStatus.enabled ? '🟢' : '🔴';
        const initialized = moduleStatus.initialized ? '✅' : '❌';
        console.log(`   ${name}: ${enabled} ${initialized} [${moduleStatus.state}]`);
      });
    }
    
    // Plugin status
    console.log(chalk.cyan('\n🔌 Plugins:'));
    const pluginEntries = Object.entries(status.plugins);
    
    if (pluginEntries.length === 0) {
      console.log('   No plugins installed');
    } else {
      pluginEntries.forEach(([name, pluginStatus]: [string, any]) => {
        const active = pluginStatus.active ? '🟢' : '🔴';
        console.log(`   ${name}: ${active} v${pluginStatus.version}`);
      });
    }
    
    // Performance metrics
    if (status.performance) {
      console.log(chalk.cyan('\n⚡ Performance:'));
      if (status.performance.memory) {
        const memory = status.performance.memory;
        console.log(`   Memory: ${memory.heapUsed}MB / ${memory.heapTotal}MB`);
        console.log(`   RSS: ${memory.rss}MB`);
      }
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to get engine status:'), error);
    process.exit(1);
  }
}

/**
 * Stop command - Shutdown the engine gracefully
 */
export async function stopEngine(): Promise<void> {
  try {
    if (!engineInstance) {
      console.log(chalk.yellow('⚠️ Engine is not running'));
      return;
    }
    
    console.log(chalk.blue('🛑 Stopping NebulaForge X Engine...'));
    
    await engineInstance.shutdown();
    engineInstance = null;
    
    console.log(chalk.green('✅ Engine stopped successfully'));
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to stop engine:'), error);
    process.exit(1);
  }
}

/**
 * Pause command - Pause the engine
 */
export async function pauseEngine(): Promise<void> {
  try {
    if (!engineInstance) {
      console.log(chalk.yellow('⚠️ Engine is not running'));
      return;
    }
    
    console.log(chalk.blue('⏸️ Pausing NebulaForge X Engine...'));
    
    await engineInstance.pause();
    
    console.log(chalk.green('✅ Engine paused successfully'));
    console.log(chalk.yellow('Use "npm run forge resume" to resume'));
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to pause engine:'), error);
  }
}

/**
 * Resume command - Resume the engine from pause
 */
export async function resumeEngine(): Promise<void> {
  try {
    if (!engineInstance) {
      console.log(chalk.yellow('⚠️ Engine is not running'));
      return;
    }
    
    console.log(chalk.blue('▶️ Resuming NebulaForge X Engine...'));
    
    await engineInstance.resume();
    
    console.log(chalk.green('✅ Engine resumed successfully'));
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to resume engine:'), error);
  }
}

/**
 * Module commands
 */
export async function listModules(): Promise<void> {
  try {
    const engine = await getEngineInstance();
    const status = engine.getStatus();
    
    console.log(chalk.blue('📦 Available Modules:\n'));
    
    const moduleEntries = Object.entries(status.modules);
    
    if (moduleEntries.length === 0) {
      console.log('No modules found');
      return;
    }
    
    moduleEntries.forEach(([name, moduleStatus]: [string, any]) => {
      console.log(chalk.cyan(`${name}:`));
      console.log(`  Status: ${moduleStatus.enabled ? chalk.green('Enabled') : chalk.red('Disabled')}`);
      console.log(`  State: ${moduleStatus.state}`);
      console.log(`  Version: ${moduleStatus.version}`);
      console.log(`  Dependencies: ${moduleStatus.dependencies.join(', ') || 'None'}`);
      console.log('');
    });
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to list modules:'), error);
  }
}

export async function enableModule(moduleName: string): Promise<void> {
  try {
    const engine = await getEngineInstance();
    await engine.modules.enable(moduleName);
    
    console.log(chalk.green(`✅ Module '${moduleName}' enabled successfully`));
    
  } catch (error) {
    console.error(chalk.red(`❌ Failed to enable module '${moduleName}':`), error);
  }
}

export async function disableModule(moduleName: string): Promise<void> {
  try {
    const engine = await getEngineInstance();
    await engine.modules.disable(moduleName);
    
    console.log(chalk.green(`✅ Module '${moduleName}' disabled successfully`));
    
  } catch (error) {
    console.error(chalk.red(`❌ Failed to disable module '${moduleName}':`), error);
  }
}

/**
 * Development commands
 */
export async function developmentMode(): Promise<void> {
  try {
    console.log(chalk.blue('🔧 Starting NebulaForge X in development mode...'));
    
    const engine = await getEngineInstance();
    
    // Set development-specific configurations
    engine.stateManager.set('development:mode', true);
    engine.stateManager.set('development:hotReload', true);
    
    await engine.initialize();
    await engine.start();
    
    console.log(chalk.green('✅ Development mode started'));
    console.log(chalk.yellow('Features enabled:'));
    console.log('  • Hot reloading');
    console.log('  • Debug logging');
    console.log('  • Module reloading');
    
    // Keep process running with additional development features
    console.log(chalk.blue('\nDevelopment server is running. Press Ctrl+C to stop.'));
    
    process.on('SIGINT', async () => {
      console.log(chalk.blue('\n🛑 Stopping development server...'));
      await engine.shutdown();
      process.exit(0);
    });
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to start development mode:'), error);
    process.exit(1);
  }
}

// Helper functions

function getStateEmoji(state: string): string {
  switch (state) {
    case 'boot': return '🔄';
    case 'init': return '⚙️';
    case 'run': return '✅';
    case 'pause': return '⏸️';
    case 'terminate': return '🛑';
    default: return '❓';
  }
}

/**
 * Export all engine commands for use in the main CLI
 */
export const engineCommands = {
  run: runEngine,
  init: initEngine,
  status: statusEngine,
  stop: stopEngine,
  pause: pauseEngine,
  resume: resumeEngine,
  dev: developmentMode,
  modules: {
    list: listModules,
    enable: enableModule,
    disable: disableModule
  }
};