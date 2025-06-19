const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const path = require('path');
const db = require('./database');
const { getImageBuffer } = require('./imageCache');
const { getTeamById } = require('./teamUtils');
const playerStatsDisplay = require('./playerStatsDisplay');
const {
    RANKS,
    getRankFromElo,
    getRankName,
    getRankColor,
    getRankProgress,
    getLeaderboardPosition,
    isInSameRankTier
} = require('./rankUtils');

const BASE_ELO = 100;
const ELO_WIN = 25;
const ELO_LOSS = -15;
const BATTLE_DELAY = 2000;
const LEADERBOARD_TOP = 250;

class ArenaMatchmaker {
    constructor() {
        this.queue = new Map();
        this.activeMatches = new Map();
        this.userToMatch = new Map();
        this.client = null;
    }
    
    setClient(client) {
        this.client = client;
    }
    
    initializeCard(card) {
        return {
            ...card,
            currentHp: card.stats.hp,
            defeated: false,
            originalStats: { ...card.stats }
        };
    }
    
    applyBuff(card, stat, value) {
        if (!card.originalStats) {
            card.originalStats = { ...card.stats };
        }
        
        card.stats[stat] = (card.originalStats[stat] || 0) + value;
        
        if (stat === 'hp') {
            card.currentHp = Math.min(card.currentHp, card.stats.hp);
        }
    }
    
    applyPlaystyleBuffs(team) {
        let buffCount = 0;
        
        team.forEach((card, idx) => {
            if (!card.playstyle) return;
            
            const isLastPosition = idx === team.length - 1;
            let buffApplied = false;
            
            switch(card.playstyle) {
                case 'LEADER':
                    team.forEach(ally => {
                        ally.stats.strength = (ally.stats.strength || 0) + 5;
                    });
                    buffApplied = true;
                    console.log(`${card.name}'s Leader ability: +5 Strength to all allies`);
                    break;
                    
                case 'VIP':
                    team.forEach(ally => {
                        ally.stats.speed = (ally.stats.speed || 0) + 5;
                    });
                    buffApplied = true;
                    console.log(`${card.name}'s VIP ability: +5 Speed to all allies`);
                    break;
                    
                case 'TACTIC':
                    team.forEach(ally => {
                        ally.stats.defense = (ally.stats.defense || 0) + 5;
                    });
                    buffApplied = true;
                    console.log(`${card.name}'s Tactic ability: +5 Defense to all allies`);
                    break;
                    
                case 'SPIRIT':
                    team.forEach(ally => {
                        const maxHpIncrease = 20;
                        ally.originalStats = ally.originalStats || { ...ally.stats };
                        ally.stats.hp = (ally.originalStats.hp || 0) + maxHpIncrease;
                        ally.currentHp += maxHpIncrease;
                    });
                    buffApplied = true;
                    console.log(`${card.name}'s Spirit ability: +20 HP to all allies`);
                    break;
                    
                case 'LONER':
                    if (isLastPosition) {
                        card.stats.strength = (card.stats.strength || 0) + 5;
                        buffApplied = true;
                        console.log(`${card.name}'s Loner ability: +5 Strength (last position)`);
                    }
                    break;
            }
            
            if (buffApplied) buffCount++;
        });
        
        return buffCount;
    }

    async joinQueue(userId, teamId) {
        if (this.queue.has(userId) || this.userToMatch.has(userId)) {
            return { success: false, message: 'You are already in queue or in a match!' };
        }

        const userData = db.getUser(userId);
        if (!userData) {
            return { success: false, message: 'User not found.' };
        }

        const team = getTeamById(teamId);
        if (!team) {
            return { success: false, message: 'Team not found.' };
        }

        if (team.owner !== userId) {
            return { success: false, message: 'This is not your team.' };
        }

        const userCards = db.getUserCards(userId);
        const teamCards = [];

        for (let i = 1; i <= 4; i++) {
            const slot = team[`slot${i}`];
            if (!slot) {
                return { success: false, message: `Slot ${i} is empty.` };
            }
            
            const card = userCards.find(c => c.id === slot.id);
            if (!card) {
                return { success: false, message: `Card in slot ${i} not found in your collection.` };
            }
            
            const battleCard = {
                ...card,
                name: card.name || slot.name || 'Unknown Card',
                stats: {
                    hp: card.stats?.hp || slot.stats?.hp || 100,
                    strength: card.stats?.strength || slot.stats?.strength || 50,
                    defense: card.stats?.defense || slot.stats?.defense || 50,
                    speed: card.stats?.speed || slot.stats?.speed || 50
                },
                image: card.image || slot.image || slot.imagePath,
                imagePath: card.imagePath || slot.imagePath || slot.image,
                playstyle: card.playstyle || slot.playstyle,
                rarity: card.rarity || slot.rarity
            };
            
            teamCards.push(battleCard);
        }

        const elo = userData.elo || BASE_ELO;
        
        this.queue.set(userId, {
            teamId,
            elo,
            username: userData.username,
            team: teamCards
        });

        return { 
            success: true, 
            inQueue: true, 
            position: Array.from(this.queue.keys()).indexOf(userId) + 1,
            elo: elo
        };
    }

