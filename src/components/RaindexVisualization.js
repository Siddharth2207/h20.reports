import React, { useState, useEffect, useRef } from 'react';
import axios from "axios";
import { getSwap } from 'sushi';
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


const RaindexVisualization = () => {
  const [orders, setOrders] = useState([]);
  const [network, setNetwork] = useState();
  const [networkProvider, setNetworkProvider] = useState();
  const [networkEndpoint, setNetworkEndpoint] = useState();
  const [baseToken, setBaseToken] = useState();
  const [quoteToken, setQuoteToken] = useState();
  const [baseTokenPrice, setBaseTokenPrice] = useState();
  const [quoteTokenPrice, setQuoteTokenPrice] = useState();


  const POLLING_INTERVAL = 300000;
  const pollingRef = useRef(null);

  useEffect(() => {
    // Cleanup function to stop the previous polling interval
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      console.log("Previous polling stopped...");
    }

    if (networkEndpoint && baseToken && quoteToken) {
      fetchOrders(); // Fetch immediately when network, baseToken, or quoteToken changes

      pollingRef.current = setInterval(() => {
        fetchOrders();
      }, POLLING_INTERVAL);

      console.log("New polling started...");
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        console.log("Polling cleaned up...");
      }
    };
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
        const  basePrice  = await fetchDexTokenPrice(baseTokenConfig[baseToken], quoteTokenConfig[quoteToken]);
        setBaseTokenPrice(basePrice);
        const  quotePrice  = await fetchDexTokenPrice(quoteTokenConfig[quoteToken], baseTokenConfig[baseToken]);
        setQuoteTokenPrice(quotePrice)
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
    }
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
              ioRatio: orderRatio,
              outputAmount: amount,
              inputAmount: orderRatio * amount,
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

  const handleNetworkChange = (newNetwork) => {
    setNetwork(newNetwork);
    setNetworkProvider(
      new ethers.providers.JsonRpcProvider(config.networks[newNetwork].rpc)
    );
    setNetworkEndpoint(config.subgraphs[newNetwork]);
    setOrders([]);
  };

  const renderOrderTables = (orders) => {
    const groupOrdersByPrice = (orders) =>
      orders.reduce((acc, order) => {
        const price = Number(order.ioRatio).toFixed(4); // Group by price
        if (!acc[price]) acc[price] = [];
        acc[price].push(order); // Group orders by price
        return acc;
      }, {});
  
    const groupedBuyOrders = groupOrdersByPrice(
      orders.filter((o) => o.side === "buy")
    );
    const groupedSellOrders = groupOrdersByPrice(
      orders.filter((o) => o.side === "sell")
    );
  
    const buyOrders = Object.entries(groupedBuyOrders)
      .flatMap(([price, orders]) =>
        orders.map((order) => ({
          price: Number(price),
          outputAmount: order.outputAmount,
          inputAmount: order.inputAmount,
          orderHash: order.orderHash,
        }))
      )
      .sort((a, b) => a.price - b.price);
  
    const sellOrders = Object.entries(groupedSellOrders)
      .flatMap(([price, orders]) =>
        orders.map((order) => ({
          price: Number(price),
          outputAmount: order.outputAmount,
          inputAmount: order.inputAmount,
          orderHash: order.orderHash,
        }))
      )
      .sort((a, b) => a.price - b.price);
  
    const getOrderLink = (orderHash) =>
      `https://raindex.finance/my-strategies/${orderHash}-${network}`;
  
    return (
      <div className="flex flex-col gap-5">
        {/* Buy Orders Table */}
        <div className="bg-white border border-gray-300 rounded-md p-4 shadow-md">
          <h3 className="text-lg font-bold text-green-600 mb-3">Buy Orders</h3>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="py-2 px-4">#</th>
                <th className="py-2 px-4">{baseTokenConfig[baseToken]?.symbol} Price</th>
                <th className="py-2 px-4"> Price Distance</th>
                <th className="py-2 px-4">Output Amount {quoteTokenConfig[quoteToken]?.symbol}</th>
                <th className="py-2 px-4">Input Amount {baseTokenConfig[baseToken]?.symbol}</th>
                <th className="py-2 px-4">IO Ratio {baseTokenConfig[baseToken]?.symbol}/{quoteTokenConfig[quoteToken]?.symbol}</th>
                <th className="py-2 px-4">Order Hash</th>
              </tr>
            </thead>
            <tbody>
              {buyOrders.map((order, index) => (
                <tr
                  key={order.orderHash}
                  className="border-b border-gray-200 hover:bg-gray-100"
                >
                  <td className="py-2 px-4">{index + 1}</td>
                  <td className="py-2 px-4">{(1/order.price).toFixed(4)}</td>
                  <td className="py-2 px-4">{(((quoteTokenPrice-order.price.toFixed(4))/order.price.toFixed(4))*100).toFixed(4)} %</td>
                  <td className="py-2 px-4">{order.outputAmount.toFixed(4)}</td>
                  <td className="py-2 px-4">{order.inputAmount.toFixed(4)}</td>
                  <td className="text-green-600 py-2 px-4">
                    {order.price.toFixed(4)}
                  </td>
                  
                  <td className="py-2 px-4 text-blue-500 underline">
                    <a
                      href={getOrderLink(order.orderHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {`${order.orderHash.slice(0, 6)}...${order.orderHash.slice(
                        -4
                      )}`}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Base Token Price Section */}
        <div className="text-center bg-gray-100 border border-gray-300 rounded-md p-4 shadow-md">
          <h3 className="text-lg font-bold text-gray-800">
            {baseTokenConfig[baseToken]?.symbol} Price (USD): ${baseTokenPrice}
          </h3>
        </div>
        
        {/* Sell Orders Table */}
        <div className="bg-white border border-gray-300 rounded-md p-4 shadow-md">
          <h3 className="text-lg font-bold text-red-600 mb-3">Sell Orders</h3>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="py-2 px-4">#</th>
                <th className="py-2 px-4">{baseTokenConfig[baseToken]?.symbol} Price</th>
                <th className="py-2 px-4"> Price Distance</th>
                <th className="py-2 px-4">Output Amount {baseTokenConfig[baseToken]?.symbol}</th>
                <th className="py-2 px-4">Input Amount {quoteTokenConfig[quoteToken]?.symbol}</th>
                <th className="py-2 px-4">IO Ratio {quoteTokenConfig[quoteToken]?.symbol}/{baseTokenConfig[baseToken]?.symbol}</th>
                <th className="py-2 px-4">Order Hash</th>
              </tr>
            </thead>
            <tbody>
              {sellOrders.map((order, index) => (
                <tr
                  key={order.orderHash}
                  className="border-b border-gray-200 hover:bg-gray-100"
                >
                  <td className="py-2 px-4">{index + 1}</td>
                  <td className="py-2 px-4">{order.price.toFixed(4)}</td>
                  <td className="py-2 px-4">{(((baseTokenPrice-order.price.toFixed(4))/order.price.toFixed(4))*100).toFixed(4)} %</td>
                  <td className="py-2 px-4">{order.outputAmount.toFixed(4)}</td>
                  <td className="py-2 px-4">{order.inputAmount.toFixed(4)}</td>
                  <td className="text-red-600 py-2 px-4">
                    {order.price.toFixed(4)}
                  </td>
                  
                  <td className="py-2 px-4 text-blue-500 underline">
                    <a
                      href={getOrderLink(order.orderHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {`${order.orderHash.slice(0, 6)}...${order.orderHash.slice(
                        -4
                      )}`}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const fetchDexTokenPrice = async (baseToken, quoteToken) => {
    try {

      const network = config.networks[baseToken.network]
      // Validate inputs
      if (!baseToken || !quoteToken || !baseToken.address || !quoteToken.address) {
        throw new Error('Invalid baseToken or quoteToken. Ensure both tokens have an address.');
      }
  
      // Generate a recipient address dynamically
      const recipientAddress = ethers.Wallet.createRandom().address;
  
      // Fixed swap amount of 1 base token
      const amountIn = ethers.utils.parseUnits('1', baseToken.decimals).toBigInt();
  
      // Get the swap data from SushiSwap
      const data = await getSwap({
        chainId: network.chainId,
        tokenIn: baseToken.address,
        tokenOut: quoteToken.address,
        to: recipientAddress,
        amount: amountIn,
        maxSlippage: 0.005, // 0.5% max slippage
        includeTransaction: true,
      });
  
      if (!data || !data.amountIn || !data.assumedAmountOut) {
        throw new Error('Invalid response from getSwap. Check the input parameters.');
      }
  
      const amountInFormatted = parseFloat(
        ethers.utils.formatUnits(data.amountIn, baseToken.decimals)
      );
      const amountOutFormatted = parseFloat(
        ethers.utils.formatUnits(data.assumedAmountOut, quoteToken.decimals)
      );
  
      const price = amountOutFormatted / amountInFormatted;

      return price.toFixed(4);
    } catch (error) {
      console.error('Error performing swap:', error.message || error);
      throw error; // Re-throw the error for further handling if needed
    }
  };
  
  
  

  return (
    <div className="w-full max-w-6xl mx-auto p-5 font-sans bg-gray-100 border border-gray-300 rounded-lg shadow-lg">
      <div className="flex flex-col items-center gap-4 mb-5">
        <img src={h20Logo} alt="Raindex Logo" className="w-16 h-auto" />
        <h2 className="text-2xl font-bold text-gray-800">Market Depth</h2>
      </div>
      
      {/* Input Selectors */}
      <div className="flex flex-col gap-4 mb-5">
        <div>
          <label className="block mb-1 font-medium">Network:</label>
          <select
            value={network || ""}
            onChange={(e) => handleNetworkChange(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
          <label className="block mb-1 font-medium">Base Token:</label>
          <select
            value={baseToken || ""}
            onChange={(e) => setBaseToken(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
          <label className="block mb-1 font-medium">Quote Token:</label>
          <select
            value={quoteToken || ""}
            onChange={(e) => setQuoteToken(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
          <div className="mt-5 p-4 bg-blue-50 border border-blue-500 rounded-md text-center text-lg font-semibold text-blue-600">
          <p>
            <span className="text-blue-700 font-bold">Total Orders:</span> {orders.filter((o) => o.side === "buy").length}
          </p>
          
          {/* Dynamic Token Balances */}
          <div className="mt-3">
            {Object.entries(
              orders.filter((o) => o.side === "buy").reduce((acc, order) => {
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

      {/* Order Table */}
      <div className="bg-white border border-gray-300 rounded-md p-5 shadow-md">
        {orders.length > 0 && baseTokenPrice ? (
          renderOrderTables(orders)
        ) : (
          <p className="text-center text-gray-500">No orders available.</p>
        )}
      </div>
      {orders.length > 0 && (
          <div className="mt-5 p-4 bg-blue-50 border border-blue-500 rounded-md text-center text-lg font-semibold text-blue-600">
          <p>
            <span className="text-blue-700 font-bold">Total Orders:</span> {orders.filter((o) => o.side === "sell").length}
          </p>
          
          {/* Dynamic Token Balances */}
          <div className="mt-3">
            {Object.entries(
              orders.filter((o) => o.side === "sell").reduce((acc, order) => {
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
};

export default RaindexVisualization;
