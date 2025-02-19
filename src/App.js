import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import RaindexMarketData from './components/RaindexMarketData';
import RaindexOrderAnalysis from './components/RaindexOrderAnalysis';
import RaindexVisualization from './components/RaindexVisualization';
import RaindexOrderList from './components/RaindexOrderList';
import RaindexActivityList from './components/RaindexActivityList';
import RaindexSolverStatus from './components/RaindexSolverStatus';

import './tailwind.css';

import logoIcon from './assets/h20-logo.png';

const Header = () => (
  <header className="border-b border-gray-300 bg-white p-4">
    <div className="flex items-center gap-5">
      {/* Logo Section */}
      <div className="flex items-center gap-2">
        <img src={logoIcon} alt="Logo" className="h-10 w-10" />
      </div>

      {/* Navigation Links */}
      <nav>
        <ul className="m-0 flex list-none gap-5 p-0">
          <li>
            <Link to="/" className="text-lg font-semibold text-indigo-600 no-underline">
              OrderBook
            </Link>
          </li>
          <li>
            <Link to="/market" className="text-lg font-semibold text-indigo-600 no-underline">
              Market Analysis
            </Link>
          </li>
          <li>
            <Link
              to="/order-analysis"
              className="text-lg font-semibold text-indigo-600 no-underline"
            >
              Order Analysis
            </Link>
          </li>
          <li>
            <Link to="/orderlist" className="text-lg font-semibold text-indigo-600 no-underline">
              Order List
            </Link>
          </li>
          <li>
            <Link to="/activitylist" className="text-lg font-semibold text-indigo-600 no-underline">
              Activity List
            </Link>
          </li>
          <li>
            <Link to="/solverlogs" className="text-lg font-semibold text-indigo-600 no-underline">
              Solver Logs
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
          <Route path="/market" element={<RaindexMarketData />} />
          <Route path="/order-analysis" element={<RaindexOrderAnalysis />} />
          <Route path="/orderlist" element={<RaindexOrderList />} />
          <Route path="/activitylist" element={<RaindexActivityList />} />
          <Route path="/solverlogs" element={<RaindexSolverStatus />} />
        </Routes>
      </main>
    </Router>
  );
};

export default App;
