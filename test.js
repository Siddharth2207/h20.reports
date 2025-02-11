const orderWithTrades = require('./test2.json')
const ethers = require('ethers')


for(let i = 0 ; i < orderWithTrades.length; i++){
    let order = orderWithTrades[i]
    order["trades"] = order.trades.sort((a, b) => parseInt(b.timestamp, 10) - parseInt(a.timestamp, 10));

    const SECONDS_IN_YEAR = 31536000; // Total seconds in a year

    for (let i = 0; i < order.inputs.length; i++) {
        let input = order.inputs[i]; // Correctly access each input

        // Filter trades that involve the current input vault
        let inputTrades = order.trades.filter(trade => {
            return (
                (trade.inputVaultBalanceChange.vault.token.address.toLowerCase() === input.token.address.toLowerCase() &&
                    trade.inputVaultBalanceChange.vault.id === input.id) ||
                (trade.outputVaultBalanceChange.vault.token.address.toLowerCase() === input.token.address.toLowerCase() &&
                    trade.outputVaultBalanceChange.vault.id === input.id)
            );
        });

        if (inputTrades.length === 0) {
            console.log(`No trades found for input ${i}`);
            continue; // Skip to next input if no trades exist
        }

        // Sort trades in ascending order of timestamp (oldest first)
        inputTrades.sort((a, b) => parseInt(a.timestamp) - parseInt(b.timestamp));

        // Find the first trade (oldest trade)
        let firstTrade = inputTrades[0];
        let firstTradeTime = parseInt(firstTrade.timestamp);

        // Define 24-hour window
        let oneDayLater = firstTradeTime + 86400; // 86400 seconds = 24 hours

        // Find the latest trade within the first 24 hours
        let firstDayLastTrade = inputTrades.find(trade => parseInt(trade.timestamp) <= oneDayLater) || firstTrade;

        // Determine starting capital (choosing balance change from the relevant trade)
        let vaultBalanceChange =
            firstDayLastTrade.inputVaultBalanceChange.vault.id === input.id &&
            firstDayLastTrade.inputVaultBalanceChange.vault.token.address.toLowerCase() === input.token.address.toLowerCase()
                ? firstDayLastTrade.inputVaultBalanceChange
                : firstDayLastTrade.outputVaultBalanceChange;

        let startingCapital = parseFloat(ethers.utils.formatUnits(vaultBalanceChange.newVaultBalance, vaultBalanceChange.vault.token.decimals));

        // Find the final trade (most recent trade)
        let lastTrade = inputTrades[inputTrades.length - 1];
        let lastTradeTime = parseInt(lastTrade.timestamp);

        // Determine final capital (choosing balance change from the relevant trade)
        let lastVaultBalanceChange =
            lastTrade.inputVaultBalanceChange.vault.id === input.id &&
            lastTrade.inputVaultBalanceChange.vault.token.address.toLowerCase() === input.token.address.toLowerCase()
                ? lastTrade.inputVaultBalanceChange
                : lastTrade.outputVaultBalanceChange;

        let finalCapital = parseFloat(ethers.utils.formatUnits(lastVaultBalanceChange.newVaultBalance, lastVaultBalanceChange.vault.token.decimals));

        console.log(`order network : `, order.network)
        console.log(`order hash : `, order.orderHash)
        console.log(`input : `, input.token.symbol)
        console.log(`finalCapital : `, finalCapital)
        console.log(`startingCapital : `, startingCapital)

        // Calculate Net Profit
        let netProfit = finalCapital - startingCapital;
        console.log(`Net Profit for input ${i}: ${netProfit}`);

        // Calculate ROI
        let roi = startingCapital > 0 ? (netProfit / startingCapital) * 100 : 0;
        console.log(`ROI for input ${i}: ${roi.toFixed(2)}%`);

        // Calculate elapsed time in seconds
        let elapsedTime = lastTradeTime - firstTradeTime;
        console.log(`Elapsed Time for input ${i}: ${elapsedTime} seconds`);

        // Calculate Annualized Time Factor
        let annualizedFactor = elapsedTime > 0 ? SECONDS_IN_YEAR / elapsedTime : 1;

        // Calculate APY using the formula (1 + ROI/Annualized Time Factor)^Annualized Time Factor - 1
        let apy = netProfit > 0 ? netProfit * annualizedFactor  : 0;
        let apyPercentage = roi > 0 ? roi * annualizedFactor  : 0;

        
        console.log(`APY for input ${i}: ${apy.toFixed(2)}`);
        console.log(`APY for input % ${i}: ${apyPercentage.toFixed(2)}%`);

        console.log(`-----------`);
    }

}

