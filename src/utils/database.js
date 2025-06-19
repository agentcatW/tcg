const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('./logger');
const { isCardInAnyTeam } = require('./teamUtils');

const DATA_PATH = path.join(__dirname, '../../data');
const USERS_FILE = path.join(DATA_PATH, 'users.json');
const MARKET_FILE = path.join(DATA_PATH, 'market.json');

if (!fs.existsSync(DATA_PATH)) {
    fs.mkdirSync(DATA_PATH, { recursive: true });
}

if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, '{}');
}

if (!fs.existsSync(MARKET_FILE)) {
    fs.writeFileSync(MARKET_FILE, '[]');
}

class Database {
    constructor() {
        this.data = {
            users: {},
            market: []
        };
        this.cooldowns = new Map();
        this.activeRolls = new Map();
        this.isCardInAnyTeam = isCardInAnyTeam;
        
        this.loadUsers();
        this.cleanupActiveRolls();
    }

    loadUsers() {
        try {
            const data = fs.readFileSync(USERS_FILE, 'utf8');
            const parsed = JSON.parse(data);
            this.data.users = parsed;
            return this.data.users;
        } catch (error) {
            logger.error('Error loading users:', error);
            return {};
        }
    }

    getLeaderboard() {
        try {
            return Object.values(this.data.users)
                .filter(user => user.elo !== undefined && user.elo !== null)
                .sort((a, b) => (b.elo || 0) - (a.elo || 0))
                .map((user, index) => ({
                    ...user,
                    position: index + 1
                }));
        } catch (error) {
            logger.error('Error getting leaderboard:', error);
            return [];
        }
    }

    getUserCards(userId) {
        try {
            const user = this.getUser(userId);
            if (!user) return [];
            return user.cards || [];
        } catch (error) {
            logger.error('Error getting user cards:', error);
            return [];
        }
    }

    loadMarket() {
        try {
            if (!fs.existsSync(MARKET_FILE)) {
                fs.writeFileSync(MARKET_FILE, '[]');
                return [];
            }
            const data = fs.readFileSync(MARKET_FILE, 'utf8');
            const parsed = JSON.parse(data);
            this.data.market = Array.isArray(parsed) ? parsed : [];
            return this.data.market;
        } catch (error) {
            logger.error('Error loading market:', error);
            return [];
        }
    }

    saveUsers() {
        try {
            fs.writeFileSync(USERS_FILE, JSON.stringify(this.data.users, null, 4));
        } catch (error) {
            logger.error('Error saving users:', error);
        }
    }

    saveMarket() {
        try {
            if (!fs.existsSync(path.dirname(MARKET_FILE))) {
                fs.mkdirSync(path.dirname(MARKET_FILE), { recursive: true });
            }
            fs.writeFileSync(MARKET_FILE, JSON.stringify(this.data.market || [], null, 4));
        } catch (error) {
            logger.error('Error saving market:', error);
        }
    }

    get data() {
        return this._data;
    }

    set data(value) {
        this._data = value;
    }

    get users() {
        return this.data.users;
    }

    get market() {
        if (!Array.isArray(this.data.market)) {
            this.data.market = [];
        }
        return this.data.market;
    }

    set market(value) {
        this.data.market = Array.isArray(value) ? value : [];
        this.saveMarket();
    }

    getUser(userId) {
        if (!this.users[userId]) {
            this.users[userId] = {
                id: userId,
                cards: [],
                lastRoll: {
                    hourly: 0,
                    daily: 0,
                    weekly: 0
                },
                lastCoinClaim: 0,
                lastWeeklyCoinClaim: 0,
                currency: 1000,
                redeemedCodes: [],
                packs: {
                    beginner: 0,
                    novice: 0,
                    expert: 0,
                    master: 0,
                    legend: 0
                }
            };
        }
        return this.users[userId];
    }

    addCard(userId, card) {
        const user = this.getUser(userId);
        const cardWithId = { ...card, id: uuidv4() };
        user.cards.push(cardWithId);
        this.saveUsers();
        return cardWithId;
    }

    setCooldown(userId, type) {
        const now = Date.now();
        
        const cooldowns = this.getCooldowns(userId);
        cooldowns[type] = now;
        this.cooldowns.set(userId, cooldowns);
        
        const user = this.getUser(userId);
        if (!user.lastRoll) user.lastRoll = {};
        user.lastRoll[type] = now;
        this.saveUsers();
    }

    getCooldowns(userId) {
        const user = this.getUser(userId);
        
        if (!this.cooldowns.has(userId)) {
            this.cooldowns.set(userId, {
                hourly: user.lastRoll?.hourly || 0,
                daily: user.lastRoll?.daily || 0,
                weekly: user.lastRoll?.weekly || 0
            });
        }
        return this.cooldowns.get(userId);
    }

    canRoll(userId, type) {
        const user = this.getUser(userId);
        const cooldowns = this.getCooldowns(userId);
        const now = Date.now();
        const cooldownTimes = {
            hourly: 60 * 60 * 1000,
            daily: 24 * 60 * 60 * 1000,
            weekly: 7 * 24 * 60 * 60 * 1000
        };

        const lastRoll = Math.max(
            cooldowns[type] || 0,
            user.lastRoll?.[type] || 0
        );
        
        return now - lastRoll >= cooldownTimes[type];
    }

    getTimeUntilNextRoll(userId, type) {
        const cooldowns = this.getCooldowns(userId);
        const now = Date.now();
        const cooldownTimes = {
            hourly: 60 * 60 * 1000,
            daily: 24 * 60 * 60 * 1000,
            weekly: 7 * 24 * 60 * 60 * 1000
        };

        const lastRoll = cooldowns[type] || 0;
        const timePassed = now - lastRoll;
        const timeRemaining = Math.max(0, cooldownTimes[type] - timePassed);
        
        return timeRemaining;
    }

    formatTime(ms) {
        const seconds = Math.floor((ms / 1000) % 60);
        const minutes = Math.floor((ms / (1000 * 60)) % 60);
        const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
        const days = Math.floor(ms / (1000 * 60 * 60 * 24));

        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

        return parts.join(' ');
    }
    
    addCurrency(userId, amount) {
        const user = this.getUser(userId);
        user.currency = (user.currency || 0) + amount;
        this.saveUsers();
        return user.currency;
    }
    
    cleanupActiveRolls() {
        this.activeRolls.clear();
    }
    
    hasActiveRoll(userId) {
        return this.activeRolls.has(userId);
    }
    
    setRollActive(userId, type) {
        this.setCooldown(userId, type);
        this.activeRolls.set(userId, type);
    }
    
    clearActiveRoll(userId) {
        this.activeRolls.delete(userId);
    }
    
    hasActiveRollOrIsInTeam(userId) {
        if (this.hasActiveRoll(userId)) {
            return { hasActive: true, reason: 'You have an active roll in progress. Please complete it first.' };
        }
        
        const user = this.getUser(userId);
        const hasCardInTeam = user.cards.some(card => 
            this.isCardInAnyTeam && this.isCardInAnyTeam(card.id)
        );
        
        if (hasCardInTeam) {
            return { hasActive: true, reason: 'You have cards in your team. Please remove them from teams first.' };
        }
        
        return { hasActive: false };
    }
    
    canModifyCard(cardId) {
        if (this.isCardInAnyTeam && this.isCardInAnyTeam(cardId)) {
            return { canModify: false, reason: 'This card is currently in a team. Please remove it from the team first.' };
        }
        return { canModify: true };
    }
}

const db = new Database();
module.exports = db;
