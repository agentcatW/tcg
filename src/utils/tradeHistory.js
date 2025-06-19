const fs = require('fs');
const path = require('path');

const TRADE_HISTORY_FILE = path.join(__dirname, '../../data/trade_history.json');

const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(TRADE_HISTORY_FILE)) {
    fs.writeFileSync(TRADE_HISTORY_FILE, JSON.stringify([], null, 2));
}

function logTrade(tradeData) {
    try {
        const history = getTradeHistory();
        history.push({
            tradeId: tradeData.tradeId,
            timestamp: new Date().toISOString(),
            participants: {
                user1: {
                    id: tradeData.user1.id,
                    username: tradeData.user1.username,
                    card: tradeData.user1.card,
                    payment: tradeData.user1.payment || 0
                },
                user2: {
                    id: tradeData.user2.id,
                    username: tradeData.user2.username,
                    card: tradeData.user2.card,
                    payment: tradeData.user2.payment || 0
                }
            },
            totalValue: tradeData.totalValue
        });
        
        const recentTrades = history.slice(-1000);
        fs.writeFileSync(TRADE_HISTORY_FILE, JSON.stringify(recentTrades, null, 2));
        return true;
    } catch (error) {
        console.error('Error logging trade:', error);
        return false;
    }
}

function getTradeHistory() {
    try {
        const data = fs.readFileSync(TRADE_HISTORY_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading trade history:', error);
        return [];
    }
}

function getTradeById(tradeId) {
    const history = getTradeHistory();
    return history.find(trade => trade.tradeId === tradeId);
}

function getUserTradeHistory(userId) {
    const history = getTradeHistory();
    return history.filter(trade => 
        trade.participants.user1.id === userId || 
        trade.participants.user2.id === userId
    );
}

module.exports = {
    logTrade,
    getTradeHistory,
    getTradeById,
    getUserTradeHistory
};
