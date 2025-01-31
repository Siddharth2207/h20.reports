
  import React, { useState, useEffect } from "react";
  import { fetchAndFilterOrders,fetchTradesQuery, tokenConfig, networkConfig, fetchAllPaginatedData } from "raindex-reports"
  import { ethers } from "ethers";

  
  const RaindexOrderList = () => {
    const [initialized, setInitialized] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedToken, setSelectedToken] = useState(null);
    const [filterActiveOrders, setFilterActiveOrders] = useState("all"); 
    const [network, setNetwork] = useState(null);
    const [allOrders, setAllOrders] = useState(null);    
    
    useEffect(() => {
      if (selectedToken) { // Ensures no request is made when there's no token selected
        fetchAndSetData(selectedToken, filterActiveOrders);
      }
    }, [selectedToken, filterActiveOrders]);

    // Function to filter orders based on active/inactive state
    const filteredOrders = allOrders?.filter((order) => {
      if (filterActiveOrders === "all") return true;
      return filterActiveOrders === "active" ? order.active : !order.active;
    });

    const fetchOrderTrades = async (endpoint, allOrders) => {
        let ordersWithTrades = []
        for(let i = 0; i < allOrders.length; i++){
            let order = allOrders[i]

            const trades = await fetchAllPaginatedData(
                endpoint,
                fetchTradesQuery,
                { orderHash: order.orderHash },
                "trades",
            );
            order["trades"] = trades.sort((a, b) => parseInt(b.timestamp) - parseInt(a.timestamp))
            ordersWithTrades[i] = order
        }
        return ordersWithTrades
    }
  
    const fetchAndSetData = async (token, filter) => {
      try {
        setInitialized(true);
        const network = tokenConfig[token]?.network;
        
        // Fetch active and inactive orders
        const { filteredActiveOrders, filteredInActiveOrders } = await fetchAndFilterOrders(
          token,
          network
        );
    
        let filteredOrders = [];
    
        // Apply the filter based on selected option
        if (filter === "active") {
          filteredOrders = filteredActiveOrders;
        } else if (filter === "inactive") {
          filteredOrders = filteredInActiveOrders;
        } else {
          filteredOrders = filteredActiveOrders.concat(filteredInActiveOrders); // Default: show all
        }
    
        // Fetch trades only for filtered orders
        let allOrders = await fetchOrderTrades(networkConfig[network].subgraphUrl, filteredOrders);
        
        setAllOrders(allOrders);
        setLoading(false);
      } catch (error) {
        setError(error);
      }
    };
    
    const renderOrdersTable = (orders) => {
      const formatTimestamp = (timestamp) => {
        return new Date(timestamp * 1000).toLocaleString("en-GB", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
      };
    
      const now = Math.floor(Date.now() / 1000); // Current timestamp
    
      return (
        <div className="overflow-x-auto bg-white rounded-lg shadow-lg w-full">
          <table className="table-auto w-full border-collapse border border-gray-200">
            <thead className="bg-gray-100">
              <tr className="text-left">
                <th className="border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700">NETWORK</th>
                <th className="border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700">LAST TRADE</th>
                <th className="border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700">FIRST TRADE</th>
                <th className="border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700">TOTAL TRADES</th>
                <th className="border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700">TRADES (24H)</th>
                <th className="border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700">INPUTS</th>
                <th className="border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700">OUTPUTS</th>
                <th className="border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700">INPUT CHANGE (24H)</th>
                <th className="border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700">OUTPUT CHANGE (24H)</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order, index) => {
                const trades = order.trades || [];
                const tradeTimestamps = trades.map((t) => parseInt(t.timestamp));
    
                const lastTrade = tradeTimestamps.length > 0 ? formatTimestamp(Math.max(...tradeTimestamps)) : "N/A";
                const firstTrade = tradeTimestamps.length > 0 ? formatTimestamp(Math.min(...tradeTimestamps)) : "N/A";
    
                const trades24h = trades.filter((trade) => now - parseInt(trade.timestamp) <= 86400).length;
    
                // Input Balances
                const inputBalances = order.inputs.map((input) => (
                  <div key={input.id} className="border border-gray-300 px-3 py-2 rounded bg-gray-50 text-sm mb-1">
                    {input.token.symbol}
                    <br />
                    Strategy Balance: {ethers.utils.formatUnits(input.balance, input.token.decimals)}
                  </div>
                ));
    
                // Output Balances
                const outputBalances = order.outputs.map((output) => (
                  <div key={output.id} className="border border-gray-300 px-3 py-2 rounded bg-gray-50 text-sm mb-1">
                    {output.token.symbol}
                    <br />
                    Strategy Balance: {ethers.utils.formatUnits(output.balance, output.token.decimals)}
                  </div>
                ));
    
                // Calculate input balance change percentage in last 24 hours (with vault token matching)
                const inputChange24h = order.inputs.map((input) => {
                  const filteredTrades = trades
                    .filter((trade) => now - parseInt(trade.timestamp) <= 86400)
                    .sort((a, b) => parseInt(a.timestamp) - parseInt(b.timestamp));
    
                  if (filteredTrades.length === 0) {
                    return (
                      <div key={input.token.address} className="border border-gray-300 px-3 py-2 rounded bg-gray-50 text-sm mb-1">
                        {`${input.token.symbol}: 0%`}
                      </div>
                      )
                  }
    
                  const oldestTrade = filteredTrades[0];
                  const latestTrade = filteredTrades[filteredTrades.length - 1];
    
                  const oldBalance = parseFloat(
                    input.token.address === oldestTrade.inputVaultBalanceChange?.vault.token.address
                      ? oldestTrade.inputVaultBalanceChange?.oldVaultBalance || "0"
                      : oldestTrade.outputVaultBalanceChange?.oldVaultBalance || "0"
                  );
    
                  const newBalance = parseFloat(
                    input.token.address === latestTrade.inputVaultBalanceChange?.vault.token.address
                      ? latestTrade.inputVaultBalanceChange?.newVaultBalance || "0"
                      : latestTrade.outputVaultBalanceChange?.newVaultBalance || "0"
                  );
    
                  const percentageChange = oldBalance > 0 ? ((newBalance - oldBalance) / oldBalance) * 100 : 0;
    
                  return (
                    <div key={input.token.address} className="border border-gray-300 px-3 py-2 rounded bg-gray-50 text-sm mb-1">
                      {`${input.token.symbol}: ${percentageChange.toFixed(4)}%`}
                    </div>
                  );
                });
    
                // Calculate output balance change percentage in last 24 hours (with vault token matching)
                const outputChange24h = order.outputs.map((output) => {
                  const filteredTrades = trades
                    .filter((trade) => now - parseInt(trade.timestamp) <= 86400)
                    .sort((a, b) => parseInt(a.timestamp) - parseInt(b.timestamp));
    
                  if (filteredTrades.length === 0){
                    return (
                      <div key={output.token.address} className="border border-gray-300 px-3 py-2 rounded bg-gray-50 text-sm mb-1">
                        {`${output.token.symbol}: 0%`}
                      </div>
                      )
                  }
    
                  const oldestTrade = filteredTrades[0];
                  const latestTrade = filteredTrades[filteredTrades.length - 1];
    
                  const oldBalance = parseFloat(
                    output.token.address === oldestTrade.outputVaultBalanceChange?.vault.token.address
                      ? oldestTrade.outputVaultBalanceChange?.oldVaultBalance || "0"
                      : oldestTrade.inputVaultBalanceChange?.oldVaultBalance || "0"
                  );
    
                  const newBalance = parseFloat(
                    output.token.address === latestTrade.outputVaultBalanceChange?.vault.token.address
                      ? latestTrade.outputVaultBalanceChange?.newVaultBalance || "0"
                      : latestTrade.inputVaultBalanceChange?.newVaultBalance || "0"
                  );
    
                  const percentageChange = oldBalance > 0 ? ((newBalance - oldBalance) / oldBalance) * 100 : 0;
    
                  return (
                    <div key={output.token.address} className="border border-gray-300 px-3 py-2 rounded bg-gray-50 text-sm mb-1">
                      {`${output.token.symbol}: ${percentageChange.toFixed(4)}%`}
                    </div>
                  );
                });
    
                return (
                  <tr key={index} className="border-t border-gray-300">
                    <td className="border border-gray-300 px-4 py-3 text-sm text-gray-700">{network}</td>
                    <td className="border border-gray-300 px-4 py-3 text-sm text-gray-700">{lastTrade}</td>
                    <td className="border border-gray-300 px-4 py-3 text-sm text-gray-700">{firstTrade}</td>
                    <td className="border border-gray-300 px-4 py-3 text-sm text-gray-700">{trades.length}</td>
                    <td className="border border-gray-300 px-4 py-3 text-sm text-gray-700">{trades24h}</td>
                    <td className="border border-gray-300 px-4 py-3 text-sm text-gray-700">{inputBalances}</td>
                    <td className="border border-gray-300 px-4 py-3 text-sm text-gray-700">{outputBalances}</td>
                    <td className="border border-gray-300 px-4 py-3 text-sm text-gray-700">{inputChange24h}</td>
                    <td className="border border-gray-300 px-4 py-3 text-sm text-gray-700">{outputChange24h}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    };
    
    if (error) {
      return <div>Error: {error}</div>;
    }

    const handleFiltersApply = (token, filter) => {
      setNetwork(tokenConfig[token].network);
      setSelectedToken(token);
      setFilterActiveOrders(filter);
      setInitialized(true);
      setLoading(true);
    };
    
    return (
      <div className="p-6 bg-gray-50 min-h-screen">
        {/* New Native Header */}
        <div className="bg-gray-800 text-white p-4 flex flex-col md:flex-row items-center justify-between rounded-lg shadow-lg">
          {/* Left Side: Header */}
          <h1 className="text-lg font-semibold uppercase tracking-wide">Market Reports</h1>
    
          {/* Right Side: Filters */}
          <div className="flex flex-wrap items-center gap-4 mt-2 md:mt-0">
            {/* Token Dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Token:</span>
              <select
                value={selectedToken || ""}
                onChange={(e) => handleFiltersApply(e.target.value, filterActiveOrders)}
                className="bg-gray-700 text-white p-2 rounded text-sm"
              >
                <option value="" disabled>Select a token</option> {/* Placeholder option */}
                {Object.keys(tokenConfig).map((token, index) => (
                  <option key={index} value={token}>
                    {token}
                  </option>
                ))}
              </select>
            </div>

    
            {/* Active/Inactive Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Filter:</span>
              <select
                value={filterActiveOrders}
                onChange={(e) => handleFiltersApply(selectedToken, e.target.value)}
                className="bg-gray-700 text-white p-2 rounded text-sm"
              >
                <option value="all">All Orders</option>
                <option value="active">Active Orders</option>
                <option value="inactive">Inactive Orders</option>
              </select>
            </div>
          </div>
        </div>
    
        {initialized ? (
          loading ? (
            <div className="flex flex-col items-center justify-center h-screen bg-gray-100">
              <div className="spinner w-10 h-10 border-4 border-gray-300 border-t-indigo-500 rounded-full animate-spin"></div>
              <p>Loading...</p>
            </div>
          ) : (
            <div className="max-w-screen-3xl mx-auto p-8 bg-gray-100 rounded-lg shadow-lg">
              <div className="p-6 bg-gray-100 border-b border-gray-300">
                <h1 className="text-2xl font-bold text-gray-800">{selectedToken.toUpperCase()} Order List</h1>
              </div>
    
              {/* Full-Width Table */}
              <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                {filteredOrders && renderOrdersTable(filteredOrders)}
              </div>
    
              <div className="mt-8 bg-gray-100 text-gray-700 text-base p-6 rounded-lg">
                <h3 className="text-left font-semibold text-lg mb-4">Data Sources</h3>
                <ul className="list-disc list-inside space-y-2">
                  <li>
                    <a
                      href="https://docs.envio.dev/docs/HyperSync/overview"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      HyperSync Documentation
                    </a>
                  </li>
                  <li>
                    <a
                      href={networkConfig[tokenConfig[selectedToken.toUpperCase()]?.network].subgraphUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      Raindex Subgraph API
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center bg-gray-100 rounded-lg shadow-md p-6 text-center">
            <p className="text-gray-700">
              Please select a <span className="text-blue-900 font-medium">token</span> and filter orders.
            </p>
          </div>
        )}
      </div>
    );
    
  };
  
  export default RaindexOrderList;