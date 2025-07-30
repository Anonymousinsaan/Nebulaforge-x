const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

class LogicBrain {
  constructor(dataStorage) {
    this.dataStorage = dataStorage;
    this.context = {
      currentProject: null,
      recentFiles: [],
      userPreferences: {},
      conversationHistory: [],
      systemState: 'ready'
    };
    this.promptHistory = [];
    this.learningPatterns = new Map();
  }

  async initialize() {
    console.log('🧠 Initializing LogicBrain...');
    
    // Load existing context and history
    await this.loadContext();
    
    // Initialize learning patterns
    await this.initializeLearningPatterns();
    
    console.log('✅ LogicBrain initialized');
  }

  async loadContext() {
    try {
      const savedContext = await this.dataStorage.load('logicbrain_context');
      if (savedContext) {
        this.context = { ...this.context, ...savedContext };
      }
      
      const savedHistory = await this.dataStorage.load('prompt_history');
      if (savedHistory) {
        this.promptHistory = savedHistory;
      }
    } catch (error) {
      console.log('No existing context found, starting fresh');
    }
  }

  async initializeLearningPatterns() {
    // Load learned patterns from storage
    const patterns = await this.dataStorage.load('learning_patterns');
    if (patterns) {
      this.learningPatterns = new Map(Object.entries(patterns));
    }
  }

  async processPrompt(prompt, options = {}) {
    const promptId = crypto.randomUUID();
    const timestamp = Date.now();
    
    console.log(`🧠 Processing prompt: ${prompt.substring(0, 50)}...`);
    
    // Create prompt context
    const promptContext = {
      id: promptId,
      timestamp,
      prompt,
      options,
      context: { ...this.context },
      result: null,
      success: false
    };

    try {
      // Analyze prompt intent
      const intent = await this.analyzeIntent(prompt);
      
      // Route to appropriate handler
      const result = await this.routePrompt(prompt, intent, options);
      
      // Update prompt context
      promptContext.result = result;
      promptContext.success = true;
      promptContext.intent = intent;
      
      // Learn from this interaction
      await this.learnFromPrompt(promptContext);
      
      // Update conversation history
      this.context.conversationHistory.push({
        timestamp,
        prompt,
        response: result,
        intent
      });
      
      // Keep history manageable
      if (this.context.conversationHistory.length > 100) {
        this.context.conversationHistory = this.context.conversationHistory.slice(-50);
      }
      
      // Save context
      await this.saveContext();
      
      return {
        success: true,
        result,
        intent,
        context: this.context
      };
      
    } catch (error) {
      console.error('❌ LogicBrain processing failed:', error);
      
      promptContext.error = error.message;
      promptContext.success = false;
      
      await this.learnFromPrompt(promptContext);
      
      return {
        success: false,
        error: error.message,
        intent: 'error'
      };
    }
  }

  async analyzeIntent(prompt) {
    const lowerPrompt = prompt.toLowerCase();
    
    // Basic intent classification
    if (lowerPrompt.includes('create') || lowerPrompt.includes('new') || lowerPrompt.includes('generate')) {
      return 'creation';
    } else if (lowerPrompt.includes('debug') || lowerPrompt.includes('fix') || lowerPrompt.includes('error')) {
      return 'debugging';
    } else if (lowerPrompt.includes('explain') || lowerPrompt.includes('what') || lowerPrompt.includes('how')) {
      return 'explanation';
    } else if (lowerPrompt.includes('refactor') || lowerPrompt.includes('optimize') || lowerPrompt.includes('improve')) {
      return 'refactoring';
    } else if (lowerPrompt.includes('test') || lowerPrompt.includes('validate')) {
      return 'testing';
    } else if (lowerPrompt.includes('run') || lowerPrompt.includes('execute') || lowerPrompt.includes('start')) {
      return 'execution';
    } else {
      return 'general';
    }
  }

  async routePrompt(prompt, intent, options) {
    switch (intent) {
      case 'creation':
        return await this.handleCreation(prompt, options);
      case 'debugging':
        return await this.handleDebugging(prompt, options);
      case 'explanation':
        return await this.handleExplanation(prompt, options);
      case 'refactoring':
        return await this.handleRefactoring(prompt, options);
      case 'testing':
        return await this.handleTesting(prompt, options);
      case 'execution':
        return await this.handleExecution(prompt, options);
      default:
        return await this.handleGeneral(prompt, options);
    }
  }

