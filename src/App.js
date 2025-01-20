import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import RechartsDashboard from "./components/RechartsDashboard";
import RaindexVisualization from "./components/RaindexVisualization";
import './tailwind.css';

import logoIcon from './assets/h20-logo.png';

const Header = () => (
  <header className="p-4 bg-white border-b border-gray-300">
    <div className="flex items-center gap-5">
      {/* Logo Section */}
      <div className="flex items-center gap-2">
        <img src={logoIcon} alt="Logo" className="w-10 h-10" />
      </div>

      {/* Navigation Links */}
      <nav>
        <ul className="flex gap-5 list-none m-0 p-0">
          <li>
            <Link
              to="/"
              className="text-indigo-600 font-semibold text-lg no-underline"
            >
              OrderBook Visualization
            </Link>
          </li>
          <li>
            <Link
              to="/reports"
              className="text-indigo-600 font-semibold text-lg no-underline"
            >
              Market Reports
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  </header>
);

const App = () => {
  return (
    <Router>
      <Header />
      <main className="p-5">
        <Routes>
          <Route path="/" element={<RaindexVisualization />} />
          <Route
            path="/reports"
            element={<RechartsDashboard />}
          />
        </Routes>
      </main>
    </Router>
  );
};

export default App;


