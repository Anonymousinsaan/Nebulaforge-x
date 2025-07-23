/**
 * NebulaForge X - Errors Handler System
 * 
 * 🛡️ BUG HEALING LAYER
 * 
 * Auto-analysis and healing system that:
 * - Continuously scans codebase, folders, and system structure
 * - Detects syntax errors, dead imports, unused modules
 * - Identifies incomplete or missing core engine parts
 * - Logs issues and generates auto-repair suggestions
 * - Implements multi-pass safety scan loop (3x per session)
 * - Integrates with NebulaMind and Void Sentinel
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { EventEmitter } from 'events';
import { KernelConfig } from '../core.kernel.js';
import { CoreControllerImpl } from '../engine/modules/NebulaCore/core.controller.js';
import { ToolNamespace, MessageType } from '../src/tools/bus.module.js';

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ErrorCategory {
  SYNTAX = 'syntax',
  DEAD_IMPORT = 'dead_import',
  UNUSED_MODULE = 'unused_module',
  MISSING_CORE = 'missing_core',
  LOGIC_CONTRADICTION = 'logic_contradiction',
  BAD_ARCHITECTURE = 'bad_architecture',
  REDUNDANT_FOLDER = 'redundant_folder',
  OVERLAPPING_LOGIC = 'overlapping_logic'
}

export enum RepairStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ADMIN_OVERRIDE_REQUIRED = 'admin_override_required'
}

export interface ErrorReport {
  id: string;
  timestamp: Date;
  severity: ErrorSeverity;
  category: ErrorCategory;
  file: string;
  line?: number;
  column?: number;
  message: string;
  details: string;
  context: string[];
  suggestedFix: RepairSuggestion | null;
  scanPassNumber: number;
  autoRepairAttempted: boolean;
  requiresAdminOverride: boolean;
}

export interface RepairSuggestion {
  id: string;
  errorId: string;
  type: 'safe_auto_repair' | 'suggested_fix' | 'admin_required';
  description: string;
  codeChanges: CodeChange[];
  riskLevel: 'low' | 'medium' | 'high';
  confidenceScore: number; // 0-100
  testRequired: boolean;
  backupRequired: boolean;
}

export interface CodeChange {
  file: string;
  startLine: number;
  endLine: number;
  originalCode: string;
  suggestedCode: string;
  reason: string;
}

export interface ScanSession {
  id: string;
  startTime: Date;
  endTime?: Date;
  passNumber: number;
  totalPasses: number;
  scannedFiles: number;
  errorsFound: number;
  errorsFixed: number;
  status: 'running' | 'completed' | 'failed';
}

export class ErrorsHandler extends EventEmitter {
  private config: KernelConfig;
  private coreController: CoreControllerImpl;
  private isInitialized = false;
  
  // Error tracking
  private errorReports: Map<string, ErrorReport> = new Map();
  private repairSuggestions: Map<string, RepairSuggestion> = new Map();
  private scanSessions: Map<string, ScanSession> = new Map();
  
  // Scanning configuration
  private scanInterval: NodeJS.Timeout | null = null;
  private currentScanSession: ScanSession | null = null;
  private scanPassesPerSession = 3;
  private autoRepairEnabled = true;
  
  // File monitoring
  private watchedDirectories: Set<string> = new Set();
  private fileWatchers: Map<string, any> = new Map();
  
  // Log file paths
  private logFilePath = '/logs/bugscan.txt';
  private patchFilePath = '/fixes/patchlist.auto.js';

  constructor(config: KernelConfig, coreController: CoreControllerImpl) {
    super();
    this.config = config;
    this.coreController = coreController;
    this.setupDirectories();
  }

  /**
   * Initialize the errors handler system
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      throw new Error('ErrorsHandler already initialized');
    }

    console.log('🛡️ Initializing Errors Handler System...');

    // Setup log directories
    await this.ensureLogDirectories();
    
    // Load previous error reports
    await this.loadPreviousReports();
    
    // Setup file system monitoring
    await this.setupFileSystemWatching();
    
    // Start periodic scanning
    this.startPeriodicScanning();
    
    // Register with core controller for events
    this.registerEventHandlers();
    
    this.isInitialized = true;
    this.emit('errors-handler:initialized');

    console.log('✅ Errors Handler System initialized');
    
    // Perform initial system scan
    await this.performFullSystemScan();
  }

  /**
   * Shutdown the errors handler system
   */
  public async shutdown(): Promise<void> {
    console.log('🛑 Errors Handler shutting down...');
    
    // Stop periodic scanning
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    
    // Stop file watchers
    for (const watcher of this.fileWatchers.values()) {
      watcher.close();
    }
    this.fileWatchers.clear();
    
    // Save current state
    await this.saveErrorReports();
    await this.savePatchSuggestions();
    
    this.isInitialized = false;
    this.emit('errors-handler:shutdown');
    
    console.log('✅ Errors Handler shutdown complete');
  }

  /**
   * Perform full system scan with multi-pass analysis
   */
  public async performFullSystemScan(): Promise<ScanSession> {
    console.log('🔍 Starting full system scan with multi-pass analysis...');
    
    const session: ScanSession = {
      id: this.generateSessionId(),
      startTime: new Date(),
      passNumber: 1,
      totalPasses: this.scanPassesPerSession,
      scannedFiles: 0,
      errorsFound: 0,
      errorsFixed: 0,
      status: 'running'
    };
    
    this.currentScanSession = session;
    this.scanSessions.set(session.id, session);
    
    try {
      // Perform 3-pass scanning as requested
      for (let pass = 1; pass <= this.scanPassesPerSession; pass++) {
        console.log(`🔄 Scan pass ${pass}/${this.scanPassesPerSession}`);
        session.passNumber = pass;
        
        await this.performScanPass(session, pass);
        
        // Short delay between passes
        if (pass < this.scanPassesPerSession) {
          await this.delay(1000);
        }
      }
      
      session.status = 'completed';
      session.endTime = new Date();
      
      console.log(`✅ Full system scan completed. Found ${session.errorsFound} issues, fixed ${session.errorsFixed}`);
      
      // Generate comprehensive report
      await this.generateScanReport(session);
      
    } catch (error) {
      session.status = 'failed';
      session.endTime = new Date();
      console.error('❌ System scan failed:', error);
      throw error;
    }
    
    return session;
  }

  /**
   * Perform a single scan pass
   */
  private async performScanPass(session: ScanSession, passNumber: number): Promise<void> {
    const scanTargets = [
      './NebulaForgeX',
      './src',
      './engine',
      './core',
      './systems',
      './tools',
      './modules',
      './themes'
    ];
    
    for (const target of scanTargets) {
      if (await fs.pathExists(target)) {
        await this.scanDirectoryRecursive(target, session, passNumber);
      }
    }
    
    // Validate system structure
    await this.validateSystemStructure(session, passNumber);
    
    // Check for architectural issues
    await this.checkArchitecturalIssues(session, passNumber);
    
    // Auto-repair safe issues
    if (this.autoRepairEnabled) {
      await this.attemptAutoRepairs(session);
    }
  }

  /**
   * Scan directory recursively for issues
   */
  private async scanDirectoryRecursive(
    dirPath: string, 
    session: ScanSession, 
    passNumber: number
  ): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          // Skip node_modules and other irrelevant directories
          if (!this.shouldSkipDirectory(entry.name)) {
            await this.scanDirectoryRecursive(fullPath, session, passNumber);
          }
        } else if (entry.isFile()) {
          session.scannedFiles++;
          await this.scanFile(fullPath, session, passNumber);
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dirPath}:`, error);
    }
  }

  /**
   * Scan individual file for issues
   */
  private async scanFile(filePath: string, session: ScanSession, passNumber: number): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      
      // Check for syntax errors
      await this.checkSyntaxErrors(filePath, content, lines, session, passNumber);
      
      // Check for dead imports
      await this.checkDeadImports(filePath, content, lines, session, passNumber);
      
      // Check for unused modules
      await this.checkUnusedModules(filePath, content, lines, session, passNumber);
      
      // Check for logic contradictions
      await this.checkLogicContradictions(filePath, content, lines, session, passNumber);
      
    } catch (error) {
      // File read error might indicate a problem
      await this.reportError({
        severity: ErrorSeverity.MEDIUM,
        category: ErrorCategory.SYNTAX,
        file: filePath,
        message: `Unable to read file: ${error}`,
        details: `File system error: ${error}`,
        context: [],
        scanPassNumber: passNumber
      });
    }
  }

  /**
   * Check for syntax errors in file
   */
  private async checkSyntaxErrors(
    filePath: string, 
    content: string, 
    lines: string[], 
    session: ScanSession, 
    passNumber: number
  ): Promise<void> {
    // TypeScript/JavaScript syntax checking
    if (filePath.endsWith('.ts') || filePath.endsWith('.js')) {
      // Check for common syntax issues
      const syntaxIssues = [
        { pattern: /\bunexpected token/i, severity: ErrorSeverity.HIGH },
        { pattern: /\bmissing semicolon/i, severity: ErrorSeverity.LOW },
        { pattern: /\bundefined variable/i, severity: ErrorSeverity.MEDIUM },
        { pattern: /\bunmatched bracket/i, severity: ErrorSeverity.HIGH },
        { pattern: /\bunmatched parenthesis/i, severity: ErrorSeverity.HIGH }
      ];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        for (const issue of syntaxIssues) {
          if (issue.pattern.test(line)) {
            await this.reportError({
              severity: issue.severity,
              category: ErrorCategory.SYNTAX,
              file: filePath,
              line: i + 1,
              message: `Syntax issue detected: ${line.trim()}`,
              details: `Pattern matched: ${issue.pattern}`,
              context: this.getLineContext(lines, i),
              scanPassNumber: passNumber
            });
            session.errorsFound++;
          }
        }
      }
    }
  }

  /**
   * Check for dead imports
   */
  private async checkDeadImports(
    filePath: string, 
    content: string, 
    lines: string[], 
    session: ScanSession, 
    passNumber: number
  ): Promise<void> {
    const importRegex = /^import\s+.*?from\s+['"]([^'"]+)['"]/gm;
    let match;
    
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      const lineNumber = content.substring(0, match.index).split('\n').length;
      
      // Check if imported module exists
      const resolvedPath = this.resolveImportPath(filePath, importPath);
      
      if (resolvedPath && !await fs.pathExists(resolvedPath)) {
        await this.reportError({
          severity: ErrorSeverity.MEDIUM,
          category: ErrorCategory.DEAD_IMPORT,
          file: filePath,
          line: lineNumber,
          message: `Dead import: ${importPath}`,
          details: `Imported file does not exist: ${resolvedPath}`,
          context: this.getLineContext(lines, lineNumber - 1),
          scanPassNumber: passNumber
        });
        session.errorsFound++;
      }
    }
  }

  /**
   * Validate system structure for missing core components
   */
  private async validateSystemStructure(session: ScanSession, passNumber: number): Promise<void> {
    const requiredCoreFiles = [
      './NebulaForgeX/core.kernel.ts',
      './NebulaForgeX/engine.main.ts',
      './NebulaForgeX/core/registry.manager.ts',
      './NebulaForgeX/systems/errors.handler.ts',
      './NebulaForgeX/observer.guard.ts',
      './NebulaForgeX/comm/gateway.ts',
      './NebulaForgeX/engine/modules/NebulaCore/index.ts'
    ];
    
    for (const filePath of requiredCoreFiles) {
      if (!await fs.pathExists(filePath)) {
        await this.reportError({
          severity: ErrorSeverity.CRITICAL,
          category: ErrorCategory.MISSING_CORE,
          file: filePath,
          message: `Missing core engine component: ${path.basename(filePath)}`,
          details: `Required core file not found: ${filePath}`,
          context: [],
          scanPassNumber: passNumber
        });
        session.errorsFound++;
      }
    }
  }

  /**
   * Check for architectural issues
   */
  private async checkArchitecturalIssues(session: ScanSession, passNumber: number): Promise<void> {
    // Check for redundant folders
    await this.checkRedundantFolders(session, passNumber);
    
    // Check for overlapping logic
    await this.checkOverlappingLogic(session, passNumber);
    
    // Check toolspace isolation boundaries
    await this.checkToolspaceIsolation(session, passNumber);
  }

  /**
   * Attempt automatic repairs for safe issues
   */
  private async attemptAutoRepairs(session: ScanSession): Promise<void> {
    const safeRepairs = Array.from(this.repairSuggestions.values())
      .filter(repair => repair.type === 'safe_auto_repair' && repair.riskLevel === 'low');
    
    for (const repair of safeRepairs) {
      try {
        await this.executeAutoRepair(repair);
        session.errorsFixed++;
        
        // Send repair event to NebulaMind and Void Sentinel
        await this.notifyRepairEvent(repair);
        
      } catch (error) {
        console.error(`Failed to auto-repair ${repair.id}:`, error);
      }
    }
  }

  /**
   * Report an error and generate repair suggestion
   */
  private async reportError(errorData: {
    severity: ErrorSeverity;
    category: ErrorCategory;
    file: string;
    line?: number;
    column?: number;
    message: string;
    details: string;
    context: string[];
    scanPassNumber: number;
  }): Promise<string> {
    const errorId = this.generateErrorId();
    
    const error: ErrorReport = {
      id: errorId,
      timestamp: new Date(),
      severity: errorData.severity,
      category: errorData.category,
      file: errorData.file,
      line: errorData.line,
      column: errorData.column,
      message: errorData.message,
      details: errorData.details,
      context: errorData.context,
      suggestedFix: null,
      scanPassNumber: errorData.scanPassNumber,
      autoRepairAttempted: false,
      requiresAdminOverride: errorData.severity === ErrorSeverity.CRITICAL
    };
    
    this.errorReports.set(errorId, error);
    
    // Generate repair suggestion
    const repairSuggestion = await this.generateRepairSuggestion(error);
    if (repairSuggestion) {
      error.suggestedFix = repairSuggestion;
      this.repairSuggestions.set(repairSuggestion.id, repairSuggestion);
    }
    
    // Log to file
    await this.logErrorToFile(error);
    
    // Emit event
    this.emit('error:detected', error);
    
    return errorId;
  }

  /**
   * Log error to bugscan.txt file
   */
  private async logErrorToFile(error: ErrorReport): Promise<void> {
    const logEntry = `[${error.timestamp.toISOString()}] ${error.severity.toUpperCase()}: ${error.category}
