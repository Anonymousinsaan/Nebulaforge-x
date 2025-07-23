/**
 * NebulaCore Logger System
 * 
 * Comprehensive logging framework with support for multiple outputs,
 * log levels, structured logging, and module-specific child loggers.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { LogLevel, LogEntry, LoggerInterface } from '../../types/core.types.js';

interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  logDir: string;
  maxFileSize: number; // in bytes
  maxFiles: number;
  enableColors: boolean;
  dateFormat: string;
}

interface ColorMap {
  debug: string;
  info: string;
  warn: string;
  error: string;
  reset: string;
}

export class Logger implements LoggerInterface {
  private config: LoggerConfig;
  private moduleName?: string;
  private logFile?: string;
  private fileHandle?: fs.WriteStream;
  
  private static readonly LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };

  private static readonly COLORS: ColorMap = {
    debug: '\x1b[36m', // cyan
    info: '\x1b[32m',  // green
    warn: '\x1b[33m',  // yellow
    error: '\x1b[31m', // red
    reset: '\x1b[0m'   // reset
  };

  constructor(config: Partial<LoggerConfig> = {}, moduleName?: string) {
    this.config = {
      level: 'info',
      enableConsole: true,
      enableFile: true,
      logDir: './logs',
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      enableColors: true,
      dateFormat: 'YYYY-MM-DD HH:mm:ss.SSS',
      ...config
    };
    
    this.moduleName = moduleName;
    
    if (this.config.enableFile) {
      this.initializeFileLogging();
    }
  }

  private async initializeFileLogging(): Promise<void> {
    try {
      await fs.ensureDir(this.config.logDir);
      
      const timestamp = new Date().toISOString().split('T')[0];
      const modulePart = this.moduleName ? `-${this.moduleName}` : '';
      this.logFile = path.join(this.config.logDir, `nebula${modulePart}-${timestamp}.log`);
      
      await this.rotateLogFiles();
      this.fileHandle = fs.createWriteStream(this.logFile, { flags: 'a' });
      
    } catch (error) {
      console.warn('Failed to initialize file logging:', error);
      this.config.enableFile = false;
    }
  }

  private async rotateLogFiles(): Promise<void> {
    if (!this.logFile) return;
    
    try {
      const stats = await fs.stat(this.logFile);
      if (stats.size > this.config.maxFileSize) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = this.logFile.replace('.log', `-${timestamp}.log`);
        await fs.move(this.logFile, backupFile);
        
        // Clean up old log files
        await this.cleanupOldLogs();
      }
    } catch (error) {
      // File doesn't exist yet, which is fine
    }
  }

  private async cleanupOldLogs(): Promise<void> {
    try {
      const files = await fs.readdir(this.config.logDir);
      const logFiles = files
        .filter(file => file.startsWith('nebula') && file.endsWith('.log'))
        .map(file => ({
          name: file,
          path: path.join(this.config.logDir, file),
          stats: fs.statSync(path.join(this.config.logDir, file))
        }))
        .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());

      if (logFiles.length > this.config.maxFiles) {
        const filesToDelete = logFiles.slice(this.config.maxFiles);
        for (const file of filesToDelete) {
          await fs.unlink(file.path);
        }
      }
    } catch (error) {
      console.warn('Failed to cleanup old log files:', error);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return Logger.LOG_LEVELS[level] >= Logger.LOG_LEVELS[this.config.level];
  }

  private formatTimestamp(): string {
    const now = new Date();
    return now.toISOString().replace('T', ' ').replace('Z', '');
  }

  private formatMessage(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): LogEntry {
    return {
      timestamp: new Date(),
      level,
      message,
      module: this.moduleName,
      context,
      error
    };
  }

  private formatConsoleOutput(entry: LogEntry): string {
    const timestamp = this.formatTimestamp();
    const levelStr = entry.level.toUpperCase().padEnd(5);
    const moduleStr = entry.module ? `[${entry.module}]` : '';
    const color = this.config.enableColors ? Logger.COLORS[entry.level] : '';
    const reset = this.config.enableColors ? Logger.COLORS.reset : '';
    
    let output = `${color}${timestamp} ${levelStr}${reset} ${moduleStr} ${entry.message}`;
    
    if (entry.context && Object.keys(entry.context).length > 0) {
      output += `\n  Context: ${JSON.stringify(entry.context, null, 2)}`;
    }
    
    if (entry.error) {
      output += `\n  Error: ${entry.error.message}`;
      if (entry.error.stack) {
        output += `\n  Stack: ${entry.error.stack}`;
      }
    }
    
    return output;
  }

  private formatFileOutput(entry: LogEntry): string {
    const logData = {
      timestamp: entry.timestamp.toISOString(),
      level: entry.level,
      module: entry.module,
      message: entry.message,
      context: entry.context,
      error: entry.error ? {
        message: entry.error.message,
        stack: entry.error.stack
      } : undefined
    };
    
    return JSON.stringify(logData) + '\n';
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): void {
    if (!this.shouldLog(level)) return;
    
    const entry = this.formatMessage(level, message, context, error);
    
    // Console output
    if (this.config.enableConsole) {
      const consoleOutput = this.formatConsoleOutput(entry);
      console.log(consoleOutput);
    }
    
    // File output
    if (this.config.enableFile && this.fileHandle) {
      const fileOutput = this.formatFileOutput(entry);
      this.fileHandle.write(fileOutput);
    }
  }

  debug(message: string, context?: Record<string, any>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, any>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, any>): void {
    this.log('warn', message, context);
  }

  error(message: string, error?: Error, context?: Record<string, any>): void {
    this.log('error', message, context, error);
  }

  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  getLevel(): LogLevel {
    return this.config.level;
  }

  createChild(module: string): LoggerInterface {
    const childModuleName = this.moduleName ? `${this.moduleName}.${module}` : module;
    return new Logger(this.config, childModuleName);
  }

  async flush(): Promise<void> {
    if (this.fileHandle) {
      return new Promise((resolve, reject) => {
        this.fileHandle!.end((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  }

  async close(): Promise<void> {
    await this.flush();
    this.fileHandle = undefined;
  }

  // Static factory method for creating the global logger
  static createGlobal(config?: Partial<LoggerConfig>): Logger {
    return new Logger(config);
  }

  // Utility methods for common logging patterns
  logMethodEntry(methodName: string, args?: any[]): void {
    this.debug(`→ ${methodName}`, { args });
  }

  logMethodExit(methodName: string, result?: any): void {
    this.debug(`← ${methodName}`, { result });
  }

  logPerformance(operation: string, duration: number): void {
    this.debug(`⏱ ${operation} completed in ${duration}ms`);
  }

  logMemoryUsage(operation?: string): void {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const memory = process.memoryUsage();
      const memoryMB = {
        rss: Math.round(memory.rss / 1024 / 1024 * 100) / 100,
        heapTotal: Math.round(memory.heapTotal / 1024 / 1024 * 100) / 100,
        heapUsed: Math.round(memory.heapUsed / 1024 / 1024 * 100) / 100,
        external: Math.round(memory.external / 1024 / 1024 * 100) / 100
      };
      this.debug(`💾 Memory usage${operation ? ` (${operation})` : ''}`, memoryMB);
    }
  }
}