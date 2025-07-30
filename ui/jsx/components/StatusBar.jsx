const { useState, useEffect } = React;

const StatusBar = ({ status, activeTab, sidebarOpen, terminalOpen, copilotOpen }) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [systemInfo, setSystemInfo] = useState({
    memory: '0 MB',
    cpu: '0%',
    uptime: '0s'
  });

  useEffect(() => {
    // Update time every second
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    // Update system info every 5 seconds
    const systemInterval = setInterval(() => {
      updateSystemInfo();
    }, 5000);

    return () => {
      clearInterval(timeInterval);
      clearInterval(systemInterval);
    };
  }, []);

  const updateSystemInfo = () => {
    // Mock system info for now
    setSystemInfo({
      memory: `${Math.floor(Math.random() * 1000 + 100)} MB`,
      cpu: `${Math.floor(Math.random() * 50 + 10)}%`,
      uptime: `${Math.floor(Math.random() * 3600)}s`
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'ready':
        return 'success';
      case 'processing':
        return 'warning';
      case 'error':
        return 'error';
      default:
        return 'success';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'ready':
        return '✅';
      case 'processing':
        return '⏳';
      case 'error':
        return '❌';
      default:
        return '✅';
    }
  };

  return (
    <div className="aurora-statusbar">
      {/* Left Section */}
      <div className="aurora-statusbar-left">
        <div className="aurora-statusbar-item">
          <span className="aurora-statusbar-icon">
            {getStatusIcon(status.status)}
          </span>
          <span className="aurora-statusbar-text">
            {status.message}
          </span>
        </div>
        
        {activeTab && (
          <div className="aurora-statusbar-item">
            <span className="aurora-statusbar-icon">📄</span>
            <span className="aurora-statusbar-text">
              {activeTab.title}
            </span>
          </div>
        )}
      </div>

      {/* Center Section */}
      <div className="aurora-statusbar-center">
        <div className="aurora-statusbar-item">
          <span className="aurora-statusbar-icon">💾</span>
          <span className="aurora-statusbar-text">
            {systemInfo.memory}
          </span>
        </div>
        
        <div className="aurora-statusbar-item">
          <span className="aurora-statusbar-icon">⚡</span>
          <span className="aurora-statusbar-text">
            {systemInfo.cpu}
          </span>
        </div>
        
        <div className="aurora-statusbar-item">
          <span className="aurora-statusbar-icon">⏱️</span>
          <span className="aurora-statusbar-text">
            {systemInfo.uptime}
          </span>
        </div>
      </div>

      {/* Right Section */}
      <div className="aurora-statusbar-right">
        <div className="aurora-statusbar-item">
          <span className="aurora-statusbar-icon">📁</span>
          <span className="aurora-statusbar-text">
            {sidebarOpen ? 'ON' : 'OFF'}
          </span>
        </div>
        
        <div className="aurora-statusbar-item">
          <span className="aurora-statusbar-icon">💻</span>
          <span className="aurora-statusbar-text">
            {terminalOpen ? 'ON' : 'OFF'}
          </span>
        </div>
        
        <div className="aurora-statusbar-item">
          <span className="aurora-statusbar-icon">🤖</span>
          <span className="aurora-statusbar-text">
            {copilotOpen ? 'ON' : 'OFF'}
          </span>
        </div>
        
        <div className="aurora-statusbar-item">
          <span className="aurora-statusbar-icon">🕐</span>
          <span className="aurora-statusbar-text">
            {currentTime.toLocaleTimeString()}
          </span>
        </div>
      </div>
    </div>
  );
};