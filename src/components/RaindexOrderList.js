
  import React, { useState, useEffect, useMemo } from "react";
  import { fetchAndFilterOrders,fetchTradesQuery, tokenConfig, networkConfig, fetchAllPaginatedData, vaultDepositsQuery, vaultWithdrawalQuery, getTokenPriceUsd } from "raindex-reports"
  import { ethers } from "ethers";

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
      if (isNaN(num)) return "0.00";
      const absNum = Math.abs(num);
      let formatted;
      if (absNum >= 1e6) {
          formatted = (absNum / 1e6).toFixed(2) + "M";
      } else if (absNum >= 1e3) {
          formatted = (absNum / 1e3).toFixed(2) + "K";
      } else {
          formatted = absNum.toFixed(2);
      }

      return num < 0 ? `-${formatted}` : formatted;
  };

  const calculateTotalVolume = (trades) => {
      const tokenVolumes = {};

      trades.forEach(trade => {
        // Process output vault balance change (tokens being sent)
        if (trade.outputVaultBalanceChange) {
            const { vault, amount } = trade.outputVaultBalanceChange;
            if (vault && vault.token) {
                const { symbol, decimals, address } = vault.token;
                const volume = parseFloat(amount) / Math.pow(10, decimals);
    
                if (!tokenVolumes[symbol]) {
                    tokenVolumes[symbol] = { totalVolume: 0, tokenAddress: address };
                }
                tokenVolumes[symbol].totalVolume += Math.abs(volume);
            }
        }
    
        // Process input vault balance change (tokens being received)
        if (trade.inputVaultBalanceChange) {
            const { vault, amount } = trade.inputVaultBalanceChange;
            if (vault && vault.token) {
                const { symbol, decimals, address } = vault.token;
                const volume = parseFloat(amount) / Math.pow(10, decimals);
    
                if (!tokenVolumes[symbol]) {
                    tokenVolumes[symbol] = { totalVolume: 0, tokenAddress: address };
                }
                tokenVolumes[symbol].totalVolume += Math.abs(volume);
            }
        }
      });
      
      // Convert the object into an array format
      return Object.entries(tokenVolumes).map(([symbol, data]) => ({
          token: symbol,
          tokenAddress: data.tokenAddress, // Include token address
          totalVolume: data.totalVolume.toFixed(4) // Format to 4 decimal places
      }));
    
  }

  const transformedOrders = (orders) => {
    return orders.map((order) => {
        const trades = order.trades || [];
        const tradeTimestamps = trades.map((t) => parseInt(t.timestamp));

        const lastTrade = tradeTimestamps.length > 0 ? Math.max(...tradeTimestamps) : 0;
        const firstTrade = tradeTimestamps.length > 0 ? Math.min(...tradeTimestamps) : 0;

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
          network: order.network,
          timestampAdded: order.timestampAdded,
          orderHash: order.orderHash,
          owner: order.owner,
          active: order.active, 
          inputs: order.inputs,
          outputs: order.outputs,
          trades: trades,
          trades24h: trades24h.length,
          lastTrade: lastTrade,
          firstTrade: firstTrade,
          inputBalances: inputBalances,
          outputBalances: outputBalances,
          inputChange24h: inputChange24h,
          outputChange24h: outputChange24h,
          volumeTotal : calculateTotalVolume(trades),
          volume24H :  calculateTotalVolume(trades24h)
        }
    });
  }

  const fetchAllNetworksOrderQuery = `query OrderTakesListQuery($skip: Int = 0, $first: Int = 1000, $timestampGt: Int!) {
    trades(orderBy: timestamp, orderDirection: desc, skip: $skip, first: $first, where: {
      timestamp_gt: $timestampGt
    }) {
      timestamp
      id
      order {
        orderHash
        owner
        active
        outputs {
          id
          token {
            id
            address
            name
            symbol
            decimals
          }
          balance
          vaultId
        }
        inputs {
          id
          token {
            id
            address
            name
            symbol
            decimals
          }
          balance
          vaultId
        }
      }
      outputVaultBalanceChange {
        amount
        oldVaultBalance
        newVaultBalance
        vault {
          id
          token {
            id
            address
            name
            symbol
            decimals
          }
        }
      }
      inputVaultBalanceChange {
        vault {
          id
          token {
            id
            address
            name
            symbol
            decimals
          }
        }
        amount
        oldVaultBalance
        newVaultBalance
      }
    }
  }
  `

  const fetchDataForElapsedTime = async(elapsedTime) => {
       
    const networksArray = Object.keys(networkConfig)

    let allNetworksTrades = []
    for(let i = 0; i < networksArray.length; i++){
      const network = networksArray[i]
      const endpoint = networkConfig[network].subgraphUrl
      const tradesLast24h = await fetchAllPaginatedData(
       endpoint,
       fetchAllNetworksOrderQuery,
       {timestampGt: now - elapsedTime},
       "trades"
      )
      const groupedTrades = tradesLast24h.reduce((acc, trade) => {
         const orderHash = trade.order.orderHash;
 
         if (!acc[orderHash]) {
         acc[orderHash] = {
             orderHash: orderHash,
             owner: trade.order.owner,
             active: trade.order.active,
             inputs: trade.order.inputs,
             outputs: trade.order.outputs,
             trades: [],
         };
         }
 
         acc[orderHash].trades.push({
         timestamp: trade.timestamp,
         outputVaultBalanceChange: trade.outputVaultBalanceChange,
         inputVaultBalanceChange: trade.inputVaultBalanceChange,
         });
 
         return acc;
       }, {});
     const networkTrades = Object.values(groupedTrades).map((order) => ({
         ...order,
         network: network
       }))
       allNetworksTrades.push(...networkTrades);
    }
    return transformedOrders(allNetworksTrades)
  }

  const getOrderLink = (orderHash, orderNetwork) =>
    `https://raindex.finance/my-strategies/${orderHash}-${orderNetwork}`;

  export { formatTimestamp, formatBalance, calculateTotalVolume, transformedOrders , fetchDataForElapsedTime, fetchAllNetworksOrderQuery, getOrderLink};
  const OrdersTable = ({orders }) => {

    const [sortedOrders, setSortedOrders] = useState([]);
    const [activeTab, setActiveTab] = useState("trades");
    const [depositsData, setDepositsData] = useState(null);
    const [loadingDeposits, setLoadingDeposits] = useState(false);
    const transformedSortedOrders = useMemo(() => transformedOrders(orders), [orders]);

    useEffect(() => {
      setSortedOrders(transformedSortedOrders);
    }, [transformedSortedOrders]);

    useEffect(() => {
      if ((activeTab === "vault" || activeTab === "p&l") && !depositsData) {
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
    
        fetchData();
      }
    }, [activeTab]);
  

    const handleSortByVaultBalance = (orders, sortType) => {
      let sorted = [...orders];
    
      switch (sortType) {
        case "orderRoiAsc":
          sorted.sort((a, b) => a.orderRoi - b.orderRoi);
          break;
    
        case "orderRoiDesc":
          sorted.sort((a, b) => b.orderRoi - a.orderRoi);
          break;

        case "orderApyAsc":
          sorted.sort((a, b) => a.orderApy - b.orderApy);
          break;
    
        case "orderApyDesc":
          sorted.sort((a, b) => b.orderApy - a.orderApy);
          break;

        case "orderDurationAsc":
          sorted.sort((a, b) => (now - a.timestampAdded) - (now - b.timestampAdded));
          break;
    
        case "orderDurationDesc":
          sorted.sort((a, b) => (now - b.timestampAdded) - (now - a.timestampAdded));
          break;

        case "tradeDurationAsc":
          sorted.sort((a, b) => (a.lastTrade - a.firstTrade) - (b.lastTrade - b.firstTrade));
          break;
    
        case "tradeDurationDesc":
          sorted.sort((a, b) => (b.lastTrade - b.firstTrade) - (a.lastTrade - a.firstTrade));
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
    
      
      setSortedOrders(sorted);
      
    };
    
    const fetchDepositsAndWithdrawals = async (ordersWithTrades) => {
        
      for(let i = 0; i < ordersWithTrades.length; i++){
          let order = ordersWithTrades[i]
          const endpoint = networkConfig[order.network].subgraphUrl
          for(let i = 0; i < order.inputs.length; i++){
            let input = order.inputs[i]
            const deposits = await fetchAllPaginatedData(
              endpoint,
              vaultDepositsQuery,
              {vaultId: input.id},
              "deposits"
            )
            input["usdPrice"] = await getTokenPriceUsd(input.token.address, input.token.symbol)
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
            output["usdPrice"] = await getTokenPriceUsd(output.token.address, output.token.symbol)
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
      
      const tokenPriceMap = {};

      // Populate the price map from order.inputs
      order.inputs.forEach(input => {
          if (input.token.address && input.usdPrice !== undefined) {
              tokenPriceMap[input.token.address.toLowerCase()] = parseFloat(input.usdPrice.currentPrice);
          }
      });
      
      // Populate the price map from order.outputs (overwrite if necessary)
      order.outputs.forEach(output => {
          if (output.token.address && output.usdPrice !== undefined) {
              tokenPriceMap[output.token.address.toLowerCase()] = parseFloat(output.usdPrice.currentPrice);
          }
      });
      order["volumeTotal"] = order.volumeTotal.map(tokenData => {
        const tokenAddrLower = tokenData.tokenAddress.toLowerCase();
        const usdPrice = tokenPriceMap[tokenAddrLower] || 0; 
        const totalVolumeUsd = parseFloat(tokenData.totalVolume) * usdPrice;
    
        return {
            ...tokenData,
            totalVolumeUsd: totalVolumeUsd.toFixed(2) 
        };
    });
      const orderDuration = now - order.timestampAdded
      const secondsInYear = 365 * 86400
      // Unique input vaults
      const uniqueInputVaults = new Map();

      const inputDepositsWithdraws = order.inputs.reduce((acc, input) => {
        if (!uniqueInputVaults.has(input.id)) {
          const totalVaultDeposits = input.deposits.reduce((total, deposit) => total.add(ethers.BigNumber.from(deposit.amount)), ethers.BigNumber.from(0));
          const totalVaultWithdrawals = input.withdrawals.reduce((total, withdrawal) => total.add(ethers.BigNumber.from(withdrawal.amount).abs()), ethers.BigNumber.from(0));
          const currentVaultInputs = totalVaultWithdrawals.add(input.balance);

          const curerentVaultDifferential = parseFloat(
            ethers.utils.formatUnits(
              currentVaultInputs.sub(totalVaultDeposits), 
              input.token.decimals
            )
          ).toFixed(4);
          const currentVaultApy = parseFloat((curerentVaultDifferential * secondsInYear)/(orderDuration))

          const vaultDifferentialPercentage = totalVaultDeposits.gt(0) ? (
            parseFloat(
              ethers.utils.formatUnits(
                currentVaultInputs.sub(totalVaultDeposits), 
                input.token.decimals
              )
            ) / parseFloat(ethers.utils.formatUnits(totalVaultDeposits, input.token.decimals)) * 100
          ).toFixed(2) : "0.00";

          const currentVaultApyPercentage = parseFloat((vaultDifferentialPercentage * secondsInYear)/(orderDuration))


          console.log("input.usdPrice : ", input.usdPrice)
          const vaultData = {
            vaultId: input.id,
            inputToken: input.token.symbol,
            inputTokenPriceUsd: input.usdPrice.currentPrice,
            totalVaultDeposits: parseFloat(ethers.utils.formatUnits(totalVaultDeposits, input.token.decimals)).toFixed(4),
            totalVaultWithdrawals: parseFloat(ethers.utils.formatUnits(totalVaultWithdrawals, input.token.decimals)).toFixed(4),
            currentVaultInputs: parseFloat(ethers.utils.formatUnits(currentVaultInputs, input.token.decimals)).toFixed(4),
            curerentVaultDifferential,
            vaultDifferentialPercentage,
            currentVaultApy,
            currentVaultApyPercentage
          };

          uniqueInputVaults.set(input.id, vaultData);
          acc.push(vaultData);
        }
        return acc;
      }, []);

      // Unique output vaults
      const uniqueOutputVaults = new Map();

      const outputDepositsWithdraws = order.outputs.reduce((acc, output) => {
        if (!uniqueOutputVaults.has(output.id)) {
          const totalVaultDeposits = output.deposits.reduce((total, deposit) => total.add(ethers.BigNumber.from(deposit.amount)), ethers.BigNumber.from(0));
          const totalVaultWithdrawals = output.withdrawals.reduce((total, withdrawal) => total.add(ethers.BigNumber.from(withdrawal.amount).abs()), ethers.BigNumber.from(0));
          const currentVaultInputs = totalVaultWithdrawals.add(output.balance);

          const curerentVaultDifferential = parseFloat(
            ethers.utils.formatUnits(
              currentVaultInputs.sub(totalVaultDeposits), 
              output.token.decimals
            )
          ).toFixed(4);

          const currentVaultApy = parseFloat((curerentVaultDifferential * secondsInYear)/(orderDuration))
          const vaultDifferentialPercentage = totalVaultDeposits.gt(0) ? (
            parseFloat(
              ethers.utils.formatUnits(
                currentVaultInputs.sub(totalVaultDeposits), 
                output.token.decimals
              )
            ) / parseFloat(ethers.utils.formatUnits(totalVaultDeposits, output.token.decimals)) * 100
          ).toFixed(2) : "0.00";

          const currentVaultApyPercentage = parseFloat((vaultDifferentialPercentage * secondsInYear)/(orderDuration))

          const vaultData = {
            vaultId: output.id,
            outputToken: output.token.symbol,
            outputTokenPriceUsd: output.usdPrice.currentPrice,
            totalVaultDeposits: parseFloat(ethers.utils.formatUnits(totalVaultDeposits, output.token.decimals)).toFixed(4),
            totalVaultWithdrawals: parseFloat(ethers.utils.formatUnits(totalVaultWithdrawals, output.token.decimals)).toFixed(4),
            currentVaultBalance: parseFloat(ethers.utils.formatUnits(output.balance, output.token.decimals)).toFixed(4),
            currentVaultInputs: parseFloat(ethers.utils.formatUnits(currentVaultInputs, output.token.decimals)).toFixed(4),
            curerentVaultDifferential,
            vaultDifferentialPercentage,
            currentVaultApy,
            currentVaultApyPercentage
          };

          uniqueOutputVaults.set(output.id, vaultData);
          acc.push(vaultData);
        }
        return acc;
      }, []);

      const totalDepositUsd = outputDepositsWithdraws.reduce((sum, output) => {
        return sum + (parseFloat(output.totalVaultDeposits) * parseFloat(output.outputTokenPriceUsd));
      }, 0);

      const totalInputsChange = inputDepositsWithdraws.reduce((sum, input) => {
        return sum + (parseFloat(input.currentVaultInputs) * parseFloat(input.inputTokenPriceUsd));
      }, 0);

      const orderRoi = (totalInputsChange - totalDepositUsd).toFixed(2)
      const orderApy = (orderRoi * secondsInYear) / orderDuration

      const orderRoiPercentage = (((totalInputsChange - totalDepositUsd) / totalDepositUsd) * 100).toFixed(2)
      const orderApyPercentage = (orderRoiPercentage * secondsInYear) / orderDuration

      const orderTotalVolumeUsd = order.volumeTotal.reduce((sum, token) => sum + (parseFloat(token.totalVolumeUsd) || 0), 0)

      return {
          ...order,
          orderTotalVolumeUsd,
          orderRoi,
          orderRoiPercentage,
          orderApy,
          orderApyPercentage,
          totalDepositUsd,
          totalInputsChange,
          inputDepositsWithdraws: inputDepositsWithdraws,
          outputDepositsWithdraws: outputDepositsWithdraws
        }
      })
      return transformedOrders
    }

    return (
      <div className="overflow-x-auto bg-white rounded-lg shadow-lg w-full">
        <div className="flex border-b border-gray-300 bg-gray-100 rounded-t-lg">
          {["trades", "balance","vault", "p&l"].map((tab) => (
            <button
              key={tab}
              className={`px-6 py-3 text-sm font-medium transition-all ${
                activeTab === tab
                  ? "border-b-2 border-indigo-500 text-indigo-600 font-semibold bg-white"
                  : "text-gray-600 hover:text-indigo-500"
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "trades" ? "Trades" : 
              tab === "balance" ? "Balance Changes" : 
              tab === "vault" ? "Deposits & Withdrawals" : 
              "Profit & Loss"}
            </button>
          ))}
        </div>

        <table className="table-auto w-full border-collapse border border-gray-200">
        <thead className="bg-gray-50 text-gray-800 text-sm font-semibold">
          <tr className="border-b border-gray-300">
            <th className="px-4 py-3 text-left">Network</th>
            

            {(activeTab === "trades") && (
              <>
                <th className="px-4 py-3 text-left">Last Trade</th>
                <th className="px-4 py-3 text-left">First Trade</th>
                <th className="px-4 py-3 text-center">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      sortedOrders, 
                      e.target.value
                    )}
                  >
                    <option value="totalTradesAsc">Total ↑</option>
                    <option value="totalTradesDesc">Total ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-center">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      sortedOrders, 
                      e.target.value
                    )}
                  >
                    <option value="trades24hAsc">24h ↑</option>
                    <option value="trades24hDesc">24h ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      sortedOrders, 
                      e.target.value
                    )}
                  >
                    <option value="volTotalAsc">Volume Total ↑</option>
                    <option value="volTotalDesc">Volume Total ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      sortedOrders, 
                      e.target.value
                    )}
                  >
                    <option value="vol24hAsc">Volume 24h ↑</option>
                    <option value="vol24hDesc">Volume 24h ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      sortedOrders, 
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
                      sortedOrders, 
                      e.target.value
                    )}
                  >
                    <option value="outputAsc">Output Balance ↑</option>
                    <option value="outputDesc">Output Balance ↓</option>
                  </select>
                </th>

              </>
            )}

            {(activeTab === "balance") && (
              <>
                <th className="px-4 py-3 text-left">Last Trade</th>
                <th className="px-4 py-3 text-left">First Trade</th>
                <th className="px-4 py-3 text-center">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      sortedOrders, 
                      e.target.value
                    )}
                  >
                    <option value="trades24hAsc">24h ↑</option>
                    <option value="trades24hDesc">24h ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      sortedOrders, 
                      e.target.value
                    )}
                  >
                    <option value="vol24hAsc">Volume 24h ↑</option>
                    <option value="vol24hDesc">Volume 24h ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      sortedOrders, 
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
                      sortedOrders, 
                      e.target.value
                    )}
                  >
                    <option value="outputAsc">Output Balance ↑</option>
                    <option value="outputDesc">Output Balance ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      sortedOrders, 
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
                      sortedOrders, 
                      e.target.value
                    )}
                  >
                    <option value="outputChangeAsc">Output Δ 24h ↑</option>
                    <option value="outputChangeDesc">Output Δ 24h ↓</option>
                  </select>
                </th>

              </>
            )}

            {activeTab === "vault" && (
              <>
                <th className="px-4 py-3 text-left">Last Trade</th>
                <th className="px-4 py-3 text-left">First Trade</th>
                <th className="px-4 py-3 text-center">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      sortedOrders, 
                      e.target.value
                    )}
                  >
                    <option value="totalTradesAsc">Total ↑</option>
                    <option value="totalTradesDesc">Total ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      sortedOrders, 
                      e.target.value
                    )}
                  >
                    <option value="volTotalAsc">Volume Total ↑</option>
                    <option value="volTotalDesc">Volume Total ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      sortedOrders, 
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
                      sortedOrders, 
                      e.target.value
                    )}
                  >
                    <option value="outputAsc">Output Balance ↑</option>
                    <option value="outputDesc">Output Balance ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      sortedOrders, 
                      e.target.value
                    )}
                  >
                    <option value="inputDepositWithdrawalsAsc">Input Deposits / Withdrawals ↑</option>
                    <option value="inputDepositWithdrawalsDesc">Input Deposits / Withdrawals ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      sortedOrders, 
                      e.target.value
                    )}
                  >
                    <option value="outputDepositWithdrawalsAsc">Output Deposits / Withdrawals ↑</option>
                    <option value="outputDepositWithdrawalsDesc">Output Deposits / Withdrawals ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      sortedOrders, 
                      e.target.value
                    )}
                  >
                    <option value="inputsAsc">Inputs ↑</option>
                    <option value="inputsDesc">Inputs ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      sortedOrders, 
                      e.target.value
                    )}
                  >
                    <option value="differentialAsc">Change ↑</option>
                    <option value="differentialDesc">Change ↓</option>
                  </select>
                </th>
              </>
            )}

            {activeTab === "p&l" && (
              <>
            
                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      sortedOrders, 
                      e.target.value
                    )}
                  >
                    <option value="tradeDurationAsc">Trade Duration ↑</option>
                    <option value="tradeDurationDesc">Trade Duration ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      sortedOrders, 
                      e.target.value
                    )}
                  >
                    <option value="orderDurationAsc">Order Duration ↑</option>
                    <option value="orderDurationDesc">Order Duration ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      sortedOrders, 
                      e.target.value
                    )}
                  >
                    <option value="outputAsc">Current Price ↑</option>
                    <option value="outputDesc">Current Price ↓</option>
                  </select>
                </th>
                <th className="px-4 py-3 text-center">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      sortedOrders, 
                      e.target.value
                    )}
                  >
                    <option value="totalTradesAsc">Total Trades ↑</option>
                    <option value="totalTradesDesc">Total Trades ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      sortedOrders, 
                      e.target.value
                    )}
                  >
                    <option value="volTotalAsc">Total Volume ↑</option>
                    <option value="volTotalDesc">Volume Volume ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      sortedOrders, 
                      e.target.value
                    )}
                  >
                    <option value="inputAsc">Total Deposits ↑</option>
                    <option value="inputDesc">Total Deposits ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      sortedOrders, 
                      e.target.value
                    )}
                  >
                    <option value="outputAsc">Total Inputs (Withdrawals + Balances) ↑</option>
                    <option value="outputDesc">Total Inputs (Withdrawals + Balances) ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      sortedOrders, 
                      e.target.value
                    )}
                  >
                    <option value="">$ ROI ↑</option>
                    <option value="">$ ROI ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      sortedOrders, 
                      e.target.value
                    )}
                  >
                    <option value="orderRoiAsc">ROI % ↑</option>
                    <option value="orderRoiDesc">ROI % ↓</option>
                  </select>
                </th>
                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      sortedOrders, 
                      e.target.value
                    )}
                  >
                    <option value="orderApyAsc">$ Projected APY ↑</option>
                    <option value="orderApyDesc">$ Projected APY ↓</option>
                  </select>
                </th>

                <th className="px-4 py-3 text-left">
                  <select
                    className="bg-gray-100 text-gray-700 p-1 rounded focus:outline-none"
                    onChange={(e) => handleSortByVaultBalance(
                      sortedOrders, 
                      e.target.value
                    )}
                  >
                    <option value="">Projected APY %↑</option>
                    <option value="">Projected APY %↓</option>
                  </select>
                </th>

              </>
            )}

            
            
            <th className="px-4 py-3 text-left">Hash</th>
          </tr>
        </thead>

          <tbody>
              {
                (activeTab === "trades") && (
                  <>
                    {sortedOrders.map((order, index) => (
                      <tr key={index} className="border-t border-gray-300 text-gray-700">
                        <td className="px-4 py-3 text-sm">{order.network}</td>
                        <td className="px-4 py-3 text-sm">{formatTimestamp(order.lastTrade)}</td>
                        <td className="px-4 py-3 text-sm">{formatTimestamp(order.firstTrade)}</td>
                        <td className="px-4 py-3 text-sm text-center">{order.trades.length}</td>
                        <td className="px-4 py-3 text-sm text-center">{order.trades24h}</td>

                        {/* Total Volume */}
                        <td className="px-4 py-3 text-sm">
                          {order.volumeTotal.length > 0 ? (
                            order.volumeTotal.map((output, index) => (
                              <div key={index} className="flex justify-between bg-gray-50 px-3 py-2 rounded-lg shadow-sm text-sm">
                                <span className="font-semibold">{output.token}</span>
                                <span className="text-gray-800">{formatBalance(output.totalVolume)}</span>
                              </div>
                            ))
                          ) : (
                            <div className="flex justify-center items-center h-10 bg-gray-50 text-gray-600 font-medium text-sm rounded-lg shadow-sm">
                                      N/A
                            </div>
                          )}
                        </td>

                        {/* 24H Volume */}
                        <td className="px-4 py-3 text-sm">
                          {order.volume24H.length > 0 ? (
                            order.volume24H.map((input, index) => (
                              <div key={index} className="flex justify-between bg-gray-50 px-3 py-2 rounded-lg shadow-sm text-sm">
                                <span className="font-semibold">{input.token}</span>
                                <span className="text-gray-800">{formatBalance(input.totalVolume)}</span>
                              </div>
                            ))
                          ) : (
                            <div className="flex justify-center items-center h-10 bg-gray-50 text-gray-600 font-medium text-sm rounded-lg shadow-sm">
                                      N/A
                            </div>
                          )}
                        </td>

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



                            
                        

                        <td className="py-2 px-4 text-blue-500 underline">
                              <a href={getOrderLink(order.orderHash, order.network)} target="_blank" rel="noopener noreferrer">
                                {`${order.orderHash.slice(0, 6)}...${order.orderHash.slice(-4)}`}
                              </a>
                        </td>
                      </tr>
                    ))}
                  </>
                )
              }
              {
                (activeTab === "vault") && (
                  <>
                    {sortedOrders.map((order, index) => (
                      <tr key={index} className="border-t border-gray-300 text-gray-700">
                        <td className="px-4 py-3 text-sm">{order.network}</td>
                        <td className="px-4 py-3 text-sm">{formatTimestamp(order.lastTrade)}</td>
                        <td className="px-4 py-3 text-sm">{formatTimestamp(order.firstTrade)}</td>
                        <td className="px-4 py-3 text-sm text-center">{order.trades.length}</td>

                        {/* Total Volume */}
                        <td className="px-4 py-3 text-sm">
                          {order.volumeTotal.length > 0 ? (
                            order.volumeTotal.map((output, index) => (
                              <div key={index} className="flex justify-between bg-gray-50 px-3 py-2 rounded-lg shadow-sm text-sm">
                                <span className="font-semibold">{output.token}</span>
                                <span className="text-gray-800">{formatBalance(output.totalVolume)}</span>
                              </div>
                            ))
                          ) : (
                            <div className="flex justify-center items-center h-10 bg-gray-50 text-gray-600 font-medium text-sm rounded-lg shadow-sm">
                                      N/A
                            </div>
                          )}
                        </td>

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

                        {/* Input Deposits/Withdrawals */}
                        <td className="px-4 py-3 text-sm">
                          {loadingDeposits ? (
                            <span>Loading...</span>
                          ) : (
                            order?.inputDepositsWithdraws?.map((input, idx) => (
                              <div key={idx} className="flex justify-between bg-gray-50 px-3 py-2 rounded-lg shadow-sm text-sm">
                                <span className="font-semibold">{input.inputToken}</span>
                                <div className="flex flex-col text-right">
                                  <span className="text-green-600 font-medium">+{formatBalance(input.totalVaultDeposits)}</span>
                                  <span className="text-red-600 font-medium">{formatBalance(input.totalVaultWithdrawals)}</span>
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
                                  <span className="text-green-600 font-medium">+{formatBalance(output.totalVaultDeposits)}</span>
                                  <span className="text-red-600 font-medium">{formatBalance(output.totalVaultWithdrawals)}</span>
                                </div>
                              </div>
                            ))
                          )}
                        </td>

                        {/* Combined Vault Inputs */}
                        <td className="px-4 py-3 text-sm">
                          {loadingDeposits ? (
                            <div className="flex justify-center items-center h-10 bg-gray-50 text-gray-400 font-medium text-sm rounded-lg shadow-sm">
                              Loading...
                            </div>
                          ) : order?.inputDepositsWithdraws?.length > 0 || order?.outputDepositsWithdraws?.length > 0 ? (
                            <>
                              {/* Input Vaults */}
                              {order?.inputDepositsWithdraws?.map((input, idx) => (
                                <div key={idx} className="flex justify-between bg-gray-50 px-3 py-2 rounded-lg shadow-sm text-sm mb-1">
                                  <span className="font-semibold">{input.inputToken}</span>
                                  <span className="text-gray-600 font-medium">{formatBalance(input.currentVaultInputs)}</span>
                                </div>
                              ))}

                              {/* Output Vaults */}
                              {order?.outputDepositsWithdraws?.map((output, idx) => (
                                <div key={idx} className="flex justify-between bg-gray-50 px-3 py-2 rounded-lg shadow-sm text-sm">
                                  <span className="font-semibold">{output.outputToken}</span>
                                  <span className="text-gray-600 font-medium">{formatBalance(output.currentVaultInputs)}</span>
                                </div>
                              ))}
                            </>
                          ) : (
                            <div className="flex justify-center items-center h-10 bg-gray-50 text-gray-400 font-medium text-sm rounded-lg shadow-sm">
                              N/A
                            </div>
                          )}
                        </td>

                        {/* Combined Vault Differential (Amount & Percentage) */}
                        <td className="px-4 py-3 text-sm">
                          {loadingDeposits ? (
                            <div className="flex justify-center items-center h-10 bg-gray-50 text-gray-400 font-medium text-sm rounded-lg shadow-sm">
                              Loading...
                            </div>
                          ) : order?.inputDepositsWithdraws?.length > 0 || order?.outputDepositsWithdraws?.length > 0 ? (
                            <>
                              {/* Input Vault Differential */}
                              {order?.inputDepositsWithdraws?.map((input, idx) => (
                                <div key={idx} className="flex justify-between bg-gray-50 px-3 py-2 rounded-lg shadow-sm text-sm mb-1">
                                  <span className="font-semibold">{input.inputToken}</span>
                                  <div className="flex flex-col text-right">
                                    <span className="text-gray-800 font-medium">{formatBalance(input.curerentVaultDifferential)}</span>
                                    <span className={`font-medium ${input.vaultDifferentialPercentage >= 0 ? "text-green-600" : "text-red-600"}`}>
                                      {input.vaultDifferentialPercentage}%
                                    </span>
                                  </div>
                                </div>
                              ))}

                              {/* Output Vault Differential */}
                              {order?.outputDepositsWithdraws?.map((output, idx) => (
                                <div key={idx} className="flex justify-between bg-gray-50 px-3 py-2 rounded-lg shadow-sm text-sm">
                                  <span className="font-semibold">{output.outputToken}</span>
                                  <div className="flex flex-col text-right">
                                    <span className="text-gray-800 font-medium">{formatBalance(output.curerentVaultDifferential)}</span>
                                    <span className={`font-medium ${output.vaultDifferentialPercentage >= 0 ? "text-green-600" : "text-red-600"}`}>
                                      {output.vaultDifferentialPercentage}%
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </>
                          ) : (
                            <div className="flex justify-center items-center h-10 bg-gray-50 text-gray-400 font-medium text-sm rounded-lg shadow-sm">
                              N/A
                            </div>
                          )}
                        </td>

                        <td className="py-2 px-4 text-blue-500 underline">
                              <a href={getOrderLink(order.orderHash, order.network)} target="_blank" rel="noopener noreferrer">
                                {`${order.orderHash.slice(0, 6)}...${order.orderHash.slice(-4)}`}
                              </a>
                        </td>
                      </tr>
                    ))}
                  </>
                )
              }
              {
                (activeTab === "balance") && (
                  <>
                    {sortedOrders.map((order, index) => (
                      <tr key={index} className="border-t border-gray-300 text-gray-700">
                        <td className="px-4 py-3 text-sm">{order.network}</td>
                        <td className="px-4 py-3 text-sm">{formatTimestamp(order.lastTrade)}</td>
                        <td className="px-4 py-3 text-sm">{formatTimestamp(order.firstTrade)}</td>
                        <td className="px-4 py-3 text-sm text-center">{order.trades24h}</td>

                        {/* 24H Volume */}
                        <td className="px-4 py-3 text-sm">
                          {order.volume24H.length > 0 ? (
                            order.volume24H.map((input, index) => (
                              <div key={index} className="flex justify-between bg-gray-50 px-3 py-2 rounded-lg shadow-sm text-sm">
                                <span className="font-semibold">{input.token}</span>
                                <span className="text-gray-800">{formatBalance(input.totalVolume)}</span>
                              </div>
                            ))
                          ) : (
                            <div className="flex justify-center items-center h-10 bg-gray-50 text-gray-600 font-medium text-sm rounded-lg shadow-sm">
                                      N/A
                            </div>
                          )}
                        </td>

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

                        <td className="py-2 px-4 text-blue-500 underline">
                          <a href={getOrderLink(order.orderHash, order.network)} target="_blank" rel="noopener noreferrer">
                            {`${order.orderHash.slice(0, 6)}...${order.orderHash.slice(-4)}`}
                        </a>
                        </td>
                      </tr>
                    ))}
                  </>
                )
              }
              {
                (activeTab === "p&l") && (
                  <>
                    {sortedOrders.map((order, index) => (
                      <tr key={index} className="border-t border-gray-300 text-gray-700">
                        <td className="px-4 py-3 text-sm">{order.network}</td>
                        <td className="px-4 py-3 text-sm">{parseFloat((order.lastTrade - order.firstTrade)/86400).toFixed(4)} days</td>
                        <td className="px-4 py-3 text-sm">{parseFloat((now - order.timestampAdded)/86400).toFixed(4)} days</td>

                        {/* Current Price */}
                        <td className="px-4 py-3 text-sm">
                          {loadingDeposits ? (
                            <div className="flex justify-center items-center h-10 bg-gray-50 text-gray-400 font-medium text-sm rounded-lg shadow-sm">
                              Loading...
                            </div>
                          ) : order?.inputDepositsWithdraws?.length > 0 || order?.outputDepositsWithdraws?.length > 0 ? (
                            <>
                              {/* Input Vaults */}
                              {order?.inputDepositsWithdraws?.map((input, idx) => (
                                <div key={idx} className="flex justify-between bg-gray-50 px-3 py-2 rounded-lg shadow-sm text-sm mb-1">
                                  <span className="font-semibold">{input.inputToken}</span>
                                  <span className="text-gray-600 font-medium">${formatBalance(input.inputTokenPriceUsd)}</span>
                                </div>
                              ))}
                            </>
                          ) : (
                            <div className="flex justify-center items-center h-10 bg-gray-50 text-gray-400 font-medium text-sm rounded-lg shadow-sm">
                              N/A
                            </div>
                          )}
                        </td>
                        
                        <td className="px-4 py-3 text-sm text-center">{order.trades.length}</td>

                        {/* Total Volume */}
                        <td className="px-4 py-3 text-sm">
                          {order.volumeTotal.length > 0 ? (
                            <>
                            {
                              order.volumeTotal.map((output, index) => (
                                <div key={index} className="flex justify-between bg-gray-50 px-3 py-2 rounded-lg shadow-sm text-sm">
                                  <span className="font-semibold">{output.token}</span>
                                  <span className="text-gray-800">{formatBalance(output.totalVolume)}</span>
                                </div>
                              ))
                            }
                            <div
                              className="flex justify-between items-center px-3 py-2 bg-gray-50 rounded-lg shadow-sm text-sm font-medium"
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
                            <div className="flex justify-center items-center h-10 bg-gray-50 text-gray-600 font-medium text-sm rounded-lg shadow-sm">
                                      N/A
                            </div>
                          )}
                        </td>


                        {/* Output Deposits/Withdrawals */}
                        <td className="px-4 py-3 text-sm">
                          {loadingDeposits ? (
                            <div className="flex justify-center items-center h-10 bg-gray-50 text-gray-400 font-medium text-sm rounded-lg shadow-sm">
                              Loading...
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {order?.outputDepositsWithdraws?.map((output, idx) => (
                                <div
                                  key={idx}
                                  className="flex justify-between bg-gray-50 px-3 py-2 rounded-lg shadow-sm text-sm"
                                >
                                  <span className="font-semibold">{output.outputToken}</span>
                                  <div className="flex flex-col text-right">
                                    <span className="text-gray-600 font-medium">
                                      +{formatBalance(output.totalVaultDeposits)}
                                    </span>
                                  </div>
                                </div>
                              ))}

                              {order?.totalDepositUsd !== undefined && (
                                <div
                                  className="flex justify-between items-center px-3 py-2 bg-gray-50 rounded-lg shadow-sm text-sm font-medium"
                                >
                                  <span className="font-semibold text-gray-600">Total (USD)</span>
                                  <span
                                    className=" font-semibold text-gray-600"
                                  >{order.totalDepositUsd >= 0 ? `$${formatBalance(order.totalDepositUsd)}` : `$${formatBalance(order.totalDepositUsd)}`}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Combined Vault Inputs */}
                        <td className="px-4 py-3 text-sm">
                          {loadingDeposits ? (
                            <div className="flex justify-center items-center h-10 bg-gray-50 text-gray-400 font-medium text-sm rounded-lg shadow-sm">
                              Loading...
                            </div>
                          ) : order?.inputDepositsWithdraws?.length > 0 || order?.outputDepositsWithdraws?.length > 0 ? (
                            <div className="space-y-2">
                              {/* Input Vaults */}
                              {order?.inputDepositsWithdraws?.map((input, idx) => (
                                <div key={idx} className="flex justify-between bg-gray-50 px-3 py-2 rounded-lg shadow-sm text-sm">
                                  <span className="font-semibold">{input.inputToken}</span>
                                  <span className="text-gray-600 font-medium">{formatBalance(input.currentVaultInputs)}</span>
                                </div>
                              ))}

                              {order?.totalInputsChange !== undefined && (
                                <div
                                  className="flex justify-between items-center px-3 py-2 bg-gray-50 rounded-lg shadow-sm text-sm font-medium"
                                >
                                  <span className="font-semibold text-gray-600">Total Inputs (USD)</span>
                                  <span
                                    className=" font-semibold text-gray-600"
                                  >{order.totalInputsChange >= 0 ? `$${formatBalance(order.totalInputsChange)}` : `$${formatBalance(order.totalInputsChange)}`}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex justify-center items-center h-10 bg-gray-50 text-gray-400 font-medium text-sm rounded-lg shadow-sm">
                              N/A
                            </div>
                          )}
                        </td>

                        
                        {/* ROI */}
                        <td className="px-4 py-3 text-sm">
                          {loadingDeposits ? (
                            <div className="flex justify-center items-center h-10 bg-gray-50 text-gray-400 font-medium text-sm rounded-lg shadow-sm">
                              Loading...
                            </div>
                          ) : order?.inputDepositsWithdraws?.length > 0 ? (
                            <div className="space-y-2">
                              {order?.inputDepositsWithdraws?.map((input, idx) => (
                                <div
                                  key={idx}
                                  className="flex justify-between bg-gray-50 px-3 py-2 rounded-lg shadow-sm text-sm"
                                >
                                  <span className="font-semibold">{input.inputToken}</span>
                                  <div className="flex flex-col text-right">
                                    <span
                                      className={`font-medium ${
                                        input.curerentVaultDifferential >= 0 ? "text-green-600" : "text-red-600"
                                      }`}
                                    >
                                      {formatBalance(input.curerentVaultDifferential)}
                                    </span>
                                  </div>
                                </div>
                              ))}
                              
                              {order?.orderRoi !== undefined && (
                                <div
                                  className="flex justify-between items-center px-3 py-2 bg-gray-50 rounded-lg shadow-sm text-sm font-medium"
                                >
                                  <span className="font-semibold text-gray-600">Total ROI (USD)</span>
                                  <span
                                    className={`${
                                      order.orderRoi >= 0 ? "text-green-600" : "text-red-600"
                                    }`}
                                  >{order.orderRoi >= 0 ? `$${order.orderRoi}` : `$${order.orderRoi}`}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex justify-center items-center h-10 bg-gray-50 text-gray-400 font-medium text-sm rounded-lg shadow-sm">
                              N/A
                            </div>
                          )}
                        </td>

                        {/* ROI% */}
                        <td className="px-4 py-3 text-sm">
                          {loadingDeposits ? (
                            <div className="flex justify-center items-center h-10 bg-gray-50 text-gray-400 font-medium text-sm rounded-lg shadow-sm">
                              Loading...
                            </div>
                          ) : order?.inputDepositsWithdraws?.length > 0 ? (
                            <div className="space-y-2">
                              {order?.inputDepositsWithdraws?.map((input, idx) => (
                                <div
                                  key={idx}
                                  className="flex justify-between bg-gray-50 px-3 py-2 rounded-lg shadow-sm text-sm"
                                >
                                  <span className="font-semibold">{input.inputToken}</span>
                                  <div className="flex flex-col text-right">
                                    <span
                                      className={`font-medium ${
                                        input.vaultDifferentialPercentage >= 0 ? "text-green-600" : "text-red-600"
                                      }`}
                                    >
                                      {input.vaultDifferentialPercentage}%
                                    </span>
                                  </div>
                                </div>
                              ))}

                              {order?.orderRoiPercentage !== undefined && (
                                <div
                                  className="flex justify-between items-center px-3 py-2 bg-gray-50 rounded-lg shadow-sm text-sm font-medium"
                                >
                                  <span className="font-semibold text-gray-600">Total ROI%</span>
                                  <span
                                    className={`${
                                      order.orderRoiPercentage >= 0 ? "text-green-600" : "text-red-600"
                                    }`}
                                  >{order.orderRoiPercentage >= 0 ? `${order.orderRoiPercentage}%` : `${order.orderRoiPercentage}%`}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex justify-center items-center h-10 bg-gray-50 text-gray-400 font-medium text-sm rounded-lg shadow-sm">
                              N/A
                            </div>
                          )}
                        </td>

                        {/* APY */}
                        <td className="px-4 py-3 text-sm">
                          {loadingDeposits ? (
                            <div className="flex justify-center items-center h-10 bg-gray-50 text-gray-400 font-medium text-sm rounded-lg shadow-sm">
                              Loading...
                            </div>
                          ) : order?.inputDepositsWithdraws?.length > 0 ? (
                            <div className="space-y-2">
                              {order?.inputDepositsWithdraws?.map((input, idx) => (
                                <div
                                  key={idx}
                                  className="flex justify-between bg-gray-50 px-3 py-2 rounded-lg shadow-sm text-sm"
                                >
                                  <span className="font-semibold">{input.inputToken}</span>
                                  <div className="flex flex-col text-right">
                                    <span
                                      className={`font-medium ${
                                        input.currentVaultApy >= 0 ? "text-green-600" : "text-red-600"
                                      }`}
                                    >
                                      {formatBalance(input.currentVaultApy)}
                                    </span>
                                  </div>
                                </div>
                              ))}
                              
                              {order?.orderApy !== undefined && (
                                <div
                                  className="flex justify-between items-center px-3 py-2 bg-gray-50 rounded-lg shadow-sm text-sm font-medium"
                                >
                                  <span className="font-semibold text-gray-600">Total Projected APY (USD)</span>
                                  <span
                                    className={`${
                                      order.orderApy >= 0 ? "text-green-600" : "text-red-600"
                                    }`}
                                  >{order.orderApy >= 0 ? `$${formatBalance(order.orderApy)}` : `$${formatBalance(order.orderApy)}`}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex justify-center items-center h-10 bg-gray-50 text-gray-400 font-medium text-sm rounded-lg shadow-sm">
                              N/A
                            </div>
                          )}
                        </td>

                        {/* APY% */}
                        <td className="px-4 py-3 text-sm">
                          {loadingDeposits ? (
                            <div className="flex justify-center items-center h-10 bg-gray-50 text-gray-400 font-medium text-sm rounded-lg shadow-sm">
                              Loading...
                            </div>
                          ) : order?.inputDepositsWithdraws?.length > 0 ? (
                            <div className="space-y-2">
                              {order?.inputDepositsWithdraws?.map((input, idx) => (
                                <div
                                  key={idx}
                                  className="flex justify-between bg-gray-50 px-3 py-2 rounded-lg shadow-sm text-sm"
                                >
                                  <span className="font-semibold">{input.inputToken}</span>
                                  <div className="flex flex-col text-right">
                                    <span
                                      className={`font-medium ${
                                        input.currentVaultApyPercentage >= 0 ? "text-green-600" : "text-red-600"
                                      }`}
                                    >
                                      {formatBalance(input.currentVaultApyPercentage)}%
                                    </span>
                                  </div>
                                </div>
                              ))}

                              {order?.orderApyPercentage !== undefined && (
                                <div
                                  className="flex justify-between items-center px-3 py-2 bg-gray-50 rounded-lg shadow-sm text-sm font-medium"
                                >
                                  <span className="font-semibold text-gray-600">Total Projected APY%</span>
                                  <span
                                    className={`${
                                      order.orderApyPercentage >= 0 ? "text-green-600" : "text-red-600"
                                    }`}
                                  >{order.orderApyPercentage >= 0 ? `${formatBalance(order.orderApyPercentage)}%` : `${formatBalance(order.orderApyPercentage)}%`}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex justify-center items-center h-10 bg-gray-50 text-gray-400 font-medium text-sm rounded-lg shadow-sm">
                              N/A
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-4 text-blue-500 underline">
                              <a href={getOrderLink(order.orderHash, order.network)} target="_blank" rel="noopener noreferrer">
                                {`${order.orderHash.slice(0, 6)}...${order.orderHash.slice(-4)}`}
                              </a>
                        </td>
                      </tr>
                    ))}
                  </>
                )
              }
              
              
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
            order["network"] = network
            order["timestampAdded"] = order.timestampAdded
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
                {filteredOrders && <OrdersTable orders={filteredOrders} />}
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