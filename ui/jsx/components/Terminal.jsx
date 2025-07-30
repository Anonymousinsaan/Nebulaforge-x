const { useState, useEffect, useRef } = React;

const Terminal = () => {
  const [output, setOutput] = useState([]);
  const [currentCommand, setCurrentCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isProcessing, setIsProcessing] = useState(false);
  const terminalRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    // Initialize terminal with welcome message
    addOutput('system', 'AURORA IDE Terminal v1.0.0');
    addOutput('system', 'Type "help" for available commands');
    addOutput('system', '');
  }, []);

  useEffect(() => {
    // Focus input when terminal is opened
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const addOutput = (type, content, data = null) => {
    const outputEntry = {
      id: Date.now(),
      type,
      content,
      data,
      timestamp: new Date().toLocaleTimeString()
    };
    
    setOutput(prev => [...prev, outputEntry]);
  };

  const executeCommand = async (command) => {
    if (!command.trim()) return;

    // Add command to output
    addOutput('command', `$ ${command}`);
    setIsProcessing(true);

    try {
      // Execute through IPC
      if (window.electron) {
        const result = await window.electron.invoke('codecore-execute', {
          code: command,
          language: 'javascript'
        });
        
        if (result.success) {
          addOutput('output', result.output);
        } else {
          addOutput('error', result.error);
        }
      } else {
        // Fallback for development
        setTimeout(() => {
          addOutput('output', `Command executed: ${command}`);
          setIsProcessing(false);
        }, 500);
      }
    } catch (error) {
      addOutput('error', `Failed to execute command: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }

    // Add to history
    setCommandHistory(prev => [...prev, command]);
    setHistoryIndex(-1);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    executeCommand(currentCommand);
    setCurrentCommand('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
        setHistoryIndex(newIndex);
        setCurrentCommand(commandHistory[commandHistory.length - 1 - newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setCurrentCommand(commandHistory[commandHistory.length - 1 - newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCurrentCommand('');
      }
    }
  };

  const clearTerminal = () => {
    setOutput([]);
    addOutput('system', 'Terminal cleared');
  };

  const showHelp = () => {
    const helpText = `
Available Commands:
  help                    - Show this help message
  clear                   - Clear terminal output
  ls                      - List files in current directory
  pwd                     - Show current working directory
  node <file>             - Run a Node.js file
  npm <command>           - Run npm commands
  git <command>           - Run git commands
  echo <text>             - Print text to terminal
  date                    - Show current date and time
  whoami                  - Show current user
  exit                    - Close terminal
    `.trim();
    
    addOutput('output', helpText);
  };

  const renderOutput = (entry) => {
    const { type, content, timestamp } = entry;
    
    return (
      <div key={entry.id} className={`aurora-terminal-output aurora-terminal-output-${type}`}>
        {type === 'command' && (
          <span className="aurora-terminal-prompt">$ </span>
        )}
        <span className="aurora-terminal-content">{content}</span>
        {type === 'error' && (
          <span className="aurora-terminal-timestamp">{timestamp}</span>
        )}
      </div>
    );
  };

  return (
    <div className="aurora-terminal">
      {/* Terminal Header */}
      <div className="aurora-terminal-header">
        <div className="aurora-terminal-title">
          <span className="aurora-terminal-icon">💻</span>
          Terminal
        </div>
        
        <div className="aurora-terminal-controls">
          <button 
            className="aurora-button"
            onClick={clearTerminal}
            title="Clear terminal"
          >
            🗑️ Clear
          </button>
          
          <button 
            className="aurora-button"
            onClick={showHelp}
            title="Show help"
          >
            ❓ Help
          </button>
        </div>
      </div>

      {/* Terminal Output */}
      <div className="aurora-terminal-output-container" ref={terminalRef}>
        {output.map(renderOutput)}
        
        {isProcessing && (
          <div className="aurora-terminal-output aurora-terminal-output-processing">
            <div className="aurora-loading">
              <div className="aurora-loading-spinner"></div>
              Processing command...
            </div>
          </div>
        )}
      </div>

      {/* Terminal Input */}
      <div className="aurora-terminal-input-container">
        <form onSubmit={handleSubmit}>
          <div className="aurora-terminal-input-line">
            <span className="aurora-terminal-prompt">$ </span>
            <input
              ref={inputRef}
              type="text"
              value={currentCommand}
              onChange={(e) => setCurrentCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter command..."
              disabled={isProcessing}
              className="aurora-terminal-input"
            />
          </div>
        </form>
      </div>
    </div>
  );
};