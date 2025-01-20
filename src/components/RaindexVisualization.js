import React, { useState, useEffect, useRef } from 'react';
import axios from "axios";

import {
  SciChartSurface,
  NumericAxis,
  XyDataSeries,
  FastMountainRenderableSeries,
  TextAnnotation,
} from "scichart";

import { ethers } from 'ethers';
import {
  OrderV3,
  config,
  baseTokenConfig,
  quoteTokenConfig,
  orderbookAbi,
  interpreterV3Abi,
  orderQuery,
  ONE,
  qualifyNamespace,
  getContext
} from './contants';
import h20Logo from "../assets/h20-logo.png";

SciChartSurface.loadWasmFromCDN();


const RaindexVisualization = () => {
    const [orders, setOrders] = useState([]);
    const [network, setNetwork] = useState();
    const [networkProvider, setNetworkProvider] = useState();
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
    }, [networkEndpoint, baseToken, quoteToken]);
  
    async function validateHandleIO(currentOrder, inputIOIndex, outputIOIndex, buyAmountFp18, buyOrderRatioFp18){
      const currentDecodedOrder = ethers.utils.defaultAbiCoder.decode([OrderV3], currentOrder.orderBytes)[0];
      
      const orderbookAddress = currentOrder.orderbook.id;
  
      const takerAddress = ethers.Wallet.createRandom().address
  
      let context = getContext()
      context[0][0] = takerAddress
      context[0][1] = orderbookAddress
  
      context[1][0] = currentOrder.orderHash
      context[1][1] = currentOrder.owner
      context[1][2] = takerAddress
  
      context[2][0] = buyAmountFp18
      context[2][1] = buyOrderRatioFp18
  
      context[3][0] = currentDecodedOrder.validInputs[inputIOIndex].token.toString()
      context[3][1] = ethers.BigNumber.from(currentDecodedOrder.validInputs[inputIOIndex].decimals.toString()).mul(ONE).toString()
      context[3][2] = currentDecodedOrder.validInputs[inputIOIndex].vaultId.toString()
      context[3][3] = ethers.BigNumber.from(
          currentOrder.inputs.filter((input) => {
              return (
                  input.token.address.toLowerCase() === currentDecodedOrder.validInputs[inputIOIndex].token.toLowerCase() &&
                  input.token.decimals.toString() === currentDecodedOrder.validInputs[inputIOIndex].decimals.toString() &&
                  input.vaultId.toString() === currentDecodedOrder.validInputs[inputIOIndex].vaultId.toString() 
              )
          })[0].balance.toString()
      ).mul(ethers.BigNumber.from('1'+'0'.repeat(18-Number(currentDecodedOrder.validInputs[inputIOIndex].decimals)))).toString()
      context[3][4] = ethers.BigNumber.from(buyOrderRatioFp18).mul(ethers.BigNumber.from(buyAmountFp18)).div(ethers.BigNumber.from(ONE)).toString()
  
      context[4][0] = currentDecodedOrder.validOutputs[outputIOIndex].token.toString()
      context[4][1] = ethers.BigNumber.from(currentDecodedOrder.validOutputs[outputIOIndex].decimals.toString()).mul(ONE).toString()
      context[4][2] = currentDecodedOrder.validOutputs[outputIOIndex].vaultId.toString()
      context[4][3] = ethers.BigNumber.from(
          currentOrder.outputs.filter((output) => {
              return (
                  output.token.address.toLowerCase() === currentDecodedOrder.validOutputs[outputIOIndex].token.toLowerCase() &&
                  output.token.decimals.toString() === currentDecodedOrder.validOutputs[outputIOIndex].decimals.toString() &&
                  output.vaultId.toString() === currentDecodedOrder.validOutputs[outputIOIndex].vaultId.toString() 
              )
          })[0].balance.toString()
      ).mul(ethers.BigNumber.from('1'+'0'.repeat(18-Number(currentDecodedOrder.validOutputs[outputIOIndex].decimals)))).toString()
      context[4][4] = buyAmountFp18
  
      const interpreterContract = new ethers.Contract(currentDecodedOrder.evaluable.interpreter, interpreterV3Abi, networkProvider);  
  
      let validHandleIO = false 
      try{
          await interpreterContract.eval3(
              currentDecodedOrder.evaluable.store,
              ethers.BigNumber.from(qualifyNamespace(currentDecodedOrder.owner,orderbookAddress)).toString(),
              currentDecodedOrder.evaluable.bytecode,
              '1', // Handle IO source index is 1
              context,
              []
          );
          validHandleIO = true
      }catch(e){
        console.log(`HandleIO Eval failed for order ${currentOrder.orderHash} : ${e.reason} `)
      }
  
      return validHandleIO
    }
  
    async function getCombinedOrders(orders, baseToken, quoteToken) {
      let combinedOrders = [];
      
      const quoteRequests = orders.map(async (currentOrder) => {
        const currentDecodedOrder = ethers.utils.defaultAbiCoder.decode([OrderV3], currentOrder.orderBytes)[0];
    
        let isBuyInput = false, isBuyOutput = false, buyInputIndex, buyOutputIndex;
        let isSellInput = false, isSellOutput = false, sellInputIndex, sellOutputIndex;
    
        // Identify Buy Order Input/Output indices
        for (let j = 0; j < currentDecodedOrder.validInputs.length; j++) {
          if (currentDecodedOrder.validInputs[j].token.toLowerCase() === baseToken.toLowerCase()) {
            isBuyInput = true;
            buyInputIndex = j;
          }
          if (currentDecodedOrder.validInputs[j].token.toLowerCase() === quoteToken.toLowerCase()) {
            isSellInput = true;
            sellInputIndex = j;
          }
        }
    
        for (let j = 0; j < currentDecodedOrder.validOutputs.length; j++) {
          if (currentDecodedOrder.validOutputs[j].token.toLowerCase() === quoteToken.toLowerCase()) {
            isBuyOutput = true;
            buyOutputIndex = j;
          }
          if (currentDecodedOrder.validOutputs[j].token.toLowerCase() === baseToken.toLowerCase()) {
            isSellOutput = true;
            sellOutputIndex = j;
          }
        }
    
        const orderbookAddress = currentOrder.orderbook.id;
        const orderBookContract = new ethers.Contract(orderbookAddress, orderbookAbi, networkProvider);
    
        const processOrder = async (side) => {
          try {
            const isBuy = side === "buy";
            const inputIndex = isBuy ? buyInputIndex : sellInputIndex;
            const outputIndex = isBuy ? buyOutputIndex : sellOutputIndex;
    
            const currentOutputVault = currentOrder.outputs.filter((output) => {
              return (
                output.token.address.toLowerCase() === currentDecodedOrder.validOutputs[outputIndex].token.toLowerCase() &&
                output.token.decimals.toString() === currentDecodedOrder.validOutputs[outputIndex].decimals.toString() &&
                output.vaultId.toString() === currentDecodedOrder.validOutputs[outputIndex].vaultId.toString()
              );
            })[0];
    
            const outputTokenSymbol = currentOutputVault.token.symbol.toUpperCase();
            const outputTokenBalance = ethers.utils.formatUnits(
              currentOutputVault.balance.toString(),
              currentOutputVault.token.decimals
            );
    
            const quoteResult = await networkProvider.call({
              to: orderbookAddress,
              from: ethers.Wallet.createRandom().address,
              data: orderBookContract.interface.encodeFunctionData("quote", [
                {
                  order: currentDecodedOrder,
                  inputIOIndex: inputIndex,
                  outputIOIndex: outputIndex,
                  signedContext: [],
                },
              ]),
            });
    
            const decodedQuote = ethers.utils.defaultAbiCoder.decode(["bool", "uint256", "uint256"], quoteResult);
            const amountFp18 = decodedQuote[1].toString();
            const orderRatioFp18 = decodedQuote[2].toString();
            const amount = decodedQuote[1] / 1e18;
            const orderRatio = decodedQuote[2] / 1e18;
    
            const isHandleIOValid = await validateHandleIO(
              currentOrder,
              inputIndex,
              outputIndex,
              amountFp18,
              orderRatioFp18
            );
    
            if (isHandleIOValid) {
              combinedOrders.push({
                orderHash: currentOrder.orderHash,
                side: side,
                ioRatio: isBuy ? 1 / orderRatio : orderRatio,
                outputAmount: isBuy ? amount * orderRatio : amount,
                outputTokenSymbol,
                outputTokenBalance,
              });
            }
          } catch (error) {
            console.log(`Error processing ${side} order: `, currentOrder.orderHash, error);
          }
        };
    
        // Concurrently process buy and sell orders where applicable
        const promises = [];
        if (isBuyInput && isBuyOutput) promises.push(processOrder("buy"));
        if (isSellInput && isSellOutput) promises.push(processOrder("sell"));
    
        await Promise.all(promises);
      });
    
      // Wait for all requests to finish
      await Promise.all(quoteRequests);
    
      return combinedOrders.filter((order) => order.outputAmount > 0);
    }
  
    async function fetchOrders() {
      try {
        const queryResult = await axios.post(networkEndpoint, { query: orderQuery });
        const orders = queryResult.data.data.orders;
        const baseTokenAddress = baseTokenConfig[baseToken]?.address;
        const quoteTokenAddress = quoteTokenConfig[quoteToken]?.address;
  
        if (baseTokenAddress && quoteTokenAddress) {
          const sampleOrders = await getCombinedOrders(orders, baseTokenAddress, quoteTokenAddress);
          setOrders(sampleOrders);
          renderDepthChart(sampleOrders);
        }
      } catch (error) {
        console.error('Error fetching orders:', error);
      }
    }
    
    async function renderDepthChart(orders) {
      const { sciChartSurface, wasmContext } = await SciChartSurface.create("scichart-root");
  
      // Add X and Y axes
      sciChartSurface.xAxes.add(
        new NumericAxis(wasmContext, {
          axisTitle: `${baseToken.toUpperCase()} Price`,
          autoRange: "Always",
          labelPrecision: 6,
          axisAlignment: "Left",
        })
      );
      sciChartSurface.yAxes.add(
        new NumericAxis(wasmContext, {
          axisTitle: `${baseToken.toUpperCase()} Cumulative Quantity`,
          autoRange: "Always",
          labelPrecision: 6,
          axisAlignment: "Top",
        })
      );
  
      // Add the chart title
      sciChartSurface.annotations.add(
        new TextAnnotation({
          text: "",
          fontSize: 24,
          textColor: "white",
          x1: 1,
          y1: 0.5,
          horizontalAnchorPoint: "Center",
          verticalAnchorPoint: "Top",
        })
      );
  
      // Prepare buy and sell order data
      const buyOrders = orders
        .filter((o) => o.side === "buy" && o.outputAmount > 0)
        .sort((a, b) => b.ioRatio - a.ioRatio);
      const sellOrders = orders
        .filter((o) => o.side === "sell" && o.outputAmount > 0)
        .sort((a, b) => a.ioRatio - b.ioRatio);
  
      // Calculate cumulative buy and sell depth
      let cumulativeBuy = 0;
      const buyDepthData = buyOrders.map((order) => {
        cumulativeBuy += order.outputAmount;
        return { x: order.ioRatio, y: cumulativeBuy };
      });
  
      let cumulativeSell = 0;
      const sellDepthData = sellOrders.map((order) => {
        cumulativeSell += order.outputAmount;
        return { x: order.ioRatio, y: cumulativeSell };
      });
  
      // Add buy and sell series to the chart
      sciChartSurface.renderableSeries.add(
        new FastMountainRenderableSeries(wasmContext, {
          dataSeries: new XyDataSeries(wasmContext, {
            xValues: buyDepthData.map((point) => point.x),
            yValues: buyDepthData.map((point) => point.y),
          }),
          stroke: "green",
          fill: "rgba(0, 137, 0, 0.2)",
          strokeThickness: 2,
          isDigitalLine: true,
        }),
        new FastMountainRenderableSeries(wasmContext, {
          dataSeries: new XyDataSeries(wasmContext, {
            xValues: sellDepthData.map((point) => point.x),
            yValues: sellDepthData.map((point) => point.y),
          }),
          stroke: "red",
          fill: "rgba(137, 0, 0, 0.2)",
          strokeThickness: 2,
          isDigitalLine: true,
        })
      );
  
      // Clean up on component unmount
      return () => {
        sciChartSurface.delete();
      };
    }
  
    
  
    const handleNetworkChange = (newNetwork) => {
      setNetwork(newNetwork);
      setNetworkProvider(new ethers.providers.JsonRpcProvider(config.networks[newNetwork].rpc));
      setNetworkEndpoint(config.subgraphs[newNetwork]);
      setOrders([]);
    };
  
    const renderOrderTables = (orders) => {
      // Helper function to group and sum orders by ioRatio
      const groupOrdersByPrice = (orders) => {
        return orders.reduce((acc, order) => {
          const price = Number(order.ioRatio).toFixed(4); // Use price as the key
          if (!acc[price]) {
            acc[price] = 0; // Initialize cumulative amount
          }
          acc[price] += Number(order.outputAmount); // Add outputAmount to cumulative sum
          return acc;
        }, {});
      };
    
      // Group orders by price and side
      const groupedBuyOrders = groupOrdersByPrice(
        orders.filter((o) => o.side === "buy")
      );
      const groupedSellOrders = groupOrdersByPrice(
        orders.filter((o) => o.side === "sell")
      );
    
      const buyOrders = Object.entries(groupedBuyOrders)
        .map(([price, amount]) => ({ price: Number(price), amount }))
        .sort((a, b) => b.price - a.price).reverse();
    
      const sellOrders = Object.entries(groupedSellOrders)
        .map(([price, amount]) => ({ price: Number(price), amount }))
        .sort((a, b) => a.price - b.price);
    
      return (
        <div className="flex flex-col gap-5">
        {/* Buy Orders Table */}
        <div className="bg-white border border-gray-300 rounded-md p-4 shadow-md">
          <h3 className="text-lg font-bold text-green-600 mb-3">Buy Orders</h3>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="py-2">Price</th>
                <th className="py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {buyOrders.map((order, index) => (
                <tr key={index} className="border-b border-gray-200">
                  <td className="text-green-600 py-2">{order.price.toFixed(4)}</td>
                  <td className="py-2">{Number(order.amount).toFixed(4)} {baseToken}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
  
        {/* Sell Orders Table */}
        <div className="bg-white border border-gray-300 rounded-md p-4 shadow-md">
          <h3 className="text-lg font-bold text-red-600 mb-3">Sell Orders</h3>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="py-2">Price</th>
                <th className="py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {sellOrders.map((order, index) => (
                <tr key={index} className="border-b border-gray-200">
                  <td className="text-red-600 py-2">{order.price.toFixed(4)}</td>
                  <td className="py-2">{Number(order.amount).toFixed(4)} {baseToken}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
  
      );
    };
    
    return (
      <div className="w-full max-w-6xl mx-auto p-5 font-sans bg-gray-100 border border-gray-300 rounded-lg shadow-lg">
        <div className="flex items-center justify-center gap-4 mb-5">
          {/* Logo */}
          <img src={h20Logo} alt="Raindex Logo" className="w-20 h-auto" />
          <h2 className="text-2xl font-bold text-gray-800">Market Depth Chart</h2>
        </div>
        {/* Input Selectors */}
        <div className="flex flex-col mb-4">
          <label className="mb-1 font-medium">Network:</label>
          <select
            value={network || ''}
            onChange={(e) => handleNetworkChange(e.target.value)}
            className="p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
  
        <div className="flex flex-col mb-4">
          <label className="mb-1 font-medium">Base Token:</label>
          <select
            value={baseToken || ''}
            onChange={(e) => setBaseToken(e.target.value)}
            className="p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
  
        <div className="flex flex-col mb-4">
          <label className="mb-1 font-medium">Quote Token:</label>
          <select
            value={quoteToken || ''}
            onChange={(e) => setQuoteToken(e.target.value)}
            className="p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
  
        {/* Side-by-Side Layout */}
        <div className="flex justify-between gap-5 mt-5">
          {/* Left: Chart */}
          <div id="scichart-root" className="w-full h-[500px] bg-gray-200"></div>
  
          {/* Right: Table */}
          <div className="flex-2 bg-white border border-gray-300 rounded-md p-2 overflow-y-auto max-h-[500px] shadow-md">
            {orders.length > 0 && renderOrderTables(orders)}
          </div>
        </div>
        {orders.length > 0 && (
          <div className="mt-5 p-4 bg-blue-50 border border-blue-500 rounded-md text-center text-lg font-semibold text-blue-600">
          <p>
            <span className="text-blue-700 font-bold">Total Orders:</span> {orders.length}
          </p>
          
          {/* Dynamic Token Balances */}
          <div className="mt-3">
            {Object.entries(
              orders.reduce((acc, order) => {
                // Accumulate balances for each token symbol
                const { outputTokenSymbol, outputTokenBalance } = order;
                acc[outputTokenSymbol] =
                  (acc[outputTokenSymbol] || 0) +
                  parseFloat(outputTokenBalance); // Sum balances
                return acc;
              }, {})
            ).map(([token, balance]) => (
              <p key={token} className="text-base my-1">
                <span className="text-blue-700 font-bold">{token} Balance:</span>{" "}
                {Number(balance).toLocaleString()} {/* Formatted balance */}
              </p>
            ))}
          </div>
        </div>
        )}
      </div>
    );
    
}
export default RaindexVisualization;