const config = require('../config/config.json');
const TOP_SUPREME_PLAYERS = config.ranks?.topSupremePlayers || 250;

const RANKS = [
    { name: 'Bronze', minElo: 0, maxElo: 499, color: 0xCD7F32 },
    { name: 'Silver', minElo: 500, maxElo: 999, color: 0xC0C0C0 },
    { name: 'Gold', minElo: 1000, maxElo: 1499, color: 0xFFD700 },
    { name: 'Platinum', minElo: 1500, maxElo: 1999, color: 0x00BFFF },
    { name: 'Diamond', minElo: 2000, maxElo: 2499, color: 0x1E90FF },
    { name: 'Master', minElo: 2500, maxElo: 4999, color: 0x9932CC },
    { name: 'Supreme', minElo: 5000, maxElo: Infinity, color: 0xFF4500 }
];

function getRankFromElo(elo, leaderboardPosition = null) {
    if (leaderboardPosition !== null && leaderboardPosition <= TOP_SUPREME_PLAYERS) {
        return RANKS.find(rank => rank.name === 'Supreme');
    }
    return RANKS.find(rank => elo >= rank.minElo && elo <= rank.maxElo) || RANKS[0];
}

function getRankName(elo, leaderboardPosition = null) {
    const rank = getRankFromElo(elo, leaderboardPosition);
    return rank ? rank.name : 'Unranked';
}

function getRankColor(elo) {
    const rank = getRankFromElo(elo);
    return rank ? rank.color : 0x808080;
}

function getRankProgress(elo) {
    const rank = getRankFromElo(elo);
    if (!rank || rank.name === 'Supreme') return 100;
    
    const nextRank = RANKS[RANKS.indexOf(rank) + 1];
    if (!nextRank) return 100;
    
    const progress = ((elo - rank.minElo) / (nextRank.minElo - rank.minElo)) * 100;
    return Math.min(100, Math.max(0, Math.round(progress)));
}

function getLeaderboardPosition(userId, leaderboard) {
    const userIndex = leaderboard.findIndex(entry => entry.userId === userId);
    return userIndex >= 0 ? userIndex + 1 : null;
}

function isInSameRankTier(elo1, elo2, leaderboardPos1 = null, leaderboardPos2 = null) {
    try {
        const isPlayer1Top = leaderboardPos1 !== null && leaderboardPos1 <= TOP_SUPREME_PLAYERS;
        const isPlayer2Top = leaderboardPos2 !== null && leaderboardPos2 <= TOP_SUPREME_PLAYERS;
        
        console.log(`[isInSameRankTier] Player 1: pos=${leaderboardPos1}, isTop=${isPlayer1Top}`);
        console.log(`[isInSameRankTier] Player 2: pos=${leaderboardPos2}, isTop=${isPlayer2Top}`);
        
        if (isPlayer1Top && isPlayer2Top) {
            console.log('[isInSameRankTier] Both players are in top, allowing match');
            return true;
        }
        
        if (isPlayer1Top !== isPlayer2Top) {
            console.log('[isInSameRankTier] One player is top, the other is not - not matching');
            return false;
        }
        
        const rank1 = getRankFromElo(elo1);
        const rank2 = getRankFromElo(elo2);
        const sameRank = rank1.name === rank2.name;
        
        console.log(`[isInSameRankTier] Non-top players - rank1=${rank1.name}, rank2=${rank2.name}, sameRank=${sameRank}`);
        return sameRank;
    } catch (error) {
        console.error('[isInSameRankTier] Error:', error);
        return false;
    }
}

function getNextRank(currentRankName) {
    const currentIndex = RANKS.findIndex(rank => rank.name === currentRankName);
    if (currentIndex === -1 || currentIndex >= RANKS.length - 1) {
        return { name: 'MAX', minElo: Infinity };
    }
    return RANKS[currentIndex + 1];
}

module.exports = {
    RANKS,
    getRankFromElo,
    getRankName,
    getRankColor,
    getRankProgress,
    getLeaderboardPosition,
    isInSameRankTier,
    getNextRank
};
