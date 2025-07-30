const { useState, useEffect, useCallback } = React;

const App = () => {
  const [activeTab, setActiveTab] = useState('editor');
  const [tabs, setTabs] = useState([
    { id: 'editor', title: 'Editor', type: 'editor', content: '' },
    { id: 'copilot', title: 'Copilot', type: 'copilot', content: '' }
  ]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [systemStatus, setSystemStatus] = useState({
    status: 'ready',
    message: 'AURORA IDE is ready'
  });

  // Initialize Monaco Editor
  useEffect(() => {
    if (window.monaco) {
      window.monaco.editor.defineTheme('aurora-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'comment', foreground: '6A9955' },
          { token: 'keyword', foreground: '569CD6' },
          { token: 'string', foreground: 'CE9178' },
          { token: 'number', foreground: 'B5CEA8' },
          { token: 'function', foreground: 'DCDCAA' },
          { token: 'class', foreground: '4EC9B0' }
        ],
        colors: {
          'editor.background': '#0a0a0a',
          'editor.foreground': '#ffffff',
          'editor.lineHighlightBackground': '#1a1a1a',
          'editor.selectionBackground': '#264f78',
          'editor.inactiveSelectionBackground': '#3a3a3a'
        }
      });
    }
  }, []);

  // Handle IPC messages from main process
  useEffect(() => {
    const handleIpcMessage = (event, channel, data) => {
      switch (channel) {
        case 'new-project':
          handleNewProject();
          break;
        case 'open-project':
          handleOpenProject();
          break;
        case 'open-logicbrain':
          setActiveTab('copilot');
          setCopilotOpen(true);
          break;
        case 'open-auralite':
          handleOpenAuralite();
          break;
        case 'system-status':
          handleSystemStatus();
          break;
        default:
          console.log('Unknown IPC channel:', channel);
      }
    };

    // Listen for IPC messages
    if (window.electron) {
      window.electron.on('ipc-message', handleIpcMessage);
    }

    return () => {
      if (window.electron) {
        window.electron.removeListener('ipc-message', handleIpcMessage);
      }
    };
  }, []);

  const handleNewProject = useCallback(() => {
    const newTab = {
      id: `file-${Date.now()}`,
      title: 'Untitled',
      type: 'editor',
      content: '// New AURORA IDE Project\nconsole.log("Hello from AURORA IDE!");'
    };
    
    setTabs(prev => [...prev, newTab]);
    setActiveTab(newTab.id);
  }, []);

  const handleOpenProject = useCallback(() => {
    // This would typically open a file dialog
    console.log('Opening project...');
  }, []);

  const handleOpenAuralite = useCallback(() => {
    const auraliteTab = {
      id: `auralite-${Date.now()}`,
      title: 'Auralite',
      type: 'auralite',
      content: `// Auralite Code Example
create a function calculateSum
  give back a + b
end

when user clicks button then
  send output "Button clicked!"
end`
    };
    
    setTabs(prev => [...prev, auraliteTab]);
    setActiveTab(auraliteTab.id);
  }, []);

  const handleSystemStatus = useCallback(() => {
    setSystemStatus({
      status: 'info',
      message: 'System status requested'
    });
  }, []);

  const closeTab = useCallback((tabId) => {
    setTabs(prev => prev.filter(tab => tab.id !== tabId));
    
    if (activeTab === tabId) {
      const remainingTabs = tabs.filter(tab => tab.id !== tabId);
      if (remainingTabs.length > 0) {
        setActiveTab(remainingTabs[0].id);
      }
    }
  }, [activeTab, tabs]);

  const updateTabContent = useCallback((tabId, content) => {
    setTabs(prev => prev.map(tab => 
      tab.id === tabId ? { ...tab, content } : tab
    ));
  }, []);

  const currentTab = tabs.find(tab => tab.id === activeTab);

  return (
    <div className="aurora-layout">
      {/* Header */}
      <div className="aurora-header">
        <div className="aurora-logo">
          <div className="aurora-logo-icon">A</div>
          AURORA IDE
        </div>
        
        <div className="aurora-header-controls">
          <button 
            className="aurora-button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? '◀' : '▶'} Explorer
          </button>
          
          <button 
            className="aurora-button"
            onClick={() => setTerminalOpen(!terminalOpen)}
          >
            {terminalOpen ? '▼' : '▲'} Terminal
          </button>
          
          <button 
            className="aurora-button primary"
            onClick={() => setCopilotOpen(!copilotOpen)}
          >
            🤖 Copilot
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="aurora-main">
        {/* Sidebar */}
        {sidebarOpen && (
          <Sidebar 
            tabs={tabs}
            activeTab={activeTab}
            onTabSelect={setActiveTab}
            onTabClose={closeTab}
            onNewProject={handleNewProject}
          />
        )}

        {/* Content Area */}
        <div className="aurora-content">
          {/* Tabs */}
          <div className="aurora-tabs">
            {tabs.map(tab => (
              <button
                key={tab.id}
                className={`aurora-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.type === 'editor' && '📄'}
                {tab.type === 'copilot' && '🤖'}
                {tab.type === 'auralite' && '🔮'}
                {tab.title}
                <button
                  className="aurora-tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                >
                  ×
                </button>
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="aurora-split aurora-split-vertical">
            <div className="aurora-split-pane">
              {currentTab && (
                <Editor
                  tab={currentTab}
                  onContentChange={(content) => updateTabContent(currentTab.id, content)}
                />
              )}
            </div>
            
            {terminalOpen && (
              <>
                <div className="aurora-split-resizer vertical"></div>
                <div className="aurora-split-pane" style={{ height: '200px' }}>
                  <Terminal />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Copilot Panel */}
        {copilotOpen && (
          <div className="aurora-split-pane" style={{ width: '400px' }}>
            <Copilot />
          </div>
        )}
      </div>

      {/* Status Bar */}
      <StatusBar 
        status={systemStatus}
        activeTab={currentTab}
        sidebarOpen={sidebarOpen}
        terminalOpen={terminalOpen}
        copilotOpen={copilotOpen}
      />
    </div>
  );
};