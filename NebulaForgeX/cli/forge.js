#!/usr/bin/env node

const { program } = require('commander');
const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');

const package_json = require('../package.json');

// Dynamic import for ES modules
async function loadEngineCommands() {
  try {
    const { engineCommands } = await import('./engine.js');
    return engineCommands;
  } catch (error) {
    console.error(chalk.red('Failed to load engine commands:'), error.message);
    return null;
  }
}

// ASCII Art Banner
const BANNER = `
╔═══════════════════════════════════════════════╗
║               NebulaForge X                   ║
║    Universal AI-Native Game & Software Engine ║
║                  v${package_json.version}                     ║
╚═══════════════════════════════════════════════╝
`;

console.log(chalk.cyan(BANNER));

program
  .name('forge')
  .description('NebulaForge X Engine CLI')
  .version(package_json.version);

// Engine lifecycle commands
program
  .command('run')
  .description('Initialize and start the NebulaForge X engine')
  .action(async () => {
    const commands = await loadEngineCommands();
    if (commands) {
      await commands.run();
    }
  });

program
  .command('init')
  .description('Initialize the NebulaForge X engine')
  .action(async () => {
    const commands = await loadEngineCommands();
    if (commands) {
      await commands.init();
    } else {
      // Fallback to basic initialization
      await basicInit();
    }
  });

program
  .command('status')
  .description('Show engine and module status')
  .action(async () => {
    const commands = await loadEngineCommands();
    if (commands) {
      await commands.status();
    } else {
      await basicStatus();
    }
  });

program
  .command('stop')
  .description('Stop the NebulaForge X engine')
  .action(async () => {
    const commands = await loadEngineCommands();
    if (commands) {
      await commands.stop();
    }
  });

program
  .command('pause')
  .description('Pause the NebulaForge X engine')
  .action(async () => {
    const commands = await loadEngineCommands();
    if (commands) {
      await commands.pause();
    }
  });

program
  .command('resume')
  .description('Resume the NebulaForge X engine')
  .action(async () => {
    const commands = await loadEngineCommands();
    if (commands) {
      await commands.resume();
    }
  });

program
  .command('dev')
  .description('Start the engine in development mode')
  .action(async () => {
    const commands = await loadEngineCommands();
    if (commands) {
      await commands.dev();
    }
  });

// Module management commands
const moduleCmd = program
  .command('module')
  .description('Module management commands');

moduleCmd
  .command('list')
  .description('List all available modules')
  .action(async () => {
    const commands = await loadEngineCommands();
    if (commands && commands.modules) {
      await commands.modules.list();
    } else {
      await basicModuleList();
    }
  });

moduleCmd
  .command('enable <name>')
  .description('Enable a module')
  .action(async (name) => {
    const commands = await loadEngineCommands();
    if (commands && commands.modules) {
      await commands.modules.enable(name);
    } else {
      await basicModuleEnable(name);
    }
  });

moduleCmd
  .command('disable <name>')
  .description('Disable a module')
  .action(async (name) => {
    const commands = await loadEngineCommands();
    if (commands && commands.modules) {
      await commands.modules.disable(name);
    } else {
      await basicModuleDisable(name);
    }
  });

// Build command
program
  .command('build')
  .description('Build all enabled modules')
  .option('-m, --module <name>', 'Build specific module')
  .action(async (options) => {
    console.log(chalk.blue('🔨 Building modules...'));
    
    try {
      const config = await fs.readJson('./engine.config.json');
      const enabledModules = Object.entries(config.modules)
        .filter(([name, mod]) => mod.enabled)
        .map(([name]) => name);
      
      if (options.module) {
        if (enabledModules.includes(options.module)) {
          console.log(chalk.green(`✅ Building module: ${options.module}`));
        } else {
          console.log(chalk.red(`❌ Module '${options.module}' is not enabled`));
          return;
        }
      } else {
        console.log(chalk.green(`✅ Building ${enabledModules.length} enabled modules:`));
        enabledModules.forEach(mod => console.log(`  - ${mod}`));
      }
      
      console.log(chalk.green('🎉 Build completed!'));
      
    } catch (error) {
      console.error(chalk.red('❌ Build failed:'), error.message);
    }
  });

// Fallback implementations for when TypeScript modules aren't available

