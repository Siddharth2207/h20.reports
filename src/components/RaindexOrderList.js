
  import React, { useState, useEffect } from "react";
  import { fetchAndFilterOrders,fetchTradesQuery, tokenConfig, networkConfig, fetchAllPaginatedData, vaultDepositsQuery, vaultWithdrawalQuery } from "raindex-reports"
  import { ethers } from "ethers";

  const OrdersTable = ({ network,orders }) => {
    
    const now = Math.floor(Date.now() / 1000);

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

    const formatBalance = (balance) => {
      const num = parseFloat(balance);
      if (num >= 1e6) return (num / 1e6).toFixed(2) + "M";
      if (num >= 1e3) return (num / 1e3).toFixed(2) + "K";
      return num.toFixed(2);
    };

    const transformedOrders = orders.map((order) => {
        const trades = order.trades || [];
        const tradeTimestamps = trades.map((t) => parseInt(t.timestamp));

        const lastTrade = tradeTimestamps.length > 0 ? formatTimestamp(Math.max(...tradeTimestamps)) : "N/A";
        const firstTrade = tradeTimestamps.length > 0 ? formatTimestamp(Math.min(...tradeTimestamps)) : "N/A";

        const trades24h = trades.filter((trade) => now - parseInt(trade.timestamp) <= 86400);

        // Input Balances
        const inputBalances = order.inputs.map((input) => {
          return {
            inputToken : input.token.symbol,
            inputTokenBalance: parseFloat(ethers.utils.formatUnits(input.balance, input.token.decimals)).toFixed(4)
          }
        });

        // Output Balances
        const outputBalances = order.outputs.map((output) => {
          return {
            outputToken: output.token.symbol,
            outputTokenBalance: parseFloat(ethers.utils.formatUnits(output.balance, output.token.decimals)).toFixed(4)
          }
        });

        // Calculate input balance change percentage in last 24 hours (with vault token matching)
        const inputChange24h = order.inputs.map((input) => {
          const filteredTrades = trades24h
            .sort((a, b) => parseInt(a.timestamp) - parseInt(b.timestamp));

          if (filteredTrades.length === 0) {
            return {
              inputToken : input.token.symbol,
              inputBalanceChange : 0,
              inputPercentageChange : 0
            }
          }

          const oldestTrade = filteredTrades[0];
          const latestTrade = filteredTrades[filteredTrades.length - 1];
          
          const oldBalance = parseFloat(
            input.token.address === oldestTrade.inputVaultBalanceChange?.vault.token.address
              ? oldestTrade.inputVaultBalanceChange?.newVaultBalance || "0"
              : oldestTrade.outputVaultBalanceChange?.newVaultBalance || "0"
          );
        
          const newBalance = parseFloat(
            input.token.address === latestTrade.inputVaultBalanceChange?.vault.token.address
              ? latestTrade.inputVaultBalanceChange?.newVaultBalance || "0"
              : latestTrade.outputVaultBalanceChange?.newVaultBalance || "0"
          );
          
          const balanceChange = (newBalance - oldBalance)
          const percentageChange = oldBalance > 0 ? (balanceChange / oldBalance) * 100 : 0;
          const balanceChangeBigNum = ethers.BigNumber.from(balanceChange.toLocaleString('fullwide', { useGrouping: false }))
          const formattedBalanceChange = parseFloat(ethers.utils.formatUnits(balanceChangeBigNum,input.token.decimals).toString()).toFixed(2)

          return {
            inputToken : input.token.symbol,
            inputBalanceChange : formattedBalanceChange,
            inputPercentageChange : percentageChange.toFixed(2)
          }
        });

        // Calculate output balance change percentage in last 24 hours (with vault token matching)
        const outputChange24h = order.outputs.map((output) => {
          const filteredTrades = trades24h
            .sort((a, b) => parseInt(a.timestamp) - parseInt(b.timestamp));

          if (filteredTrades.length === 0){
            return {
              outputToken : output.token.symbol,
              outputBalanceChange : 0,
              outputPercentageChange : 0
            }
          }

          const oldestTrade = filteredTrades[0];
          const latestTrade = filteredTrades[filteredTrades.length - 1];

          const oldBalance = parseFloat(
            output.token.address === oldestTrade.outputVaultBalanceChange?.vault.token.address
              ? oldestTrade.outputVaultBalanceChange?.newVaultBalance || "0"
              : oldestTrade.inputVaultBalanceChange?.newVaultBalance || "0"
          );

          const newBalance = parseFloat(
            output.token.address === latestTrade.outputVaultBalanceChange?.vault.token.address
              ? latestTrade.outputVaultBalanceChange?.newVaultBalance || "0"
              : latestTrade.inputVaultBalanceChange?.newVaultBalance || "0"
          );
          
          const balanceChange = (newBalance - oldBalance)
          const percentageChange = oldBalance > 0 ? (balanceChange / oldBalance) * 100 : 0;
          const balanceChangeBigNum = ethers.BigNumber.from(balanceChange.toLocaleString('fullwide', { useGrouping: false }))
          const formattedBalanceChange = parseFloat(ethers.utils.formatUnits(balanceChangeBigNum,output.token.decimals).toString()).toFixed(2)
          return {
            outputToken : output.token.symbol,
            outputBalanceChange : formattedBalanceChange,
            outputPercentageChange : percentageChange.toFixed(2)
          }
        }) 

        return {
          orderHash: order.orderHash,
          inputs: order.inputs,
          outputs: order.outputs,
          trades: order.trades || [],
          trades24h: trades24h.length,
          lastTrade: lastTrade,
          firstTrade: firstTrade,
          inputBalances: inputBalances,
          outputBalances: outputBalances,
          inputChange24h: inputChange24h,
          outputChange24h: outputChange24h
        }
    });
    const [sortedOrders, setSortedOrders] = useState([...transformedOrders]);
    const [activeTab, setActiveTab] = useState("main");
    const [depositsData, setDepositsData] = useState(null);
    const [loadingDeposits, setLoadingDeposits] = useState(false);

    useEffect(() => {
      if (activeTab === "vault" && !depositsData) {
        // Only fetch data if it's not already loaded
        setLoadingDeposits(true);
        
        const fetchData = async () => {
          try {
            const data = await fetchDepositsAndWithdrawals(sortedOrders);
            setDepositsData(data);
            setSortedOrders(data);
          } catch (error) {
            console.error("Error fetching deposits/withdrawals:", error);
          } finally {
            setLoadingDeposits(false);
          }
        };
    
        fetchData(); // Call the async function
      }
    }, [activeTab, sortedOrders]); // Added sortedOrders as a dependency

    // Sorting function with UX-friendly icons
    const handleSortByVaultBalance = (sortType) => {
      let sorted = [...sortedOrders];
    
      switch (sortType) {
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
    
        case "inputChangeAsc":
          sorted.sort((a, b) => {
            const aChange = parseFloat(a.inputChange24h.reduce((sum, input) => sum + parseFloat(Math.abs(input.inputPercentageChange) || "0"), 0));
            const bChange = parseFloat(b.inputChange24h.reduce((sum, input) => sum + parseFloat(Math.abs(input.inputPercentageChange) || "0"), 0));
            return aChange - bChange;
          });
          break;
    
        case "inputChangeDesc":
          sorted.sort((a, b) => {
            const aChange = parseFloat(a.inputChange24h.reduce((sum, input) => sum + parseFloat(Math.abs(input.inputPercentageChange) || "0"), 0));
            const bChange = parseFloat(b.inputChange24h.reduce((sum, input) => sum + parseFloat(Math.abs(input.inputPercentageChange) || "0"), 0));
            return bChange - aChange;
          });
          break;
    
        case "outputChangeAsc":
          sorted.sort((a, b) => {
            const aChange = parseFloat(a.outputChange24h.reduce((sum, output) => sum + parseFloat(Math.abs(output.outputPercentageChange) || "0"), 0));
            const bChange = parseFloat(b.outputChange24h.reduce((sum, output) => sum + parseFloat(Math.abs(output.outputPercentageChange) || "0"), 0));
            return aChange - bChange;
          });
          break;
    
        case "outputChangeDesc":
          sorted.sort((a, b) => {
            const aChange = parseFloat(a.outputChange24h.reduce((sum, output) => sum + parseFloat(Math.abs(output.outputPercentageChange) || "0"), 0));
            const bChange = parseFloat(b.outputChange24h.reduce((sum, output) => sum + parseFloat(Math.abs(output.outputPercentageChange) || "0"), 0));
            return bChange - aChange;
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
          
          case "inputDifferentialAsc":
            sorted.sort((a, b) => {
              const aChange = 
              parseFloat(a.inputDepositsWithdraws.reduce((sum, input) => sum + parseFloat(Math.abs(input.vaultDifferentialPercentage) || "0"), 0));
  
              const bChange = 
              parseFloat(b.inputDepositsWithdraws.reduce((sum, input) => sum + parseFloat(Math.abs(input.vaultDifferentialPercentage) || "0"), 0));
              return aChange - bChange;
            });
            break;
          
          case "inputDifferentialDesc":
            sorted.sort((a, b) => {
              const aChange = 
              parseFloat(a.inputDepositsWithdraws.reduce((sum, input) => sum + parseFloat(Math.abs(input.vaultDifferentialPercentage) || "0"), 0));
  
              const bChange = 
              parseFloat(b.inputDepositsWithdraws.reduce((sum, input) => sum + parseFloat(Math.abs(input.vaultDifferentialPercentage) || "0"), 0));
              return bChange - aChange;
            });
            break;
          
          case "outputDifferentialAsc":
            sorted.sort((a, b) => {
              const aChange = 
              parseFloat(a.outputDepositsWithdraws.reduce((sum, output) => sum + parseFloat(Math.abs(output.vaultDifferentialPercentage) || "0"), 0));
  
              const bChange = 
              parseFloat(b.outputDepositsWithdraws.reduce((sum, output) => sum + parseFloat(Math.abs(output.vaultDifferentialPercentage) || "0"), 0));
              return aChange - bChange;
            });
            break;
          
          case "outputDifferentialDesc":
              sorted.sort((a, b) => {
                const aChange = 
                parseFloat(a.outputDepositsWithdraws.reduce((sum, output) => sum + parseFloat(Math.abs(output.vaultDifferentialPercentage) || "0"), 0));
    
                const bChange = 
                parseFloat(b.outputDepositsWithdraws.reduce((sum, output) => sum + parseFloat(Math.abs(output.vaultDifferentialPercentage) || "0"), 0));
                return bChange - aChange;
              });
              break;
    
        default:
          sorted = [...sortedOrders];
      }
    
      setSortedOrders(sorted);
    };
    
    const fetchDepositsAndWithdrawals = async (ordersWithTrades) => {
        const endpoint = networkConfig[network].subgraphUrl
        for(let i = 0; i < ordersWithTrades.length; i++){
          let order = ordersWithTrades[i]
          for(let i = 0; i < order.inputs.length; i++){
            let input = order.inputs[i]
            const deposits = await fetchAllPaginatedData(
              endpoint,
              vaultDepositsQuery,
              {vaultId: input.id},
              "deposits"
            )
            input["deposits"] = deposits
            const withdrawals = await fetchAllPaginatedData(
              endpoint,
              vaultWithdrawalQuery,
              {vaultId: input.id},
              "withdrawals"
            )
            input["withdrawals"] = withdrawals
          }

          for(let i = 0; i < order.outputs.length; i++){
            let output = order.outputs[i]
            const deposits = await fetchAllPaginatedData(
              endpoint,
              vaultDepositsQuery,
              {vaultId: output.id},
              "deposits"
            )
            output["deposits"] = deposits
            const withdrawals = await fetchAllPaginatedData(
              endpoint,
              vaultWithdrawalQuery,
              {vaultId: output.id},
              "withdrawals"
            )
            output["withdrawals"] = withdrawals
          }
          ordersWithTrades[i] = order
      }
      const transformedOrders = ordersWithTrades.map((order) => {
        const inputDepositsWithdraws = order.inputs.map((input) => {
          const totalVaultDeposits = input.deposits.reduce((total, deposit) => total.add(ethers.BigNumber.from(deposit.amount)), ethers.BigNumber.from(0));
          const totalVaultWithdrawals = input.withdrawals.reduce((total, withdrawal) => total.add(ethers.BigNumber.from(withdrawal.amount)), ethers.BigNumber.from(0));
          const curerentVaultDifferential = parseFloat(
            ethers.utils.formatUnits(
              totalVaultDeposits.sub(totalVaultWithdrawals.add(input.balance)), 
              input.token.decimals
            )
          ).toFixed(4);
          const vaultDifferentialPercentage = totalVaultDeposits.gt(0) ? (
            parseFloat(
              ethers.utils.formatUnits(
                totalVaultDeposits.sub(totalVaultWithdrawals.add(input.balance)), 
                input.token.decimals
              )
            ) / parseFloat(ethers.utils.formatUnits(totalVaultDeposits, input.token.decimals)) * 100
          ).toFixed(2) : "0.00";

          return {
            inputToken : input.token.symbol,
            totalVaultDeposits: parseFloat(ethers.utils.formatUnits(totalVaultDeposits, input.token.decimals)).toFixed(4),
            totalVaultWithdrawals: parseFloat(ethers.utils.formatUnits(totalVaultWithdrawals, input.token.decimals)).toFixed(4),
            curerentVaultDifferential,
            vaultDifferentialPercentage
          }
        });
        const outputDepositsWithdraws = order.outputs.map((output) => {
          const totalVaultDeposits = output.deposits.reduce((total, deposit) => total.add(ethers.BigNumber.from(deposit.amount)), ethers.BigNumber.from(0));
          const totalVaultWithdrawals = output.withdrawals.reduce((total, withdrawal) => total.add(ethers.BigNumber.from(withdrawal.amount)), ethers.BigNumber.from(0));
          const curerentVaultDifferential = parseFloat(
            ethers.utils.formatUnits(
              totalVaultDeposits.sub(totalVaultWithdrawals.add(output.balance)), 
              output.token.decimals
            )
          ).toFixed(4);
          const vaultDifferentialPercentage = totalVaultDeposits.gt(0) ? (
            parseFloat(
              ethers.utils.formatUnits(
                totalVaultDeposits.sub(totalVaultWithdrawals.add(output.balance)), 
                output.token.decimals
              )
            ) / parseFloat(ethers.utils.formatUnits(totalVaultDeposits, output.token.decimals)) * 100
          ).toFixed(2) : "0.00";

          return {
            outputToken : output.token.symbol,
            totalVaultDeposits: parseFloat(ethers.utils.formatUnits(totalVaultDeposits, output.token.decimals)).toFixed(4),
            totalVaultWithdrawals: parseFloat(ethers.utils.formatUnits(totalVaultWithdrawals, output.token.decimals)).toFixed(4),
            currentVaultBalance : parseFloat(ethers.utils.formatUnits(output.balance, output.token.decimals)).toFixed(4),
            curerentVaultDifferential,
            vaultDifferentialPercentage
          }
        });
        return {
          ...order,
          inputDepositsWithdraws: inputDepositsWithdraws,
          outputDepositsWithdraws: outputDepositsWithdraws
        }
      })
      return transformedOrders
    }
  
    const getOrderLink = (orderHash) =>
      `https://raindex.finance/my-strategies/${orderHash}-${network}`;
    
    return (
      <div className="overflow-x-auto bg-white rounded-lg shadow-lg w-full">
        <div className="flex border-b border-gray-300 bg-gray-100 rounded-t-lg">
          <button
            className={`px-6 py-3 text-sm font-medium transition-all ${
              activeTab === "main"
                ? "border-b-2 border-indigo-500 text-indigo-600 font-semibold bg-white"
                : "text-gray-600 hover:text-indigo-500"
            }`}
            onClick={() => setActiveTab("main")}
          >
            Trades & Balances
          </button>
          <button
            className={`px-6 py-3 text-sm font-medium transition-all ${
              activeTab === "vault"
                ? "border-b-2 border-indigo-500 text-indigo-600 font-semibold bg-white"
                : "text-gray-600 hover:text-indigo-500"
            }`}
            onClick={() => setActiveTab("vault")}
          >
            Deposits & Withdrawals
          </button>
        </div>

        <table className="table-auto w-full border-collapse border border-gray-200">
        <thead className="bg-gray-50 text-gray-800 text-sm font-semibold">
          <tr className="border-b border-gray-300">
            <th className="px-4 py-3 text-left">Network</th>
            <th className="px-4 py-3 text-left">Last Trade</th>
            <th className="px-4 py-3 text-left">First Trade</th>

            {activeTab === "main" ? (
              <>
                <th className="px-4 py-3 text-center">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(e.target.value)}
                  >
                    <option value="totalTradesAsc">Total ↑</option>
                    <option value="totalTradesDesc">Total ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-center">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(e.target.value)}
                  >
                    <option value="trades24hAsc">24h ↑</option>
                    <option value="trades24hDesc">24h ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(e.target.value)}
                  >
                    <option value="inputAsc">Input Balance ↑</option>
                    <option value="inputDesc">Input Balance ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(e.target.value)}
                  >
                    <option value="outputAsc">Output Balance ↑</option>
                    <option value="outputDesc">Output Balance ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(e.target.value)}
                  >
                    <option value="inputChangeAsc">Input Δ 24h ↑</option>
                    <option value="inputChangeDesc">Input Δ 24h ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(e.target.value)}
                  >
                    <option value="outputChangeAsc">Output Δ 24h ↑</option>
                    <option value="outputChangeDesc">Output Δ 24h ↓</option>
                  </select>
                </th>
              </>
            ) : (
              <>
                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(e.target.value)}
                  >
                    <option value="inputDepositWithdrawalsAsc">Input Deposits ↑</option>
                    <option value="inputDepositWithdrawalsDesc">Input Deposits ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(e.target.value)}
                  >
                    <option value="outputDepositWithdrawalsAsc">Output Deposits ↑</option>
                    <option value="outputDepositWithdrawalsDesc">Output Deposits ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(e.target.value)}
                  >
                    <option value="inputDifferentialAsc">Input Δ ↑</option>
                    <option value="inputDifferentialDesc">Input Δ ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(e.target.value)}
                  >
                    <option value="outputDifferentialAsc">Output Δ ↑</option>
                    <option value="outputDifferentialDesc">Output Δ ↓</option>
                  </select>
                </th>
              </>
            )}
            
            <th className="px-4 py-3 text-left">Hash</th>
          </tr>
        </thead>

          <tbody>
              {sortedOrders.map((order, index) => (
                <tr key={index} className="border-t border-gray-300 text-gray-700">
                  <td className="px-4 py-3 text-sm">{network}</td>
                  <td className="px-4 py-3 text-sm">{order.lastTrade}</td>
                  <td className="px-4 py-3 text-sm">{order.firstTrade}</td>

                  {activeTab === "main" ? (
                    <>
                      <td className="px-4 py-3 text-sm text-center">{order.trades.length}</td>
                      <td className="px-4 py-3 text-sm text-center">{order.trades24h}</td>

                      {/* Input Balance */}
                      <td className="px-4 py-3 text-sm">
                        {order.inputBalances.map((input, index) => (
                          <div key={index} className="flex justify-between bg-gray-50 px-3 py-2 rounded-lg shadow-sm text-sm">
                            <span className="font-semibold">{input.inputToken}</span>
                            <span className="text-gray-800">{formatBalance(input.inputTokenBalance)}</span>
                          </div>
                        ))}
                      </td>

                      {/* Output Balance */}
                      <td className="px-4 py-3 text-sm">
                        {order.outputBalances.map((output, index) => (
                          <div key={index} className="flex justify-between bg-gray-50 px-3 py-2 rounded-lg shadow-sm text-sm">
                            <span className="font-semibold">{output.outputToken}</span>
                            <span className="text-gray-800">{formatBalance(output.outputTokenBalance)}</span>
                          </div>
                        ))}
                      </td>
                      {/* Input Change 24H */}
                      <td className="px-4 py-3 text-sm">
                        {order.inputChange24h.map((change, index) => (
                          <div key={index} className="flex justify-between px-3 py-2 rounded-lg shadow-sm text-sm">
                            <span className="font-semibold">{change.inputToken}</span>
                            <span className={`font-medium ${change.inputPercentageChange >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {`${change.inputBalanceChange} (${parseFloat(change.inputPercentageChange).toFixed(2)}%)`}
                            </span>
                          </div>
                        ))}
                      </td>

                      {/* Output Change 24H */}
                      <td className="px-4 py-3 text-sm">
                        {order.outputChange24h.map((change, index) => (
                          <div key={index} className="flex justify-between px-3 py-2 rounded-lg shadow-sm text-sm">
                            <span className="font-semibold">{change.outputToken}</span>
                            <span className={`font-medium ${change.outputPercentageChange >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {`${change.outputBalanceChange} (${parseFloat(change.outputPercentageChange).toFixed(2)}%)`}
                            </span>
                          </div>
                        ))}
                      </td>
                    </>
                  ) : (
                    <>
                      {/* Input Deposits/Withdrawals */}
                      <td className="px-4 py-3 text-sm">
                        {loadingDeposits ? (
                          <span>Loading...</span>
                        ) : (
                          order?.inputDepositsWithdraws?.map((input, idx) => (
                            <div key={idx} className="flex justify-between bg-gray-50 px-3 py-2 rounded-lg shadow-sm text-sm">
                              <span className="font-semibold">{input.inputToken}</span>
                              <div className="flex flex-col text-right">
                                <span className="text-green-600 font-medium">+{input.totalVaultDeposits}</span>
                                <span className="text-red-600 font-medium">{input.totalVaultWithdrawals}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </td>

                      {/* Output Deposits/Withdrawals */}
                      <td className="px-4 py-3 text-sm">
                        {loadingDeposits ? (
                          <span>Loading...</span>
                        ) : (
                          order?.outputDepositsWithdraws?.map((output, idx) => (
                            <div key={idx} className="flex justify-between bg-gray-50 px-3 py-2 rounded-lg shadow-sm text-sm">
                              <span className="font-semibold">{output.outputToken}</span>
                              <div className="flex flex-col text-right">
                                <span className="text-green-600 font-medium">+{output.totalVaultDeposits}</span>
                                <span className="text-red-600 font-medium">{output.totalVaultWithdrawals}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </td>

                      {/* Input Vault Differential (Amount & Percentage) */}
                      <td className="px-4 py-3 text-sm">
                        {loadingDeposits ? (
                          <span>Loading...</span>
                        ) : (
                          order?.inputDepositsWithdraws?.map((input, idx) => (
                            <div key={idx} className="flex justify-between bg-gray-50 px-3 py-2 rounded-lg shadow-sm text-sm">
                              <span className="font-semibold">{input.inputToken}</span>
                              <div className="flex flex-col text-right">
                                <span className="text-gray-800 font-medium">{input.vaultDifferential}</span>
                                <span className={`font-medium ${input.vaultDifferentialPercentage >= 0 ? "text-green-600" : "text-red-600"}`}>
                                  {input.vaultDifferentialPercentage}%
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </td>

                      {/* Output Vault Differential (Amount & Percentage) */}
                      <td className="px-4 py-3 text-sm">
                        {loadingDeposits ? (
                          <span>Loading...</span>
                        ) : (
                          order?.outputDepositsWithdraws?.map((output, idx) => (
                            <div key={idx} className="flex justify-between bg-gray-50 px-3 py-2 rounded-lg shadow-sm text-sm">
                              <span className="font-semibold">{output.outputToken}</span>
                              <div className="flex flex-col text-right">
                                <span className="text-gray-800 font-medium">{output.vaultDifferential}</span>
                                <span className={`font-medium ${output.vaultDifferentialPercentage >= 0 ? "text-green-600" : "text-red-600"}`}>
                                  {output.vaultDifferentialPercentage}%
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </td>
                    </>

                  )}

                  <td className="py-2 px-4 text-blue-500 underline">
                        <a href={getOrderLink(order.orderHash)} target="_blank" rel="noopener noreferrer">
                          {`${order.orderHash.slice(0, 6)}...${order.orderHash.slice(-4)}`}
                        </a>
                  </td>
                </tr>
              ))}
            </tbody>
        </table>
      </div>
    );
  };
  

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
          <h1 className="text-lg font-semibold uppercase tracking-wide">Order List</h1>
    
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
                {filteredOrders && <OrdersTable network={network} orders={filteredOrders} />}
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