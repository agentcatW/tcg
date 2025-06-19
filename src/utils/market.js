const db = require('./database');

class Market {
    constructor() {
        this.loadMarket();
    }
    
    loadMarket() {
        if (db.loadMarket) {
            return db.loadMarket();
        }
        return [];
    }
    
    getMarket() {
        return Array.isArray(db.market) ? db.market : [];
    }

    addListing(userId, card, price) {
        const listing = {
            id: Date.now().toString(),
            sellerId: userId,
            card: card,
            price: price,
            timestamp: Date.now()
        };
        
        const market = this.getMarket();
        market.push(listing);
        
        db.market = market;
        
        return listing;
    }

    removeListing(listingId) {
        const market = this.getMarket();
        const index = market.findIndex(l => l.id === listingId);
        
        if (index !== -1) {
            const removed = market.splice(index, 1)[0];
            db.market = market;
            return removed;
        }
        return null;
    }

    getListing(listingId) {
        return this.getMarket().find(l => l.id === listingId);
    }

    getUserListings(userId) {
        return this.getMarket().filter(l => l.sellerId === userId);
    }

    getAllListings() {
        return [...this.getMarket()].sort((a, b) => b.timestamp - a.timestamp);
    }
}

const marketInstance = new Market();
module.exports = marketInstance;
