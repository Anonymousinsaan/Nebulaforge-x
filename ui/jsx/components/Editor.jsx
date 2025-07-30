const { useState, useEffect, useRef } = React;

const Editor = ({ tab, onContentChange }) => {
  const editorRef = useRef(null);
  const monacoEditorRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!editorRef.current) return;

    // Initialize Monaco Editor
    const initEditor = async () => {
      try {
        // Load Monaco if not already loaded
        if (!window.monaco) {
          await new Promise((resolve) => {
            require.config({ paths: { vs: 'https://unpkg.com/monaco-editor@0.45.0/min/vs' } });
            require(['vs/editor/editor.main'], resolve);
          });
        }

        // Create editor instance
        monacoEditorRef.current = window.monaco.editor.create(editorRef.current, {
          value: tab.content || '',
          language: getLanguageFromTab(tab),
          theme: 'aurora-dark',
          automaticLayout: true,
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          fontSize: 14,
          fontFamily: 'Consolas, "Courier New", monospace',
          lineNumbers: 'on',
          roundedSelection: false,
          scrollbar: {
            vertical: 'visible',
            horizontal: 'visible',
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8
          },
          suggestOnTriggerCharacters: true,
          acceptSuggestionOnEnter: 'on',
          tabCompletion: 'on',
          wordBasedSuggestions: true,
          parameterHints: {
            enabled: true
          },
          hover: {
            enabled: true
          },
          contextmenu: true,
          mouseWheelZoom: true,
          dragAndDrop: true,
          links: true,
          colorDecorators: true,
          lightbulb: {
            enabled: true
          },
          codeActionsOnSave: {
            'source.fixAll': true
          }
        });

        // Set up content change listener
        monacoEditorRef.current.onDidChangeModelContent(() => {
          const value = monacoEditorRef.current.getValue();
          onContentChange(value);
        });

        // Set up key bindings
        monacoEditorRef.current.addCommand(window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.KeyS, () => {
          console.log('Save triggered');
          // Trigger save action
        });

        monacoEditorRef.current.addCommand(window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.KeyF, () => {
          monacoEditorRef.current.trigger('keyboard', 'actions.find', {});
        });

        monacoEditorRef.current.addCommand(window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.KeyH, () => {
          monacoEditorRef.current.trigger('keyboard', 'actions.find', {});
        });

        setIsLoading(false);

      } catch (error) {
        console.error('Failed to initialize Monaco editor:', error);
        setIsLoading(false);
      }
    };

    initEditor();

    return () => {
      if (monacoEditorRef.current) {
        monacoEditorRef.current.dispose();
      }
    };
  }, [tab.id]);

  useEffect(() => {
    if (monacoEditorRef.current && tab.content !== undefined) {
      const currentValue = monacoEditorRef.current.getValue();
      if (currentValue !== tab.content) {
        monacoEditorRef.current.setValue(tab.content);
      }
    }
  }, [tab.content]);

  const getLanguageFromTab = (tab) => {
    switch (tab.type) {
      case 'auralite':
        return 'javascript'; // For now, transpile to JS
      case 'editor':
        // Try to detect language from file extension
        if (tab.title.includes('.js') || tab.title.includes('.jsx')) return 'javascript';
        if (tab.title.includes('.ts') || tab.title.includes('.tsx')) return 'typescript';
        if (tab.title.includes('.py')) return 'python';
        if (tab.title.includes('.html')) return 'html';
        if (tab.title.includes('.css')) return 'css';
        if (tab.title.includes('.json')) return 'json';
        if (tab.title.includes('.md')) return 'markdown';
        return 'javascript'; // Default
      default:
        return 'javascript';
    }
  };

  const handleRunCode = async () => {
    if (!monacoEditorRef.current) return;

    const code = monacoEditorRef.current.getValue();
    const language = getLanguageFromTab(tab);

    try {
      // Execute code through IPC
      if (window.electron) {
        const result = await window.electron.invoke('codecore-execute', { code, language });
        console.log('Code execution result:', result);
        
        // Show result in terminal or output panel
        if (result.success) {
          console.log('✅ Code executed successfully:', result.output);
        } else {
          console.error('❌ Code execution failed:', result.error);
        }
      }
    } catch (error) {
      console.error('Failed to execute code:', error);
    }
  };

  const handleFormatCode = () => {
    if (!monacoEditorRef.current) return;

    monacoEditorRef.current.getAction('editor.action.formatDocument').run();
  };

  const handleFindReplace = () => {
    if (!monacoEditorRef.current) return;

    monacoEditorRef.current.getAction('actions.find').run();
  };

  if (isLoading) {
    return (
      <div className="aurora-loading">
        <div className="aurora-loading-spinner"></div>
        Loading editor...
      </div>
    );
  }

  return (
    <div className="aurora-editor-container">
      {/* Editor Toolbar */}
      <div className="aurora-editor-toolbar">
        <div className="aurora-editor-toolbar-left">
          <button 
            className="aurora-button"
            onClick={handleRunCode}
            title="Run Code (Ctrl+Enter)"
          >
            ▶️ Run
          </button>
          
          <button 
            className="aurora-button"
            onClick={handleFormatCode}
            title="Format Code (Shift+Alt+F)"
          >
            🎨 Format
          </button>
          
          <button 
            className="aurora-button"
            onClick={handleFindReplace}
            title="Find & Replace (Ctrl+F)"
          >
            🔍 Find
          </button>
        </div>
        
        <div className="aurora-editor-toolbar-right">
          <span className="aurora-editor-language">
            {getLanguageFromTab(tab).toUpperCase()}
          </span>
          
          {tab.type === 'auralite' && (
            <span className="aurora-editor-badge">
              🔮 Auralite
            </span>
          )}
        </div>
      </div>

      {/* Editor Container */}
      <div 
        ref={editorRef} 
        className="aurora-editor"
        style={{ 
          height: 'calc(100% - 40px)',
          width: '100%'
        }}
      />

      {/* Editor Status */}
      <div className="aurora-editor-status">
        <span>Line {monacoEditorRef.current?.getPosition()?.lineNumber || 1}</span>
        <span>Column {monacoEditorRef.current?.getPosition()?.column || 1}</span>
        <span>{monacoEditorRef.current?.getModel()?.getLineCount() || 0} lines</span>
      </div>
    </div>
  );
};