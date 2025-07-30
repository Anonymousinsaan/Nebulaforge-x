const { useState, useEffect, useRef } = React;

const Copilot = () => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [conversationHistory, setConversationHistory] = useState([]);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Load initial suggestions
    loadSuggestions();
    
    // Listen for UI updates from copilot interface
    const handleCopilotUpdate = (event) => {
      const { status, result, error, conversationHistory: history } = event.detail;
      
      if (status === 'success' && result) {
        addMessage('assistant', result.result.message, result);
      } else if (status === 'error' && error) {
        addMessage('error', `Error: ${error}`);
      }
      
      if (history) {
        setConversationHistory(history);
      }
    };

    window.addEventListener('copilot-ui-update', handleCopilotUpdate);
    
    return () => {
      window.removeEventListener('copilot-ui-update', handleCopilotUpdate);
    };
  }, []);

  const loadSuggestions = () => {
    const defaultSuggestions = [
      'Create a new React component',
      'Debug this code',
      'Explain this function',
      'Optimize this algorithm',
      'Generate unit tests',
      'Refactor this code',
      'Create a new project',
      'Show system status'
    ];
    setSuggestions(defaultSuggestions);
  };

  const addMessage = (type, content, data = null) => {
    const message = {
      id: Date.now(),
      type,
      content,
      data,
      timestamp: new Date().toLocaleTimeString()
    };
    
    setMessages(prev => [...prev, message]);
  };

  const handleSubmit = async (prompt) => {
    if (!prompt.trim()) return;

    // Add user message
    addMessage('user', prompt);
    setInputValue('');
    setIsProcessing(true);

    try {
      // Send to LogicBrain through IPC
      if (window.electron) {
        const result = await window.electron.invoke('logicbrain-process', prompt);
        
        if (result.success) {
          addMessage('assistant', result.result.message, result);
        } else {
          addMessage('error', `Error: ${result.error}`);
        }
      } else {
        // Fallback for development
        setTimeout(() => {
          addMessage('assistant', `I understand you want to "${prompt}". How can I help you with that?`);
          setIsProcessing(false);
        }, 1000);
      }
    } catch (error) {
      addMessage('error', `Failed to process request: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    setInputValue(suggestion);
    handleSubmit(suggestion);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(inputValue);
    }
  };

  const clearConversation = () => {
    setMessages([]);
    setConversationHistory([]);
    
    // Dispatch clear event
    const event = new CustomEvent('copilot-clear');
    window.dispatchEvent(event);
  };

  const exportConversation = () => {
    const exportData = {
      messages,
      conversationHistory,
      timestamp: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aurora-conversation-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderMessage = (message) => {
    const { type, content, data, timestamp } = message;
    
    return (
      <div key={message.id} className={`aurora-copilot-message aurora-copilot-message-${type}`}>
        <div className="aurora-copilot-message-header">
          <span className="aurora-copilot-message-type">
            {type === 'user' ? '👤 You' : type === 'assistant' ? '🤖 AURORA' : '❌ Error'}
          </span>
          <span className="aurora-copilot-message-time">{timestamp}</span>
        </div>
        
        <div className="aurora-copilot-message-content">
          {content}
        </div>
        
        {data && data.result && data.result.suggestions && (
          <div className="aurora-copilot-suggestions">
            {data.result.suggestions.map((suggestion, index) => (
              <button
                key={index}
                className="aurora-copilot-suggestion"
                onClick={() => handleSuggestionClick(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="aurora-copilot">
      {/* Copilot Header */}
      <div className="aurora-copilot-header">
        <div className="aurora-copilot-title">
          <span className="aurora-copilot-icon">🤖</span>
          AURORA Copilot
        </div>
        
        <div className="aurora-copilot-controls">
          <button 
            className="aurora-button"
            onClick={clearConversation}
            title="Clear conversation"
          >
            🗑️ Clear
          </button>
          
          <button 
            className="aurora-button"
            onClick={exportConversation}
            title="Export conversation"
          >
            📤 Export
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="aurora-copilot-messages">
        {messages.length === 0 ? (
          <div className="aurora-copilot-welcome">
            <div className="aurora-copilot-welcome-icon">🌟</div>
            <h3>Welcome to AURORA Copilot</h3>
            <p>I'm here to help you with coding, debugging, and development tasks.</p>
            <p>Try asking me to:</p>
            <ul>
              <li>Create a new React component</li>
              <li>Debug some code</li>
              <li>Explain a concept</li>
              <li>Optimize an algorithm</li>
            </ul>
          </div>
        ) : (
          messages.map(renderMessage)
        )}
        
        {isProcessing && (
          <div className="aurora-copilot-message aurora-copilot-message-assistant">
            <div className="aurora-copilot-message-header">
              <span className="aurora-copilot-message-type">🤖 AURORA</span>
            </div>
            <div className="aurora-copilot-message-content">
              <div className="aurora-loading">
                <div className="aurora-loading-spinner"></div>
                Processing your request...
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Suggestions */}
      {suggestions.length > 0 && messages.length === 0 && (
        <div className="aurora-copilot-quick-suggestions">
          <h4>Quick Actions</h4>
          <div className="aurora-copilot-suggestions-grid">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                className="aurora-copilot-quick-suggestion"
                onClick={() => handleSuggestionClick(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="aurora-copilot-input">
        <div className="aurora-copilot-input-container">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me anything about coding, debugging, or development..."
            disabled={isProcessing}
            rows={3}
          />
          
          <button
            className="aurora-button primary"
            onClick={() => handleSubmit(inputValue)}
            disabled={isProcessing || !inputValue.trim()}
          >
            {isProcessing ? '⏳' : '🚀'} Send
          </button>
        </div>
        
        <div className="aurora-copilot-input-hint">
          Press Enter to send, Shift+Enter for new line
        </div>
      </div>
    </div>
  );
};