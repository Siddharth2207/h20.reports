import React, { useState, useEffect } from "react";
import {fetchDataForElapsedTime, formatTimestamp, formatBalance, getOrderLink} from "./RaindexOrderList"

const OrdersTable = () => {

    const [activeTab, setActiveTab] = useState("24h");
    const [dailyData, setDailyData] = useState([]);
    const [dailyDataLoading, setDailyDataLoading] = useState(false);
    const [ownerFilter, setOwnerFilter] = useState("");
    const [orderStatus, setOrderStatus] = useState("");


    const [weeklyData, setWeeklyData] = useState([]);
    const [weeklyDataLoading, setWeeklyDataLoading] = useState(false);

    const handleOwnerFilterChange = (e) => {
      setOwnerFilter(e.target.value.trim()); // Trim spaces
    };

    const filteredDailyData = dailyData.filter((order) => {
      const ownerMatches = !ownerFilter || order.owner.toLowerCase().includes(ownerFilter.toLowerCase());
      const statusMatches = orderStatus === "" || (orderStatus === "active" ? order.active === true : order.active === false);
      return ownerMatches && statusMatches;
    });
    
    const filteredWeeklyData = weeklyData.filter((order) => {
      const ownerMatches = !ownerFilter || order.owner.toLowerCase().includes(ownerFilter.toLowerCase());
      const statusMatches = orderStatus === "" || (orderStatus === "active" ? order.active === true : order.active === false);
      return ownerMatches && statusMatches;
    });
    

    useEffect(() => {
      if (activeTab === "24h" && dailyData.length === 0) {
        setDailyDataLoading(true);
        
        const fetchData = async () => {
          try {
            console.log("Fetching daily data...");
            const dailyDataResponse = await fetchDataForElapsedTime(86400);
            setDailyData(dailyDataResponse);
          } catch (error) {
            console.error("Error setting 24h data:", error);
          } finally {
            setDailyDataLoading(false);
          }
        };
    
        fetchData();
      }
    }, [activeTab, dailyData]);

    useEffect(() => {
      if (activeTab === "weekly" && weeklyData.length === 0) {
        setWeeklyDataLoading(true);
        
        const fetchData = async () => {
          try {
            const weeklyData = await fetchDataForElapsedTime(86400 * 7);
            setWeeklyData(weeklyData);
          } catch (error) {
            console.error("Error fetching weekly data:", error);
          } finally {
            setWeeklyDataLoading(false);
          }
        };
    
        fetchData();
      }
    }, [activeTab, weeklyData]);
    
    const handleSortByVaultBalance = (orders, sortType) => {
      let sorted = [...orders];
    
      switch (sortType) {
        case "firstTradeAsc":
          sorted.sort((a, b) => a.firstTrade - b.firstTrade);
          break;
    
        case "firstTradeDesc":
          sorted.sort((a, b) => b.firstTrade - a.firstTrade);
          break;

        case "lastTradeAsc":
          sorted.sort((a, b) => a.lastTrade - b.lastTrade);
          break;
    
        case "lastTradeDesc":
          sorted.sort((a, b) => b.lastTrade - a.lastTrade);
          break;

        case "totalTradesAsc":
          sorted.sort((a, b) => a.trades.length - b.trades.length);
          break;
    
        case "totalTradesDesc":
          sorted.sort((a, b) => b.trades.length - a.trades.length);
          break;
    
        case "trades24hAsc":
          sorted.sort((a, b) => a.trades24h - b.trades24h);
          break;
    
        case "trades24hDesc":
          sorted.sort((a, b) => b.trades24h - a.trades24h);
          break;
    
        case "inputAsc":
          sorted.sort((a, b) => {
            const aBalance = parseFloat(a.inputs.reduce((sum, input) => sum + parseFloat(input.balance || "0"), 0));
            const bBalance = parseFloat(b.inputs.reduce((sum, input) => sum + parseFloat(input.balance || "0"), 0));
            return aBalance - bBalance;
          });
          break;
    
        case "inputDesc":
          sorted.sort((a, b) => {
            const aBalance = parseFloat(a.inputs.reduce((sum, input) => sum + parseFloat(input.balance || "0"), 0));
            const bBalance = parseFloat(b.inputs.reduce((sum, input) => sum + parseFloat(input.balance || "0"), 0));
            return bBalance - aBalance;
          });
          break;
    
        case "outputAsc":
          sorted.sort((a, b) => {
            const aBalance = parseFloat(a.outputs.reduce((sum, output) => sum + parseFloat(output.balance || "0"), 0));
            const bBalance = parseFloat(b.outputs.reduce((sum, output) => sum + parseFloat(output.balance || "0"), 0));
            return aBalance - bBalance;
          });
          break;
    
        case "outputDesc":
          sorted.sort((a, b) => {
            const aBalance = parseFloat(a.outputs.reduce((sum, output) => sum + parseFloat(output.balance || "0"), 0));
            const bBalance = parseFloat(b.outputs.reduce((sum, output) => sum + parseFloat(output.balance || "0"), 0));
            return bBalance - aBalance;
          });
          break;
        
          case "vol24hAsc":
            sorted.sort((a, b) => {
              const aBalance = parseFloat(a.volume24H.reduce((sum, input) => sum + parseFloat(input.totalVolume || "0"), 0));
              const bBalance = parseFloat(b.volume24H.reduce((sum, input) => sum + parseFloat(input.totalVolume || "0"), 0));
              return aBalance - bBalance;
            });
            break;
      
          case "vol24hDesc":
            sorted.sort((a, b) => {
              const aBalance = parseFloat(a.volume24H.reduce((sum, input) => sum + parseFloat(input.totalVolume || "0"), 0));
              const bBalance = parseFloat(b.volume24H.reduce((sum, input) => sum + parseFloat(input.totalVolume || "0"), 0));
              return bBalance - aBalance;
            });
            break;
      
          case "volTotalAsc":
            sorted.sort((a, b) => {
              const aBalance = parseFloat(a.volumeTotal.reduce((sum, output) => sum + parseFloat(output.totalVolume || "0"), 0));
              const bBalance = parseFloat(b.volumeTotal.reduce((sum, output) => sum + parseFloat(output.totalVolume || "0"), 0));
              return aBalance - bBalance;
            });
            break;
      
          case "volTotalDesc":
            sorted.sort((a, b) => {
              const aBalance = parseFloat(a.volumeTotal.reduce((sum, output) => sum + parseFloat(output.totalVolume || "0"), 0));
              const bBalance = parseFloat(b.volumeTotal.reduce((sum, output) => sum + parseFloat(output.totalVolume || "0"), 0));
              return bBalance - aBalance;
            });
            break;
          
          case "inputsAsc":
            sorted.sort((a, b) => {
              const aBalance = parseFloat(a.inputDepositsWithdraws.reduce((sum, input) => sum + parseFloat(input.currentVaultInputs || "0"), 0)) + 
                               parseFloat(a.outputDepositsWithdraws.reduce((sum, output) => sum + parseFloat(Math.abs(output.currentVaultInputs) || "0"), 0));
              const bBalance = parseFloat(b.inputDepositsWithdraws.reduce((sum, input) => sum + parseFloat(input.currentVaultInputs || "0"), 0)) + 
                               parseFloat(a.outputDepositsWithdraws.reduce((sum, output) => sum + parseFloat(Math.abs(output.currentVaultInputs) || "0"), 0));
              return aBalance - bBalance;
            });
            break;
      
          case "inputsDesc":
            sorted.sort((a, b) => {
              const aBalance = parseFloat(a.inputDepositsWithdraws.reduce((sum, input) => sum + parseFloat(input.currentVaultInputs || "0"), 0)) + 
                               parseFloat(a.outputDepositsWithdraws.reduce((sum, output) => sum + parseFloat(Math.abs(output.currentVaultInputs) || "0"), 0));
              const bBalance = parseFloat(b.inputDepositsWithdraws.reduce((sum, input) => sum + parseFloat(input.currentVaultInputs || "0"), 0)) + 
                               parseFloat(a.outputDepositsWithdraws.reduce((sum, output) => sum + parseFloat(Math.abs(output.currentVaultInputs) || "0"), 0));
              return bBalance - aBalance;
            });
            break;
          
          case "differentialAsc":
            sorted.sort((a, b) => {
              const aBalance = parseFloat(a.inputDepositsWithdraws.reduce((sum, input) => sum + parseFloat(input.vaultDifferentialPercentage || "0"), 0)) + 
                                parseFloat(a.outputDepositsWithdraws.reduce((sum, output) => sum + parseFloat(Math.abs(output.vaultDifferentialPercentage) || "0"), 0));
              const bBalance = parseFloat(b.inputDepositsWithdraws.reduce((sum, input) => sum + parseFloat(input.vaultDifferentialPercentage || "0"), 0)) + 
                                parseFloat(a.outputDepositsWithdraws.reduce((sum, output) => sum + parseFloat(Math.abs(output.vaultDifferentialPercentage) || "0"), 0));
              return aBalance - bBalance;
            });
            break;
      
          case "differentialDesc":
            sorted.sort((a, b) => {
              const aBalance = parseFloat(a.inputDepositsWithdraws.reduce((sum, input) => sum + parseFloat(input.vaultDifferentialPercentage || "0"), 0)) + 
                                parseFloat(a.outputDepositsWithdraws.reduce((sum, output) => sum + parseFloat(Math.abs(output.vaultDifferentialPercentage) || "0"), 0));
              const bBalance = parseFloat(b.inputDepositsWithdraws.reduce((sum, input) => sum + parseFloat(input.vaultDifferentialPercentage || "0"), 0)) + 
                                parseFloat(a.outputDepositsWithdraws.reduce((sum, output) => sum + parseFloat(Math.abs(output.vaultDifferentialPercentage) || "0"), 0));
              return bBalance - aBalance;
            });
            break;
            
          case "inputDepositWithdrawalsAsc":
            sorted.sort((a, b) => {
              const aChange = 
              parseFloat(a.inputDepositsWithdraws.reduce((sum, input) => sum + parseFloat(Math.abs(input.totalVaultDeposits) || "0"), 0)) + 
              parseFloat(a.inputDepositsWithdraws.reduce((sum, input) => sum + parseFloat(Math.abs(input.totalVaultWithdrawals) || "0"), 0));
  
              const bChange = 
              parseFloat(b.inputDepositsWithdraws.reduce((sum, input) => sum + parseFloat(Math.abs(input.totalVaultDeposits) || "0"), 0)) + 
              parseFloat(b.inputDepositsWithdraws.reduce((sum, input) => sum + parseFloat(Math.abs(input.totalVaultWithdrawals) || "0"), 0));
              return aChange - bChange;
            });
            break;
          
          case "inputDepositWithdrawalsDesc":
            sorted.sort((a, b) => {
              const aChange = 
              parseFloat(a.inputDepositsWithdraws.reduce((sum, input) => sum + parseFloat(Math.abs(input.totalVaultDeposits) || "0"), 0)) + 
              parseFloat(a.inputDepositsWithdraws.reduce((sum, input) => sum + parseFloat(Math.abs(input.totalVaultWithdrawals) || "0"), 0));
  
              const bChange = 
              parseFloat(b.inputDepositsWithdraws.reduce((sum, input) => sum + parseFloat(Math.abs(input.totalVaultDeposits) || "0"), 0)) + 
              parseFloat(b.inputDepositsWithdraws.reduce((sum, input) => sum + parseFloat(Math.abs(input.totalVaultWithdrawals) || "0"), 0));
              return bChange - aChange;
            });
            break;
          
          case "outputDepositWithdrawalsAsc":
            sorted.sort((a, b) => {
              const aChange = 
              parseFloat(a.outputDepositsWithdraws.reduce((sum, output) => sum + parseFloat(Math.abs(output.totalVaultDeposits) || "0"), 0)) + 
              parseFloat(a.outputDepositsWithdraws.reduce((sum, output) => sum + parseFloat(Math.abs(output.totalVaultWithdrawals) || "0"), 0));
  
              const bChange = 
              parseFloat(b.outputDepositsWithdraws.reduce((sum, output) => sum + parseFloat(Math.abs(output.totalVaultDeposits) || "0"), 0)) + 
              parseFloat(b.outputDepositsWithdraws.reduce((sum, output) => sum + parseFloat(Math.abs(output.totalVaultWithdrawals) || "0"), 0))
              return aChange - bChange;
            });
            break;
          
          case "outputDepositWithdrawalsDesc":
            sorted.sort((a, b) => {
              const aChange = 
              parseFloat(a.outputDepositsWithdraws.reduce((sum, output) => sum + parseFloat(Math.abs(output.totalVaultDeposits) || "0"), 0)) + 
              parseFloat(a.outputDepositsWithdraws.reduce((sum, output) => sum + parseFloat(Math.abs(output.totalVaultWithdrawals) || "0"), 0));
  
              const bChange = 
              parseFloat(b.outputDepositsWithdraws.reduce((sum, output) => sum + parseFloat(Math.abs(output.totalVaultDeposits) || "0"), 0)) + 
              parseFloat(b.outputDepositsWithdraws.reduce((sum, output) => sum + parseFloat(Math.abs(output.totalVaultWithdrawals) || "0"), 0))
              return bChange - aChange;
            });
            break;
  
        default:
          sorted = [...orders]; // Reset to original order if no valid sortType is selected
      }
    
      if (activeTab === "24h") {
        setDailyData(sorted);
      } else if (activeTab === "weekly") {
        setWeeklyData(sorted);
      }
    };

    return (
      <div className="overflow-x-auto bg-white rounded-lg shadow-lg w-full">
        <div className="flex border-b border-gray-300 bg-gray-100 rounded-t-lg">
          {[ "24h", "weekly"].map((tab) => (
            <button
              key={tab}
              className={`px-6 py-3 text-sm font-medium transition-all ${
                activeTab === tab
                  ? "border-b-2 border-indigo-500 text-indigo-600 font-semibold bg-white"
                  : "text-gray-600 hover:text-indigo-500"
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {
              tab === "24h" ? "24h Activity" : 
              "Weekly Activity"
              }
            </button>
          ))}
        </div>

        {/* Filters Section */}
        <div className="p-4 bg-gray-50 flex items-center justify-between rounded-lg shadow-md border border-gray-200">
          {/* Owner Filter Input */}
          <div className="flex items-center">
            <label className="text-gray-700 font-semibold text-sm mr-3">Filter by Owner:</label>
            <input
              type="text"
              className="p-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-80 text-sm text-gray-900 placeholder-gray-400"
              placeholder="Enter owner address..."
              value={ownerFilter}
              onChange={handleOwnerFilterChange}
            />
          </div>

          {/* Order Status Filter */}
          <div className="flex items-center">
            <label className="text-gray-700 font-semibold text-sm mr-3">Status:</label>
            <select
              className="p-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-gray-900"
              value={orderStatus}
              onChange={(e) => setOrderStatus(e.target.value)}
            >
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>




        <table className="table-auto w-full border-collapse border border-gray-200">
        <thead className="bg-gray-50 text-gray-800 text-sm font-semibold">
          <tr className="border-b border-gray-300">
            <th className="px-4 py-3 text-left">Network</th>
            

            {(activeTab === "24h" || activeTab === "weekly") && (
              <>
                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      activeTab === "24h" ? dailyData : weeklyData, 
                      e.target.value
                    )}
                  >
                    <option value="lastTradeAsc">Last Trade ↑</option>
                    <option value="lastTradeDesc">Last Trade ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      activeTab === "24h" ? dailyData : weeklyData, 
                      e.target.value
                    )}
                  >
                    <option value="firstTradeAsc">First Trade ↑</option>
                    <option value="firstTradeDesc">First Trade ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-left">Order Status</th>
                <th className="px-4 py-3 text-center">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      activeTab === "24h" ? dailyData : weeklyData, 
                      e.target.value
                    )}
                  >
                    <option value="totalTradesAsc">Total Trades ↑</option>
                    <option value="totalTradesDesc">Total Trades ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-center">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      activeTab === "24h" ? dailyData : weeklyData, 
                      e.target.value
                    )}
                  >
                    <option value="trades24hAsc">24h Trades ↑</option>
                    <option value="trades24hDesc">24h Trades ↓</option>
                  </select>
                </th>

                {/* <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      activeTab === "24h" ? dailyData : weeklyData, 
                      e.target.value
                    )}
                  >
                    <option value="inputChangeAsc">Input Δ 24h ↑</option>
                    <option value="inputChangeDesc">Input Δ 24h ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      activeTab === "24h" ? dailyData : weeklyData, 
                      e.target.value
                    )}
                  >
                    <option value="outputChangeAsc">Output Δ 24h ↑</option>
                    <option value="outputChangeDesc">Output Δ 24h ↓</option>
                  </select>
                </th> */}

                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      activeTab === "24h" ? dailyData : weeklyData, 
                      e.target.value
                    )}
                  >
                    <option value="volTotalAsc">Total Volume ↑</option>
                    <option value="volTotalDesc">Total Volume ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      activeTab === "24h" ? dailyData : weeklyData, 
                      e.target.value
                    )}
                  >
                    <option value="vol24hAsc">24h Volume ↑</option>
                    <option value="vol24hDesc">24h Volume ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      activeTab === "24h" ? dailyData : weeklyData, 
                      e.target.value
                    )}
                  >
                    <option value="inputAsc">Input Balance ↑</option>
                    <option value="inputDesc">Input Balance ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      activeTab === "24h" ? dailyData : weeklyData, 
                      e.target.value
                    )}
                  >
                    <option value="outputAsc">Output Balance ↑</option>
                    <option value="outputDesc">Output Balance ↓</option>
                  </select>
                </th>

              </>
            )}

            <th className="px-4 py-3 text-left">Hash</th>
          </tr>
        </thead>

          <tbody>
              {
                (activeTab === "24h") && (
                  <>
                    {
                      dailyDataLoading ? (
                        <tr>
                          <td colSpan="100%" className="py-6 text-center">
                            <div className="flex flex-col items-center justify-center">
                              <div className="w-10 h-10 border-4 border-gray-300 border-t-indigo-600 rounded-full animate-spin"></div>
                              <p className="mt-3 text-gray-600 font-medium text-lg">Loading...</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <>
                          {
                            filteredDailyData.map((order, index) => (
                              <tr key={index} className="border-t border-gray-300 text-gray-700">
                                <td className="px-4 py-3 text-sm">{order.network}</td>
                                <td className="px-4 py-3 text-sm">{formatTimestamp(order.lastTrade)}</td>
                                <td className="px-4 py-3 text-sm">{formatTimestamp(order.firstTrade)}</td>
                                <td
                                  className={`px-4 py-3 text-sm font-semibold ${
                                    order.active ? "text-green-600" : "text-red-600"
                                  }`}
                                >
                                  {order.active ? "Active" : "Inactive"}
                                </td>
                                <td className="px-4 py-3 text-sm text-center">{order.trades.length}</td>
                                <td className="px-4 py-3 text-sm text-center">{order.trades24h}</td>
      
                               <td className="px-4 py-3 text-sm">
                                  {order.volumeTotal.length > 0 ? (
                                    <>
                                    {
                                      order.volumeTotal.map((output, index) => (
                                        <div key={index} className="flex justify-between px-3 py-2 rounded-lg shadow-sm text-sm">
                                          <span className="font-semibold">{output.token}</span>
                                          <span className="text-gray-800">{formatBalance(output.totalVolume)}</span>
                                        </div>
                                      ))
                                    }
                                    <div
                                      className="flex justify-between items-center px-3 py-2 rounded-lg shadow-sm text-sm font-medium"
                                    >
                                      <span className="font-semibold text-gray-600">Total Volume (USD)</span>
                                      <span>
                                      ${formatBalance(
                                        order.orderTotalVolumeUsd
                                      )}
                                    </span>
        
                                    </div>
                                    </>
                                  ) : (
                                    <div className="flex justify-center items-center h-10 text-gray-600 font-medium text-sm rounded-lg shadow-sm">
                                              N/A
                                    </div>
                                  )}
                                </td>

                                {/* 24H Volume */}
                                <td className="px-4 py-3 text-sm">
                                  {order.volume24H.length > 0 ? (
                                    <>
                                    {
                                      order.volume24H.map((output, index) => (
                                        <div key={index} className="flex justify-between px-3 py-2 rounded-lg shadow-sm text-sm">
                                          <span className="font-semibold">{output.token}</span>
                                          <span className="text-gray-800">{formatBalance(output.totalVolume)}</span>
                                        </div>
                                      ))
                                    }
                                    <div
                                      className="flex justify-between items-center px-3 py-2 rounded-lg shadow-sm text-sm font-medium"
                                    >
                                      <span className="font-semibold text-gray-600">24H Volume (USD)</span>
                                      <span>
                                      ${formatBalance(
                                        order.order24hVolumeUsd
                                      )}
                                    </span>
        
                                    </div>
                                    </>
                                  ) : (
                                    <div className="flex justify-center items-center h-10 text-gray-600 font-medium text-sm rounded-lg shadow-sm">
                                              N/A
                                    </div>
                                  )}
                                </td>

                                {/* Input Balance */}
                                <td className="px-4 py-3 text-sm">
                                  <>
                                      {order.inputBalances.map((input, index) => (
                                        
                                          <div key={index} className="flex justify-between px-3 py-2 rounded-lg shadow-sm text-sm">
                                            <span className="font-semibold">{input.inputToken}</span>
                                            <span className="text-gray-800">{formatBalance(input.inputTokenBalance)}</span>
                                          </div>
                                      ))}
                                      <div
                                        className="flex justify-between items-center px-3 py-2 rounded-lg shadow-sm text-sm font-medium"
                                      >
                                        <span className="font-semibold text-gray-600">USD : </span>
                                        <span>
                                          ${formatBalance(
                                            order.inputBalances.reduce((sum, input) => {
                                              return sum + (parseFloat(input.inputTokenBalance) * parseFloat(order.tokenPriceMap[input.inputTokenAddress.toLowerCase()]));
                                            }, 0)
                                          )}
                                        </span>
                                      </div>
                                  </>
                                </td>
      
                                {/* Output Balance */}
                                <td className="px-4 py-3 text-sm">
                                  <>
                                    {order.outputBalances.map((output, index) => (
                                      <div key={index} className="flex justify-between px-3 py-2 rounded-lg shadow-sm text-sm">
                                        <span className="font-semibold">{output.outputToken}</span>
                                        <span className="text-gray-800">{formatBalance(output.outputTokenBalance)}</span>
                                      </div>
                                    ))}
                                    <div
                                      className="flex justify-between items-center px-3 py-2 rounded-lg shadow-sm text-sm font-medium"
                                    >
                                      <span className="font-semibold text-gray-600">USD : </span>
                                      <span>
                                        ${formatBalance(
                                          order.outputBalances.reduce((sum, output) => {
                                            return sum + (parseFloat(output.outputTokenBalance) * parseFloat(order.tokenPriceMap[output.outputTokenAddress.toLowerCase()]));
                                          }, 0)
                                        )}
                                      </span>
                                    </div>
                                  </>
                                </td>

                                <td className="py-2 px-4 text-blue-500 underline">
                                      <a href={getOrderLink(order.orderHash, order.network)} target="_blank" rel="noopener noreferrer">
                                        {`${order.orderHash.slice(0, 6)}...${order.orderHash.slice(-4)}`}
                                      </a>
                                </td>
                              </tr>
                            ))
                          }
                        </>
                        
                      )
                    }
                  </>
                )
              }
              {
                (activeTab === "weekly") && (
                  <>
                    {
                      weeklyDataLoading ? (
                        <tr>
                          <td colSpan="100%" className="py-6 text-center">
                            <div className="flex flex-col items-center justify-center">
                              <div className="w-10 h-10 border-4 border-gray-300 border-t-indigo-600 rounded-full animate-spin"></div>
                              <p className="mt-3 text-gray-600 font-medium text-lg">Loading...</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <>
                          {
                            filteredWeeklyData.map((order, index) => (
                              <tr key={index} className="border-t border-gray-300 text-gray-700">
                                <td className="px-4 py-3 text-sm">{order.network}</td>
                                <td className="px-4 py-3 text-sm">{formatTimestamp(order.lastTrade)}</td>
                                <td className="px-4 py-3 text-sm">{formatTimestamp(order.firstTrade)}</td>
                                <td
                                  className={`px-4 py-3 text-sm font-semibold ${
                                    order.active ? "text-green-600" : "text-red-600"
                                  }`}
                                >
                                  {order.active ? "Active" : "Inactive"}
                                </td>
                                <td className="px-4 py-3 text-sm text-center">{order.trades.length}</td>
                                <td className="px-4 py-3 text-sm text-center">{order.trades24h}</td>
      
                                {/* <td className="px-4 py-3 text-sm">
                                  {order.inputChange24h.map((change, index) => (
                                    <div key={index} className="flex justify-between px-3 py-2 rounded-lg shadow-sm text-sm">
                                      <span className="font-semibold">{change.inputToken}</span>
                                      <span className={`font-medium ${change.inputPercentageChange >= 0 ? "text-green-600" : "text-red-600"}`}>
                                        {`${change.inputBalanceChange} (${parseFloat(change.inputPercentageChange).toFixed(2)}%)`}
                                      </span>
                                    </div>
                                  ))}
                                </td>
      
                                <td className="px-4 py-3 text-sm">
                                  {order.outputChange24h.map((change, index) => (
                                    <div key={index} className="flex justify-between px-3 py-2 rounded-lg shadow-sm text-sm">
                                      <span className="font-semibold">{change.outputToken}</span>
                                      <span className={`font-medium ${change.outputPercentageChange >= 0 ? "text-green-600" : "text-red-600"}`}>
                                        {`${change.outputBalanceChange} (${parseFloat(change.outputPercentageChange).toFixed(2)}%)`}
                                      </span>
                                    </div>
                                  ))}
                                </td> */}
                                {/* Total Volume */}
                                <td className="px-4 py-3 text-sm">
                                    {order.volumeTotal.length > 0 ? (
                                      order.volumeTotal.map((output, index) => (
                                        <div key={index} className="flex justify-between px-3 py-2 rounded-lg shadow-sm text-sm">
                                          <span className="font-semibold">{output.token}</span>
                                          <span className="text-gray-800">{formatBalance(output.totalVolume)}</span>
                                        </div>
                                      ))
                                    ) : (
                                      <div className="flex justify-center items-center h-10 text-gray-600 font-medium text-sm rounded-lg shadow-sm">
                                            N/A
                                      </div>
                                    )}
                                  </td>

                                {/* 24H Volume */}
                                  <td className="px-4 py-3 text-sm">
                                    {order.volume24H.length > 0 ? (
                                      order.volume24H.map((input, index) => (
                                        <div key={index} className="flex justify-between px-3 py-2 rounded-lg shadow-sm text-sm">
                                          <span className="font-semibold">{input.token}</span>
                                          <span className="text-gray-800">{formatBalance(input.totalVolume)}</span>
                                        </div>
                                      ))
                                    ) : (
                                      <div className="flex justify-center items-center h-10 text-gray-600 font-medium text-sm rounded-lg shadow-sm">
                                            N/A
                                      </div>
                                    )}
                                  </td>

                                  {/* Input Balance */}
                                  <td className="px-4 py-3 text-sm">
                                    {order.inputBalances.map((input, index) => (
                                      <div key={index} className="flex justify-between px-3 py-2 rounded-lg shadow-sm text-sm">
                                        <span className="font-semibold">{input.inputToken}</span>
                                        <span className="text-gray-800">{formatBalance(input.inputTokenBalance)}</span>
                                      </div>
                                    ))}
                                  </td>
        
                                  {/* Output Balance */}
                                  <td className="px-4 py-3 text-sm">
                                    {order.outputBalances.map((output, index) => (
                                      <div key={index} className="flex justify-between px-3 py-2 rounded-lg shadow-sm text-sm">
                                        <span className="font-semibold">{output.outputToken}</span>
                                        <span className="text-gray-800">{formatBalance(output.outputTokenBalance)}</span>
                                      </div>
                                    ))}
                                  </td>

                                <td className="py-2 px-4 text-blue-500 underline">
                                      <a href={getOrderLink(order.orderHash, order.network)} target="_blank" rel="noopener noreferrer">
                                        {`${order.orderHash.slice(0, 6)}...${order.orderHash.slice(-4)}`}
                                      </a>
                                </td>
                              </tr>
                            ))
                          }
                        </>
                        
                      )
                    }
                  </>
                )
              }
          
              
              
          </tbody>
        </table>
      </div>
    );
};
  
  const RaindexActivityList = () => {
    return (
      <div className="p-6 min-h-screen">
        {/* New Native Header */}
        <div className="bg-gray-800 text-white p-4 flex flex-col md:flex-row items-center justify-between rounded-lg shadow-lg">
          {/* Left Side: Header */}
          <h1 className="text-lg font-semibold uppercase tracking-wide">Activity List</h1>

        </div>
    
        <div className="max-w-screen-3xl mx-auto p-8 bg-gray-100 rounded-lg shadow-lg">
              
    
              {/* Full-Width Table */}
              <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                <OrdersTable />
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
                      href="https://github.com/rainlanguage/rain.webapp"
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
      </div>
    );
    
  };
  
  export default RaindexActivityList;