import {
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Legend,
    AreaChart, Area, CartesianGrid, BarChart, Bar
  } from "recharts";
  import React, { useState, useEffect } from "react";
  import { analyzeLiquidity, fetchAndFilterOrders, getTradesByTimeStamp,orderMetrics,tokenMetrics, tokenConfig, networkConfig, fetchAllPaginatedData } from "raindex-reports"
  import TopBarWithFilters from "./TopBarWithFilters";
  import { PieChart, Pie, Cell } from 'recharts';
  import {generateColorPalette } from './RaindexMarketData'
  import { ethers } from "ethers";

  
  const RaindexVaults = () => {
    const [initialized, setInitialized] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [customRange, setCustomRange] = useState({ from: null, to: null });
    const [selectedToken, setSelectedToken] = useState('IOEN');

    const [orderMetricsStats, setOrderMetricsStats] = useState([]);
    const [allOrders, setAllOrders] = useState(null);

    const [orderVolumeData, setOrderVolumeData] = useState([]);
    const [orderVolumeStats, setOrderVolumeStats] = useState([]);
    const [vaults, setVaults] = useState([]);

    const [vaultData, setVaultData] = useState([]);
    const [vaultStats, setVaultStats] = useState([]);

    const [tokenVaultSummary, setTokenVaultSummary] = useState([]);
    const [ordersPerVault, setOrdersPerVault] = useState([]);


    
    useEffect(() => {
      if (customRange.from && customRange.to && selectedToken) {
        const currentGracePeriod = 300
        const fromTimestamp = Math.floor(new Date(customRange.from).getTime() / 1000);
        const toTimestamp = Math.floor(new Date(customRange.to).getTime() / 1000) - currentGracePeriod;
        fetchAndSetData(selectedToken, fromTimestamp, toTimestamp);
      }
    }, [customRange, selectedToken]);

    function abbreviateHash(hash) {
        return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
    }
  
    const fetchAndSetData = async (token, fromTimestamp, toTimestamp) => {
      try {
        const network = tokenConfig[token]?.network
        const { filteredActiveOrders, filteredInActiveOrders } = await fetchAndFilterOrders(
          token,
          network,
        );
        const allOrders = filteredActiveOrders.concat(filteredInActiveOrders);
        setAllOrders(allOrders)

        const { tradesAccordingToTimeStamp: allTradesArray } = await analyzeLiquidity(network, token, fromTimestamp, toTimestamp);
        const raindexOrderWithTrades = await getTradesByTimeStamp(network, allOrders, fromTimestamp, toTimestamp);
        prepareOrderVolumeData(allTradesArray, raindexOrderWithTrades)

        const { orderMetricsData: orderMetricsDataRaindex } = await orderMetrics(filteredActiveOrders, filteredInActiveOrders, fromTimestamp, toTimestamp);
        const { stats: orderMetricsStats } = prepareStackedBarChartData(orderMetricsDataRaindex);
        setOrderMetricsStats(orderMetricsStats)

        const vaultBalanceData = await prepareVaultBalanceData();
        console.log("vaultBalanceData : ", JSON.stringify(vaultBalanceData))
        setVaults(vaultBalanceData);

        const orderPerVaults =   vaultBalanceData
            .map(vault => {
                const vaultId = vault.id;
        
                // Collect only active orders
                const orders = new Set([
                    ...vault.ordersAsInput.filter(order => order.active).map(order => order.id),
                    ...vault.ordersAsOutput.filter(order => order.active).map(order => order.id)
                ]);
        
                // Return only vaults that have active orders
                return orders.size > 0 ? { vaultId, orders: orders.size } : null;
            })
            .filter(vault => vault !== null);
        console.log("orderPerVaults : ", JSON.stringify(orderPerVaults))
        setOrdersPerVault(orderPerVaults)

        const {tokenVaultSummary} = await tokenMetrics(filteredActiveOrders);
        const {vaultData, vaultStats} = prepareVaultDataAndStats(tokenVaultSummary);
        setVaultData(vaultData)
        setVaultStats(vaultStats)

        setTokenVaultSummary(tokenVaultSummary)
  
  
        setLoading(false);
      } catch (error) {
        setError(error)
      }
    }
  
    function prepareStackedBarChartData(data) {
        const chartData = [
          {
            name: "Orders",
            Active: data.totalActiveOrders,
            InActive: data.totalInActiveOrders,
            total: data.totalActiveOrders + data.totalInActiveOrders
          }
        ];
    
        const stats = [
          {
            name: "Unique Owners",
            value: data.uniqueOwners
          },
          {
            name: "New Owners for Duration",
            value: data.uniqueOwnersForDuration
          },
          {
            name: "Orders added for the duration",
            value: data.ordersAddedForDuration.length
          },
          {
            name: "Last order added",
            value: data.lastOrderDate
          },
        ];
    
        return { chartData, stats };
    }

    const StackedBarChart = (title, subtitle, barChartData, dataKeyXAxis, dataKeyYAxis, xAxisLabel, yAxisLabel, xAxisFormatter, yAxisFormatter) => {
    const COLORS = generateColorPalette(barChartData.length);
    
    return (
        <div className="bg-white rounded-lg shadow-lg p-5 flex flex-col justify-between">
        <h3 className="text-lg font-semibold text-center mb-2 text-gray-800">{title}</h3>
        {subtitle && <p className="text-sm text-center text-gray-600 mb-4">{subtitle}</p>}
    
        <ResponsiveContainer width="100%" height={400}>
            <BarChart data={barChartData} margin={{ top: 20, right: 30, left: 20, bottom: 25 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
                dataKey={dataKeyXAxis}
                tick={{ fontSize: 12 }}
                tickFormatter={xAxisFormatter}
                label={{
                    value: `${xAxisLabel}`,
                    position: "bottom",
                    offset: 5, // Adjusted offset for better spacing
                    style: { fontSize: 14, fill: "#555" } 
                }}
            />
            <YAxis 
                tick={{ fontSize: 12 }}
                tickFormatter={yAxisFormatter}
                label={{
                    value: `${yAxisLabel}`,
                    position: "insideLeft",
                    angle: -90,
                    dy: 50,
                    dx: -10,
                    style: { fontSize: 14, fill: "#555" }
                }} 
            />
            <Tooltip />

            <Bar dataKey={dataKeyYAxis} stackId="a" name={xAxisLabel} barSize={30}>
                {barChartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
            </Bar>
            </BarChart>
        </ResponsiveContainer>
        </div>
    );
    };

    const prepareOrderVolumeData = (allTradesArray, raindexTradesArray) => {
        console.log("allTradesArray : ", JSON.stringify(allTradesArray[0]))
        console.log("raindexTradesArray : ", JSON.stringify(raindexTradesArray[0]))

        function enrichAndGroupByOrderHash(raindexTradesArray, allTradesArray) {
          // Step 1: Create a mapping for allTradesArray by transactionHash for efficient lookup
          const tradeMap = allTradesArray.reduce((map, trade) => {
            map[trade.transactionHash] = {
              amountInTokens: trade.amountInTokens,
              amountInUsd: trade.amountInUsd,
            };
            return map;
          }, {});
    
          // Step 2: Enrich raindexTradesArray with amountInTokens and amountInUsd from allTradesArray
          const enrichedTrades = raindexTradesArray.map((raindexTrade) => {
            const tradeDetails = tradeMap[raindexTrade.transactionHash];
            if (tradeDetails) {
              return {
                ...raindexTrade,
                amountInTokens: tradeDetails.amountInTokens,
                amountInUsd: tradeDetails.amountInUsd,
              };
            }
            return { ...raindexTrade }; // If no match, keep the original object
          });
    
          // Step 3: Group enriched trades by orderHash and sum amountInTokens and amountInUsd
          const grouped = {};
          enrichedTrades.forEach((trade) => {
            const { orderHash, amountInTokens, amountInUsd } = trade;
    
            if (!grouped[orderHash]) {
              grouped[orderHash] = {
                orderHash,
                totalAmountInTokens: 0,
                totalAmountInUsd: 0,
              };
            }
    
            grouped[orderHash].totalAmountInTokens += parseFloat(amountInTokens || 0);
            grouped[orderHash].totalAmountInUsd += parseFloat(amountInUsd || 0);
          });
    
          // Convert grouped object to an array and return
          return Object.values(grouped);
        }
        const groupedTrades = enrichAndGroupByOrderHash(raindexTradesArray, allTradesArray);
    
        // Step 2: Calculate total volume and percentages
        const totalVolume = groupedTrades.reduce((sum, trade) => sum + trade.totalAmountInUsd, 0);
    
        // Add volumePercentage to groupedTrades and sort by totalVolumeUsd in descending order
        const sortedEntries = groupedTrades
          .map((trade) => ({
            ...trade,
            totalVolumeUsd: trade.totalAmountInUsd,
            volumePercentage: ((trade.totalAmountInUsd / totalVolume) * 100).toFixed(2),
          }))
          .sort((a, b) => b.totalVolumeUsd - a.totalVolumeUsd);
    
        // Step 3: Prepare data for the top 5 orders and "Others"
        const orderVolumeStats = [];
        let othersVolume = 0;
    
        sortedEntries.forEach((entry, index) => {
          const volume = entry.totalVolumeUsd;
    
          if (index < 5 && volume > 0) {
            orderVolumeStats.push({
              name: abbreviateHash(entry.orderHash),
              value: `$${volume.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`,
              percentage: entry.volumePercentage,
            });
          } else {
            othersVolume += volume;
          }
        });
    
        // Add "Others" category
        if (othersVolume > 0) {
          orderVolumeStats.push({
            name: "Others",
            value: `$${othersVolume.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`,
            percentage: ((othersVolume / totalVolume) * 100).toFixed(2),
          });
        }
    
        // Step 4: Prepare orderVolumeData
        const volumeData = sortedEntries.reduce((result, entry, index) => {
          const volume = entry.totalVolumeUsd;
          if (index < 5 && volume > 0) {
            result[abbreviateHash(entry.orderHash)] = volume;
          }
          return result;
        }, {});
    
        const orderVolumeData = [
          {
            name: "Volume",
            ...volumeData,
            Others: othersVolume,
            total: totalVolume,
          },
        ];
        
        console.log("orderVolumeData : ", orderVolumeData)
        console.log("orderVolumeStats : ", orderVolumeStats)

        setOrderVolumeData(orderVolumeData)
        setOrderVolumeStats(orderVolumeStats)
    };

    const prepareStackedData = (vaults) => {
        const tokenDecimals = tokenConfig[selectedToken].decimals;
      
        const timestampMap = {};
      
        vaults.forEach((vault) => {
          const vaultId = vault.id;
      
          // Process historical balance changes
          vault.balanceChanges.forEach((change) => {
            const timestamp = new Date(change.timestamp * 1000).toISOString(); // Use ISO format
            if (!timestampMap[timestamp]) {
              timestampMap[timestamp] = { timestamp }; // Keep as ISO string for sorting
            }
            timestampMap[timestamp][vaultId] =
              parseFloat(ethers.utils.formatUnits(change.newVaultBalance, tokenDecimals).toString());
          });
      
          // Add the current balance for the vault
          const currentTimestamp = new Date().toISOString(); // Use ISO format
          if (!timestampMap[currentTimestamp]) {
            timestampMap[currentTimestamp] = { timestamp: currentTimestamp };
          }
          timestampMap[currentTimestamp][vaultId] =
            parseFloat(ethers.utils.formatUnits(vault.balance, tokenDecimals).toString());
        });
      
        // Ensure all timestamps have an entry for every vault, fill missing with 0
        const vaultIds = vaults.map((vault) => vault.id);
        Object.values(timestampMap).forEach((entry) => {
          vaultIds.forEach((vaultId) => {
            if (!entry[vaultId]) {
              entry[vaultId] = 0;
            }
          });
        });
      
        // Convert timestampMap to a sorted array
        return Object.values(timestampMap)
          .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)) // Sort properly
          .map((entry) => ({
            ...entry,
            timestamp: new Date(entry.timestamp).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            }), // Format for display
          }));
    };

    const prepareVaultBalanceData = async () => {
        const fetchVaultDetails = `
            query VaultsQuery($tokenAddress: Bytes!) {
              vaults(
                where: {
                  token_: {
                    address: $tokenAddress
                  }
                }
              ) {
                id
                balance
                token {
                  decimals
                  address
                  symbol
                }
                ordersAsInput{
                    id
                    orderHash
                    active
                }
                ordersAsOutput{
                    id
                    orderHash
                    active
                }
              }
            }
          `;
    
          const vaultBalanceChanges = `
            query VaultBalanceChanges($vaultId: Bytes!) {
              vaultBalanceChanges(
                where: {vault_: {id: $vaultId}}
              ) {
                amount
                timestamp
                oldVaultBalance
                newVaultBalance
              }
            }
          `;
    
        let vaultsData = await fetchAllPaginatedData(
          networkConfig[tokenConfig[selectedToken].network].subgraphUrl,
          fetchVaultDetails,
          { tokenAddress: tokenConfig[selectedToken].address.toLowerCase() },
          "vaults"
        )
    
        for(let i = 0 ; i< vaultsData.length; i++){
          let vault = vaultsData[i]
          console.log("vault id here : ", vault.id.toString() )
          let vaultBalanceChangesData = await fetchAllPaginatedData(
            networkConfig[tokenConfig[selectedToken].network].subgraphUrl,
            vaultBalanceChanges,
            { vaultId: vault.id.toString() },
            "vaultBalanceChanges"
          )
          vault["balanceChanges"] = vaultBalanceChangesData.sort((a, b) => parseInt(b.timestamp, 10) - parseInt(a.timestamp, 10));
        }
    
        return vaultsData
    }

    const renderVaultBarChart = (orders, title, subtitle) => {
        // Prepare data for vault balances
        const vaultBalances = {};
        
        // Aggregate balances from inputs and outputs
        orders.forEach((order) => {
            [...order.inputs, ...order.outputs].forEach((entry) => {
            const vaultId = entry.vaultId;
            const balance = parseFloat(ethers.utils.formatEther(entry.balance, entry.token.decimals));
        
            if (vaultBalances[vaultId]) {
                vaultBalances[vaultId].value += balance;
            } else {
                vaultBalances[vaultId] = {
                name: `Vault ${vaultId.slice(0, 4)}..`,
                value: balance,
                };
            }
            });
        });
        
        // Sort by balance in descending order
        const sortedVaults = Object.values(vaultBalances).sort((a, b) => b.value - a.value);
        
        // Keep top 5 vaults and group the rest into "Others"
        const displayedVaults = sortedVaults.slice(0, 5);
        const othersValue = sortedVaults.slice(5).reduce((sum, vault) => sum + vault.value, 0);
        
        if (othersValue > 0) {
            displayedVaults.push({ name: "Others", value: othersValue });
        }
        
        // Calculate total value and percentages
        const totalValue = displayedVaults.reduce((sum, vault) => sum + vault.value, 0);
        const data = displayedVaults.map((vault) => ({
            ...vault,
            percentage: (vault.value / totalValue) * 100,
        }));
        
        // Generate colors for the bar chart
        const COLORS = orders.map((_, index) => generateColorPalette(orders.length)[index]);
        
        return (
            <div className="bg-white rounded-lg shadow-lg p-5 flex flex-col justify-between">
                {/* Chart Title */}
                <h3 className="text-lg font-semibold text-center mb-2 text-gray-800">{title}</h3>
                {subtitle && <p className="text-sm text-center text-gray-600 mb-4">{subtitle}</p>}
        
                {/* Stacked Bar Chart */}
                <ResponsiveContainer width="100%" height={550}>
                    <BarChart
                        layout="vertical"
                        data={data}
                        margin={{ top: 20, right: 30, left: 20, bottom: 40 }} // Increased bottom margin for label
                    >
                        <CartesianGrid strokeDasharray="3 3" />
                        
                        <XAxis 
                            type="number" 
                            tick={{ fontSize: 12 }}
                            tickFormatter={(value) => `${formatValue(value)}`} 
                            label={{
                                value: `${tokenConfig[selectedToken].symbol} Balance`,
                                position: "insideBottom",
                                offset: -5,
                                style: { fontSize: 14, fill: "#555" }
                            }}
                        />

                        <YAxis 
                            dataKey="name" 
                            type="category" 
                            tick={{ fontSize: 12 }}
                            
                            label={{
                                value: "Vault ID",
                                position: "insideLeft",
                                angle: -90, // Rotates the text vertically
                                dy: 50, // Adjust vertical position for better centering
                                dx: -10, // Adjusts left/right alignment
                                style: { fontSize: 14, fill: "#555" }
                            }} 
                        />

                        
                        <Tooltip />
                        {/* <Legend /> */}
        
                        <Bar dataKey="value" stackId="1" barSize={30}>
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        );
        
    };

    const prepareVaultDataAndStats = (tokenVaultSummary) => {
        console.log("prepareVaultDataAndStats")
        console.log("tokenVaultSummary : ", JSON.stringify(tokenVaultSummary))

        if (!tokenVaultSummary || tokenVaultSummary.length === 0) return { vaultData: [], vaultStats: [] };
      
        // Prepare vaultData
        const vaultData = [
          tokenVaultSummary.reduce(
            (result, token) => {
              result[token.symbol] = token.totalTokenBalanceUsd;
              result.total += token.totalTokenBalanceUsd;
              return result;
            },
            { name: "Balance", total: 0 }
          ),
        ];
      
        const totalBalanceUsd = tokenVaultSummary.reduce(
          (sum, token) => sum + token.totalTokenBalanceUsd,
          0
        );
      
        const vaultStats = tokenVaultSummary.map((token) => {
          const percentage = ((token.totalTokenBalanceUsd / totalBalanceUsd) * 100).toFixed(2);
          return {
            name: token.symbol,
            value: `$${token.totalTokenBalanceUsd.toLocaleString()} - ${formatValue(token.totalTokenBalance)} ${token.symbol}`,
            percentage: percentage,
          };
        });
      
        return { vaultData, vaultStats };
    };

    const renderPieChart = (title, stats, colorKeys, subtitle) => {
        const data = stats.map((item) => ({
          ...item,
          value: parseFloat(item.value.replace(/[^0-9.-]+/g, "")),
          percentage: parseFloat(item.percentage),
        }));
    
        // Ensure total value and colors match
        const totalVaultValue = formatValue(
          data.reduce((sum, item) => sum + item.value, 0)
        );
        const COLORS = colorKeys.map((_, index) =>
          generateColorPalette(colorKeys.length)[index]
        );
    
        // console.log("Pie Chart Data:", data); // Debugging
        // console.log("COLORS:", COLORS); // Debugging
    
        return (
          <div className="bg-white rounded-lg shadow-lg p-5 flex flex-col justify-between">
            <h3 className="text-lg font-semibold text-center mb-2 text-gray-800">
              {title}
            </h3>
            {subtitle && (
              <p className="text-sm text-center text-gray-600 mb-4">{subtitle}</p>
            )}
    
            {/* Pie Chart */}
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={90}
                  fill="#8884d8"
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percentage }) => `${name}: ${percentage.toFixed(2)}%`}
                >
                  {data.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <text
                  x="50%"
                  y="50%"
                  dy={8}
                  textAnchor="middle"
                  fill={"#0A1320"}
                >
                  Total: ${totalVaultValue}
                </text>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
    
            <div className="space-y-3 mt-4">
              {stats.map((stat, index) => (
                <div key={index}>
                  <div className="flex justify-between mb-1">
                    <span className="font-bold" style={{ color: COLORS[index] }}>
                      {stat.name}
                    </span>
                    <span>{stat.value}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 rounded">
                    <div
                      className="h-full rounded"
                      style={{
                        width: `${stat.percentage}%`,
                        backgroundColor: COLORS[index],
                      }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
    };

    const renderVaultPieChart = (orders, title, subtitle) => {
        // Prepare data for vault balances
        const vaultBalances = {};
      
        // Aggregate balances from inputs and outputs
        orders.forEach((order) => {
          [...order.inputs, ...order.outputs].forEach((entry) => {
            const vaultId = entry.vaultId;
            const balance = parseFloat(ethers.utils.formatEther(entry.balance,entry.token.decimals));
      
            if (vaultBalances[vaultId]) {
              vaultBalances[vaultId].value += balance;
            } else {
              vaultBalances[vaultId] = {
                name: `Vault ${vaultId.slice(0, 6)}...${vaultId.slice(-4)}`, // Abbreviated vault ID
                value: balance,
              };
            }
          });
        });
      
        // Sort by balance in descending order
        const sortedVaults = Object.values(vaultBalances).sort(
          (a, b) => b.value - a.value
        );
      
        // Keep top 5 vaults and group the rest into "Others"
        const displayedVaults = sortedVaults.slice(0, 5);
        const othersValue = sortedVaults
          .slice(5)
          .reduce((sum, vault) => sum + vault.value, 0);
      
        if (othersValue > 0) {
          displayedVaults.push({ name: "Others", value: othersValue });
        }
      
        // Calculate total value and percentages
        const totalValue = displayedVaults.reduce((sum, vault) => sum + vault.value, 0);
        const data = displayedVaults.map((vault) => ({
          ...vault,
          percentage: (vault.value / totalValue) * 100,
        }));
      
        // Generate colors for the pie chart
        const COLORS = orders.map((_, index) =>
          generateColorPalette(orders.length)[index]
        );
      
        // Render the pie chart
        return (
          <div className="bg-white rounded-lg shadow-lg p-5 flex flex-col justify-between">
            {/* Chart Title */}
            <h3 className="text-lg font-semibold text-center mb-2 text-gray-800">
              {title}
            </h3>
            {subtitle && <p className="text-sm text-center text-gray-600 mb-4">{subtitle}</p>}
      
            {/* Pie Chart */}
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={90}
                  fill="#8884d8"
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percentage }) =>
                    `${name}: ${percentage.toFixed(2)}%`
                  }
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <text
                  x="50%"
                  y="50%"
                  dy={8}
                  textAnchor="middle"
                  fill={"#0A1320"}
                  style={{ fontSize: "14px", fontWeight: "bold" }}
                >
                  Total: {totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </text>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
      
            {/* Legend and Bars */}
            <div className="space-y-3 mt-4">
              {data.map((stat, index) => (
                <div key={index}>
                  <div className="flex justify-between mb-1">
                    <span className="font-bold" style={{ color: COLORS[index] }}>
                      {stat.name}
                    </span>
                    <span>{stat.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 rounded">
                    <div
                      className="h-full rounded"
                      style={{
                        width: `${stat.percentage}%`,
                        backgroundColor: COLORS[index],
                      }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
    };
    
    const formatValue = (value) => {
      if (value >= 1000000) {
        return `${(value / 1000000).toFixed(2)}M`;
      } else if (value >= 1000) {
        return `${(value / 1000).toFixed(2)}k`;
      } else {
        return `${(value / 1).toFixed(2)}`;
      }
    };
  
    const handleFiltersApply = (range, token) => {
  
      setCustomRange(range);
      setSelectedToken(token);
      setInitialized(true);
      setLoading(true);
    };
  
    if (error) {
      return <div>Error: {error}</div>;
    }
    return (
      <div className="p-6 bg-gray-50 min-h-screen">
        <TopBarWithFilters
          onApplyFilters={handleFiltersApply}
          tokenOptions={Object.keys(tokenConfig)} // Add your token options here
        />
        {
          initialized ?
            (
              loading ?
                (
                  <div className="flex flex-col items-center justify-center h-screen bg-gray-100">
                    <div className="spinner w-10 h-10 border-4 border-gray-300 border-t-indigo-500 rounded-full animate-spin"></div>
                    <p>Loading...</p>
                  </div>
                ) :
                (
  
                  <div className="max-w-screen-3xl mx-auto p-8 bg-gray-100 rounded-lg shadow-lg">
                    <div className="p-6 bg-gray-100 border-b border-gray-300">
                      <div className="flex justify-between items-start">
                        {/* Title Section */}
                        <h1 className="text-2xl font-bold text-gray-800">
                          {selectedToken.toUpperCase()} Market Analysis Report
                        </h1>
  
                        {/* Info Section */}
                        <div className="text-right space-y-4">
                          <div>
                            <span className="block font-semibold text-gray-600">Report generated at:</span>
                            <p className="text-gray-700">{new Date().toLocaleString()}</p>
                          </div>
                          <div>
                            <span className="block font-semibold text-gray-600">Report duration:</span>
                            <p className="text-gray-700">
                              {new Date(customRange.from).toLocaleString()} -{" "}
                              {new Date(customRange.to).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
  
                    <div className="grid grid-cols-3 gap-5 md:grid-cols-3 sm:grid-cols-1">
                    {
                      orderVolumeData.length > 0 &&
                      orderVolumeStats.length > 0 &&
                      renderPieChart(
                        "Volume by Order for Duration",
                        orderVolumeStats,
                        orderVolumeStats.map((item) => item.name),
                        ``
                      )
                    }
  
                   {
                        allOrders &&
                        allOrders.length > 0 &&
                        renderVaultBarChart(
                            allOrders,
                            `${tokenConfig[selectedToken.toUpperCase()].symbol} Vaults`,
                            `Vault distribution for ${tokenConfig[selectedToken.toUpperCase()].symbol}`
                        )
                    }
                    {   
                        vaultData.length > 0 &&
                        vaultStats.length > 0 &&
                        renderPieChart(
                            `Vault Distribution for ${tokenConfig[selectedToken].symbol} orders`,
                            vaultStats,
                            vaultStats.map((item) => item.name),
                            ``
                        )
                    }
                    {
                        tokenVaultSummary &&
                        StackedBarChart(
                            `Total Value Locked`,
                            `Token vault balances for ${tokenConfig[selectedToken].symbol} orders`,
                            tokenVaultSummary,
                            "symbol",
                            "totalTokenBalanceUsd",
                            "Tokens",
                            "Amount USD",
                            ``,
                            (value) => `$${formatValue(value)}`
                        )
                    }
                    {
                        ordersPerVault &&
                        StackedBarChart(
                            `Orders Per Vaults`,
                            `Orders per vaults for ${tokenConfig[selectedToken].symbol}`,
                            ordersPerVault,
                            'vaultId',
                            'orders',
                            'Vault Ids',
                            'Orders Count',
                            (value) => `${value.slice(0, 2)}..${value.slice(-2)}`,
                            (value) => `${formatValue(value)}`
                        )
                    }

                    </div>
                    <div className="max-w-screen-3xl mx-auto p-8 bg-gray-100 rounded-lg shadow-lg">
  
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
            ) :
            (
              <div className="flex flex-col items-center justify-center bg-gray-100 rounded-lg shadow-md p-6 text-center">
                <p className="text-gray-700">
                  Please select a <span className="text-blue-900 font-medium">date range</span> and a <span className="text-blue-900 font-medium">token</span> to filter the data.
                </p>
  
              </div>
            )
        }
      </div>
    );
  };
  
  export default RaindexVaults;