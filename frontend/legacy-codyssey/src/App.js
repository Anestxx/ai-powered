import React, { useState } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import MapView from './components/MapView';
import AlertsPanel from './components/AlertsPanel';
import RoutePlanner from './components/RoutePlanner';

function App() {
  const [activeTab, setActiveTab] = useState('map');

  return (
    <div className="app">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <div className="main">
        {activeTab === 'map' && <MapView />}
        {activeTab === 'alerts' && <AlertsPanel />}
        {activeTab === 'route' && <RoutePlanner />}
      </div>
    </div>
  );
}

export default App;