  async handleCreation(prompt, options) {
    return {
      type: 'creation',
      message: 'I can help you create new code, projects, or components. What would you like to create?',
      suggestions: [
        'Create a new React component',
        'Generate a Node.js API',
        'Create a database schema',
        'Generate test files'
      ],
      action: 'await_user_input'
    };
  }

  async handleDebugging(prompt, options) {
    return {
      type: 'debugging',
      message: 'I can help you debug code issues. Please share the error or code you\'d like me to examine.',
      suggestions: [
        'Analyze error messages',
        'Check code syntax',
        'Review logic flow',
        'Suggest fixes'
      ],
      action: 'await_user_input'
    };
  }

  async handleExplanation(prompt, options) {
    return {
      type: 'explanation',
      message: 'I can explain code concepts, patterns, or help you understand how things work.',
      suggestions: [
        'Explain code structure',
        'Describe algorithms',
        'Clarify concepts',
        'Provide examples'
      ],
      action: 'await_user_input'
    };
  }

  async handleRefactoring(prompt, options) {
    return {
      type: 'refactoring',
      message: 'I can help you refactor and optimize your code for better performance and maintainability.',
      suggestions: [
        'Optimize performance',
        'Improve readability',
        'Reduce complexity',
        'Apply best practices'
      ],
      action: 'await_user_input'
    };
  }

  async handleTesting(prompt, options) {
    return {
      type: 'testing',
      message: 'I can help you create tests and validate your code.',
      suggestions: [
        'Generate unit tests',
        'Create integration tests',
        'Set up test framework',
        'Validate test coverage'
      ],
      action: 'await_user_input'
    };
  }

  async handleExecution(prompt, options) {
    return {
      type: 'execution',
      message: 'I can help you run and execute code.',
      suggestions: [
        'Run current file',
        'Execute project',
        'Start development server',
        'Run tests'
      ],
      action: 'await_user_input'
    };
  }

  async handleGeneral(prompt, options) {
    return {
      type: 'general',
      message: 'I\'m here to help with your development tasks. What would you like to work on?',
      suggestions: [
        'Create new project',
        'Open existing project',
        'View system status',
        'Access LogicBrain console'
      ],
      action: 'await_user_input'
    };
  }

  async learnFromPrompt(promptContext) {
    // Add to prompt history
    this.promptHistory.push(promptContext);
    
    // Keep history manageable
    if (this.promptHistory.length > 1000) {
      this.promptHistory = this.promptHistory.slice(-500);
    }
    
    // Extract patterns for learning
    const pattern = this.extractPattern(promptContext);
    if (pattern) {
      this.learningPatterns.set(pattern.key, pattern);
    }
    
    // Save learning data
    await this.dataStorage.save('prompt_history', this.promptHistory);
    await this.dataStorage.save('learning_patterns', Object.fromEntries(this.learningPatterns));
  }

  extractPattern(promptContext) {
    const { prompt, intent, success } = promptContext;
    
    // Simple pattern extraction based on keywords and intent
    const keywords = prompt.toLowerCase().split(' ').filter(word => word.length > 3);
    const key = `${intent}_${keywords.slice(0, 3).join('_')}`;
    
    return {
      key,
      intent,
      keywords,
      success,
      frequency: 1,
      lastUsed: Date.now()
    };
  }

  updateContext(update) {
    this.context = { ...this.context, ...update };
  }

  async saveContext() {
    await this.dataStorage.save('logicbrain_context', this.context);
  }

  getContext() {
    return this.context;
  }

  getPromptHistory() {
    return this.promptHistory;
  }

  getLearningPatterns() {
    return Array.from(this.learningPatterns.values());
  }

  async resetContext() {
    this.context = {
      currentProject: null,
      recentFiles: [],
      userPreferences: {},
      conversationHistory: [],
      systemState: 'ready'
    };
    await this.saveContext();
  }
}

module.exports = LogicBrain;