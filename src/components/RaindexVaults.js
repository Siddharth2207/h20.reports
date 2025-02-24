import { XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar } from 'recharts';
import React, { useState, useEffect } from 'react';
import {
  analyzeLiquidity,
  fetchAndFilterOrders,
  getTradesByTimeStamp,
  tokenMetrics,
  tokenConfig,
  networkConfig,
  fetchAllPaginatedData,
  getTokenPriceUsd,
} from 'raindex-reports';
import TopBarWithFilters from './TopBarWithFilters';
import { PieChart, Pie, Cell } from 'recharts';
import { generateColorPalette } from './RaindexMarketData';
import { ethers } from 'ethers';

const RaindexVaults = () => {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [customRange, setCustomRange] = useState({ from: null, to: null });
  const [selectedToken, setSelectedToken] = useState('IOEN');
  const [allOrders, setAllOrders] = useState(null);
  const [orderVolumeData, setOrderVolumeData] = useState([]);
  const [orderVolumeStats, setOrderVolumeStats] = useState([]);
  const [vaultData, setVaultData] = useState([]);
  const [vaultStats, setVaultStats] = useState([]);
  const [tokenVaultSummary, setTokenVaultSummary] = useState([]);
  const [ordersPerVault, setOrdersPerVault] = useState([]);

  const [vaultBalancesData, setVaultBalancesData] = useState([]);
  const [vaultVolumeData, setVaultVolumeData] = useState([]);
  const [tokenPrice, setTokenPrice] = useState(null);

  useEffect(() => {
    if (customRange.from && customRange.to && selectedToken) {
      const currentGracePeriod = 300;
      const fromTimestamp = Math.floor(new Date(customRange.from).getTime() / 1000);
      const toTimestamp =
        Math.floor(new Date(customRange.to).getTime() / 1000) - currentGracePeriod;
      fetchAndSetData(selectedToken, fromTimestamp, toTimestamp);
    }
    // eslint-disable-next-line
  }, [customRange, selectedToken]);

  function abbreviateHash(hash) {
    return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
  }

  const fetchAndSetData = async (token, fromTimestamp, toTimestamp) => {
    try {
      const network = tokenConfig[token]?.network;
      const { filteredActiveOrders, filteredInActiveOrders } = await fetchAndFilterOrders(
        token,
        network,
      );
      const allOrders = filteredActiveOrders.concat(filteredInActiveOrders);
      setAllOrders(allOrders);

      const { tradesAccordingToTimeStamp: allTradesArray } = await analyzeLiquidity(
        network,
        token,
        fromTimestamp,
        toTimestamp,
      );
      const raindexOrderWithTrades = await getTradesByTimeStamp(
        network,
        allOrders,
        fromTimestamp,
        toTimestamp,
      );
      prepareOrderVolumeData(allTradesArray, raindexOrderWithTrades);

      const vaultBalanceData = await prepareVaultBalanceData();

      const vaultVolumeData = prepareVaultVolumeData(vaultBalanceData);
      setVaultVolumeData(vaultVolumeData);

      const vaultBalancesData = prepareVaultBalancesData(allOrders);
      setVaultBalancesData(vaultBalancesData);

      const tokenPrice = await getTokenPriceUsd(
        tokenConfig[selectedToken]?.address,
        tokenConfig[selectedToken]?.symbol,
      );
      setTokenPrice(tokenPrice);

      const orderPerVaults = vaultBalanceData
        .map((vault) => {
          const vaultId = vault.id;

          // Collect only active orders
          const orders = new Set([
            ...vault.ordersAsInput.filter((order) => order.active).map((order) => order.id),
            ...vault.ordersAsOutput.filter((order) => order.active).map((order) => order.id),
          ]);

          // Return only vaults that have active orders
          return orders.size > 0 ? { vaultId, orders: orders.size } : null;
        })
        .filter((vault) => vault !== null);
      setOrdersPerVault(orderPerVaults);

      const { tokenVaultSummary } = await tokenMetrics(filteredActiveOrders);
      const { vaultData, vaultStats } = prepareVaultDataAndStats(tokenVaultSummary);
      setVaultData(vaultData);
      setVaultStats(vaultStats);

      setTokenVaultSummary(tokenVaultSummary);

      setLoading(false);
    } catch (error) {
      setError(error);
    }
  };

  const StackedBarChart = (
    title,
    subtitle,
    barChartData,
    dataKeyXAxis,
    dataKeyYAxis,
    xAxisLabel,
    yAxisLabel,
    xAxisFormatter,
    yAxisFormatter,
  ) => {
    const COLORS = generateColorPalette(barChartData.length);

    return (
      <div className="flex flex-col justify-between rounded-lg bg-white p-5 shadow-lg">
        <h3 className="mb-2 text-center text-lg font-semibold text-gray-800">{title}</h3>
        {subtitle && <p className="mb-4 text-center text-sm text-gray-600">{subtitle}</p>}

        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={barChartData} margin={{ top: 20, right: 30, left: 20, bottom: 25 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey={dataKeyXAxis}
              tick={{ fontSize: 12 }}
              tickFormatter={xAxisFormatter}
              label={{
                value: `${xAxisLabel}`,
                position: 'bottom',
                offset: 5, // Adjusted offset for better spacing
                style: { fontSize: 14, fill: '#555' },
              }}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              tickFormatter={yAxisFormatter}
              label={{
                value: `${yAxisLabel}`,
                position: 'insideLeft',
                angle: -90,
                dy: 50,
                dx: -10,
                style: { fontSize: 14, fill: '#555' },
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

  const renderVaultHealthMetrics = () => {
    const totalVaultBalance = vaultBalancesData.reduce((sum, vault) => sum + vault.value, 0);
    const totalVaultVolume = vaultVolumeData.reduce((sum, vault) => sum + vault.value, 0);
    const activeRatio = ((totalVaultBalance / totalVaultVolume) * 100).toFixed(2);

    return (
      <div className="flex flex-col justify-between rounded-lg bg-white p-5 shadow-lg">
        <h3 className="mb-2 text-center text-lg font-semibold text-gray-800">
          Vault Health Metrics
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg bg-blue-50 p-5 text-center">
            <p className="text-sm text-gray-600">Total Orders</p>
            <p className="text-2xl font-semibold text-blue-600">{allOrders.length}</p>
          </div>

          <div className="rounded-lg bg-green-50 p-5 text-center">
            <p className="text-sm text-gray-600">
              Total Tokens {tokenConfig[selectedToken]?.symbol}
            </p>
            <p className="text-2xl font-semibold text-green-600">
              {formatValue(totalVaultBalance)}
            </p>
          </div>

          <div className="rounded-lg bg-purple-50 p-5 text-center">
            <p className="text-sm text-gray-600">Total Value (USD)</p>
            <p className="text-2xl font-semibold text-purple-600">
              ${formatValue(totalVaultBalance * tokenPrice.currentPrice)}
            </p>
          </div>

          <div className="rounded-lg bg-indigo-50 p-5 text-center">
            <p className="text-sm text-gray-600">Active Ratio</p>
            <p className="text-2xl font-semibold text-indigo-600">{activeRatio}%</p>
          </div>
        </div>
      </div>
    );
  };

  const prepareVaultVolumeData = (vaultBalanceData) => {
    // Prepare data for vault balances
    const vaultBalances = {};

    // Sum up all amounts in balanceChanges for each vault
    vaultBalanceData.forEach((vault) => {
      const vaultId = vault.vaultId;
      const totalBalanceChange = vault.balanceChanges.reduce(
        (sum, change) => sum + (Math.abs(parseFloat(change.amount)) || 0),
        0,
      );

      if (totalBalanceChange > 0) {
        vaultBalances[vaultId] = {
          name: `Vault ${vaultId.slice(0, 4)}..`,
          value: totalBalanceChange / 10 ** vault.token.decimals, // Convert from smallest unit
        };
      }
    });

    // Sort by balance in descending order
    const sortedVaults = Object.values(vaultBalances).sort((a, b) => b.value - a.value);

    // Keep top 5 vaults and group the rest into "Others"
    const displayedVaults = sortedVaults.slice(0, 5);
    const othersValue = sortedVaults.slice(5).reduce((sum, vault) => sum + vault.value, 0);

    if (othersValue > 0) {
      displayedVaults.push({ name: 'Others', value: othersValue });
    }

    // Calculate total value and percentages
    const totalValue = displayedVaults.reduce((sum, vault) => sum + vault.value, 0);
    const data = displayedVaults.map((vault) => ({
      ...vault,
      percentage: (vault.value / totalValue) * 100,
    }));

    return data;
  };

  const prepareVaultBalancesData = (orders) => {
    // Prepare data for vault balances
    const vaultBalances = {};

    // Aggregate balances from inputs and outputs
    orders.forEach((order) => {
      [...order.inputs, ...order.outputs].forEach((entry) => {
        const vaultId = entry.id;
        const balance = parseFloat(
          ethers.utils.formatEther(entry.balance, entry.token.decimals),
        ).toFixed(8);

        if (!vaultBalances[vaultId]) {
          vaultBalances[vaultId] = {
            name: `Vault ${entry.vaultId.slice(0, 4)}..`,
            values: new Set(), // Store unique balances
          };
        }

        vaultBalances[vaultId].values.add(balance);
      });
    });

    // Convert Sets to unique aggregated values
    Object.keys(vaultBalances).forEach((vaultId) => {
      const uniqueBalances = Array.from(vaultBalances[vaultId].values).map(Number); // Convert back to numbers
      vaultBalances[vaultId].value = uniqueBalances.reduce((sum, val) => sum + val, 0); // Sum unique balances
      delete vaultBalances[vaultId].values; // Remove the Set after aggregation
    });

    // Sort by balance in descending order
    const sortedVaults = Object.values(vaultBalances).sort((a, b) => b.value - a.value);

    // Keep top 5 vaults and group the rest into "Others"
    const displayedVaults = sortedVaults.slice(0, 5);
    const othersValue = sortedVaults.slice(5).reduce((sum, vault) => sum + vault.value, 0);

    if (othersValue > 0) {
      displayedVaults.push({ name: 'Others', value: othersValue });
    }

    // Calculate total value and percentages
    const totalValue = displayedVaults.reduce((sum, vault) => sum + vault.value, 0);
    const data = displayedVaults.map((vault) => ({
      ...vault,
      percentage: (vault.value / totalValue) * 100,
    }));

    return data;
  };

  const prepareOrderVolumeData = (allTradesArray, raindexTradesArray) => {
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
        name: 'Others',
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
        name: 'Volume',
        ...volumeData,
        Others: othersVolume,
        total: totalVolume,
      },
    ];

    setOrderVolumeData(orderVolumeData);
    setOrderVolumeStats(orderVolumeStats);
  };

  const prepareVaultBalanceData = async () => {
    const fetchVaultDetails = `
            query VaultsQuery($tokenAddress: Bytes!, $skip: Int = 0, $first: Int = 1000) {
              vaults(
                skip: $skip
                first: $first
                where: {
                  token_: {
                    address: $tokenAddress
                  }
                }
              ) {
                id
                vaultId
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
            query VaultBalanceChanges($vaultId: Bytes!, $skip: Int = 0, $first: Int = 1000) {
              vaultBalanceChanges(
                skip: $skip
                first: $first
                where: {vault_: {id: $vaultId}}
              ) {
                ... on TradeVaultBalanceChange {
                  id
                  amount
                  timestamp
                  newVaultBalance
                  oldVaultBalance
                }
              }
            }
          `;

    let vaultsData = await fetchAllPaginatedData(
      networkConfig[tokenConfig[selectedToken].network].subgraphUrl,
      fetchVaultDetails,
      { tokenAddress: tokenConfig[selectedToken].address.toLowerCase() },
      'vaults',
    );

    for (let i = 0; i < vaultsData.length; i++) {
      let vault = vaultsData[i];
      let vaultBalanceChangesData = await fetchAllPaginatedData(
        networkConfig[tokenConfig[selectedToken].network].subgraphUrl,
        vaultBalanceChanges,
        { vaultId: vault.id.toString() },
        'vaultBalanceChanges',
      );
      vault['balanceChanges'] = vaultBalanceChangesData.sort(
        (a, b) => parseInt(b.timestamp, 10) - parseInt(a.timestamp, 10),
      );
    }

    return vaultsData;
  };

  const renderVaultBarChart = (
    data,
    title,
    subtitle,
    xAxisLabel,
    yAxisLabel,
    xAxisFormatter,
    yAxisFormatter,
  ) => {
    // Generate colors for the bar chart
    const COLORS = data.map((_, index) => generateColorPalette(data.length)[index]);

    return (
      <div className="flex flex-col justify-between rounded-lg bg-white p-5 shadow-lg">
        {/* Chart Title */}
        <h3 className="mb-2 text-center text-lg font-semibold text-gray-800">{title}</h3>
        {subtitle && <p className="mb-4 text-center text-sm text-gray-600">{subtitle}</p>}

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
              tickFormatter={xAxisFormatter}
              label={{
                value: `${xAxisLabel}`,
                position: 'insideBottom',
                offset: -5,
                style: { fontSize: 14, fill: '#555' },
              }}
            />

            <YAxis
              dataKey="name"
              type="category"
              tick={{ fontSize: 12 }}
              tickFormatter={yAxisFormatter}
              label={{
                value: `${yAxisLabel}`,
                position: 'insideLeft',
                angle: -90, // Rotates the text vertically
                dy: 50, // Adjust vertical position for better centering
                dx: -10, // Adjusts left/right alignment
                style: { fontSize: 14, fill: '#555' },
              }}
            />

            <Tooltip formatter={xAxisFormatter} />
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
    if (!tokenVaultSummary || tokenVaultSummary.length === 0)
      return { vaultData: [], vaultStats: [] };

    // Prepare vaultData
    const vaultData = [
      tokenVaultSummary.reduce(
        (result, token) => {
          result[token.symbol] = token.totalTokenBalanceUsd;
          result.total += token.totalTokenBalanceUsd;
          return result;
        },
        { name: 'Balance', total: 0 },
      ),
    ];

    const totalBalanceUsd = tokenVaultSummary.reduce(
      (sum, token) => sum + token.totalTokenBalanceUsd,
      0,
    );

    const vaultStats = tokenVaultSummary.map((token) => {
      const percentage = ((token.totalTokenBalanceUsd / totalBalanceUsd) * 100).toFixed(2);
      return {
        name: token.symbol,
        value: `$${token.totalTokenBalanceUsd.toLocaleString()} - ${formatValue(
          token.totalTokenBalance,
        )} ${token.symbol}`,
        percentage: percentage,
      };
    });

    return { vaultData, vaultStats };
  };

  const renderPieChart = (title, stats, colorKeys, subtitle) => {
    const data = stats.map((item) => ({
      ...item,
      value: parseFloat(item.value.replace(/[^0-9.-]+/g, '')),
      percentage: parseFloat(item.percentage),
    }));

    // Ensure total value and colors match
    const totalVaultValue = formatValue(data.reduce((sum, item) => sum + item.value, 0));
    const COLORS = colorKeys.map((_, index) => generateColorPalette(colorKeys.length)[index]);

    return (
      <div className="flex flex-col justify-between rounded-lg bg-white p-5 shadow-lg">
        <h3 className="mb-2 text-center text-lg font-semibold text-gray-800">{title}</h3>
        {subtitle && <p className="mb-4 text-center text-sm text-gray-600">{subtitle}</p>}

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
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <text x="50%" y="50%" dy={8} textAnchor="middle" fill={'#0A1320'}>
              Total: ${totalVaultValue}
            </text>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>

        <div className="mt-4 space-y-3">
          {stats.map((stat, index) => (
            <div key={index}>
              <div className="mb-1 flex justify-between">
                <span className="font-bold" style={{ color: COLORS[index] }}>
                  {stat.name}
                </span>
                <span>{stat.value}</span>
              </div>
              <div className="h-2 w-full rounded bg-gray-200">
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
    <div className="min-h-screen bg-gray-50 p-6">
      <TopBarWithFilters
        onApplyFilters={handleFiltersApply}
        tokenOptions={Object.keys(tokenConfig)} // Add your token options here
      />
      {initialized ? (
        loading ? (
          <div className="flex h-screen flex-col items-center justify-center bg-gray-100">
            <div className="spinner h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-indigo-500"></div>
            <p>Loading...</p>
          </div>
        ) : (
          <div className="max-w-screen-3xl mx-auto rounded-lg bg-gray-100 p-8 shadow-lg">
            <div className="border-b border-gray-300 bg-gray-100 p-6">
              <div className="flex items-start justify-between">
                {/* Title Section */}
                <h1 className="text-2xl font-bold text-gray-800">
                  {selectedToken.toUpperCase()} Market Analysis Report
                </h1>

                {/* Info Section */}
                <div className="space-y-4 text-right">
                  <div>
                    <span className="block font-semibold text-gray-600">Report generated at:</span>
                    <p className="text-gray-700">{new Date().toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="block font-semibold text-gray-600">Report duration:</span>
                    <p className="text-gray-700">
                      {new Date(customRange.from).toLocaleString()} -{' '}
                      {new Date(customRange.to).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-5 sm:grid-cols-1 md:grid-cols-3">
              {orderVolumeData.length > 0 &&
                orderVolumeStats.length > 0 &&
                renderPieChart(
                  'Volume by Order for Duration',
                  orderVolumeStats,
                  orderVolumeStats.map((item) => item.name),
                  ``,
                )}

              {vaultBalancesData &&
                vaultBalancesData.length > 0 &&
                renderVaultBarChart(
                  vaultBalancesData,
                  `${tokenConfig[selectedToken.toUpperCase()].symbol} Vault Balances`,
                  `Vault distribution for ${tokenConfig[selectedToken.toUpperCase()].symbol}`,
                  `${tokenConfig[selectedToken].symbol} Balance`,
                  `Vault ID`,
                  (value) =>
                    `${formatValue(value)} ${tokenConfig[selectedToken.toUpperCase()].symbol}`,
                  ``,
                )}

              {vaultVolumeData &&
                vaultVolumeData.length > 0 &&
                renderVaultBarChart(
                  vaultVolumeData,
                  `${tokenConfig[selectedToken.toUpperCase()].symbol} Vault Volume`,
                  `Volume distribution for ${
                    tokenConfig[selectedToken.toUpperCase()].symbol
                  } vaults`,
                  `${tokenConfig[selectedToken].symbol} Volume`,
                  `Vault ID`,
                  (value) =>
                    `${formatValue(value)} ${tokenConfig[selectedToken.toUpperCase()].symbol}`,
                  ``,
                )}

              {vaultData.length > 0 &&
                vaultStats.length > 0 &&
                renderPieChart(
                  `Vault Distribution for ${tokenConfig[selectedToken].symbol} orders`,
                  vaultStats,
                  vaultStats.map((item) => item.name),
                  ``,
                )}
              {tokenVaultSummary &&
                StackedBarChart(
                  `Total Value Locked`,
                  `Token vault balances for ${tokenConfig[selectedToken].symbol} orders`,
                  tokenVaultSummary,
                  'symbol',
                  'totalTokenBalanceUsd',
                  'Tokens',
                  'Amount USD',
                  ``,
                  (value) => `$${formatValue(value)}`,
                )}
              {ordersPerVault &&
                StackedBarChart(
                  `Orders Per Vaults`,
                  `Orders per vaults for ${tokenConfig[selectedToken].symbol}`,
                  ordersPerVault,
                  'vaultId',
                  'orders',
                  'Vault Ids',
                  'Orders Count',
                  (value) => `${value.slice(0, 2)}..${value.slice(-2)}`,
                  (value) => `${formatValue(value)}`,
                )}
              {renderVaultHealthMetrics()}
            </div>
            <div className="max-w-screen-3xl mx-auto rounded-lg bg-gray-100 p-8 shadow-lg"></div>
            <div className="mt-8 rounded-lg bg-gray-100 p-6 text-base text-gray-700">
              <h3 className="mb-4 text-left text-lg font-semibold">Data Sources</h3>
              <ul className="list-inside list-disc space-y-2">
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
                    href={
                      networkConfig[tokenConfig[selectedToken.toUpperCase()]?.network].subgraphUrl
                    }
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
        <div className="flex flex-col items-center justify-center rounded-lg bg-gray-100 p-6 text-center shadow-md">
          <p className="text-gray-700">
            Please select a <span className="font-medium text-blue-900">date range</span> and a{' '}
            <span className="font-medium text-blue-900">token</span> to filter the data.
          </p>
        </div>
      )}
    </div>
  );
};

export default RaindexVaults;