    async tryFindMatch(userId) {
        const player1Data = this.queue.get(userId);
        if (!player1Data) return { success: false, message: 'Not in queue.' };

        const leaderboard = db.getLeaderboard() || [];
        const player1LeaderboardPos = leaderboard.findIndex(entry => entry.userId === userId) + 1;
        const isPlayer1Top250 = player1LeaderboardPos > 0 && player1LeaderboardPos <= LEADERBOARD_TOP;

        console.log(`[Matchmaking] Player ${userId} leaderboard position: ${player1LeaderboardPos}, isTop250: ${isPlayer1Top250}`);

        let bestMatch = null;
        let smallestDiff = Infinity;
        let bestRankMatch = null;
        let smallestRankDiff = Infinity;

        let matchCandidate = null;

        if (isPlayer1Top250) {
            for (const [otherUserId, otherData] of this.queue.entries()) {
                if (otherUserId === userId) continue;
                
                const otherLeaderboardPos = leaderboard.findIndex(entry => entry.userId === otherUserId) + 1;
                const isOtherTop250 = otherLeaderboardPos > 0 && otherLeaderboardPos <= LEADERBOARD_TOP;
                
                if (isOtherTop250) {
                    const eloDiff = Math.abs(player1Data.elo - otherData.elo);
                    console.log(`[Matchmaking] Found top 250 opponent: ${otherUserId} at position ${otherLeaderboardPos} (ELO diff: ${eloDiff})`);
                    if (eloDiff < smallestRankDiff) {
                        bestRankMatch = { userId: otherUserId, ...otherData, leaderboardPos: otherLeaderboardPos };
                        smallestRankDiff = eloDiff;
                    }
                }
            }
            
            if (bestRankMatch) {
                console.log(`[Matchmaking] Found top 250 match for ${userId} with ${bestRankMatch.userId}`);
                matchCandidate = bestRankMatch;
            }
        }
        
        if (!matchCandidate) {
            for (const [otherUserId, otherData] of this.queue.entries()) {
                if (otherUserId === userId) continue;
                
                const eloDiff = Math.abs(player1Data.elo - otherData.elo);
                const otherLeaderboardPos = leaderboard.findIndex(entry => entry.userId === otherUserId) + 1;
                const isOtherTop250 = otherLeaderboardPos > 0 && otherLeaderboardPos <= LEADERBOARD_TOP;
                
                if (isPlayer1Top250 || isOtherTop250) continue;
                
                const isSameRankTier = isInSameRankTier(
                    player1Data.elo, 
                    otherData.elo, 
                    null, 
                    null
                );
                
                if (isSameRankTier && eloDiff < smallestDiff) {
                    bestMatch = { userId: otherUserId, ...otherData };
                    smallestDiff = eloDiff;
                }
            }
            matchCandidate = bestMatch;
        }
            
        if (matchCandidate) {
            const matchId = `match_${Date.now()}`;
            const player1Elo = player1Data.elo;
            const player2Elo = matchCandidate.elo;
            const opponentId = matchCandidate.userId;
            const isOpponentTop250 = leaderboard.findIndex(entry => entry.userId === opponentId) < LEADERBOARD_TOP;
            
            console.log(`[Matchmaking] Found match: ${userId} (${isPlayer1Top250 ? 'Top 250' : 'Regular'}) vs ${opponentId} (${isOpponentTop250 ? 'Top 250' : 'Regular'})`);

            const player1Username = player1Data.username || (await this.getUsernameFromId(userId)) || `Player ${userId.substring(0, 4)}`;
            const player2Username = matchCandidate.username || (await this.getUsernameFromId(opponentId)) || `Player ${opponentId.substring(0, 4)}`;

            console.log(`[Matchmaking] Creating match between ${player1Username} and ${player2Username}`);

            const match = {
                id: matchId,
                players: [
                    { 
                        userId, 
                        team: player1Data.team, 
                        elo: player1Elo, 
                        health: 4,
                        username: player1Username,
                        isTop250: isPlayer1Top250
                    },
                    { 
                        userId: opponentId, 
                        team: matchCandidate.team, 
                        elo: player2Elo, 
                        health: 4,
                        username: player2Username,
                        isTop250: isOpponentTop250
                    }
                ],
                currentRound: 0,
                log: []
            };

            this.addMatch(match);

            this.queue.delete(userId);
            this.queue.delete(opponentId);

            console.log(`[Matchmaking] Starting battle ${matchId} between ${player1Username} and ${player2Username}`);
            this.processBattle(matchId);

            return { 
                success: true, 
                inQueue: false, 
                matchId,
                opponentId,
                elo: player1Elo
            };
        } else {
            return { 
                success: true, 
                inQueue: true, 
                position: Array.from(this.queue.keys()).indexOf(userId) + 1,
                elo: player1Data.elo
            };
        }
    }

