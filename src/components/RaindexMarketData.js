import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import React, { useState, useEffect } from "react";
import { analyzeLiquidity, fetchAndFilterOrders, getTradesByTimeStamp, tokenConfig, networkConfig } from "raindex-reports"
import TopBarWithFilters from "./TopBarWithFilters"; // Assuming you have created this component
import { PieChart, Pie, Cell } from 'recharts';

function generateColorPalette(numColors) {
  const colors = [];

  // Base hue for blue
  const baseHue = 210; // Hue value for blue (210° in HSL)

  // Define the range for lightness (avoid too dark or too light)
  const minLightness = 15; // Minimum lightness (darker blue)
  const maxLightness = 50; // Maximum lightness (medium blue)

  // Loop through and generate shades within the specified range
  for (let i = 0; i < numColors; i++) {
    // Evenly distribute lightness within the range
    const lightness = minLightness + (i * ((maxLightness - minLightness) / (numColors - 1)));

    // Push the generated color to the array
    colors.push(hslToHex(baseHue, 70, lightness));
  }

  return colors;
}

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(Math.min(k(n) - 3, 9 - k(n), 1), -1);
  const toHex = (x) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

const prepareTradeAndVolumeStats = async (tradesAccordingToTimeStamp, orderTrades) => {

  const raindexTransactionHashes = new Set(orderTrades.map((trade) => trade.transactionHash));

  // Split into RaindexTrades and ExternalTrades
  const raindexTrades = [];
  const externalTrades = [];

  for (const trade of tradesAccordingToTimeStamp) {
    if (raindexTransactionHashes.has(trade.transactionHash)) {
      raindexTrades.push(trade);
    } else {
      externalTrades.push(trade);
    }
  }

  // Helper function to group trades by 24-hour periods
  const groupTradesByDay = (trades) => {
    const grouped = {};
    trades.forEach((trade) => {
      const dateKey = new Date(trade.timestamp * 1000).toISOString().split("T")[0]; // YYYY-MM-DD
      if (!grouped[dateKey]) {
        grouped[dateKey] = { count: 0, volume: 0 };
      }
      grouped[dateKey].count += 1;
      grouped[dateKey].volume += parseFloat(trade.amountInUsd || 0); // Ensure volume in USD is summed
    });
    return grouped;
  };

  // Group Raindex and External trades
  const raindexGrouped = groupTradesByDay(raindexTrades);
  const externalGrouped = groupTradesByDay(externalTrades);

  const totalRaindexVolume = raindexTrades.reduce((sum, item) => sum + (item.amountInUsd || 0), 0)
  const totalExternalVolume = externalTrades.reduce((sum, item) => sum + (item.amountInUsd || 0), 0)

  // Merge grouped data into final structure
  const tradeData = [[]];
  const volumeData = [[]];
  const allDates = Array.from(new Set([...Object.keys(raindexGrouped), ...Object.keys(externalGrouped)])).sort();

  allDates.forEach((dateKey) => {
    const raindexStats = raindexGrouped[dateKey] || { count: 0, volume: 0 };
    const externalStats = externalGrouped[dateKey] || { count: 0, volume: 0 };

    tradeData[0].push({
      name: new Date(dateKey).toLocaleDateString("en-US", { day: "2-digit", month: "short" }),
      Raindex: raindexStats.count,
      External: externalStats.count,
      total: raindexStats.count + externalStats.count,
    });

    volumeData[0].push({
      name: new Date(dateKey).toLocaleDateString("en-US", { day: "2-digit", month: "short" }),
      Raindex: parseFloat(raindexStats.volume.toFixed(2)),
      External: parseFloat(externalStats.volume.toFixed(2)),
      total: parseFloat((raindexStats.volume + externalStats.volume).toFixed(2)),
    });
  });

  const tradeStats = [
    { name: "Raindex" },
    { name: "External" },
  ];

  const volumeStats = [
    { name: "Raindex" },
    { name: "External" },
  ];

  return {
    tradeData,
    tradeStats,
    volumeData,
    volumeStats,
    totalRaindexTrades: raindexTrades.length,
    totalExternalTrades: externalTrades.length,
    totalRaindexVolume,
    totalExternalVolume
  }
};

export { generateColorPalette, hslToHex, prepareTradeAndVolumeStats };

