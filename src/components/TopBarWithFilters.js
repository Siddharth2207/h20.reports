import React, { useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const TopBarWithFilters = ({ onApplyFilters, tokenOptions }) => {
  const [customRange, setCustomRange] = useState({ from: null, to: null });
  const [selectedToken, setSelectedToken] = useState(tokenOptions[0]);

  const handleDateChange = (key, date) => {
    setCustomRange((prev) => ({ ...prev, [key]: date }));
  };

  const handleApplyFilters = () => {
    onApplyFilters(customRange, selectedToken);
  };

  return (
    <div className="bg-gray-800 text-white p-4 flex items-center justify-between rounded-lg shadow-lg">
      {/* Left Side: Header */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-semibold uppercase tracking-wide">Market Reports</span>
      </div>

      {/* Right Side: Filters */}
      <div className="flex items-center gap-6">
        {/* Custom Range */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">From:</span>
          <DatePicker
            selected={customRange.from}
            onChange={(date) => handleDateChange("from", date)}
            showTimeSelect
            timeFormat="HH:mm:ss"
            timeIntervals={1}
            dateFormat="yyyy-MM-dd HH:mm:ss"
            className="bg-gray-700 text-white p-2 rounded text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">To:</span>
          <DatePicker
            selected={customRange.to}
            onChange={(date) => handleDateChange("to", date)}
            showTimeSelect
            timeFormat="HH:mm:ss"
            timeIntervals={1}
            dateFormat="yyyy-MM-dd HH:mm:ss"
            className="bg-gray-700 text-white p-2 rounded text-sm"
          />
        </div>

        {/* Token Dropdown */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Token:</span>
          <select
            value={selectedToken}
            onChange={(e) => setSelectedToken(e.target.value)}
            className="bg-gray-700 text-white p-2 rounded text-sm"
          >
            {tokenOptions.map((token, index) => (
              <option key={index} value={token}>
                {token}
              </option>
            ))}
          </select>
        </div>

        {/* Apply Filters Button */}
        <button
          onClick={handleApplyFilters}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-4 py-2 rounded text-sm"
        >
          Apply Filters
        </button>
      </div>
    </div>
  );
};

export default TopBarWithFilters;
