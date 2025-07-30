const fs = require('fs');
const path = require('path');

class AuraliteTranspiler {
  constructor() {
    this.grammar = this.loadGrammar();
    this.tokens = [];
    this.ast = null;
    this.output = '';
  }

  loadGrammar() {
    // Auralite grammar rules
    return {
      keywords: [
        'create', 'build', 'generate', 'make', 'new',
        'function', 'method', 'class', 'object', 'data',
        'if', 'when', 'unless', 'else', 'then',
        'loop', 'repeat', 'for', 'while', 'each',
        'return', 'give', 'send', 'output',
        'import', 'use', 'require', 'include',
        'export', 'share', 'publish',
        'try', 'catch', 'handle', 'error',
        'async', 'await', 'promise', 'future',
        'test', 'validate', 'check', 'assert'
      ],
      
      operators: [
        '=', '+=', '-=', '*=', '/=', '%=',
        '==', '===', '!=', '!==',
        '<', '>', '<=', '>=',
        '+', '-', '*', '/', '%',
        '&&', '||', '!',
        '->', '=>', '::', '..'
      ],
      
      symbols: [
        '(', ')', '[', ']', '{', '}', ';', ',', '.', ':',
        '@', '#', '$', '&', '|', '^', '~', '?', '!'
      ],
      
      patterns: {
        // Natural language patterns
        'create a function': 'function',
        'build a class': 'class',
        'make an object': 'object',
        'generate data': 'data',
        'when condition': 'if',
        'unless condition': 'if (!condition)',
        'loop through': 'for',
        'repeat until': 'while',
        'give back': 'return',
        'send output': 'console.log',
        'use module': 'import',
        'share function': 'export',
        'try to': 'try',
        'handle error': 'catch',
        'wait for': 'await',
        'test that': 'assert'
      }
    };
  }

  async transpile(auraliteCode) {
    console.log('🔄 Transpiling Auralite code...');
    
    try {
      // Tokenize the input
      this.tokens = this.tokenize(auraliteCode);
      
      // Parse into AST
      this.ast = this.parse(this.tokens);
      
      // Generate JavaScript
      this.output = this.generate(this.ast);
      
      console.log('✅ Auralite transpilation complete');
      return this.output;
      
    } catch (error) {
      console.error('❌ Auralite transpilation failed:', error);
      throw error;
    }
  }

  tokenize(input) {
    const tokens = [];
    const lines = input.split('\n');
    
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum].trim();
      if (!line || line.startsWith('//')) continue;
      
