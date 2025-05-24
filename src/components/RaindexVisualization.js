import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { ethers } from 'ethers';
import { OrderV3, config, baseTokenConfig, quoteTokenConfig, orderQuery } from './contants';
import h20Logo from '../assets/h20-logo.png';
import { queryRainSolverByOrder } from '../lib/queryRainSolver.mjs';
import { networkConfig } from 'raindex-reports';

const RaindexVisualization = () => {
  const [orders, setOrders] = useState([]);
  const [network, setNetwork] = useState();
  const [networkEndpoint, setNetworkEndpoint] = useState();
  const [baseToken, setBaseToken] = useState();
  const [quoteToken, setQuoteToken] = useState();

  const POLLING_INTERVAL = 300000;
  const pollingRef = useRef(null);

  useEffect(() => {
    // Cleanup function to stop the previous polling interval
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      console.log('Previous polling stopped...');
    }

    if (networkEndpoint && baseToken && quoteToken) {
      fetchOrders(); // Fetch immediately when network, baseToken, or quoteToken changes

      pollingRef.current = setInterval(() => {
        fetchOrders();
      }, POLLING_INTERVAL);

      console.log('New polling started...');
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        console.log('Polling cleaned up...');
      }
    };
    // eslint-disable-next-line
  }, [networkEndpoint, baseToken, quoteToken]);

  async function fetchOrders() {
    try {
      const queryResult = await axios.post(networkEndpoint, { query: orderQuery });
      const orders = queryResult.data.data.orders;
      const baseTokenAddress = baseTokenConfig[baseToken]?.address;
      const quoteTokenAddress = quoteTokenConfig[quoteToken]?.address;

      if (baseTokenAddress && quoteTokenAddress) {
        const sampleOrders = await getCombinedOrders(orders, baseTokenAddress, quoteTokenAddress);
        setOrders(sampleOrders);
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
    }
  }

  async function getCombinedOrders(orders, baseTokenAddress, quoteTokenAddress) {
    let combinedOrders = [];

    const quoteRequests = orders.map(async (currentOrder) => {
      const currentDecodedOrder = ethers.utils.defaultAbiCoder.decode(
        [OrderV3],
        currentOrder.orderBytes,
      )[0];

      let isBuyInput = false,
        isBuyOutput = false,
        buyOutputIndex;
      let isSellInput = false,
        isSellOutput = false,
        sellOutputIndex;

      // Identify Buy Order Input/Output indices
      for (let j = 0; j < currentDecodedOrder.validInputs.length; j++) {
        if (
          currentDecodedOrder.validInputs[j].token.toLowerCase() === baseTokenAddress.toLowerCase()
        ) {
          isBuyInput = true;
        }
        if (
          currentDecodedOrder.validInputs[j].token.toLowerCase() === quoteTokenAddress.toLowerCase()
        ) {
          isSellInput = true;
        }
      }

      for (let j = 0; j < currentDecodedOrder.validOutputs.length; j++) {
        if (
          currentDecodedOrder.validOutputs[j].token.toLowerCase() ===
          quoteTokenAddress.toLowerCase()
        ) {
          isBuyOutput = true;
          buyOutputIndex = j;
        }
        if (
          currentDecodedOrder.validOutputs[j].token.toLowerCase() === baseTokenAddress.toLowerCase()
        ) {
          isSellOutput = true;
          sellOutputIndex = j;
        }
      }
      const processOrder = async (side) => {
        try {
          const isBuy = side === 'buy';
          const outputIndex = isBuy ? buyOutputIndex : sellOutputIndex;
          const pair = isBuy
            ? `${baseTokenConfig[baseToken]?.symbol}/${quoteTokenConfig[quoteToken]?.symbol}`
            : `${quoteTokenConfig[quoteToken]?.symbol}/${baseTokenConfig[baseToken]?.symbol}`;

          const orderLogs = await queryRainSolverByOrder(
            networkConfig[network].chainId,
            currentOrder.orderHash,
          );

          const currentOutputVault = currentOrder.outputs.filter((output) => {
            return (
              output.token.address.toLowerCase() ===
                currentDecodedOrder.validOutputs[outputIndex].token.toLowerCase() &&
              output.token.decimals.toString() ===
                currentDecodedOrder.validOutputs[outputIndex].decimals.toString() &&
              output.vaultId.toString() ===
                currentDecodedOrder.validOutputs[outputIndex].vaultId.toString()
            );
          })[0];

          const outputTokenSymbol = currentOutputVault.token.symbol.toUpperCase();
          const outputTokenBalance = ethers.utils.formatUnits(
            currentOutputVault.balance.toString(),
            currentOutputVault.token.decimals,
          );

          if (orderLogs.length > 0) {
            const orderLog = orderLogs.filter((i) => {
              return i.pair === pair;
            })[0];
            if (orderLog.attemptDetails !== undefined) {
              const marketPrice = parseFloat(orderLog.attemptDetails.fullAttempt.marketPrice);
              const ioRatio = parseFloat(orderLog.attemptDetails.quote.ratio);
              const priceDistance = ((marketPrice - ioRatio) / ioRatio) * 100;
              combinedOrders.push({
                orderHash: currentOrder.orderHash,
                side: side,
                ioRatio,
                outputAmount: parseFloat(orderLog.attemptDetails.quote.maxOutput),
                inputAmount:
                  parseFloat(orderLog.attemptDetails.quote.ratio) *
                  parseFloat(orderLog.attemptDetails.quote.maxOutput),
                outputTokenSymbol,
                outputTokenBalance,
                pair,
                priceDistance,
                status: orderLog.status,
              });
            } else if (orderLog.attemptDetails === undefined) {
              console.log(`%%% here %%%`);
              const ioRatio = 0;
              const priceDistance = 0;
              combinedOrders.push({
                orderHash: currentOrder.orderHash,
                side: side,
                ioRatio,
                outputAmount: 0,
                inputAmount: 0,
                outputTokenSymbol,
                outputTokenBalance,
                pair,
                priceDistance,
                status: orderLog.status,
              });
            }
          }
        } catch (error) {
          console.log(`Error processing ${side} order: `, currentOrder.orderHash, error);
        }
      };

      // Concurrently process buy and sell orders where applicable
      const promises = [];
      if (isBuyInput && isBuyOutput) promises.push(processOrder('buy'));
      if (isSellInput && isSellOutput) promises.push(processOrder('sell'));

      await Promise.all(promises);
    });

    // Wait for all requests to finish
    await Promise.all(quoteRequests);

    combinedOrders = combinedOrders.filter((order) => order.outputAmount > 0);
    return combinedOrders;
  }

  const handleNetworkChange = (newNetwork) => {
    setNetwork(newNetwork);
    setNetworkEndpoint(config.subgraphs[newNetwork]);
    setOrders([]);
  };

  const renderOrderTables = (orders) => {
    const groupOrdersByPrice = (orders) =>
      orders.reduce((acc, order) => {
        const price = Number(order.ioRatio).toFixed(8); // Group by price
        if (!acc[price]) acc[price] = [];
        acc[price].push(order); // Group orders by price
        return acc;
      }, {});

    const groupedBuyOrders = groupOrdersByPrice(orders.filter((o) => o.side === 'buy'));
    const groupedSellOrders = groupOrdersByPrice(orders.filter((o) => o.side === 'sell'));

    const buyOrders = Object.entries(groupedBuyOrders)
      .flatMap(([price, orders]) =>
        orders.map((order) => ({
          price: Number(price),
          outputAmount: order.outputAmount,
          inputAmount: order.inputAmount,
          orderHash: order.orderHash,
          priceDistance: order.priceDistance,
          status: order.status,
        })),
      )
      .sort((a, b) => a.price - b.price);

    const sellOrders = Object.entries(groupedSellOrders)
      .flatMap(([price, orders]) =>
        orders.map((order) => ({
          price: Number(price),
          outputAmount: order.outputAmount,
          inputAmount: order.inputAmount,
          orderHash: order.orderHash,
          priceDistance: order.priceDistance,
          status: order.status,
        })),
      )
      .sort((a, b) => a.price - b.price);

    const getOrderLink = (orderHash) => `https://v2.raindex.finance/orders/${network}-${orderHash}`;

    return (
      <div className="flex flex-col gap-5">
        {/* Buy Orders Table */}
        <div className="rounded-md border border-gray-300 bg-white p-4 shadow-md">
          <h3 className="mb-3 text-lg font-bold text-green-600">Buy Orders</h3>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="px-4 py-2">#</th>
                <th className="px-4 py-2">{baseTokenConfig[baseToken]?.symbol} Price</th>
                <th className="px-4 py-2"> Price Distance</th>
                <th className="px-4 py-2">Output Amount {quoteTokenConfig[quoteToken]?.symbol}</th>
                <th className="px-4 py-2">Input Amount {baseTokenConfig[baseToken]?.symbol}</th>
                <th className="px-4 py-2">
                  IO Ratio {baseTokenConfig[baseToken]?.symbol}/
                  {quoteTokenConfig[quoteToken]?.symbol}
                </th>
                <th className="px-4 py-2">Order Hash</th>
                <th className="px-4 py-2">Solver Status</th>
              </tr>
            </thead>
            <tbody>
              {buyOrders.map((order, index) => (
                <tr key={order.orderHash} className="border-b border-gray-200 hover:bg-gray-100">
                  <td className="px-4 py-2">{index + 1}</td>
                  <td className="px-4 py-2">{(1 / order.price).toFixed(4)}</td>
                  <td className="px-4 py-2">{order.priceDistance.toFixed(4)} %</td>
                  <td className="px-4 py-2">{order.outputAmount.toFixed(4)}</td>
                  <td className="px-4 py-2">{order.inputAmount.toFixed(4)}</td>
                  <td className="px-4 py-2 text-green-600">{order.price.toFixed(8)}</td>

                  <td className="px-4 py-2 text-blue-500 underline">
                    <a
                      href={getOrderLink(order.orderHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {`${order.orderHash.slice(0, 6)}...${order.orderHash.slice(-4)}`}
                    </a>
                  </td>
                  <td className="px-4 py-2 text-gray-600">{order.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Sell Orders Table */}
        <div className="rounded-md border border-gray-300 bg-white p-4 shadow-md">
          <h3 className="mb-3 text-lg font-bold text-red-600">Sell Orders</h3>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="px-4 py-2">#</th>
                <th className="px-4 py-2">{baseTokenConfig[baseToken]?.symbol} Price</th>
                <th className="px-4 py-2"> Price Distance</th>
                <th className="px-4 py-2">Output Amount {baseTokenConfig[baseToken]?.symbol}</th>
                <th className="px-4 py-2">Input Amount {quoteTokenConfig[quoteToken]?.symbol}</th>
                <th className="px-4 py-2">
                  IO Ratio {quoteTokenConfig[quoteToken]?.symbol}/
                  {baseTokenConfig[baseToken]?.symbol}
                </th>
                <th className="px-4 py-2">Order Hash</th>
                <th className="px-4 py-2">Solver Status</th>
              </tr>
            </thead>
            <tbody>
              {sellOrders.map((order, index) => (
                <tr key={order.orderHash} className="border-b border-gray-200 hover:bg-gray-100">
                  <td className="px-4 py-2">{index + 1}</td>
                  <td className="px-4 py-2">{order.price.toFixed(4)}</td>
                  <td className="px-4 py-2">{order.priceDistance.toFixed(4)} %</td>
                  <td className="px-4 py-2">{order.outputAmount.toFixed(4)}</td>
                  <td className="px-4 py-2">{order.inputAmount.toFixed(4)}</td>
                  <td className="px-4 py-2 text-red-600">{order.price.toFixed(8)}</td>

                  <td className="px-4 py-2 text-blue-500 underline">
                    <a
                      href={getOrderLink(order.orderHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {`${order.orderHash.slice(0, 6)}...${order.orderHash.slice(-4)}`}
                    </a>
                  </td>
                  <td className="px-4 py-2 text-gray-600">{order.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-6xl rounded-lg border border-gray-300 bg-gray-100 p-5 font-sans shadow-lg">
      <div className="mb-5 flex flex-col items-center gap-4">
        <img src={h20Logo} alt="Raindex Logo" className="h-auto w-16" />
        <h2 className="text-2xl font-bold text-gray-800">Market Depth</h2>
      </div>

      {/* Input Selectors */}
      <div className="mb-5 flex flex-col gap-4">
        <div>
          <label className="mb-1 block font-medium">Network:</label>
          <select
            value={network || ''}
            onChange={(e) => handleNetworkChange(e.target.value)}
            className="w-full rounded border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="" disabled>
              Select a Network
            </option>
            {Object.keys(config.networks).map((key) => (
              <option key={key} value={key}>
                {key.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block font-medium">Base Token:</label>
          <select
            value={baseToken || ''}
            onChange={(e) => setBaseToken(e.target.value)}
            className="w-full rounded border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="" disabled>
              Select a Token
            </option>
            {Object.keys(baseTokenConfig).map((key) => (
              <option key={key} value={key}>
                {key.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block font-medium">Quote Token:</label>
          <select
            value={quoteToken || ''}
            onChange={(e) => setQuoteToken(e.target.value)}
            className="w-full rounded border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="" disabled>
              Select a Token
            </option>
            {Object.keys(quoteTokenConfig).map((key) => (
              <option key={key} value={key}>
                {key.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {orders.length > 0 && (
        <div className="mt-5 rounded-md border border-blue-500 bg-blue-50 p-4 text-center text-lg font-semibold text-blue-600">
          <p>
            <span className="font-bold text-blue-700">Total Orders:</span>{' '}
            {orders.filter((o) => o.side === 'buy').length}
          </p>

          {/* Dynamic Token Balances */}
          <div className="mt-3">
            {Object.entries(
              orders
                .filter((o) => o.side === 'buy')
                .reduce((acc, order) => {
                  // Accumulate balances for each token symbol
                  const { outputTokenSymbol, outputTokenBalance } = order;
                  acc[outputTokenSymbol] =
                    (acc[outputTokenSymbol] || 0) + parseFloat(outputTokenBalance); // Sum balances
                  return acc;
                }, {}),
            ).map(([token, balance]) => (
              <p key={token} className="my-1 text-base">
                <span className="font-bold text-blue-700">{token} Balance:</span>{' '}
                {Number(balance).toLocaleString()} {/* Formatted balance */}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Order Table */}
      <div className="rounded-md border border-gray-300 bg-white p-5 shadow-md">
        {orders.length > 0 ? (
          renderOrderTables(orders)
        ) : (
          <p className="text-center text-gray-500">No orders available.</p>
        )}
      </div>
      {orders.length > 0 && (
        <div className="mt-5 rounded-md border border-blue-500 bg-blue-50 p-4 text-center text-lg font-semibold text-blue-600">
          <p>
            <span className="font-bold text-blue-700">Total Orders:</span>{' '}
            {orders.filter((o) => o.side === 'sell').length}
          </p>

          {/* Dynamic Token Balances */}
          <div className="mt-3">
            {Object.entries(
              orders
                .filter((o) => o.side === 'sell')
                .reduce((acc, order) => {
                  // Accumulate balances for each token symbol
                  const { outputTokenSymbol, outputTokenBalance } = order;
                  acc[outputTokenSymbol] =
                    (acc[outputTokenSymbol] || 0) + parseFloat(outputTokenBalance); // Sum balances
                  return acc;
                }, {}),
            ).map(([token, balance]) => (
              <p key={token} className="my-1 text-base">
                <span className="font-bold text-blue-700">{token} Balance:</span>{' '}
                {Number(balance).toLocaleString()} {/* Formatted balance */}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default RaindexVisualization;