    getMatch(userId) {
        const matchId = this.userToMatch.get(userId);
        if (!matchId) return null;
        return this.activeMatches.get(matchId);
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

    async processBattle(matchId) {
        const match = this.activeMatches.get(matchId);
        if (!match) return { success: false, message: 'Match not found.' };

        const player1 = match.players[0];
        const player2 = match.players[1];
        const logs = [];

        player1.team = player1.team.map(card => this.initializeCard(card));
        player2.team = player2.team.map(card => this.initializeCard(card));
        
        const player1Buffs = this.applyPlaystyleBuffs(player1.team);
        const player2Buffs = this.applyPlaystyleBuffs(player2.team);
        
        if (player1Buffs) {
            console.log(`Applied ${player1Buffs} buff(s) to ${player1.username}'s team`);
        }
        if (player2Buffs) {
            console.log(`Applied ${player2Buffs} buff(s) to ${player2.username}'s team`);
        }
        
        player1.remainingCards = player1.team.length;
        player2.remainingCards = player2.team.length;
        player1.cardsDefeated = 0;
        player2.cardsDefeated = 0;
        player1.damageDealt = 0;
        player2.damageDealt = 0;

        while (true) {
            for (let slot = 0; slot < 4; slot++) {
                match.currentRound = slot;
                const player1Card = player1.team[slot];
                const player2Card = player2.team[slot];
                
                if (player1Card.currentHp <= 0 && player2Card.currentHp <= 0) {
                    continue;
                }
                
                const player1CanAttack = player1Card.currentHp > 0;
                const player2CanAttack = player2Card.currentHp > 0;
                
                let firstAttacker, firstDefender, secondAttacker, secondDefender;
                
                if (player1CanAttack && player2CanAttack) {
                    if (player1Card.stats.speed >= player2Card.stats.speed) {
                        firstAttacker = player1;
                        firstDefender = player2;
                        secondAttacker = player2;
                        secondDefender = player1;
                    } else {
                        firstAttacker = player2;
                        firstDefender = player1;
                        secondAttacker = player1;
                        secondDefender = player2;
                    }
                } else if (player1CanAttack) {
                    firstAttacker = player1;
                    firstDefender = player2;
                    secondAttacker = null;
                } else if (player2CanAttack) {
                    firstAttacker = player2;
                    firstDefender = player1;
                    secondAttacker = null;
                } else {
                    continue; 
                }
                
                const firstAttackerCard = firstAttacker.team[slot];
                let firstDefenderCard = firstDefender.team[slot];
                
                if (!firstDefenderCard || firstDefenderCard.currentHp <= 0) {
                    const aliveDefenders = firstDefender.team
                        .filter(card => card && card.currentHp > 0);
                    
                    if (aliveDefenders.length === 0) {
                        match.winner = firstAttacker.userId;
                        match.loser = firstDefender.userId;
                        break;
                    }
                    
                    firstDefenderCard = aliveDefenders[Math.floor(Math.random() * aliveDefenders.length)];
                }
                
                const damage1 = Math.max(1, (firstAttackerCard.stats.strength * 2) - firstDefenderCard.stats.defense);
                firstDefenderCard.currentHp = Math.max(0, firstDefenderCard.currentHp - damage1);
                firstAttacker.damageDealt += damage1;
                
                logs.push({
                    type: 'attack',
                    round: slot + 1,
                    attacker: firstAttacker.userId,
                    defender: firstDefender.userId,
                    damage: damage1,
                    attackerHealth: firstAttacker.health,
                    defenderHealth: firstDefender.health,
                    attackerCardHp: firstAttackerCard.currentHp,
                    defenderCardHp: firstDefenderCard.currentHp
                });
                
                const commandName = match.isFriendly ? 'friendly' : 'arena';
                const command = this.client.commands.get(commandName);
                if (command && command.updateBattleDisplay) {
                    match.currentRound = slot;
                    await command.updateBattleDisplay(match, this.client);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                
                if (firstDefenderCard.currentHp <= 0 && !firstDefenderCard.defeated) {
                    firstDefenderCard.defeated = true;
                    firstDefender.remainingCards--;
                    firstAttacker.cardsDefeated++;
                    
                    if (firstDefender.remainingCards <= 0) {
                        match.winner = firstAttacker.userId;
                        match.loser = firstDefender.userId;
                        break;
                    }
                }
                
                if (secondAttacker && secondAttacker.team[slot]?.currentHp > 0) {
                    const secondAttackerCard = secondAttacker.team[slot];
                    let secondDefenderCard = secondDefender.team[slot];
                    
                    if (!secondDefenderCard || secondDefenderCard.currentHp <= 0) {
                        const secondAliveDefenders = secondDefender.team
                            .filter(card => card && card.currentHp > 0);
                        
                        if (secondAliveDefenders.length === 0) {
                            match.winner = secondAttacker.userId;
                            match.loser = secondDefender.userId;
                            break;
                        }
                        
                        secondDefenderCard = secondAliveDefenders[Math.floor(Math.random() * secondAliveDefenders.length)];
                    }
                    
                    const damage2 = Math.max(1, (secondAttackerCard.stats.strength * 2) - secondDefenderCard.stats.defense);
                    secondDefenderCard.currentHp = Math.max(0, secondDefenderCard.currentHp - damage2);
                    secondAttacker.damageDealt += damage2;
                    
                    logs.push({
                        type: 'attack',
                        round: slot + 1,
                        attacker: secondAttacker.userId,
                        defender: secondDefender.userId,
                        damage: damage2,
                        attackerHealth: secondAttacker.health,
                        defenderHealth: secondDefender.health,
                        attackerCardHp: secondAttackerCard.currentHp,
                        defenderCardHp: secondDefenderCard.currentHp
                    });
                    
                    const commandName = match.isFriendly ? 'friendly' : 'arena';
                    const command = this.client.commands.get(commandName);
                    if (command && command.updateBattleDisplay) {
                        match.currentRound = slot;
                        await command.updateBattleDisplay(match, this.client);
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                    
                    if (secondDefenderCard.currentHp <= 0 && !secondDefenderCard.defeated) {
                        secondDefenderCard.defeated = true;
                        secondDefender.remainingCards--;
                        secondAttacker.cardsDefeated++;
                        
                        if (secondDefender.remainingCards <= 0) {
                            match.winner = secondAttacker.userId;
                            match.loser = secondDefender.userId;
                            break;
                        }
                    }
                }
                
                if (match.winner) break;
            }
            
            if (match.winner) {
                const winner = match.players.find(p => p.userId === match.winner);
                const loser = match.players.find(p => p.userId === match.loser);
                
                if (match.isFriendly) {
                    match.stats = {
                        winner: {
                            eloChange: 0,
                            cardsDefeated: winner.cardsDefeated,
                            damageDealt: winner.damageDealt
                        },
                        loser: {
                            eloChange: 0,
                            cardsDefeated: loser.cardsDefeated,
                            damageDealt: loser.damageDealt
                        }
                    };
                } else {
                    const eloResult = await this.calculateElo(winner, loser);
                    match.winnerElo = eloResult.winnerNewElo;
                    match.loserElo = eloResult.loserNewElo;
                    
                    match.stats = {
                        winner: {
                            eloChange: eloResult.winnerNewElo - winner.elo,
                            cardsDefeated: winner.cardsDefeated,
                            damageDealt: winner.damageDealt
                        },
                        loser: {
                            eloChange: eloResult.loserNewElo - loser.elo,
                            cardsDefeated: loser.cardsDefeated,
                            damageDealt: loser.damageDealt
                        }
                    };
                    
                    const winnerUser = db.getUser(winner.userId);
                    const loserUser = db.getUser(loser.userId);
                    
                    winnerUser.elo = eloResult.winnerNewElo;
                    winnerUser.wins = (winnerUser.wins || 0) + 1;
                    winnerUser.cardsDefeated = (winnerUser.cardsDefeated || 0) + winner.cardsDefeated;
                    winnerUser.damageDealt = (winnerUser.damageDealt || 0) + winner.damageDealt;
                    
                    loserUser.elo = eloResult.loserNewElo;
                    loserUser.losses = (loserUser.losses || 0) + 1;
                    loserUser.cardsDefeated = (loserUser.cardsDefeated || 0) + loser.cardsDefeated;
                    loserUser.damageDealt = (loserUser.damageDealt || 0) + loser.damageDealt;
                }
                
                db.saveUsers();
                
                const commandName = match.isFriendly ? 'friendly' : 'arena';
                const command = this.client.commands.get(commandName);
                
                if (command && command.updateBattleDisplay) {
                    await command.updateBattleDisplay(match, this.client);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                
                this.cleanupMatch(matchId);
                
                return {
                    success: true,
                    gameOver: true,
                    winner: match.winner,
                    loser: match.loser,
                    winnerElo: match.winnerElo,
                    loserElo: match.loserElo,
                    log: logs
                };
            }
            
            if (logs.length > 100) {
                console.warn('Battle exceeded maximum rounds, ending in a draw');
                return {
                    success: false,
                    gameOver: true,
                    message: 'Battle ended in a draw due to exceeding maximum rounds.'
                };
            }
        }
    }

    async processAttack(attacker, defender, round, logs, matchId) {
        const match = this.activeMatches.get(matchId);
        if (!match) return;
        
        const attackerCard = attacker.team[round];
        
        if (attackerCard.currentHp <= 0) {
            return null;
        }
        
        const aliveDefenders = defender.team
            .map((card, index) => ({ card, index }))
            .filter(({ card }) => card && card.currentHp > 0);
        
        if (aliveDefenders.length === 0) {
            return null;
        }
        
        const randomTarget = aliveDefenders[Math.floor(Math.random() * aliveDefenders.length)];
        const targetIndex = randomTarget.index;
        const defenderCard = randomTarget.card;
        
        const damage = Math.max(1, (attackerCard.stats.strength * 2) - defenderCard.stats.defense);
        const previousHp = defenderCard.currentHp;
        defenderCard.currentHp = Math.max(0, (defenderCard.currentHp || defenderCard.stats.hp) - damage);
        
        const logEntry = {
            attacker: attacker.userId,
            defender: defender.userId,
            attackerCard: attackerCard.name,
            defenderCard: defenderCard.name,
            damage,
            round: round + 1,
            attackerHealth: attacker.health,
            defenderHealth: defender.health,
            attackerCardHp: attackerCard.currentHp,
            defenderCardHp: defenderCard.currentHp,
            targetDefeated: previousHp > 0 && defenderCard.currentHp <= 0
        };

        logs.push(logEntry);

        if (defenderCard.currentHp <= 0) {
            const remainingAliveDefenders = defender.team
                .map((card, idx) => ({ card, index: idx }))
                .filter(({ card }, idx) => card && card.currentHp > 0 && idx !== targetIndex);
            
            if (remainingAliveDefenders.length > 0) {
                const nextTarget = remainingAliveDefenders[Math.floor(Math.random() * remainingAliveDefenders.length)];
                const nextDefenderCard = nextTarget.card;
                const nextTargetIndex = nextTarget.index;
                const nextDamage = Math.max(1, (attackerCard.stats.strength * 2) - nextDefenderCard.stats.defense);
                nextDefenderCard.currentHp = Math.max(0, (nextDefenderCard.currentHp || nextDefenderCard.stats.hp) - nextDamage);
                
                const nextLogEntry = {
                    attacker: attacker.userId,
                    defender: defender.userId,
                    attackerCard: attackerCard.name,
                    defenderCard: nextDefenderCard.name,
                    damage: nextDamage,
                    round: round + 1,
                    attackerHealth: attacker.health,
                    defenderHealth: defender.health,
                    attackerCardHp: attackerCard.currentHp,
                    defenderCardHp: nextDefenderCard.currentHp,
                    isAdditionalAttack: true
                };
                
                logs.push(nextLogEntry);
                
                if (nextDefenderCard.currentHp <= 0) {
                    const hasCardsLeft = defender.team.some(card => 
                        card && card.currentHp > 0
                    );
                    
                    if (!hasCardsLeft) {
                        defender.health--;
                        
                        if (defender.health <= 0) {
                            match.winner = attacker.userId;
                            match.loser = defender.userId;
                        }
                    }
                }
            } else {
                const hasCardsLeft = defender.team.some((card, idx) => 
                    card && card.currentHp > 0
                );
                
                if (!hasCardsLeft) {
                    defender.health--;
                    
                    if (defender.health <= 0) {
                        match.winner = attacker.userId;
                        match.loser = defender.userId;
                    }
                }
            }
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        await new Promise(resolve => setTimeout(resolve, BATTLE_DELAY));
        
        return logEntry;
    }

    async calculateElo(winner, loser) {
        const winnerElo = winner.elo || BASE_ELO;
        const loserElo = loser.elo || BASE_ELO;
        
        const winnerNewElo = Math.max(0, winnerElo + ELO_WIN);
        const loserNewElo = Math.max(0, loserElo + ELO_LOSS);
        
        return {
            winnerNewElo,
            loserNewElo
        };
    }

    isTeamDefeated(team) {
        return team.every(card => !card || card.currentHp <= 0);
    }

    cleanupMatch(matchId) {
        this.removeMatch(matchId);
    }
    
    drawRankBadge(ctx, rank, x, y, isLeft) {
        const rankColors = {
            'Bronze': '#CD7F32',
            'Silver': '#C0C0C0',
            'Gold': '#FFD700',
            'Platinum': '#00BFFF',
            'Diamond': '#1E90FF',
            'Master': '#9932CC',
            'Supreme': '#FF4500'
        };
        
        const width = 200;
        const height = 60;
        const borderRadius = 10;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.drawRoundedRect(ctx, x, y, width, height, borderRadius);
        
        ctx.fillStyle = rankColors[rank.name] || '#808080';
        ctx.fillRect(x, y, 10, height);
        
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(rank.name, x + width/2, y + 35);
        
        ctx.beginPath();
        ctx.arc(x + 30, y + 30, 20, 0, Math.PI * 2);
        ctx.fillStyle = rankColors[rank.name] || '#808080';
        ctx.fill();
        
        ctx.textAlign = 'left';
    }

    async renderMatch(match, client) {
        const canvas = createCanvas(1200, 1000);
        const ctx = canvas.getContext('2d');

        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, '#0f0c29');
        gradient.addColorStop(1, '#302b63');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.shadowColor = 'rgba(138, 43, 226, 0.5)';
        ctx.shadowBlur = 20;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 3;
        ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
        ctx.shadowBlur = 0;

        const isMatchOver = match.winner || match.loser;
        
        if (isMatchOver) {
            const winner = match.players.find(p => p.userId === match.winner);
            const loser = match.players.find(p => p.userId === match.loser);
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            this.drawRoundedRect(ctx, 100, 100, canvas.width - 200, 150, 15);
            ctx.fill();
            
            ctx.fillStyle = '#4CAF50';
            ctx.font = 'bold 36px "Segoe UI", Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('VICTORY', canvas.width / 2, 170);
            
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 28px "Segoe UI", Arial, sans-serif';
            ctx.fillText(winner.username, canvas.width / 2, 215);
            
            const statsY = 300;
            const statsWidth = 1000;
            const statsHeight = 400;
            const statsX = (canvas.width - statsWidth) / 2;
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.drawRoundedRect(ctx, statsX, statsY, statsWidth, statsHeight, 20);
            ctx.fill();
            
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.lineWidth = 2;
            this.drawRoundedRect(ctx, statsX, statsY, statsWidth, statsHeight, 20);
            ctx.stroke();
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.font = 'bold 28px "Segoe UI", Arial, sans-serif';
            ctx.textAlign = 'center';
            
            const titleY = statsY + 50;
            const lineWidth = 100;
            const gap = 20;
            
            ctx.beginPath();
            ctx.moveTo(statsX + (statsWidth / 2) - lineWidth - gap, titleY);
            ctx.lineTo(statsX + (statsWidth / 2) - gap, titleY);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(statsX + (statsWidth / 2) + gap, titleY);
            ctx.lineTo(statsX + (statsWidth / 2) + lineWidth + gap, titleY);
            ctx.stroke();
            
            ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
            ctx.shadowBlur = 10;
            ctx.fillText('BATTLE STATS', canvas.width / 2, titleY + 5);
            ctx.shadowBlur = 0;
            
            const drawPlayerStats = (player, stats, x, y, isWinner) => {
                const nameY = y + 20;
                const nameWidth = 350;
                const nameHeight = 60;
                const statBoxPadding = 20;
                
                const nameGradient = ctx.createLinearGradient(x, nameY - 30, x, nameY + nameHeight - 30);
                nameGradient.addColorStop(0, isWinner ? 'rgba(76, 175, 80, 0.15)' : 'rgba(244, 67, 54, 0.15)');
                nameGradient.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
                
                ctx.fillStyle = nameGradient;
                this.drawRoundedRect(ctx, x, nameY - 30, nameWidth, nameHeight + 10, 12);
                ctx.fill();
                
                ctx.strokeStyle = isWinner ? 'rgba(76, 175, 80, 0.6)' : 'rgba(244, 67, 54, 0.6)';
                ctx.lineWidth = 2;
                this.drawRoundedRect(ctx, x, nameY - 30, nameWidth, nameHeight + 10, 12);
                ctx.stroke();
                
                ctx.fillStyle = isWinner ? '#4CAF50' : '#f44336';
                ctx.font = 'bold 24px "Segoe UI", Arial, sans-serif';
                ctx.textAlign = 'center';
                
                ctx.shadowColor = isWinner ? 'rgba(76, 175, 80, 0.7)' : 'rgba(244, 67, 54, 0.7)';
                ctx.shadowBlur = 10;
                ctx.fillText(player.username, x + (nameWidth / 2), nameY + 5);
                
                ctx.shadowBlur = 0;
                
                const eloChangeValue = isWinner ? 
                    match.winnerElo - (stats.elo || 100) : 
                    match.loserElo - (stats.elo || 100);
                const eloText = `${isWinner ? match.winnerElo : match.loserElo} ELO `;
                const changeText = `(${eloChangeValue >= 0 ? '+' : ''}${eloChangeValue})`;
                
                ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
                ctx.fillStyle = '#ffffff';
                const eloX = x + (nameWidth / 2);
                const eloY = nameY + 30;
                
                ctx.fillText(eloText, eloX - ctx.measureText(changeText).width/2, eloY);
                
                ctx.fillStyle = eloChangeValue >= 0 ? '#4CAF50' : '#f44336';
                ctx.fillText(changeText, 
                    eloX + ctx.measureText(eloText).width - ctx.measureText(changeText).width/2, 
                    eloY);
                
                const statBoxY = nameY + 50;
                const statBoxHeight = 150;
                const statItemHeight = 40;
                
                const statGradient = ctx.createLinearGradient(x, statBoxY, x, statBoxY + statBoxHeight);
                statGradient.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
                statGradient.addColorStop(1, 'rgba(255, 255, 255, 0.01)');
                
                ctx.fillStyle = statGradient;
                this.drawRoundedRect(ctx, x, statBoxY, nameWidth, statBoxHeight, 12);
                ctx.fill();
                
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
                ctx.lineWidth = 1;
                this.drawRoundedRect(ctx, x, statBoxY, nameWidth, statBoxHeight, 12);
                ctx.stroke();
                
                ctx.textAlign = 'left';
                ctx.fillStyle = '#ffffff';
                ctx.font = '18px "Segoe UI", Arial, sans-serif';
                
                const drawStatItem = (label, value, icon, yPos, color = '#ffffff') => {
                    ctx.fillStyle = '#bbbbbb';
                    ctx.font = '14px "Segoe UI", Arial, sans-serif';
                    ctx.fillText(label, x + 15, yPos - 5);
                    
                    ctx.fillStyle = color;
                    ctx.font = '18px "Segoe UI", Arial, sans-serif';
                    const iconX = x + 15;
                    const valueX = iconX + 30;
                    
                    if (icon) {
                        ctx.font = '20px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
                        ctx.fillText(icon, iconX, yPos + 18);
                    }
                    
                    ctx.font = '18px "Segoe UI", Arial, sans-serif';
                    ctx.fillText(value.toString(), valueX, yPos + 18);
                };
                
                drawStatItem('CARDS DEFEATED', stats.cardsDefeated || 0, '💥', statBoxY + 30, '#ff9800');
                
                drawStatItem('DAMAGE DEALT', stats.damageDealt || 0, '⚔️', statBoxY + 75, '#f44336');
                
                const eloChange = isWinner ? stats.eloChange : -Math.abs(stats.eloChange || 0);
                if (eloChange !== 0) {
                    drawStatItem('ELO CHANGE', 
                               (eloChange > 0 ? '+' : '') + eloChange, 
                               eloChange > 0 ? '📈' : '📉', 
                               statBoxY + 120, 
                               eloChange > 0 ? '#4CAF50' : '#f44336');
                }
            };
            
            drawPlayerStats(winner, match.stats.winner, statsX + 100, statsY + 100, true);
            
            drawPlayerStats(loser, match.stats.loser, statsX + 600, statsY + 100, false);
            
            return new AttachmentBuilder(canvas.toBuffer(), { name: 'battle_results.png' });
        }
        
        ctx.beginPath();
        ctx.moveTo(canvas.width / 2, 100);
        ctx.lineTo(canvas.width / 2, canvas.height - 50);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.setLineDash([10, 10]);
        ctx.shadowColor = 'rgba(138, 43, 226, 0.3)';
        ctx.shadowBlur = 15;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;

        const player1 = match.players[0];
        const player2 = match.players[1];

        this.drawPlayerPanel(ctx, player1, 30, 30, canvas.width / 2 - 50, 60, true);
        this.drawPlayerPanel(ctx, player2, canvas.width / 2 + 20, 30, canvas.width / 2 - 50, 60, false);

        const cardGridHeight = 350;  
        const cardGridY = 150;
        const cardGridWidth = canvas.width / 2 - 40;
        
        await this.drawCardGrid(
            ctx, 
            player1.team || [], 
            30, 
            cardGridY, 
            cardGridWidth, 
            cardGridHeight, 
            true
        );
        
        await this.drawCardGrid(
            ctx, 
            player2.team || [], 
            canvas.width / 2 + 10, 
            cardGridY, 
            cardGridWidth, 
            cardGridHeight, 
            false
        );

        const statsY = 520;
        const statsHeight = 350;
        playerStatsDisplay.drawPlayerStatsSection(ctx, match, 30, statsY, canvas.width - 60, statsHeight);

        this.drawRoundIndicator(ctx, match.currentRound + 1, canvas.width / 2, 100);

        return new AttachmentBuilder(canvas.toBuffer(), { name: 'battle.png' });
    }

    async getUsernameFromId(userId) {
        try {
            const user = await db.getUser(userId);
            if (user && user.username) return user.username;
            
            if (this.client) {
                const discordUser = await this.client.users.fetch(userId).catch(() => null);
                if (discordUser) return discordUser.username;
            }
            
            return null;
        } catch (error) {
            console.error('Error getting username:', error);
            return null;
        }
    }

    drawRoundedRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    drawRoundIndicator(ctx, currentRound, totalRounds, x, y, width, height) {
        const centerX = x + (width / 2);
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.drawRoundedRect(ctx, x, y, width, height, 20);
        ctx.fill();
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;
        this.drawRoundedRect(ctx, x, y, width, height, 20);
        ctx.stroke();
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        ctx.shadowColor = '#4a90e2';
        ctx.shadowBlur = 10;
        
        const roundText = `ROUND ${currentRound}/${totalRounds}`;
        ctx.fillText(roundText, centerX, y + (height / 2));
        
        ctx.shadowBlur = 0;
        
        const dotRadius = 4;
        const dotY = y + (height / 2);
        
        ctx.fillStyle = '#4a90e2';
        ctx.beginPath();
        ctx.arc(centerX - 80, dotY, dotRadius, 0, Math.PI * 2);
        ctx.arc(centerX - 100, dotY, dotRadius, 0, Math.PI * 2);
        ctx.arc(centerX - 120, dotY, dotRadius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(centerX + 80, dotY, dotRadius, 0, Math.PI * 2);
        ctx.arc(centerX + 100, dotY, dotRadius, 0, Math.PI * 2);
        ctx.arc(centerX + 120, dotY, dotRadius, 0, Math.PI * 2);
        ctx.fill();
    }

    drawBattleLog(ctx, logEntries, x, y, width, height) {
        if (!logEntries || !Array.isArray(logEntries) || logEntries.length === 0) {
            logEntries = [{ 
                text: 'The battle begins!',
                type: 'info'
            }];
        }
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.drawRoundedRect(ctx, x, y, width, height, 10);
        ctx.fill();
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1.5;
        this.drawRoundedRect(ctx, x, y, width, height, 10);
        ctx.stroke();
        
        ctx.fillStyle = 'rgba(255, 107, 107, 0.2)';
        this.drawRoundedRect(ctx, x, y, width, 40, 10);
        ctx.fill();
        
        ctx.fillStyle = '#ffffff';
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('BATTLE LOG', x + width / 2, y + 20);
        
        ctx.shadowBlur = 0;
        
        const entryHeight = 22;
        const maxVisible = Math.max(1, Math.floor((height - 50) / entryHeight));
        const startIndex = Math.max(0, logEntries.length - maxVisible);
        const visibleEntries = logEntries.slice(startIndex);
        
        visibleEntries.forEach((entry, index) => {
            if (!entry) return;
            
            const entryY = y + 50 + (index * entryHeight);
            let text = '';
            let type = 'info';
            
            if (typeof entry === 'string') {
                text = entry;
            } else {
                text = entry.text || '';
                type = entry.type || 'info';
                
                if (type === 'damage' && entry.damage && entry.attacker && entry.defender) {
                    text = `💥 ${entry.attacker} dealt ${entry.damage} damage to ${entry.defender}!`;
                } else if (type === 'heal' && entry.heal && entry.target) {
                    text = `💚 ${entry.target} healed for ${entry.heal} HP!`;
                } else if (type === 'ability' && entry.user && entry.ability) {
                    text = `✨ ${entry.user} used ${entry.ability}!`;
                } else if (type === 'defeat' && entry.defeated) {
                    text = `💀 ${entry.defeated} was defeated!`;
                } else if (type === 'critical') {
                    text = `🔥 CRITICAL HIT! ${text}`;
                }
            }
            
            const maxWidth = width - 30;
            while (text && ctx.measureText(text).width > maxWidth && text.length > 10) {
                text = text.substring(0, text.length - 1);
            }
            
            switch(type) {
                case 'damage':
                case 'critical':
                    ctx.fillStyle = '#ff6b6b'; 
                    break;
                case 'heal':
                    ctx.fillStyle = '#69db7c'; 
                    break;
                case 'ability':
                    ctx.fillStyle = '#4dabf7'; 
                    break;
                case 'defeat':
                    ctx.fillStyle = '#ff8787'; 
                    break;
                case 'info':
                default:
                    ctx.fillStyle = '#e9ecef'; 
            }
            
            ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
            ctx.shadowBlur = 2;
            ctx.font = '14px "Segoe UI", Arial, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            
            ctx.fillText(text, x + 15, entryY);
            
            ctx.shadowBlur = 0;
        });
    }
    
    drawStatBar(ctx, label, value, maxValue, x, y, width, height, color) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        this.drawRoundedRect(ctx, x, y, width, height, height / 2);
        ctx.fill();
        
        const fillWidth = Math.max(5, (value / maxValue) * width);
        ctx.fillStyle = color;
        this.drawRoundedRect(ctx, x, y, fillWidth, height, height / 2);
        ctx.fill();
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x + 5, y + height / 2);
        
        ctx.textAlign = 'right';
        ctx.fillText(value, x + width - 5, y + height / 2);
        
        ctx.textAlign = 'left';
    }
    
    drawHpBar(ctx, currentHp, maxHp, x, y, width, height) {
        const barHeight = height * 0.8;
        const barY = y + (height - barHeight) / 2;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        this.drawRoundedRect(ctx, x, barY, width, barHeight, barHeight / 2);
        ctx.fill();
        
        const hpPercent = Math.max(0, Math.min(1, currentHp / maxHp));
        const fillWidth = Math.max(5, hpPercent * width);
        
        let hpColor;
        if (hpPercent > 0.6) {
            hpColor = '#4caf50';
        } else if (hpPercent > 0.3) {
            hpColor = '#ffc107';
        } else {
            hpColor = '#f44336';
        }
        
        ctx.fillStyle = hpColor;
        this.drawRoundedRect(ctx, x, barY, fillWidth, barHeight, barHeight / 2);
        ctx.fill();
        
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 2;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const hpText = `${Math.ceil(currentHp)}/${maxHp}`;
        ctx.fillText(hpText, x + width / 2, y + height / 2);
        
        ctx.shadowBlur = 0;
    }

    async drawCardGrid(ctx, cards, startX, startY, width, height, isPlayer1 = true) {
        const cardCount = cards.length;
        if (cardCount === 0) return;

        const padding = 20;
        const cardWidth = (width - (padding * (cardCount + 1))) / cardCount;
        const cardHeight = height - (padding * 2);

        for (let i = 0; i < cardCount; i++) {
            const card = cards[i];
            if (!card) continue;

            const x = startX + (i * (cardWidth + padding)) + padding;
            const y = startY + padding;
            const isActive = this.currentRound === i;
            
            await this.drawCard(
                ctx, 
                x, 
                y, 
                cardWidth, 
                cardHeight, 
                card, 
                isPlayer1 ? '#4CAF50' : '#F44336',
                isActive
            );
        }
    }

    drawPlayerPanel(ctx, player, x, y, width, height, isLeft) {
        const gradient = ctx.createLinearGradient(x, y, x, y + height);
        gradient.addColorStop(0, 'rgba(30, 30, 40, 0.8)');
        gradient.addColorStop(1, 'rgba(20, 20, 30, 0.9)');
        
        ctx.fillStyle = gradient;
        this.drawRoundedRect(ctx, x, y, width, height, 10);
        ctx.fill();
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        this.drawRoundedRect(ctx, x, y, width, height, 10);
        ctx.stroke();
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = isLeft ? 'left' : 'right';
        
        let displayName = player.username || 'Player';
        const maxWidth = width - 120;
        
        if (ctx.measureText(displayName).width > maxWidth) {
            while (displayName.length > 3 && ctx.measureText(displayName + '...').width > maxWidth) {
                displayName = displayName.substring(0, displayName.length - 1);
            }
            displayName += '...';
        }
        
        ctx.fillText(displayName, isLeft ? x + 15 : x + width - 15, y + 25);
        
        ctx.fillStyle = '#bbbbbb';
        ctx.font = '14px "Segoe UI", Arial, sans-serif';
        const eloText = `ELO: ${player.elo || 100}`;
        ctx.fillText(eloText, isLeft ? x + 15 : x + width - 15, y + 50);    
    }

    async drawCard(ctx, x, y, width, height, card, highlightColor = 'transparent', isActive = false) {
        if (isActive) {
            ctx.shadowColor = 'rgba(76, 175, 80, 0.8)';
            ctx.shadowBlur = 20;
        }

        const cardGradient = ctx.createLinearGradient(x, y, x, y + height);
        cardGradient.addColorStop(0, '#2a2a40');
        cardGradient.addColorStop(1, '#1a1a2e');
        
        ctx.fillStyle = cardGradient;
        this.drawRoundedRect(ctx, x, y, width, height, 15);
        ctx.fill();
        
        ctx.shadowBlur = 0;
        
        try {
            const possiblePaths = [
                card.imageUrl,
                card.imagePath,
                path.join(process.cwd(), 'public/cards', `${card.name.toLowerCase().replace(/\s+/g, '')}.png`),
                path.join(process.cwd(), 'public/cards', `${card.id}.png`),
                path.join(process.cwd(), 'src/assets/cards/default.png'),
                path.join(__dirname, `../public/cards/${card.name.toLowerCase().replace(/\s+/g, '')}.png`),
                path.join(__dirname, `../public/cards/${card.id}.png`),
                path.join(__dirname, '../assets/cards/default.png')
            ].filter(Boolean);

            let imageLoaded = false;
            
            for (const imagePath of possiblePaths) {
                try {
                    const imageBuffer = await getImageBuffer(imagePath);
                    if (imageBuffer) {
                        const img = await loadImage(imageBuffer);
                        
                        const targetAspect = 1288 / 1800;
                        
                        const availableWidth = width - 20;
                        const availableHeight = height * 0.5;
                        
                        let imgWidth, imgHeight;
                        
                        if ((availableWidth / availableHeight) > targetAspect) {
                            imgHeight = availableHeight;
                            imgWidth = imgHeight * targetAspect;
                        } else {
                            imgWidth = availableWidth;
                            imgHeight = imgWidth / targetAspect;
                        }
                        
                        const imgX = x + (width - imgWidth) / 2;
                        const imgY = y + 5;

                        ctx.save();
                        this.drawRoundedRect(ctx, imgX, imgY, imgWidth, imgHeight, 10);
                        ctx.clip();
                        
                        ctx.drawImage(img, imgX, imgY, imgWidth, imgHeight);
                        ctx.restore();
                        imageLoaded = true;
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            if (!imageLoaded) {
                throw new Error('No valid image path found');
            }
        } catch (error) {
            console.error('Error loading card image:', error);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            this.drawRoundedRect(ctx, x + 10, y + 5, width - 20, height * 0.4, 10);
            ctx.fill();
            
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            let displayName = card.name;
            const maxWidth = width - 30;
            
            while (displayName.length > 3 && ctx.measureText(displayName).width > maxWidth) {
                displayName = displayName.substring(0, displayName.length - 1);
            }
            
            ctx.fillText(displayName, x + width / 2, y + 5 + (height * 0.4) / 2);
        }

        const imageBottom = y + (height * 0.5) + 10;
        
        const nameY = imageBottom + 20;
        
        if (card.imagePath || card.imageUrl) {
            ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
            ctx.shadowBlur = 5;
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 1;
            
            ctx.fillStyle = '#ffffff';
            
            const baseFontSize = Math.max(10, Math.min(16, width * 0.06));
            ctx.font = `bold ${baseFontSize}px "Segoe UI", Arial, sans-serif`;
            ctx.textAlign = 'center';
            
            let displayName = card.name;
            const maxWidth = width - 30;
            
            while (displayName.length > 3 && ctx.measureText(displayName).width > maxWidth) {
                displayName = displayName.substring(0, displayName.length - 1);
            }
            
            ctx.fillText(displayName, x + width / 2, nameY);
            
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
        }

        const statsY = nameY + 20;
        const statBarHeight = Math.max(4, height * 0.03); 
        const statSpacing = Math.max(18, height * 0.06); 
        const statLabelWidth = 25; 
        const barWidth = width - statLabelWidth - 30; 
        
        this.drawStatBar(
            ctx, 
            'STR', 
            card.stats.strength, 
            100, 
            x + 15, 
            statsY, 
            barWidth, 
            statBarHeight,
            '#ff6b6b'
        );
        
        this.drawStatBar(
            ctx, 
            'DEF', 
            card.stats.defense, 
            100, 
            x + 15, 
            statsY + statSpacing, 
            barWidth, 
            statBarHeight,
            '#4dabf7'
        );
        
        this.drawStatBar(
            ctx, 
            'SPD', 
            card.stats.speed, 
            100, 
            x + 15, 
            statsY + statSpacing * 2, 
            barWidth, 
            statBarHeight,
            '#69db7c'
        );

        const currentHp = card.currentHp !== undefined ? card.currentHp : card.stats.hp;
        const hpBarHeight = Math.max(10, height * 0.04); 
        this.drawHpBar(
            ctx, 
            currentHp, 
            card.stats.hp, 
            x + 15, 
            y + height - (hpBarHeight * 2), 
            width - 30, 
            hpBarHeight
        );

        if (card.currentHp <= 0) { 
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.drawRoundedRect(ctx, x, y, width, height, 15);
            ctx.fill();
            
            ctx.fillStyle = '#ff4444';
            ctx.font = 'bold 24px "Segoe UI", Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('DEFEATED', x + width / 2, y + height / 2);
        }
    }
}

module.exports = new ArenaMatchmaker();
