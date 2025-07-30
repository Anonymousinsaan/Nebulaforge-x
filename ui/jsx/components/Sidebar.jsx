const { useState, useEffect } = React;

const Sidebar = ({ tabs, activeTab, onTabSelect, onTabClose, onNewProject }) => {
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [files, setFiles] = useState([]);
  const [currentPath, setCurrentPath] = useState('/workspace');

  useEffect(() => {
    // Load file structure
    loadFileStructure();
  }, []);

  const loadFileStructure = async () => {
    // Mock file structure for now
    const mockFiles = [
      { name: 'main.js', type: 'file', path: '/workspace/main.js', size: '1.2KB' },
      { name: 'package.json', type: 'file', path: '/workspace/package.json', size: '856B' },
      { name: 'src', type: 'folder', path: '/workspace/src', children: [
        { name: 'components', type: 'folder', path: '/workspace/src/components', children: [
          { name: 'App.jsx', type: 'file', path: '/workspace/src/components/App.jsx', size: '2.1KB' },
          { name: 'Header.jsx', type: 'file', path: '/workspace/src/components/Header.jsx', size: '1.8KB' }
        ]},
        { name: 'utils', type: 'folder', path: '/workspace/src/utils', children: [
          { name: 'helpers.js', type: 'file', path: '/workspace/src/utils/helpers.js', size: '3.2KB' }
        ]}
      ]},
      { name: 'public', type: 'folder', path: '/workspace/public', children: [
        { name: 'index.html', type: 'file', path: '/workspace/public/index.html', size: '1.5KB' },
        { name: 'styles.css', type: 'file', path: '/workspace/public/styles.css', size: '2.3KB' }
      ]},
      { name: 'node_modules', type: 'folder', path: '/workspace/node_modules', children: [] },
      { name: 'README.md', type: 'file', path: '/workspace/README.md', size: '4.1KB' }
    ];
    
    setFiles(mockFiles);
  };

  const toggleFolder = (folderPath) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderPath)) {
        newSet.delete(folderPath);
      } else {
        newSet.add(folderPath);
      }
      return newSet;
    });
  };

  const openFile = (file) => {
    // Check if file is already open
    const existingTab = tabs.find(tab => tab.title === file.name);
    if (existingTab) {
      onTabSelect(existingTab.id);
      return;
    }

    // Create new tab
    const newTab = {
      id: `file-${Date.now()}`,
      title: file.name,
      type: 'editor',
      content: `// ${file.name}\n// File opened in AURORA IDE\n\nconsole.log("Hello from ${file.name}!");`
    };

    // This would need to be handled by the parent component
    // For now, we'll just log it
    console.log('Opening file:', file);
  };

  const renderFileItem = (item, level = 0) => {
    const isExpanded = expandedFolders.has(item.path);
    const isFolder = item.type === 'folder';
    
    return (
      <div key={item.path} className="aurora-sidebar-item">
        <div 
          className={`aurora-sidebar-item-content ${isFolder ? 'aurora-sidebar-folder' : 'aurora-sidebar-file'}`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => {
            if (isFolder) {
              toggleFolder(item.path);
            } else {
              openFile(item);
            }
          }}
        >
          <span className="aurora-sidebar-item-icon">
            {isFolder ? (isExpanded ? '📁' : '📂') : '📄'}
          </span>
          
          <span className="aurora-sidebar-item-name">
            {item.name}
          </span>
          
          {!isFolder && (
            <span className="aurora-sidebar-item-size">
              {item.size}
            </span>
          )}
        </div>
        
        {isFolder && isExpanded && item.children && (
          <div className="aurora-sidebar-children">
            {item.children.map(child => renderFileItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderTabItem = (tab) => {
    const isActive = activeTab === tab.id;
    
    return (
      <div 
        key={tab.id} 
        className={`aurora-sidebar-tab ${isActive ? 'active' : ''}`}
        onClick={() => onTabSelect(tab.id)}
      >
        <span className="aurora-sidebar-tab-icon">
          {tab.type === 'editor' && '📄'}
          {tab.type === 'copilot' && '🤖'}
          {tab.type === 'auralite' && '🔮'}
        </span>
        
        <span className="aurora-sidebar-tab-name">
          {tab.title}
        </span>
        
        <button
          className="aurora-sidebar-tab-close"
          onClick={(e) => {
            e.stopPropagation();
            onTabClose(tab.id);
          }}
        >
          ×
        </button>
      </div>
    );
  };

  return (
    <div className="aurora-sidebar">
      {/* Sidebar Header */}
      <div className="aurora-sidebar-header">
        <div className="aurora-sidebar-title">
          <span className="aurora-sidebar-icon">📁</span>
          Explorer
        </div>
        
        <div className="aurora-sidebar-controls">
          <button 
            className="aurora-button"
            onClick={onNewProject}
            title="New file"
          >
            ➕ New
          </button>
        </div>
      </div>

      {/* Tabs Section */}
      <div className="aurora-sidebar-section">
        <div className="aurora-sidebar-section-header">
          OPEN EDITORS
        </div>
        <div className="aurora-sidebar-tabs">
          {tabs.map(renderTabItem)}
        </div>
      </div>

      {/* Files Section */}
      <div className="aurora-sidebar-section">
        <div className="aurora-sidebar-section-header">
          WORKSPACE
        </div>
        <div className="aurora-sidebar-files">
          {files.map(renderFileItem)}
        </div>
      </div>

      {/* Search */}
      <div className="aurora-sidebar-search">
        <input
          type="text"
          placeholder="Search files..."
          className="aurora-sidebar-search-input"
        />
      </div>
    </div>
  );
};