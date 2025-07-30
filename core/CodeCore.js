const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

class CodeCore {
  constructor(logicBrain, dataStorage) {
    this.logicBrain = logicBrain;
    this.dataStorage = dataStorage;
    this.editors = new Map();
    this.activeProject = null;
    this.executionHistory = [];
  }

  async initialize() {
    console.log('🔧 Initializing CodeCore...');
    
    // Initialize project workspace
    await this.initializeWorkspace();
    
    // Set up file watchers
    this.setupFileWatchers();
    
    console.log('✅ CodeCore initialized');
  }

  async initializeWorkspace() {
    const workspacePath = path.join(process.cwd(), 'workspace');
    if (!fs.existsSync(workspacePath)) {
      fs.mkdirSync(workspacePath, { recursive: true });
    }
    
    // Create default project structure
    const defaultProject = {
      name: 'aurora-project',
      path: path.join(workspacePath, 'aurora-project'),
      files: [],
      config: {
        language: 'javascript',
        framework: 'node',
        auralite: false
      }
    };
    
    await this.createProject(defaultProject);
  }

  async createProject(projectConfig) {
    const projectPath = projectConfig.path;
    
    if (!fs.existsSync(projectPath)) {
      fs.mkdirSync(projectPath, { recursive: true });
    }

    // Create default project structure
    const defaultFiles = [
      { name: 'main.js', content: '// AURORA IDE Project\nconsole.log("Hello from AURORA IDE!");' },
      { name: 'package.json', content: JSON.stringify({
        name: projectConfig.name,
        version: '1.0.0',
        description: 'AURORA IDE Project',
        main: 'main.js',
        scripts: {
          start: 'node main.js',
          test: 'echo "No tests specified"'
        }
      }, null, 2) },
      { name: 'README.md', content: '# AURORA IDE Project\n\nThis project was created with AURORA IDE.' }
    ];

    for (const file of defaultFiles) {
      const filePath = path.join(projectPath, file.name);
      fs.writeFileSync(filePath, file.content);
    }

    this.activeProject = {
      ...projectConfig,
      files: defaultFiles.map(f => f.name)
    };

    await this.dataStorage.save('active_project', this.activeProject);
    console.log(`📁 Project created: ${projectConfig.name}`);
  }

  async execute(code, language = 'javascript') {
    try {
      console.log(`🚀 Executing code in ${language}...`);
      
      // Log execution for learning
      this.executionHistory.push({
        timestamp: Date.now(),
        language,
        code,
        success: false
      });

      let result;
      
      switch (language) {
        case 'javascript':
          result = await this.executeJavaScript(code);
          break;
        case 'auralite':
          result = await this.executeAuralite(code);
          break;
        default:
          throw new Error(`Unsupported language: ${language}`);
      }

      // Update execution history
      this.executionHistory[this.executionHistory.length - 1].success = true;
      this.executionHistory[this.executionHistory.length - 1].result = result;

      // Save to storage for learning
      await this.dataStorage.save('execution_history', this.executionHistory);

      return {
        success: true,
        result,
        output: result.toString()
      };

    } catch (error) {
      console.error('❌ Code execution failed:', error);
      
      this.executionHistory[this.executionHistory.length - 1].error = error.message;
      await this.dataStorage.save('execution_history', this.executionHistory);

      return {
        success: false,
        error: error.message,
        output: error.stack
      };
    }
  }

  async executeJavaScript(code) {
    // Create a safe execution environment
    const vm = require('vm');
    const context = {
      console: {
        log: (...args) => {
          console.log('📤 Output:', ...args);
          return args.join(' ');
        },
        error: (...args) => {
          console.error('❌ Error:', ...args);
          return args.join(' ');
        }
      },
      setTimeout,
      setInterval,
      clearTimeout,
      clearInterval
    };

    const script = new vm.Script(code);
    const result = script.runInNewContext(context, { timeout: 5000 });
    return result;
  }

  async executeAuralite(code) {
    // For now, transpile Auralite to JavaScript and execute
    const AuraliteTranspiler = require('../auralite/auralite_transpiler');
    const transpiler = new AuraliteTranspiler();
    
    const javascriptCode = await transpiler.transpile(code);
    return await this.executeJavaScript(javascriptCode);
  }

  setupFileWatchers() {
    if (this.activeProject) {
      const projectPath = this.activeProject.path;
      
      fs.watch(projectPath, { recursive: true }, (eventType, filename) => {
        if (filename) {
          console.log(`📝 File changed: ${filename}`);
          this.handleFileChange(eventType, filename);
        }
      });
    }
  }

  handleFileChange(eventType, filename) {
    // Notify LogicBrain about file changes for context awareness
    this.logicBrain.updateContext({
      type: 'file_change',
      event: eventType,
      file: filename,
      project: this.activeProject.name
    });
  }

  async openFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return {
        success: true,
        content,
        path: filePath
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async saveFile(filePath, content) {
    try {
      fs.writeFileSync(filePath, content, 'utf8');
      return {
        success: true,
        path: filePath
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  getExecutionHistory() {
    return this.executionHistory;
  }

  getActiveProject() {
    return this.activeProject;
  }

  async getProjectFiles(projectPath) {
    try {
      const files = [];
      const items = fs.readdirSync(projectPath);
      
      for (const item of items) {
        const fullPath = path.join(projectPath, item);
        const stat = fs.statSync(fullPath);
        
        files.push({
          name: item,
          path: fullPath,
          isDirectory: stat.isDirectory(),
          size: stat.size,
          modified: stat.mtime
        });
      }
      
      return files;
    } catch (error) {
      console.error('Error reading project files:', error);
      return [];
    }
  }
}

module.exports = CodeCore;