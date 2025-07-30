const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

class DataStorage {
  constructor() {
    this.dbPath = path.join(process.cwd(), 'data', 'aurora_ide.db');
    this.db = null;
    this.encryptionKey = this.generateEncryptionKey();
  }

  async initialize() {
    console.log('💾 Initializing DataStorage...');
    
    // Ensure data directory exists
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Initialize database
    await this.initializeDatabase();
    
    console.log('✅ DataStorage initialized');
  }

  generateEncryptionKey() {
    // Generate a consistent encryption key based on system info
    const systemInfo = `${process.platform}_${process.arch}_${process.version}`;
    return crypto.createHash('sha256').update(systemInfo).digest('hex').substring(0, 32);
  }

  async initializeDatabase() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Create tables
        this.createTables().then(resolve).catch(reject);
      });
    });
  }

  async createTables() {
    const tables = [
      // Core data storage
      `CREATE TABLE IF NOT EXISTS data_store (
        key TEXT PRIMARY KEY,
        value TEXT,
        encrypted BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Project metadata
      `CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        config TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // File references with encryption
      `CREATE TABLE IF NOT EXISTS file_references (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        file_path TEXT NOT NULL,
        encrypted_path TEXT,
        hash TEXT,
        size INTEGER,
        last_modified DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      )`,
      
      // Execution history
      `CREATE TABLE IF NOT EXISTS execution_history (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        language TEXT,
        code TEXT,
        result TEXT,
        success BOOLEAN,
        error TEXT,
        execution_time INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      )`,
      
      // Learning patterns
      `CREATE TABLE IF NOT EXISTS learning_patterns (
        pattern_key TEXT PRIMARY KEY,
        intent TEXT,
        keywords TEXT,
        success_rate REAL,
        frequency INTEGER DEFAULT 1,
        last_used DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Conversation memory
      `CREATE TABLE IF NOT EXISTS conversation_memory (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        prompt TEXT,
        response TEXT,
        intent TEXT,
        context TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // System analytics
      `CREATE TABLE IF NOT EXISTS system_analytics (
        id TEXT PRIMARY KEY,
        event_type TEXT,
        event_data TEXT,
        user_id TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const table of tables) {
      await this.runQuery(table);
    }
  }

  async runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  async getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  async allQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async save(key, value, options = {}) {
    const { encrypt = false } = options;
    
    let storedValue = value;
    if (typeof value === 'object') {
      storedValue = JSON.stringify(value);
    }
    
    if (encrypt) {
      storedValue = this.encrypt(storedValue);
    }
    
    const sql = `
      INSERT OR REPLACE INTO data_store (key, value, encrypted, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `;
    
    await this.runQuery(sql, [key, storedValue, encrypt]);
    
    return { success: true, key };
  }

  async load(key) {
    const sql = 'SELECT value, encrypted FROM data_store WHERE key = ?';
    const row = await this.getQuery(sql, [key]);
    
    if (!row) {
      return null;
    }
    
    let value = row.value;
    
    if (row.encrypted) {
      value = this.decrypt(value);
    }
    
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  async delete(key) {
    const sql = 'DELETE FROM data_store WHERE key = ?';
    await this.runQuery(sql, [key]);
    return { success: true };
  }

  async saveProject(project) {
    const sql = `
      INSERT OR REPLACE INTO projects (id, name, path, config, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;
    
    await this.runQuery(sql, [
      project.id,
      project.name,
      project.path,
      JSON.stringify(project.config || {})
    ]);
    
    return { success: true, projectId: project.id };
  }

  async getProject(projectId) {
    const sql = 'SELECT * FROM projects WHERE id = ?';
    const project = await this.getQuery(sql, [projectId]);
    
    if (project) {
      project.config = JSON.parse(project.config || '{}');
    }
    
    return project;
  }

  async getAllProjects() {
    const sql = 'SELECT * FROM projects ORDER BY updated_at DESC';
    const projects = await this.allQuery(sql);
    
    return projects.map(project => ({
      ...project,
      config: JSON.parse(project.config || '{}')
    }));
  }

  async saveFileReference(fileRef) {
    const encryptedPath = this.encrypt(fileRef.file_path);
    const hash = this.generateFileHash(fileRef.file_path);
    
    const sql = `
      INSERT OR REPLACE INTO file_references 
      (id, project_id, file_path, encrypted_path, hash, size, last_modified, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;
    
    await this.runQuery(sql, [
      fileRef.id,
      fileRef.project_id,
      fileRef.file_path,
      encryptedPath,
      hash,
      fileRef.size,
      fileRef.last_modified
    ]);
    
    return { success: true, fileId: fileRef.id };
  }

  async getFileReferences(projectId) {
    const sql = 'SELECT * FROM file_references WHERE project_id = ? ORDER BY last_modified DESC';
    const files = await this.allQuery(sql, [projectId]);
    
    return files.map(file => ({
      ...file,
      file_path: this.decrypt(file.encrypted_path)
    }));
  }

  async saveExecutionHistory(execution) {
    const sql = `
      INSERT INTO execution_history 
      (id, project_id, language, code, result, success, error, execution_time, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;
    
    await this.runQuery(sql, [
      execution.id,
      execution.project_id,
      execution.language,
      execution.code,
      execution.result,
      execution.success,
      execution.error,
      execution.execution_time
    ]);
    
    return { success: true, executionId: execution.id };
  }

  async getExecutionHistory(projectId = null, limit = 50) {
    let sql = 'SELECT * FROM execution_history';
    let params = [];
    
    if (projectId) {
      sql += ' WHERE project_id = ?';
      params.push(projectId);
    }
    
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);
    
    return await this.allQuery(sql, params);
  }

  async saveLearningPattern(pattern) {
    const sql = `
      INSERT OR REPLACE INTO learning_patterns 
      (pattern_key, intent, keywords, success_rate, frequency, last_used, created_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;
    
    await this.runQuery(sql, [
      pattern.pattern_key,
      pattern.intent,
      JSON.stringify(pattern.keywords),
      pattern.success_rate,
      pattern.frequency,
      new Date(pattern.last_used).toISOString()
    ]);
    
    return { success: true };
  }

  async getLearningPatterns() {
    const sql = 'SELECT * FROM learning_patterns ORDER BY frequency DESC, last_used DESC';
    const patterns = await this.allQuery(sql);
    
    return patterns.map(pattern => ({
      ...pattern,
      keywords: JSON.parse(pattern.keywords || '[]')
    }));
  }

  async saveConversationMemory(memory) {
    const sql = `
      INSERT INTO conversation_memory 
      (id, session_id, prompt, response, intent, context, created_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;
    
    await this.runQuery(sql, [
      memory.id,
      memory.session_id,
      memory.prompt,
      JSON.stringify(memory.response),
      memory.intent,
      JSON.stringify(memory.context)
    ]);
    
    return { success: true };
  }

  async getConversationMemory(sessionId, limit = 20) {
    const sql = `
      SELECT * FROM conversation_memory 
      WHERE session_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `;
    
    const memories = await this.allQuery(sql, [sessionId, limit]);
    
    return memories.map(memory => ({
      ...memory,
      response: JSON.parse(memory.response || '{}'),
      context: JSON.parse(memory.context || '{}')
    }));
  }

  async saveAnalytics(event) {
    const sql = `
      INSERT INTO system_analytics (id, event_type, event_data, user_id, timestamp)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;
    
    await this.runQuery(sql, [
      event.id,
      event.event_type,
      JSON.stringify(event.event_data),
      event.user_id
    ]);
    
    return { success: true };
  }

  encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  decrypt(text) {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  generateFileHash(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return crypto.createHash('sha256').update(content).digest('hex');
    } catch {
      return crypto.createHash('sha256').update(filePath).digest('hex');
    }
  }

  async close() {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            console.error('Error closing database:', err);
          }
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  async backup() {
    const backupPath = this.dbPath.replace('.db', `_backup_${Date.now()}.db`);
    return new Promise((resolve, reject) => {
      const backup = new sqlite3.Database(backupPath);
      this.db.backup(backup, (err) => {
        if (err) {
          reject(err);
        } else {
          backup.close();
          resolve(backupPath);
        }
      });
    });
  }
}

module.exports = DataStorage;