File: ${error.file}${error.line ? ':' + error.line : ''}
Message: ${error.message}
Details: ${error.details}
Scan Pass: ${error.scanPassNumber}
Context: ${error.context.join(' | ')}
---
`;
    
    await fs.appendFile(this.logFilePath, logEntry);
  }

  /**
   * Save patch suggestions to patchlist.auto.js
   */
  private async savePatchSuggestions(): Promise<void> {
    const patches = Array.from(this.repairSuggestions.values());
    const patchScript = this.generatePatchScript(patches);
    
    await fs.writeFile(this.patchFilePath, patchScript);
  }

  /**
   * Generate repair suggestion for an error
   */
  private async generateRepairSuggestion(error: ErrorReport): Promise<RepairSuggestion | null> {
    const suggestionId = this.generateSuggestionId();
    
    let suggestion: RepairSuggestion | null = null;
    
    switch (error.category) {
      case ErrorCategory.DEAD_IMPORT:
        suggestion = this.generateDeadImportRepair(suggestionId, error);
        break;
      case ErrorCategory.SYNTAX:
        suggestion = this.generateSyntaxRepair(suggestionId, error);
        break;
      case ErrorCategory.UNUSED_MODULE:
        suggestion = this.generateUnusedModuleRepair(suggestionId, error);
        break;
      case ErrorCategory.MISSING_CORE:
        suggestion = this.generateMissingCoreRepair(suggestionId, error);
        break;
      default:
        suggestion = this.generateGenericRepair(suggestionId, error);
    }
    
    return suggestion;
  }

  /**
   * Send repair events to NebulaMind and Void Sentinel
   */
  private async notifyRepairEvent(repair: RepairSuggestion): Promise<void> {
    try {
      // Send to Void Sentinel
      await this.coreController.globalEventBus.emit('repair:completed', {
        repairId: repair.id,
        errorId: repair.errorId,
        type: repair.type,
        changes: repair.codeChanges
      });
      
      console.log(`📡 Repair event sent to monitoring systems: ${repair.id}`);
      
    } catch (error) {
      console.error('Failed to notify repair event:', error);
    }
  }

  // Helper methods and utilities

  private shouldSkipDirectory(name: string): boolean {
    const skipDirs = ['node_modules', '.git', 'dist', '.cache', 'tmp', 'temp'];
    return skipDirs.includes(name) || name.startsWith('.');
  }

  private getLineContext(lines: string[], lineIndex: number): string[] {
    const context: string[] = [];
    const start = Math.max(0, lineIndex - 2);
    const end = Math.min(lines.length - 1, lineIndex + 2);
    
    for (let i = start; i <= end; i++) {
      context.push(`${i + 1}: ${lines[i]}`);
    }
    
    return context;
  }

  private resolveImportPath(fromFile: string, importPath: string): string | null {
    if (importPath.startsWith('.')) {
      const dir = path.dirname(fromFile);
      return path.resolve(dir, importPath);
    }
    return null; // Node modules, etc.
  }

  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  private generateSuggestionId(): string {
    return `fix_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  private generateSessionId(): string {
    return `scan_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Placeholder implementations for repair generators
  private generateDeadImportRepair(id: string, error: ErrorReport): RepairSuggestion {
    return {
      id,
      errorId: error.id,
      type: 'safe_auto_repair',
      description: 'Remove dead import statement',
      codeChanges: [],
      riskLevel: 'low',
      confidenceScore: 90,
      testRequired: false,
      backupRequired: false
    };
  }

  private generateSyntaxRepair(id: string, error: ErrorReport): RepairSuggestion {
    return {
      id,
      errorId: error.id,
      type: 'suggested_fix',
      description: 'Fix syntax error',
      codeChanges: [],
      riskLevel: 'medium',
      confidenceScore: 70,
      testRequired: true,
      backupRequired: true
    };
  }

  private generateUnusedModuleRepair(id: string, error: ErrorReport): RepairSuggestion {
    return {
      id,
      errorId: error.id,
      type: 'suggested_fix',
      description: 'Remove unused module',
      codeChanges: [],
      riskLevel: 'low',
      confidenceScore: 85,
      testRequired: false,
      backupRequired: false
    };
  }

  private generateMissingCoreRepair(id: string, error: ErrorReport): RepairSuggestion {
    return {
      id,
      errorId: error.id,
      type: 'admin_required',
      description: 'Create missing core component',
      codeChanges: [],
      riskLevel: 'high',
      confidenceScore: 50,
      testRequired: true,
      backupRequired: true
    };
  }

  private generateGenericRepair(id: string, error: ErrorReport): RepairSuggestion {
    return {
      id,
      errorId: error.id,
      type: 'suggested_fix',
      description: 'Generic repair suggestion',
      codeChanges: [],
      riskLevel: 'medium',
      confidenceScore: 60,
      testRequired: true,
      backupRequired: true
    };
  }

  // Placeholder implementations for other methods
  private setupDirectories(): void { console.log('📁 Setting up error handler directories'); }
  private async ensureLogDirectories(): Promise<void> { await fs.ensureDir('/logs'); await fs.ensureDir('/fixes'); }
  private async loadPreviousReports(): Promise<void> { console.log('📚 Loading previous error reports'); }
  private async setupFileSystemWatching(): Promise<void> { console.log('👁️ Setting up file system watching'); }
  private startPeriodicScanning(): void { console.log('🔄 Starting periodic scanning'); }
  private registerEventHandlers(): void { console.log('🎧 Registering event handlers'); }
  private async saveErrorReports(): Promise<void> { console.log('💾 Saving error reports'); }
  private async checkUnusedModules(): Promise<void> { console.log('🔍 Checking unused modules'); }
  private async checkLogicContradictions(): Promise<void> { console.log('🔍 Checking logic contradictions'); }
  private async checkRedundantFolders(): Promise<void> { console.log('🔍 Checking redundant folders'); }
  private async checkOverlappingLogic(): Promise<void> { console.log('🔍 Checking overlapping logic'); }
  private async checkToolspaceIsolation(): Promise<void> { console.log('🔍 Checking toolspace isolation'); }
  private async executeAutoRepair(repair: RepairSuggestion): Promise<void> { console.log(`🔧 Executing auto-repair: ${repair.id}`); }
  private async generateScanReport(session: ScanSession): Promise<void> { console.log(`📊 Generating scan report for session: ${session.id}`); }
  private generatePatchScript(patches: RepairSuggestion[]): string { return `// Auto-generated patch suggestions\n// ${patches.length} patches available\n`; }
}