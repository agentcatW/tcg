const { EmbedBuilder } = require('@discordjs/builders');
const { AttachmentBuilder } = require('discord.js');
const path = require('path');

const getSellPriceByOVR = (ovr) => {
    const priceMap = {
        60: 10, 61: 12, 62: 15, 63: 20, 64: 24, 65: 30, 66: 40, 67: 50, 68: 60, 69: 75,
        70: 90, 71: 110, 72: 140, 73: 180, 74: 220, 75: 280, 76: 350, 77: 440, 78: 550, 79: 700,
        80: 850, 81: 1000, 82: 1300, 83: 1600, 84: 2000, 85: 2500, 86: 3000, 87: 4000, 88: 5000, 89: 6500,
        90: 8000, 91: 10000, 92: 12500, 93: 15000, 94: 20000, 95: 24000, 96: 30000, 97: 38000, 98: 48000, 99: 60000
    };
    
    if (ovr < 60) return 5;
    if (ovr >= 99) return 60000;
    return priceMap[Math.floor(ovr)] || 10;
};

const RARITIES = {
    'C': { name: 'Common', weight: 40, color: 0x808080 },
    'B': { name: 'Uncommon', weight: 33.99, color: 0x1E90FF },
    'A': { name: 'Rare', weight: 20, color: 0x800080 },
    'S': { name: 'Epic', weight: 5, color: 0xFF8C00 },
    'SS': { name: 'Legendary', weight: 1, color: 0xFFD700, hasPlaystyle: true },
    'SSR': { name: 'Elite', weight: 0.1, color: 0xFF0000, hasPlaystyle: true }
};

const PLAYSTYLES = {
    'LEADER': { 
        name: 'Leader', 
        description: '+5 Strength to all allies',
        type: 'Buff'
    },
    'VIP': {
        name: 'VIP',
        description: '+5 Speed to all allies',
        type: 'Buff'
    },
    'TACTIC': {
        name: 'Tactic',
        description: '+5 Defense to all allies',
        type: 'Buff'
    },
    'SPIRIT': { 
        name: 'Spirit', 
        description: '+20 HP to all allies',
        type: 'Buff'
    },
    'LONER': { 
        name: 'Loner', 
        description: '+5 Strength when in last position',
        type: 'Self Buff'
    },
    'FEAR': { 
        name: 'Fear', 
        description: '-5 Strength to all enemies',
        type: 'Debuff'
    }
};

class Card {
    constructor(id, name, imagePath, stats, rarity, playstyle = null) {
        this.id = id;
        this.name = name;
        this.imagePath = imagePath;
        this.stats = stats;
        this.rarity = rarity;
        this.playstyle = RARITIES[rarity]?.hasPlaystyle ? playstyle || this.getRandomPlaystyle() : null;
        this.overall = this.calculateOverall();
    }

    getRandomPlaystyle() {
        const playstyleKeys = Object.keys(PLAYSTYLES);
        return playstyleKeys[Math.floor(Math.random() * playstyleKeys.length)];
    }

    calculateOverall() {
        const ovr = Math.round((this.stats.strength + this.stats.defense + this.stats.speed + (this.stats.hp / 2)) / 4);
        return Math.min(99, ovr);
    }

    async getCardEmbed() {
        const rarityData = RARITIES[this.rarity];
        const embed = new EmbedBuilder()
            .setColor(rarityData.color)
            .setTitle(this.name)
            .addFields(
                { name: 'Rarity', value: `${this.rarity} (${rarityData.name})`, inline: true },
                { name: 'Strength', value: this.stats.strength.toString(), inline: true },
                { name: 'Defense', value: this.stats.defense.toString(), inline: true },
                { name: 'Speed', value: this.stats.speed.toString(), inline: true },
                { name: 'HP', value: this.stats.hp.toString(), inline: true },
                { name: 'OVR', value: this.overall.toString(), inline: true }
            );

        if (this.playstyle) {
            const style = PLAYSTYLES[this.playstyle];
            embed.addFields({
                name: 'Playstyle',
                value: `**${style.name}**\n${style.description}`
            });
        }

        const attachment = new AttachmentBuilder(this.imagePath);
        const filename = path.basename(this.imagePath);
        embed.setThumbnail(`attachment://${filename}`);

        return {
            embeds: [embed],
            files: [attachment]
        };
    }
    
    getSellPrice() {
        return getSellPriceByOVR(this.overall);
    }
}

module.exports = {
    Card,
    RARITIES,
    PLAYSTYLES,
    getSellPriceByOVR
};
