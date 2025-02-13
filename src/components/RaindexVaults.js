import {
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Legend,
    AreaChart, Area, CartesianGrid, LineChart, Line
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

    const [orderTradeData, setOrderTradeData] = useState([]);
    const [orderTradeStats, setOrderTradeStats] = useState([]);

    const [allTradesArray, setAllTradesArray] = useState([]);

    
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
        setAllTradesArray(allTradesArray);
        const raindexOrderWithTrades = await getTradesByTimeStamp(network, allOrders, fromTimestamp, toTimestamp);
        prepareOrderVolumeData(allTradesArray, raindexOrderWithTrades)
        prepareTradeCountPerOrder(raindexOrderWithTrades)

        const { orderMetricsData: orderMetricsDataRaindex } = await orderMetrics(filteredActiveOrders, filteredInActiveOrders, fromTimestamp, toTimestamp);
        const { stats: orderMetricsStats } = prepareStackedBarChartData(orderMetricsDataRaindex);
        setOrderMetricsStats(orderMetricsStats) 
  
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
      console.log("groupedTrades : ", JSON.stringify(groupedTrades[0]))
        
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

    const prepareTradeCountPerOrder = (raindexTradesArray) => {
      // Step 1: Group trades by orderHash and count the number of trades per order
      const tradeCounts = {};
      let totalTrades = 0; // Track total number of trades

      raindexTradesArray.forEach((trade) => {
          const { orderHash } = trade;

          if (!tradeCounts[orderHash]) {
              tradeCounts[orderHash] = 0;
          }
          tradeCounts[orderHash] += 1; // Increment trade count for this order
          totalTrades += 1; // Increment overall trade count
      });

      // Step 2: Convert tradeCounts object to an array for further processing
      const groupedTrades = Object.entries(tradeCounts).map(([orderHash, tradeCount]) => ({
          orderHash,
          tradeCount,
          percentage: ((tradeCount / totalTrades) * 100).toFixed(2), // Calculate percentage
      }));

      // Step 3: Sort orders by number of trades in descending order
      const sortedEntries = groupedTrades.sort((a, b) => b.tradeCount - a.tradeCount);

      // Step 4: Extract top 5 orders and aggregate the rest into "Others"
      const tradeStats = [];
      let othersTradeCount = 0;
      let othersPercentage = 0;

      sortedEntries.forEach((entry, index) => {
          if (index < 5) {
              tradeStats.push({
                  name: abbreviateHash(entry.orderHash),
                  value: entry.tradeCount,
                  percentage: entry.percentage,
              });
          } else {
              othersTradeCount += entry.tradeCount;
              othersPercentage += parseFloat(entry.percentage);
          }
      });

      // Add "Others" category if there are remaining trades
      if (othersTradeCount > 0) {
          tradeStats.push({
              name: "Others",
              value: othersTradeCount,
              percentage: othersPercentage.toFixed(2),
          });
      }

      // Step 5: Prepare data for visualization
      const tradeDistributionData = [
          {
              name: "Trades",
              ...sortedEntries.slice(0, 5).reduce((result, entry) => {
                  result[abbreviateHash(entry.orderHash)] = entry.tradeCount;
                  return result;
              }, {}),
              Others: othersTradeCount,
          },
      ];

      setOrderTradeData(tradeDistributionData);
      setOrderTradeStats(tradeStats);  
    };
  
    const renderOrderMetrics = (
        allOrders,
        title,
        subtitle,
        yAxisLabel = "Number of Orders",
        stats = [],
      ) => {
        const orderData = allOrders.map((i) => ({
          orderId: i.orderHash,
          owner: i.owner,
          active: i.active,
          timestampAdded: i.timestampAdded,
          timestampRemoved: i.removeEvents[0]?.transaction?.timestamp || "0",
        }))
        .sort((a, b) => b.timestampAdded - a.timestampAdded);
    
        const activeOrders = orderData.filter(i => {return i.active})
        const inActiveOrders = orderData.filter(i => {return !i.active})
    
        stats=[
          { name: "Total Active Orders", value: activeOrders.length },
          { name: "Total Inactive Orders", value: inActiveOrders.length },
          { name: "Last Order Added", value: (new Date(orderData[0].timestampAdded * 1000)).toLocaleString() },
    
        ]
    
      
        // Helper function to parse data
        const processData = (data) => {
          const timeline = [];
      
          data.forEach((order) => {
            const addedDate = new Date(order.timestampAdded * 1000)
              .toISOString()
              .split("T")[0];
            timeline.push({ date: addedDate, activeChange: 1, inactiveChange: 0 });
      
            if (order.timestampRemoved !== "0") {
              const removedDate = new Date(order.timestampRemoved * 1000)
                .toISOString()
                .split("T")[0];
              timeline.push({ date: removedDate, activeChange: -1, inactiveChange: 1 });
            }
          });
      
          // Aggregate by date
          const aggregated = timeline.reduce((acc, curr) => {
            if (!acc[curr.date]) {
              acc[curr.date] = { date: curr.date, active: 0, inactive: 0 };
            }
            acc[curr.date].active += curr.activeChange;
            acc[curr.date].inactive += curr.inactiveChange;
            return acc;
          }, {});
      
          // Calculate cumulative values
          const sortedDates = Object.keys(aggregated).sort();
          let cumulativeActive = 0;
          let cumulativeInactive = 0;
      
          return sortedDates.map((date) => {
            cumulativeActive += aggregated[date].active;
            cumulativeInactive += aggregated[date].inactive;
      
            return {
              date,
              active: cumulativeActive,
              inactive: cumulativeInactive,
            };
          });
        };
      
        const chartData = processData(orderData);
        const colors = generateColorPalette(2); // Generate 2 colors for active and inactive areas
      
        return (
          <div className="bg-white rounded-lg shadow-lg p-5 flex flex-col justify-between">
            {/* Title */}
            {title && (
              <h3 className="text-lg font-semibold text-center mb-2 text-gray-800">
                {title}
              </h3>
            )}
      
            {/* Subtitle */}
            {subtitle && (
              <p className="text-sm text-center text-gray-600 mb-4">{subtitle}</p>
            )}
      
            {/* Chart */}
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis
                  label={{
                    value: yAxisLabel,
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: "14px" },
                  }}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="active"
                  stackId="1"
                  stroke={colors[0]}
                  fill={colors[0]}
                />
                <Area
                  type="monotone"
                  dataKey="inactive"
                  stackId="1"
                  stroke={colors[1]}
                  fill={colors[1]}
                />
              </AreaChart>
            </ResponsiveContainer>
      
            {/* Stats Section */}
            {stats.length > 0 && (
              <div className="mt-4">
                <h4 className="text-lg font-semibold text-gray-800 mb-2">
                  Statistics
                </h4>
                <ul className="list-disc list-inside text-gray-700">
                  {stats.map((stat, index) => (
                    <li key={index}>
                      {stat.name}: {stat.value}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
    };

    const getUniqueOrderOwnersOverTime = (orderData) => {
      const timeline = [];
  
      orderData.forEach((order) => {
      timeline.push({
          timestamp: order.timestampAdded,
          owner: order.owner,
          action: "added",
      });
      if (order.timestampRemoved !== "0") {
          timeline.push({
          timestamp: order.timestampRemoved,
          owner: order.owner,
          action: "removed",
          });
      }
      });
  
      timeline.sort((a, b) => a.timestamp - b.timestamp);
  
      const uniqueOwners = new Set();
      const result = [];
  
      timeline.forEach((event) => {
      if (event.action === "added") {
          uniqueOwners.add(event.owner);
      } else if (event.action === "removed") {
          uniqueOwners.delete(event.owner);
      }
  
      result.push({
          timestamp: event.timestamp,
          date: new Date(event.timestamp * 1000).toISOString().split("T")[0],
          uniqueOwnersCount: uniqueOwners.size,
      });
      });
  
      return result;
    };
    
    const renderUniqueOwners = (
    allOrders,
    title,
    subtitle,
    yAxisLabel = "Unique Owners",
    stats = []
    ) => {
    const orderData = allOrders
        .map((i) => ({
        orderId: i.orderHash,
        owner: i.owner,
        active: i.active,
        timestampAdded: i.timestampAdded,
        timestampRemoved: i.removeEvents[0]?.transaction?.timestamp || "0",
        }))
        .sort((a, b) => a.timestampAdded - b.timestampAdded);
    
    
    
    const chartData = getUniqueOrderOwnersOverTime(orderData);
    
    const colors = generateColorPalette(2);

    
    
    // Custom date formatter for X-axis
    const formatXAxis = (date) => {
        const options = { month: "short", day: "numeric" };
        return new Date(date).toLocaleDateString("en-US", options); // Example: "Jan 15"
    };
    
    return (
        <div className="bg-white rounded-lg shadow-lg p-5 flex flex-col justify-between">
        {/* Title */}
        {title && (
            <h3 className="text-lg font-semibold text-center mb-2 text-gray-800">
            {title}
            </h3>
        )}
    
        {/* Subtitle */}
        {subtitle && (
            <p className="text-sm text-center text-gray-600 mb-4">{subtitle}</p>
        )}
    
        {/* Chart */}
        <ResponsiveContainer width="100%" height={300}>
            <AreaChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 0, bottom: 0 }}
            >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
                dataKey="date"
                tickFormatter={formatXAxis} // Apply custom formatter
                tick={{ fontSize: 12 }}
            />
            <YAxis
                label={{
                value: yAxisLabel,
                angle: -90,
                position: "insideLeft",
                style: { fontSize: "14px" },
                }}
                tick={{ fontSize: 12 }}
            />
            <Tooltip />
            <Legend />
            <Area
                type="monotone"
                dataKey="uniqueOwnersCount"
                stackId="1"
                stroke={colors[0]}
                fill={colors[0]}
            />
            </AreaChart>
        </ResponsiveContainer>
    
        {/* Stats Section */}
        {orderMetricsStats.length > 0 && (
            <div className="mt-4">
            <h4 className="text-lg font-semibold text-gray-800 mb-2">
                Statistics
            </h4>
            <ul className="list-disc list-inside text-gray-700">
                {orderMetricsStats.map((stat, index) => (
                <li key={index}>
                    {stat.name}: {stat.value}
                </li>
                ))}
            </ul>
            </div>
        )}
        </div>
    );
    };


    const getOrdersPerDay = (orders) => {
      const ordersPerDay = {};
    
      orders.forEach((order) => {
        const date = new Date(order.timestampAdded * 1000).toISOString().split("T")[0]; // Format to YYYY-MM-DD
    
        if (!ordersPerDay[date]) {
          ordersPerDay[date] = 0;
        }
        ordersPerDay[date] += 1;
      });
    
      return Object.entries(ordersPerDay).map(([date, count]) => ({
        date,
        ordersCount: count,
      }));
    };
    
    const OrdersPerDayChart = ( allOrders, title, subtitle, yAxisLabel) => {

      const ordersPerDayData = getOrdersPerDay(allOrders);
      
      const formatXAxis = (date) => {
        return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }); // Example: "Feb 12"
      };
    
      return (
        <div className="bg-white rounded-lg shadow-lg p-5 flex flex-col justify-between">
          {/* Title */}
          {title && <h3 className="text-lg font-semibold text-center mb-2 text-gray-800">{title}</h3>}

          {/* Subtitle */}
          {subtitle && (
              <p className="text-sm text-center text-gray-600 mb-4">{subtitle}</p>
          )}
      
          {/* Check if data exists */}
          {ordersPerDayData && ordersPerDayData.length > 0 ? (
            <ResponsiveContainer width="100%" height={450}>
              <LineChart data={ordersPerDayData} margin={{ top: 20, right: 30, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatXAxis}
                  tick={{ fontSize: 12 }}
                  minTickGap={15} // Prevents overlapping of labels
                />
                <YAxis
                  label={{
                    value: yAxisLabel,
                    angle: -90,
                    position: "insideLeft",
                    dy: 10, // Adjust position for better alignment
                    style: { fontSize: "14px" },
                  }}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="ordersCount"
                  stroke="#003366" // Dark Blue Color
                  strokeWidth={2.5}
                  dot={{ r: 2 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center text-gray-500 mt-5">No data available</div>
          )}
        </div>
      );
      
      
      
    };

    const getTradesPerDay = (allTradesArray) => {
      const tradesPerDay = {};
    
      allTradesArray.forEach((trade) => {
        console.log("in tardes array : ", trade)
        const date = new Date(trade.timestamp * 1000)
          .toISOString()
          .split("T")[0]; // Convert timestamp to YYYY-MM-DD
    
        if (!tradesPerDay[date]) {
          tradesPerDay[date] = 0;
        }
        tradesPerDay[date] += 1; // Increment count for that date
      });
    
      // Convert to an array format
      return Object.entries(tradesPerDay).map(([date, tradeCount]) => ({
        date,
        tradesCount: tradeCount,
      }));
    };
    
    const TradesPerDayChart = ( allTradesArray, title = "Trades Per Day", subtitle, yAxisLabel = "Number of Trades" ) => {
      const tradesPerDayData = getTradesPerDay(allTradesArray);
    
      const formatXAxis = (date) => {
        return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }); // Example: "Feb 12"
      };
    
      return (
        <div className="bg-white rounded-lg shadow-lg p-5 flex flex-col justify-between">
          {/* Title */}
          {title && <h3 className="text-lg font-semibold text-center mb-2 text-gray-800">{title}</h3>}
    
          {/* Subtitle */}
          {subtitle && <p className="text-sm text-center text-gray-600 mb-4">{subtitle}</p>}
    
          {/* Check if data exists */}
          {tradesPerDayData && tradesPerDayData.length > 0 ? (
            <ResponsiveContainer width="100%" height={450}>
              <LineChart data={tradesPerDayData} margin={{ top: 20, right: 30, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatXAxis}
                  tick={{ fontSize: 12 }}
                  minTickGap={15} // Prevents overlapping of labels
                />
                <YAxis
                  label={{
                    value: yAxisLabel,
                    angle: -90,
                    position: "insideLeft",
                    dy: 10, // Adjust position for better alignment
                    style: { fontSize: "14px" },
                  }}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="tradesCount"
                  stroke="#003366" // Dark Blue Color
                  strokeWidth={2.5}
                  dot={{ r: 2 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center text-gray-500 mt-5">No data available</div>
          )}
        </div>
      );
    };
  
  

    const renderPieChart = (title, stats, colorKeys, subtitle, showCurrency = true) => {
        const data = stats.map((item) => ({
          ...item,
          value: parseFloat(item.value.toString().replace(/[^0-9.-]+/g, "")),
          percentage: parseFloat(item.percentage),
        }));
    
        // Ensure total value and colors match
        const totalVaultValue = formatValue(
          data.reduce((sum, item) => sum + item.value, 0)
        );
        const COLORS = colorKeys.map((_, index) =>
          generateColorPalette(colorKeys.length)[index]
        );
    

    
        return (
          <div className="bg-white rounded-lg shadow-lg p-5 flex flex-col justify-between">
            <h3 className="text-lg font-semibold text-center mb-2 text-gray-800">
              {title}
            </h3>
            {subtitle && (
              <p className="text-sm text-top text-gray-600 ">{subtitle}</p>
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
                  Total: {showCurrency ? `$${totalVaultValue}` : totalVaultValue}
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
                        allOrders && OrdersPerDayChart(
                            allOrders,
                            "Orders Added Per Day",
                            "Unique orders added per day",
                            "Orders Count"
                        )
                    }

                    {
                        allTradesArray && TradesPerDayChart(
                          allTradesArray,
                            "Trades Per Day",
                            "Order trades per day",
                            "Orders Count"
                        )
                    }
                    {
                        allOrders && renderOrderMetrics(
                            allOrders,
                            "Cummulative Orders",
                            "Daily Active and Inactive Orders",
                            "Orders Count",
                            []
                        )
                    }
                    {
                        allOrders && renderUniqueOwners(
                            allOrders,
                            "Unique Order Owners",
                            "Daily unique order owners",
                            "Orders Count",
                            []
                        )
                    }
                    

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
                      orderTradeData.length > 0 &&
                      orderTradeStats.length > 0 &&
                      renderPieChart(
                        "Trades by Order for Duration",
                        orderTradeStats,
                        orderTradeStats.map((item) => item.name),
                        ``,
                        false
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