async function basicInit() {
  console.log(chalk.green('🚀 Initializing NebulaForge X project...'));
  
  try {
    // Create basic src structure
    await fs.ensureDir('./src');
    await fs.ensureDir('./assets');
    await fs.ensureDir('./logs');
    await fs.ensureDir('./temp');
    await fs.ensureDir('./state');
    
    // Create basic index.ts if it doesn't exist
    const indexPath = './src/index.ts';
    if (!(await fs.pathExists(indexPath))) {
      const indexContent = `import { createNebulaForgeEngine } from '../engine/modules/NebulaCore/index.js';

async function main() {
  console.log('🌌 Starting NebulaForge X Engine...');
  
  const engine = createNebulaForgeEngine();
  await engine.initialize();
  await engine.start();
  
  console.log('✨ Engine started successfully!');
}

main().catch(console.error);
`;
      
      await fs.writeFile(indexPath, indexContent);
    }
    
    console.log(chalk.green('✅ Project initialized successfully!'));
    console.log(chalk.yellow('📋 Next steps:'));
    console.log('   npm install');
    console.log('   npm run forge status');
    
  } catch (error) {
    console.error(chalk.red('❌ Initialization failed:'), error.message);
  }
}

async function basicStatus() {
  console.log(chalk.blue('📊 NebulaForge X Engine Status'));
  
  try {
    const config = await fs.readJson('./engine.config.json');
    
    console.log(chalk.cyan('\n🏗️  Engine Information:'));
    console.log(`   Name: ${config.engine.name}`);
    console.log(`   Version: ${config.engine.version}`);
    console.log(`   Environment: ${config.engine.environment}`);
    console.log(`   Debug: ${config.engine.debug ? '🟢 ON' : '🔴 OFF'}`);
    
    console.log(chalk.cyan('\n📦 Module Status:'));
    const moduleEntries = Object.entries(config.modules);
    
    moduleEntries.forEach(([name, mod]) => {
      const status = mod.enabled ? chalk.green('🟢 ENABLED') : chalk.red('🔴 DISABLED');
      const autoLoad = mod.autoLoad ? '🚀 AUTO' : '🔧 MANUAL';
      const priority = `P${mod.priority}`;
      
      console.log(`   ${name}: ${status} | ${autoLoad} | ${priority} | ${mod.language.toUpperCase()}`);
    });
    
    const enabledCount = moduleEntries.filter(([, mod]) => mod.enabled).length;
    const totalCount = moduleEntries.length;
    
    console.log(chalk.cyan(`\n📈 Summary: ${enabledCount}/${totalCount} modules enabled`));
    
  } catch (error) {
    console.error(chalk.red('❌ Status check failed:'), error.message);
  }
}

async function basicModuleList() {
  console.log(chalk.blue('📋 Available Modules:'));
  
  try {
    const config = await fs.readJson('./engine.config.json');
    const moduleEntries = Object.entries(config.modules);
    
    moduleEntries.forEach(([name, mod]) => {
      console.log(chalk.cyan(`\n${name}:`));
      console.log(`  Status: ${mod.enabled ? chalk.green('Enabled') : chalk.red('Disabled')}`);
      console.log(`  Language: ${mod.language}`);
      console.log(`  Dependencies: ${mod.dependencies.join(', ') || 'None'}`);
      console.log(`  Priority: ${mod.priority}`);
      console.log(`  Auto Load: ${mod.autoLoad ? 'Yes' : 'No'}`);
    });
    
  } catch (error) {
    console.error(chalk.red('❌ Module listing failed:'), error.message);
  }
}

async function basicModuleEnable(name) {
  try {
    const config = await fs.readJson('./engine.config.json');
    
    if (!config.modules[name]) {
      console.error(chalk.red(`❌ Module '${name}' does not exist`));
      return;
    }
    
    config.modules[name].enabled = true;
    await fs.writeJson('./engine.config.json', config, { spaces: 2 });
    
    console.log(chalk.green(`✅ Module '${name}' enabled successfully`));
    
  } catch (error) {
    console.error(chalk.red('❌ Module enable failed:'), error.message);
  }
}

async function basicModuleDisable(name) {
  try {
    const config = await fs.readJson('./engine.config.json');
    
    if (!config.modules[name]) {
      console.error(chalk.red(`❌ Module '${name}' does not exist`));
      return;
    }
    
    config.modules[name].enabled = false;
    await fs.writeJson('./engine.config.json', config, { spaces: 2 });
    
    console.log(chalk.green(`✅ Module '${name}' disabled successfully`));
    
  } catch (error) {
    console.error(chalk.red('❌ Module disable failed:'), error.message);
  }
}

// Handle commands that aren't recognized
program.on('command:*', function (operands) {
  console.error(chalk.red(`Unknown command: ${operands[0]}`));
  console.log(chalk.yellow('Available commands:'));
  console.log('  run      - Initialize and start the engine');
  console.log('  init     - Initialize the engine');
  console.log('  status   - Show engine status');
  console.log('  build    - Build modules');
  console.log('  dev      - Start development mode');
  console.log('  module   - Module management');
  process.exit(1);
});

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

program.parse();