const RaindexMarketData = () => {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [customRange, setCustomRange] = useState({ from: null, to: null });
  const [selectedToken, setSelectedToken] = useState('IOEN');

  const [historicalTradeData, setHistoricalTradeData] = useState([]);
  const [historicalTradeStats, setHistoricalTradeStats] = useState([]);
  const [historicalVolumeData, setHistoricalVolumeData] = useState([]);
  const [historicalVolumeStats, setHistoricalVolumeStats] = useState([]);

  const [durationTradeData, setDurationTradeData] = useState([]);
  const [durationTradeStats, setDurationTradeStats] = useState([]);
  const [durationVolumeData, setDurationVolumeData] = useState([]);
  const [durationVolumeStats, setDurationVolumeStats] = useState([]);


  const [totalRaindexTrades, setTotalRaindexTrades] = useState(0);
  const [totalExternalTrades, setTotalExternalTrades] = useState(0);
  const [totalRaindexVolume, setTotalRaindexVolume] = useState(0);
  const [totalExternalVolume, setTotalExternalVolume] = useState(0);


  useEffect(() => {
    if (customRange.from && customRange.to && selectedToken) {
      const currentGracePeriod = 300
      const fromTimestamp = Math.floor(new Date(customRange.from).getTime() / 1000);
      const toTimestamp = Math.floor(new Date(customRange.to).getTime() / 1000) - currentGracePeriod;
      fetchAndSetData(selectedToken, fromTimestamp, toTimestamp);
    }
  }, [customRange, selectedToken]);

  const fetchAndSetData = async (token, fromTimestamp, toTimestamp) => {
    try {
      const network = tokenConfig[token]?.network
      const { filteredActiveOrders, filteredInActiveOrders } = await fetchAndFilterOrders(
        token,
        network,
      );
      const allOrders = filteredActiveOrders.concat(filteredInActiveOrders);

      const oldestTimestamp = Math.min(
        ...allOrders.map(i => Number(i.timestampAdded))
      );

      const { tradesAccordingToTimeStamp: allTradesArray } = await analyzeLiquidity(network, token, oldestTimestamp, toTimestamp);
      const raindexOrderWithTrades = await getTradesByTimeStamp(network, allOrders, oldestTimestamp, toTimestamp);

      {
        const {
          tradeData: historicalTradeData,
          tradeStats: historicalTradeStats,
          volumeData: historicalVolumeData,
          volumeStats: historicalVolumeStats
        } = await prepareTradeAndVolumeStats(allTradesArray, raindexOrderWithTrades);

        setHistoricalTradeData(historicalTradeData)
        setHistoricalTradeStats(historicalTradeStats)
        setHistoricalVolumeData(historicalVolumeData)
        setHistoricalVolumeStats(historicalVolumeStats)
      }
      {
        const {
          tradeData: durationTradeData,
          tradeStats: durationTradeStats,
          volumeData: durationVolumeData,
          volumeStats: durationVolumeStats,
          totalRaindexTrades,
          totalExternalTrades,
          totalRaindexVolume,
          totalExternalVolume
        } = await prepareTradeAndVolumeStats(
          allTradesArray.filter(i => { return i.timestamp >= fromTimestamp && i.timestamp <= toTimestamp }),
          raindexOrderWithTrades.filter(i => { return i.timestamp >= fromTimestamp && i.timestamp <= toTimestamp })
        );

        setDurationTradeData(durationTradeData)
        setDurationTradeStats(durationTradeStats)
        setDurationVolumeData(durationVolumeData)
        setDurationVolumeStats(durationVolumeStats)
        setTotalRaindexTrades(totalRaindexTrades)
        setTotalExternalTrades(totalExternalTrades)
        setTotalRaindexVolume(totalRaindexVolume)
        setTotalExternalVolume(totalExternalVolume)
      }

      setLoading(false);
    } catch (error) {
      setError(error)
    }
  }

  

  const renderBarChart = (
    dataSets,
    title,
    yAxisLabel,
    colorKeys,
    subtitles,
    formatter,
    cardSpan,
    cardHeight = 250 // Allow dynamic card span (1 to 3)
  ) => {
    const bluePalette = generateColorPalette(colorKeys.length);
  
    const cardSpanClass = `col-span-${cardSpan}`;
  
    // Calculate Y-axis domain
    const maxVal = Math.max(
      ...dataSets.flatMap((data) => data.map((item) => item.total || 0))
    );
    const yAxisMax = maxVal + maxVal * 0.1;
  
    return (
      <div
        className={`bg-white rounded-lg shadow-lg p-5 flex flex-col ${cardSpanClass}`}
      >
        {/* Chart Title */}
        <h3 className="text-lg font-semibold text-center mb-2 text-gray-800">{title}</h3>
  
        {/* Subtitle (optional) */}
        {subtitles && (
          <p className="text-sm text-center text-gray-600 mb-4">{subtitles}</p>
        )}
  
        {/* Chart Container for all bar charts */}
        <div className="space-y-6">
          {dataSets.map((data, index) => (
            <div key={index} className="flex flex-col">
              <ResponsiveContainer width="100%" height={cardHeight}>
                <BarChart
                  data={data}
                  margin={{ top: 10, right: 10, bottom: 20, left: 25 }}
                >
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis
                    type="number"
                    domain={[0, yAxisMax]}
                    allowDataOverflow={true}
                    label={{
                      value: yAxisLabel,
                      angle: -90,
                      position: "insideLeft",
                      style: { fontSize: "14px" },
                      dx: -20,
                      dy: 20,
                    }}
                    tickFormatter={(value) => formatter(value)}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip formatter={(value) => formatter(value)} />
  
                  {/* Stacked Bars */}
                  {colorKeys.map((key, keyIndex) => (
                    <Bar
                      key={key}
                      dataKey={key}
                      stackId="a"
                      fill={bluePalette[keyIndex]}
                    />
                  ))}
  
                  {/* Total Stacked Value Labels */}
                  <Bar
                    dataKey="total"
                    stackId="a"
                    fill="transparent"
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
  
              {/* Bottom Progress Bar */}
              <div className="mt-4">
                {colorKeys.map((key, keyIndex) => {
                  const totalValue = data.reduce((sum, item) => sum + (item.total || 0), 0);
                  const value = data.reduce((sum, item) => sum + (item[key] || 0), 0);
                  const percentage = (value / totalValue) * 100;
  
                  return (
                    <div key={keyIndex} className="flex items-center mb-2">
                      <div className="w-20 text-sm font-semibold text-gray-700">{key}</div>
                      <div className="flex-1 bg-gray-200 h-2 rounded-full mx-2 relative">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${percentage}%`,
                            backgroundColor: bluePalette[keyIndex % bluePalette.length],
                          }}
                        ></div>
                      </div>
                      <div className="w-12 text-sm text-gray-600">
                        {`${formatter(value)} ${percentage.toFixed(2)}%`}
                      </div>
                    </div>
                  );
                })}
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

  const volFormatter = (value) => `$${formatValue(value)}`;
  const tradeFormatter = (value) => `${formatValue(value)}`;
  const percentageFormater = (value) => `${formatValue(value)}%`;

  const renderInsights = (totalRaindexTrades, totalExternalTrades, totalRaindexVolume, totalExternalVolume) => {

    const totalTrades = totalRaindexTrades + totalExternalTrades
    const totalVolume = totalRaindexVolume + totalExternalVolume

    const pieDataTrades = [
      { name: "Raindex", value: totalRaindexTrades, percentage: ((totalRaindexTrades / totalTrades) * 100).toFixed(1) },
      { name: "External", value: totalExternalTrades, percentage: ((totalExternalTrades / totalTrades) * 100).toFixed(1) },
    ];

    const pieDataVolume = [
      { name: "Raindex", value: totalRaindexVolume, percentage: ((totalRaindexVolume / totalVolume) * 100).toFixed(1) },
      { name: "External", value: totalExternalVolume, percentage: ((totalExternalVolume / totalVolume) * 100).toFixed(1) },
    ];

    const COLORS = pieDataVolume.map((_, index) => generateColorPalette(2)[index]);

    const formatTotalVolume = formatValue(totalVolume)

    return (
      <div className="p-5">
        {/* Header Section */}
        <div className="text-center mb-2">
          <h1 className="text-2xl font-bold text-gray-800">Market Insights</h1>
          <p className="text-gray-600">Transaction and Volume Analysis</p>
        </div>

        {/* Pie Charts Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {/* Trades Pie Chart */}
          <div className="bg-white shadow-md rounded-lg p-5">
            <h3 className="text-lg font-semibold text-gray-700 text-center mb-4">
            Transaction Source Breakdown
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={pieDataTrades}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={90}
                  fill="#8884d8"
                  dataKey="value"
                // label={(entry) => `${entry.name}: ${entry.percentage}%`}
                // position="top"
                >
                  {pieDataTrades.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <text x="50%" y="50%" dy={8} textAnchor="middle" fill={"#0A1320"}>
                  Total: {formatValue(totalTrades)}
                </text>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3 mt-4">
              {pieDataTrades.map((stat, index) => (
                <div key={index}>
                  <div className="flex justify-between mb-1">
                    <span className="font-bold" style={{ color: COLORS[index] }}>
                      {stat.name}
                    </span>
                    <span>{formatValue(stat.value)} - {stat.percentage}%</span>
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

          {/* Volume Pie Chart */}
          <div className="bg-white shadow-md rounded-lg p-5">
            <h3 className="text-lg font-semibold text-gray-700 text-center mb-4">
              Trading Volume Distribution
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={pieDataVolume}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={90}
                  fill="#8884d8"
                  dataKey="value"
                // label={(entry) => `${entry.name}: ${entry.percentage}%`}
                >
                  {pieDataVolume.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <text x="50%" y="50%" dy={8} textAnchor="middle" fill={"#0A1320"}>
                  Total:${formatTotalVolume.toString()}
                </text>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3 mt-4">
              {pieDataVolume.map((stat, index) => (
                <div key={index}>
                  <div className="flex justify-between mb-1">
                    <span className="font-bold" style={{ color: COLORS[index] }}>
                      {stat.name}
                    </span>
                    <span>${formatValue(stat.value)} - {stat.percentage}%</span>
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
        </div>
      </div>
    );

  }

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
                        {selectedToken.toUpperCase()} Token
                      </h1>

                      {/* Info Section */}
                      <div className="text-right space-y-4">
                        <div>
                          <span className="block font-semibold text-gray-600">Report generated at:</span>
                          <p className="text-gray-700">{new Date().toLocaleString()}</p>
                        </div>
                        <div>
                          <span className="block font-semibold text-gray-600">Analysis Period:</span>
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
                      renderInsights(
                        totalRaindexTrades,
                        totalExternalTrades,
                        totalRaindexVolume,
                        totalExternalVolume
                      )
                    }
                    

                    {durationTradeData.length > 0 &&
                      durationTradeStats.length > 0 &&
                      renderBarChart(
                        durationTradeData,
                        "Trades Daily",
                        "Trades",
                        durationTradeStats.map((item) => item.name),
                        `${durationTradeData[0][0].name} - ${durationTradeData[0][durationTradeData[0].length - 1].name}`,
                        tradeFormatter,
                        1
                      )}
                    {durationVolumeData.length > 0 &&
                      durationVolumeStats.length > 0 &&
                      renderBarChart(
                        durationVolumeData,
                        "Volume Daily",
                        "Volume",
                        durationVolumeStats.map((item) => item.name),
                        `${durationVolumeData[0][0].name} - ${durationVolumeData[0][durationVolumeData[0].length - 1].name}`,
                        volFormatter,
                        1
                      )}

                    {durationTradeData.length > 0 &&
                      durationTradeStats.length > 0 &&
                      renderBarChart(
                        durationTradeData.map(innerArray =>
                          innerArray.map(({ name, Raindex, External, total }) => ({
                              name,
                              Raindex: +(Raindex / total * 100).toFixed(2),
                              External: +(External / total * 100).toFixed(2),
                              total: 100
                          }))
                      ),
                        "Transaction Source Distribution %",
                        "Trades",
                        durationTradeStats.map((item) => item.name),
                        `${durationTradeData[0][0].name} - ${durationTradeData[0][durationTradeData[0].length - 1].name}`,
                        percentageFormater,
                        1
                      )}
                    {durationVolumeData.length > 0 &&
                      durationVolumeStats.length > 0 &&
                      renderBarChart(
                        durationVolumeData.map(innerArray =>
                          innerArray.map(({ name, Raindex, External, total }) => ({
                              name,
                              Raindex: +(Raindex / total * 100).toFixed(2),
                              External: +(External / total * 100).toFixed(2),
                              total: 100
                          }))
                      ),
                        "Trading Volume Distribution %",
                        "Volume",
                        durationVolumeStats.map((item) => item.name),
                        `${durationVolumeData[0][0].name} - ${durationVolumeData[0][durationVolumeData[0].length - 1].name}`,
                        percentageFormater,
                        1
                      )}
                      {historicalTradeData.length > 0 &&
                      historicalTradeStats.length > 0 &&
                      renderBarChart(
                        historicalTradeData,
                        "Long-term Transaction Trends",
                        "Number of Transactions",
                        historicalTradeStats.map((item) => item.name),
                        `${historicalTradeData[0][0].name} - ${historicalTradeData[0][historicalTradeData[0].length - 1].name}`,
                        tradeFormatter,
                        3,
                        350
                      )}
                    {historicalVolumeData.length > 0 &&
                      historicalVolumeStats.length > 0 &&
                      renderBarChart(
                        historicalVolumeData,
                        "Historical Trading Volume Distribution",
                        "Volume",
                        historicalVolumeStats.map((item) => item.name),
                        `${historicalVolumeData[0][0].name} - ${historicalVolumeData[0][historicalVolumeData[0].length - 1].name}`,
                        volFormatter,
                        3,
                        350
                      )}
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

export default RaindexMarketData;
