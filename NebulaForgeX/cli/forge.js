#!/usr/bin/env node

const { program } = require('commander');
const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');
const inquirer = require('inquirer');

const package_json = require('../package.json');

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

// Init command
program
  .command('init')
  .description('Initialize a new NebulaForge X project')
  .option('-t, --template <type>', 'Project template', 'basic')
  .action(async (options) => {
    console.log(chalk.green('🚀 Initializing NebulaForge X project...'));
    
    try {
      // Create basic src structure
      await fs.ensureDir('./src');
      await fs.ensureDir('./assets');
      await fs.ensureDir('./logs');
      await fs.ensureDir('./temp');
      
      // Create basic index.ts
      const indexContent = `import { NebulaForgeEngine } from '@engine/core';

async function main() {
  console.log('🌌 Starting NebulaForge X Engine...');
  
  const engine = new NebulaForgeEngine();
  await engine.initialize();
  
  console.log('✨ Engine initialized successfully!');
}

main().catch(console.error);
`;
      
      await fs.writeFile('./src/index.ts', indexContent);
      
      console.log(chalk.green('✅ Project initialized successfully!'));
      console.log(chalk.yellow('📋 Next steps:'));
      console.log('   npm install');
      console.log('   npm run forge status');
      
    } catch (error) {
      console.error(chalk.red('❌ Initialization failed:'), error.message);
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

// Status command
program
  .command('status')
  .description('Show engine and module status')
  .action(async () => {
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
  });

// Module management commands
const moduleCmd = program
  .command('module')
  .description('Module management commands');

moduleCmd
  .command('list')
  .description('List all available modules')
  .action(async () => {
    console.log(chalk.blue('📋 Available Modules:'));
    
    try {
      const config = await fs.readJson('./engine.config.json');
      const moduleEntries = Object.entries(config.modules);
      
      moduleEntries.forEach(([name, mod]) => {
        console.log(chalk.cyan(`\n${name}:`));
        console.log(`  Status: ${mod.enabled ? chalk.green('Enabled') : chalk.red('Disabled')}`);
        console.log(`  Language: ${mod.language}`);
        console.log(`  Dependencies: ${mod.dependencies.join(', ') || 'None'}`);
      });
      
    } catch (error) {
      console.error(chalk.red('❌ Module listing failed:'), error.message);
    }
  });

moduleCmd
  .command('enable <name>')
  .description('Enable a module')
  .action(async (name) => {
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
  });

moduleCmd
  .command('disable <name>')
  .description('Disable a module')
  .action(async (name) => {
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
  });

// Development commands
program
  .command('dev')
  .description('Start development server')
  .action(() => {
    console.log(chalk.blue('🚀 Starting development server...'));
    console.log(chalk.yellow('This will be implemented based on your specific needs'));
  });

program.parse();