      const lineTokens = this.tokenizeLine(line, lineNum + 1);
      tokens.push(...lineTokens);
    }
    
    return tokens;
  }

  tokenizeLine(line, lineNumber) {
    const tokens = [];
    const words = line.split(/\s+/);
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      
      if (!word) continue;
      
      // Check for patterns first
      const pattern = this.findPattern(words, i);
      if (pattern) {
        tokens.push({
          type: 'pattern',
          value: pattern,
          line: lineNumber,
          column: i
        });
        i += pattern.split(' ').length - 1;
        continue;
      }
      
      // Check for keywords
      if (this.grammar.keywords.includes(word.toLowerCase())) {
        tokens.push({
          type: 'keyword',
          value: word.toLowerCase(),
          line: lineNumber,
          column: i
        });
        continue;
      }
      
      // Check for operators
      if (this.grammar.operators.includes(word)) {
        tokens.push({
          type: 'operator',
          value: word,
          line: lineNumber,
          column: i
        });
        continue;
      }
      
      // Check for symbols
      if (this.grammar.symbols.includes(word)) {
        tokens.push({
          type: 'symbol',
          value: word,
          line: lineNumber,
          column: i
        });
        continue;
      }
      
      // Check for strings
      if (word.startsWith('"') || word.startsWith("'")) {
        tokens.push({
          type: 'string',
          value: word,
          line: lineNumber,
          column: i
        });
        continue;
      }
      
      // Check for numbers
      if (/^\d+(\.\d+)?$/.test(word)) {
        tokens.push({
          type: 'number',
          value: parseFloat(word),
          line: lineNumber,
          column: i
        });
        continue;
      }
      
      // Default to identifier
      tokens.push({
        type: 'identifier',
        value: word,
        line: lineNumber,
        column: i
      });
    }
    
    return tokens;
  }

  findPattern(words, startIndex) {
    for (let length = 4; length >= 1; length--) {
      const phrase = words.slice(startIndex, startIndex + length).join(' ').toLowerCase();
      if (this.grammar.patterns[phrase]) {
        return phrase;
      }
    }
    return null;
  }

  parse(tokens) {
    const ast = {
      type: 'program',
      body: []
    };
    
    let i = 0;
    while (i < tokens.length) {
      const node = this.parseStatement(tokens, i);
      if (node) {
        ast.body.push(node.statement);
        i = node.nextIndex;
      } else {
        i++;
      }
    }
    
    return ast;
  }

  parseStatement(tokens, startIndex) {
    const token = tokens[startIndex];
    
    if (!token) return null;
    
    // Parse function declaration
    if (token.type === 'keyword' && token.value === 'create') {
      return this.parseFunctionDeclaration(tokens, startIndex);
    }
    
    // Parse class declaration
    if (token.type === 'keyword' && token.value === 'build') {
      return this.parseClassDeclaration(tokens, startIndex);
    }
    
    // Parse conditional statement
    if (token.type === 'keyword' && (token.value === 'when' || token.value === 'unless')) {
      return this.parseConditional(tokens, startIndex);
    }
    
    // Parse loop
    if (token.type === 'keyword' && (token.value === 'loop' || token.value === 'repeat')) {
      return this.parseLoop(tokens, startIndex);
    }
    
    // Parse expression
    return this.parseExpression(tokens, startIndex);
  }

  parseFunctionDeclaration(tokens, startIndex) {
    let i = startIndex + 1; // Skip 'create'
    
    // Look for 'function' or 'method'
    while (i < tokens.length && tokens[i].type !== 'keyword') i++;
    
    if (i >= tokens.length || !['function', 'method'].includes(tokens[i].value)) {
      throw new Error('Expected function or method keyword');
    }
    
    i++; // Skip function/method keyword
    
    // Get function name
    if (i >= tokens.length || tokens[i].type !== 'identifier') {
      throw new Error('Expected function name');
    }
    
    const functionName = tokens[i].value;
    i++;
    
    // Parse parameters (simplified)
    const parameters = [];
    if (i < tokens.length && tokens[i].value === '(') {
      i++;
      while (i < tokens.length && tokens[i].value !== ')') {
        if (tokens[i].type === 'identifier') {
          parameters.push(tokens[i].value);
        }
        i++;
      }
      if (i < tokens.length) i++; // Skip ')'
    }
    
    // Parse body (simplified)
    const body = [];
    while (i < tokens.length && tokens[i].value !== 'end') {
      const statement = this.parseStatement(tokens, i);
      if (statement) {
        body.push(statement.statement);
        i = statement.nextIndex;
      } else {
        i++;
      }
    }
    
    return {
      statement: {
        type: 'function_declaration',
        name: functionName,
        parameters,
        body
      },
      nextIndex: i + 1
    };
  }

  parseClassDeclaration(tokens, startIndex) {
    let i = startIndex + 1; // Skip 'build'
    
    // Look for 'class'
    while (i < tokens.length && tokens[i].type !== 'keyword') i++;
    
    if (i >= tokens.length || tokens[i].value !== 'class') {
      throw new Error('Expected class keyword');
    }
    
    i++; // Skip class keyword
    
    // Get class name
    if (i >= tokens.length || tokens[i].type !== 'identifier') {
      throw new Error('Expected class name');
    }
    
    const className = tokens[i].value;
    i++;
    
    // Parse methods (simplified)
    const methods = [];
    while (i < tokens.length && tokens[i].value !== 'end') {
      const method = this.parseStatement(tokens, i);
      if (method) {
        methods.push(method.statement);
        i = method.nextIndex;
      } else {
        i++;
      }
    }
    
    return {
      statement: {
        type: 'class_declaration',
        name: className,
        methods
      },
      nextIndex: i + 1
    };
  }

  parseConditional(tokens, startIndex) {
    const isUnless = tokens[startIndex].value === 'unless';
    let i = startIndex + 1;
    
    // Parse condition (simplified)
    const condition = [];
    while (i < tokens.length && tokens[i].value !== 'then') {
      condition.push(tokens[i]);
      i++;
    }
    
    if (i >= tokens.length) {
      throw new Error('Expected then keyword');
    }
    
    i++; // Skip 'then'
    
    // Parse body
    const body = [];
    while (i < tokens.length && tokens[i].value !== 'end') {
      const statement = this.parseStatement(tokens, i);
      if (statement) {
        body.push(statement.statement);
        i = statement.nextIndex;
      } else {
        i++;
      }
    }
    
    return {
      statement: {
        type: 'conditional',
        condition: this.tokensToExpression(condition),
        body,
        isUnless
      },
      nextIndex: i + 1
    };
  }

  parseLoop(tokens, startIndex) {
    const isRepeat = tokens[startIndex].value === 'repeat';
    let i = startIndex + 1;
    
    // Parse condition/range (simplified)
    const condition = [];
    while (i < tokens.length && tokens[i].value !== 'do') {
      condition.push(tokens[i]);
      i++;
    }
    
    if (i >= tokens.length) {
      throw new Error('Expected do keyword');
    }
    
    i++; // Skip 'do'
    
    // Parse body
    const body = [];
    while (i < tokens.length && tokens[i].value !== 'end') {
      const statement = this.parseStatement(tokens, i);
      if (statement) {
        body.push(statement.statement);
        i = statement.nextIndex;
      } else {
        i++;
      }
    }
    
    return {
      statement: {
        type: 'loop',
        condition: this.tokensToExpression(condition),
        body,
        isRepeat
      },
      nextIndex: i + 1
    };
  }

  parseExpression(tokens, startIndex) {
    // Simplified expression parsing
    const expression = [];
    let i = startIndex;
    
    while (i < tokens.length && tokens[i].value !== ';' && tokens[i].value !== 'end') {
      expression.push(tokens[i]);
      i++;
    }
    
    return {
      statement: {
        type: 'expression',
        value: this.tokensToExpression(expression)
      },
      nextIndex: i + 1
    };
  }

  tokensToExpression(tokens) {
    return tokens.map(t => t.value).join(' ');
  }

  generate(ast) {
    let output = '';
    
    for (const node of ast.body) {
      output += this.generateNode(node) + '\n';
    }
    
    return output;
  }

  generateNode(node) {
    switch (node.type) {
      case 'function_declaration':
        return this.generateFunction(node);
      case 'class_declaration':
        return this.generateClass(node);
      case 'conditional':
        return this.generateConditional(node);
      case 'loop':
        return this.generateLoop(node);
      case 'expression':
        return this.generateExpression(node);
      default:
        return `// Unknown node type: ${node.type}`;
    }
  }

  generateFunction(node) {
    let output = `function ${node.name}(`;
    
    if (node.parameters.length > 0) {
      output += node.parameters.join(', ');
    }
    
    output += ') {\n';
    
    for (const statement of node.body) {
      output += '  ' + this.generateNode(statement) + '\n';
    }
    
    output += '}';
    return output;
  }

  generateClass(node) {
    let output = `class ${node.name} {\n`;
    
    for (const method of node.methods) {
      output += '  ' + this.generateNode(method) + '\n';
    }
    
    output += '}';
    return output;
  }

  generateConditional(node) {
    let output = '';
    
    if (node.isUnless) {
      output += `if (!(${node.condition})) {\n`;
    } else {
      output += `if (${node.condition}) {\n`;
    }
    
    for (const statement of node.body) {
      output += '  ' + this.generateNode(statement) + '\n';
    }
    
    output += '}';
    return output;
  }

  generateLoop(node) {
    let output = '';
    
    if (node.isRepeat) {
      output += `while (${node.condition}) {\n`;
    } else {
      output += `for (let item of ${node.condition}) {\n`;
    }
    
    for (const statement of node.body) {
      output += '  ' + this.generateNode(statement) + '\n';
    }
    
    output += '}';
    return output;
  }

  generateExpression(node) {
    // Convert Auralite patterns to JavaScript
    let expression = node.value;
    
    // Replace common patterns
    expression = expression.replace(/create a function (\w+)/g, 'function $1()');
    expression = expression.replace(/build a class (\w+)/g, 'class $1');
    expression = expression.replace(/when (.+) then/g, 'if ($1)');
    expression = expression.replace(/unless (.+) then/g, 'if (!$1)');
    expression = expression.replace(/loop through (.+)/g, 'for (let item of $1)');
    expression = expression.replace(/repeat until (.+)/g, 'while (!$1)');
    expression = expression.replace(/give back (.+)/g, 'return $1');
    expression = expression.replace(/send output (.+)/g, 'console.log($1)');
    expression = expression.replace(/use (.+)/g, 'import $1');
    expression = expression.replace(/share (.+)/g, 'export $1');
    expression = expression.replace(/try to (.+)/g, 'try { $1 }');
    expression = expression.replace(/handle error (.+)/g, 'catch (error) { $1 }');
    expression = expression.replace(/wait for (.+)/g, 'await $1');
    expression = expression.replace(/test that (.+)/g, 'assert($1)');
    
    return expression + ';';
  }
}

module.exports = AuraliteTranspiler;