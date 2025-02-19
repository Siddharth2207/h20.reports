import React, { useState, useEffect } from 'react';
import { fetchAndFilterOrders, tokenConfig, networkConfig } from 'raindex-reports';
import { queryRainSolverByOrder } from '../lib/queryRainSolver.mjs';
import { formatTimestamp } from './RaindexOrderList';

const OrdersTable = ({ orderSolverLogs }) => {
  const getOrderLink = (orderHash, orderNetwork) =>
    `https://raindex.finance/my-strategies/${orderHash}-${orderNetwork}`;

  return (
    <table className="w-full table-auto border-collapse border border-gray-200">
      <thead className="bg-gray-50 text-sm font-semibold text-gray-800">
        <tr className="border-b border-gray-300">
          <th className="w-[100px] px-4 py-3 text-center">Network</th>
          <th className="w-[150px] px-4 py-3 text-center">Hash</th>
          <th className="px-4 py-3 text-center">Pairs</th>
        </tr>
      </thead>
      <tbody>
        {orderSolverLogs?.map((order, index) => (
          <tr key={index} className="border-t border-gray-300 align-top text-gray-700">
            <td className="w-[100px] break-words px-4 py-3 text-center align-top text-sm">
              {order.network}
            </td>
            <td className="w-[150px] break-words px-4 py-2 text-center align-top text-blue-500 underline">
              <a
                href={getOrderLink(order.orderHash, order.network)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {`${order.orderHash.slice(0, 6)}...${order.orderHash.slice(-4)}`}
              </a>
            </td>
            <td className="px-4 py-3 text-center align-top text-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full table-auto rounded-lg border border-gray-200 text-left shadow-sm">
                  <thead className="bg-gray-100 text-sm uppercase text-gray-700">
                    <tr>
                      <th className="w-[120px] break-words px-4 py-2">Timestamp</th>
                      <th className="w-[120px] break-words px-4 py-2">Pair</th>
                      <th className="w-[140px] break-words px-4 py-2">ioRatio</th>
                      <th className="w-[140px] break-words px-4 py-2">Market Price</th>
                      <th className="w-[140px] break-words px-4 py-2">Price Distance</th>
                      <th className="w-[160px] break-words px-4 py-2">Order Output Amount</th>
                      <th className="w-[140px] break-words px-4 py-2">Order Status</th>
                      <th className="w-[200px] break-words px-4 py-2">Order Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {order.pairs?.map((pairItem, pairIndex) => (
                      <tr key={pairIndex} className="align-top transition hover:bg-gray-50">
                        <td className="w-[120px] break-words px-4 py-2 align-top">
                          {formatTimestamp(pairItem.timestamp / 1000)}
                        </td>
                        <td className="w-[120px] break-words px-4 py-2 align-top">
                          {pairItem.pair}
                        </td>
                        <td className="w-[140px] break-words px-4 py-2 align-top">
                          {pairItem.ioRatio}
                        </td>
                        <td className="w-[140px] break-words px-4 py-2 align-top">
                          {pairItem.marketPrice}
                        </td>
                        <td className="w-[140px] break-words px-4 py-2 align-top">
                          {pairItem.ioRatio - pairItem.marketPrice}
                        </td>
                        <td className="w-[160px] break-words px-4 py-2 align-top">
                          {pairItem.maxOutput}
                        </td>
                        <td
                          className={`w-[140px] break-words px-4 py-2 align-top font-semibold ${
                            pairItem.orderStatus === 'success' ? 'text-green-500' : 'text-red-500'
                          }`}
                        >
                          {pairItem.orderStatus}
                        </td>
                        <td className="w-[200px] break-words px-4 py-2 align-top text-gray-500">
                          {pairItem.orderReason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const RaindexSolverStatus = () => {
  // State to manage selected token
  const [selectedToken, setSelectedToken] = useState('');
  const [solverLogs, setSolverLogs] = useState(null);

  const [loadingSolverLogs, setLoadingSolverLogs] = useState(false);

  useEffect(() => {
    if (selectedToken) {
      setLoadingSolverLogs(true);
      const fetchData = async () => {
        try {
          const activeOrders = await fetchAndSetData(selectedToken);
          const fetchedSolverLogs = await fetchSolverLogs(activeOrders);

          setSolverLogs(fetchedSolverLogs);
        } catch (error) {
          console.error('Error fetching solver logs:', error);
        } finally {
          setLoadingSolverLogs(false);
        }
      };
      fetchData();
    }
    // eslint-disable-next-line
  }, [selectedToken]);

  const fetchAndSetData = async (selectedToken) => {
    const network = tokenConfig[selectedToken]?.network;
    const { filteredActiveOrders } = await fetchAndFilterOrders(selectedToken, network);
    return filteredActiveOrders;
  };

  const fetchSolverLogs = async (orders) => {
    orders = orders.filter((i) => i.active);
    const filteredData = [];
    for (let i = 0; i < orders.length; i++) {
      let order = orders[i];
      const orderLogs = await queryRainSolverByOrder(
        networkConfig[tokenConfig[selectedToken].network].chainId,
        order.orderHash,
        Date.now(),
        10,
      );
      for (const orderLog of orderLogs) {
        const hasDetails = orderLog.attemptDetails !== undefined;
        filteredData.push({
          network: tokenConfig[selectedToken].network,
          orderHash: order.orderHash,
          pair: orderLog.pair,
          ioRatio: hasDetails ? orderLog.attemptDetails.quote.ratio : '0',
          maxOutput: hasDetails ? orderLog.attemptDetails.quote.maxOutput : '0',
          marketPrice: hasDetails ? orderLog.attemptDetails.fullAttempt.marketPrice : '0',
          orderStatus: hasDetails ? orderLog.status : 'zero max output',
          orderReason: hasDetails
            ? orderLog.attemptDetails.fullAttempt.error
            : 'No attempt details',
          timestamp: orderLog.timestamp,
        });
      }
    }
    const groupedData = {};
    for (const item of filteredData) {
      const {
        orderHash,
        pair,
        ioRatio,
        maxOutput,
        marketPrice,
        network,
        orderStatus,
        orderReason,
        timestamp,
      } = item;
      if (!groupedData[orderHash]) {
        groupedData[orderHash] = { orderHash, network, pairs: [] };
      }
      groupedData[orderHash].pairs.push({
        pair,
        ioRatio,
        maxOutput,
        marketPrice,
        orderStatus,
        orderReason,
        timestamp,
      });
    }
    return Object.values(groupedData);
  };

  const handleTokenChange = (event) => {
    setSelectedToken(event.target.value);
  };

  return (
    <div className="min-h-screen p-6">
      <div className="flex items-center justify-between rounded-lg bg-gray-800 p-4 text-white shadow-lg">
        <h1 className="text-lg font-semibold uppercase tracking-wide">Solver Logs</h1>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium">Token:</span>
            <select
              className="rounded bg-gray-700 p-2 text-sm text-white focus:outline-none focus:ring focus:ring-indigo-500"
              value={selectedToken}
              onChange={handleTokenChange}
            >
              <option value="">Select Token</option>
              {Object.keys(tokenConfig).map((token, index) => (
                <option key={index} value={token}>
                  {token}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="max-w-screen-3xl mx-auto mt-6 rounded-lg bg-gray-100 p-8 shadow-lg">
        {loadingSolverLogs ? (
          <div className="flex flex-col items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-indigo-600"></div>
            <p className="mt-3 text-lg font-medium text-gray-600">Loading...</p>
          </div>
        ) : (
          <>{solverLogs && <OrdersTable orderSolverLogs={solverLogs} />}</>
        )}
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

export default RaindexSolverStatus;
