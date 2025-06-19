const db = require('./database');

class MatchUtils {
    constructor(activeMatches, userToMatchMap) {
        this.activeMatches = activeMatches;
        this.userToMatch = userToMatchMap || new Map();
    }

    getMatch(userId) {
        const matchId = this.userToMatch.get(userId);
        if (!matchId) return null;

        const match = this.activeMatches.get(matchId);
        if (!match) {
            this.userToMatch.delete(userId);
            return null;
        }

        return match;
    }
    
    addMatch(match) {
        this.activeMatches.set(match.id, match);
        match.players.forEach(player => {
            this.userToMatch.set(player.userId, match.id);
        });
    }
    
    removeMatch(matchId) {
        const match = this.activeMatches.get(matchId);
        if (match) {
            match.players.forEach(player => {
                this.userToMatch.delete(player.userId);
            });
            this.activeMatches.delete(matchId);
        }
    }

}

module.exports = MatchUtils;
