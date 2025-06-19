const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('path');
const fs = require('fs');
const db = require('../../utils/database');
const { checkTradeStatus } = require('../../utils/tradeUtils');
const { tradeOffers } = require('../../utils/tradeStore');

const tradeCooldowns = new Map();
const TRADE_COOLDOWN = 3 * 60 * 1000; 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('trade')
        .setDescription('Propose a trade with another player')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to trade with')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('your_card')
                .setDescription('Number of your card to trade (use /collection to see numbers)')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('their_card')
                .setDescription('Number of their card you want (use /collection to see numbers)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('note')
                .setDescription('Optional note to include with your trade offer')),

    async execute(interaction) {
        const userId = interaction.user.id;
        
        if (!(await checkTradeStatus(interaction))) {
            return;
        }
        
        const now = Date.now();
        const cooldownEnd = tradeCooldowns.get(userId) || 0;
        
        if (now < cooldownEnd) {
            const remainingTime = ((cooldownEnd - now) / 1000).toFixed(1);
            return interaction.reply({
                content: `⏱️ Please wait ${remainingTime} seconds before using the trade command again.`,
                ephemeral: true
            });
        }
        
        tradeCooldowns.set(userId, now + TRADE_COOLDOWN);
        
        const targetUser = interaction.options.getUser('user');
        const yourCardIndex = interaction.options.getInteger('your_card') - 1;
        const theirCardIndex = interaction.options.getInteger('their_card') - 1;
        
        if (yourCardIndex < 0 || theirCardIndex < 0) {
            return interaction.reply({
                content: '❌ Please use positive numbers for card selection.',
                ephemeral: true
            });
        }

        if (targetUser.bot) {
            return interaction.reply({
                content: "❌ You can't trade with bots!",
                ephemeral: true
            });
        }

        if (targetUser.id === userId) {
            return interaction.reply({
                content: "❌ You can't trade with yourself!",
                ephemeral: true
            });
        }

        const user = db.getUser(userId);
        const target = db.getUser(targetUser.id);

        if (!user.cards || !target.cards) {
            console.log('Your cards:', user.cards.map(c => `${c.name} (${c.id})`));
            console.log('Their cards:', target.cards.map(c => `${c.name} (${c.id})`));

            return interaction.reply({
                content: "❌ One of you doesn't have any cards to trade!",
                ephemeral: true
            });
        }

        const sortCards = (cards) => {
            return [...cards].sort((a, b) => {
                const ovrA = Math.min(99, Math.round((a.stats.strength + a.stats.defense + a.stats.speed + (a.stats.hp / 2)) / 4));
                const ovrB = Math.min(99, Math.round((b.stats.strength + b.stats.defense + b.stats.speed + (b.stats.hp / 2)) / 4));
                if (ovrB !== ovrA) return ovrB - ovrA;
                return a.name.localeCompare(b.name);
            });
        };

        const yourCards = sortCards(Array.isArray(user.cards) ? user.cards : []);
        const theirCards = sortCards(Array.isArray(target.cards) ? target.cards : []);

        const yourCardIndexActual = yourCardIndex;
        const theirCardIndexActual = theirCardIndex;

        if (yourCardIndexActual < 0 || yourCardIndexActual >= yourCards.length) {
            return interaction.reply({
                content: `❌ You don't have a card at position ${yourCardIndex + 1}. Use /collection to see your cards.`,
                ephemeral: true
            });
        }

        if (theirCardIndexActual < 0 || theirCardIndexActual >= theirCards.length) {
            return interaction.reply({
                content: `❌ That user doesn't have a card at position ${theirCardIndex + 1}.`,
                ephemeral: true
            });
        }

        const yourCard = JSON.parse(JSON.stringify(yourCards[yourCardIndexActual]));
        const theirCard = JSON.parse(JSON.stringify(theirCards[theirCardIndexActual]));
        
        if (db.isCardInAnyTeam(yourCard.id)) {
            return interaction.reply({
                content: "❌ You can't trade a card that's in one of your teams. Please remove it from the team first.",
                ephemeral: true
            });
        }
        
        if (db.isCardInAnyTeam(theirCard.id)) {
            return interaction.reply({
                content: `❌ ${targetUser.username}'s card is in one of their teams. Please ask them to remove it from their team first.`,
                ephemeral: true
            });
        }
        
        yourCard.originalPosition = yourCardIndex + 1;
        theirCard.originalPosition = theirCardIndex + 1;

        const calculateOVR = (card) => {
            if (card.ovr) return Math.min(99, card.ovr);
            const ovr = Math.round((card.stats.strength + card.stats.defense + card.stats.speed + (card.stats.hp / 2)) / 4);
            return Math.min(99, ovr);
        };

        const yourCardOVR = calculateOVR(yourCard);
        const theirCardOVR = calculateOVR(theirCard);
        const { getSellPriceByOVR } = require('../../utils/cards/cardTemplate');
        
        const yourCardPrice = getSellPriceByOVR(yourCardOVR);
        const theirCardPrice = getSellPriceByOVR(theirCardOVR);
        const priceDifference = Math.abs(yourCardPrice - theirCardPrice);
        
        let paymentInfo = '';
        let paymentRequired = false;
        let paymentAmount = 0;
        let paymentFrom = '';
        
        if (yourCardOVR < theirCardOVR) {
            paymentRequired = true;
            paymentAmount = priceDifference;
            paymentFrom = 'you';
            paymentInfo = `\n\nYou need to pay ${paymentAmount} <:coin:1381692942196150292> to complete this trade.`;
            
            if (user.currency < paymentAmount) {
                return interaction.reply({
                    content: `❌ Trade denied! You don't have enough coins to cover the required payment of ${paymentAmount} <:coin:1381692942196150292> for this trade.`,
                    ephemeral: true
                });
            }
        } else if (yourCardOVR > theirCardOVR) {
            paymentRequired = true;
            paymentAmount = priceDifference;
            paymentFrom = 'them';
            paymentInfo = `\n\n${targetUser.username} needs to pay ${paymentAmount} <:coin:1381692942196150292> to complete this trade.`;
            
            if (target.currency < paymentAmount) {
                return interaction.reply({
                    content: `❌ Trade denied! ${targetUser.username} doesn't have enough coins (${target.currency}/${paymentAmount}) to cover the required payment for this trade.`,
                    ephemeral: true
                });
            }
        } else {
            paymentInfo = '\n\nNo payment required - both cards have the same OVR.';
        }
        
        const totalPrice = yourCardPrice + theirCardPrice;

        const tradeId = `${userId}-${Date.now()}`;
        tradeOffers.set(tradeId, {
            from: userId,
            to: targetUser.id,
            yourCard: { 
                id: yourCard.id, 
                name: yourCard.name,
                image: yourCard.image || yourCard.imagePath,
                ovr: yourCardOVR,
                originalIndex: yourCard.originalPosition - 1
            },
            theirCard: { 
                id: theirCard.id, 
                name: theirCard.name,
                image: theirCard.image || theirCard.imagePath,
                ovr: theirCardOVR,
                originalIndex: theirCard.originalPosition - 1
            },
            timestamp: Date.now(),
            payment: {
                required: paymentRequired,
                amount: paymentAmount,
                from: paymentFrom,
                totalPrice: totalPrice
            }
        });

        try {
            const note = interaction.options.getString('note') || '';
            const tradeImage = await generateTradeImage({
                requester: interaction.user,
                target: targetUser,
                yourCard,
                theirCard,
                note
            });
            
            const embed = new EmbedBuilder()
                .setTitle('✨ Trade Offer')
                .setDescription(`**${interaction.user.username}** has offered to trade with **${targetUser.username}**`)
                .addFields(
                    { 
                        name: 'Trade Summary', 
                        value: `• **${interaction.user.username}** offers: ${yourCard.name} (OVR: ${yourCardOVR})\n• **${targetUser.username}** receives: ${theirCard.name} (OVR: ${theirCardOVR})`
                    }
                )
                .setImage('attachment://trade.png')
                .setColor(0x3498db)
                .setFooter({ 
                    text: `Trade ID: ${tradeId} • Use the buttons below to respond`,
                    iconURL: interaction.user.displayAvatarURL()
                });
                
            if (paymentInfo) {
                embed.addFields({
                    name: 'Additional Payment',
                    value: paymentInfo.replace('You need to pay', `**${interaction.user.username}** needs to pay`)
                                     .replace('needs to pay', 'needs to pay')
                });
            }
            
            if (note) {
                embed.addFields({
                    name: 'Note',
                    value: note
                });
            }

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`trade_accept_${tradeId}`)
                        .setLabel('Accept')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`trade_decline_${tradeId}`)
                        .setLabel('Decline')
                        .setStyle(ButtonStyle.Danger)
                );

            const message = await interaction.reply({
                content: `<@${targetUser.id}>, you have received a trade offer!`,
                embeds: [embed],
                components: [row],
                files: [tradeImage],
                fetchReply: true
            });
            
            const trade = tradeOffers.get(tradeId);
            if (trade) {
                trade.messageId = message.id;
                trade.channelId = message.channel.id;
                tradeOffers.set(tradeId, trade);
            }

        } catch (error) {
            console.error('Error generating trade image:', error);
            return interaction.reply({
                content: '❌ An error occurred while processing your trade. Please try again.',
                ephemeral: true
            });
        }
    },
};

async function generateTradeImage({ requester, target, yourCard, theirCard, note = '' }) {
    if (!requester || !target) {
        throw new Error('Missing requester or target user');
    }
    
    const canvas = createCanvas(1200, 800);
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

    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = 'bold 42px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TRADE OFFER', canvas.width / 2, 80);

    const cardWidth = 400;
    const cardHeight = 550;
    const cardY = 150;
    const leftCardX = 100;
    const rightCardX = canvas.width - cardWidth - 100;
    const centerX = canvas.width / 2;

    const drawCard = async (x, y, card, isYours, requester, targetUser) => {
        const cardGradient = ctx.createLinearGradient(x, y, x + cardWidth, y + cardHeight);
        cardGradient.addColorStop(0, '#1a1a2e');
        cardGradient.addColorStop(1, '#16213e');
        ctx.fillStyle = cardGradient;
        
        const radius = 15;
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + cardWidth - radius, y);
        ctx.quadraticCurveTo(x + cardWidth, y, x + cardWidth, y + radius);
        ctx.lineTo(x + cardWidth, y + cardHeight - radius);
        ctx.quadraticCurveTo(x + cardWidth, y + cardHeight, x + cardWidth - radius, y + cardHeight);
        ctx.lineTo(x + radius, y + cardHeight);
        ctx.quadraticCurveTo(x, y + cardHeight, x, y + cardHeight - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        ctx.fill();

        try {
            let imagePath = card.imagePath || card.image;
            if (imagePath) {
                const filename = path.basename(imagePath);
                const cardsDir = path.join(__dirname, '../../../public/cards');
                const fullPath = path.join(cardsDir, filename);
                
                if (fs.existsSync(fullPath)) {
                    const img = await loadImage(fullPath);
                    ctx.save();
                    ctx.clip();
                    ctx.drawImage(img, x + 10, y + 10, cardWidth - 20, cardHeight - 60);
                    ctx.restore();
                }
            }
            
            ctx.strokeStyle = isYours ? 'rgba(76, 175, 80, 0.8)' : 'rgba(244, 67, 54, 0.8)';
            ctx.lineWidth = 4;
            ctx.stroke();
            
            const plateHeight = 60;
            const nameGradient = ctx.createLinearGradient(x, y + cardHeight - plateHeight, x, y + cardHeight);
            nameGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
            nameGradient.addColorStop(1, 'rgba(0, 0, 0, 0.9)');
            
            ctx.fillStyle = nameGradient;
            ctx.fillRect(x, y + cardHeight - plateHeight, cardWidth, plateHeight);
            
            const username = isYours ? requester.username : target.username;
            const userData = isYours ? db.getUser(requester.id) : db.getUser(target.id);
            const elo = userData?.elo || 100;
            
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(username, x + cardWidth/2, y + cardHeight - 30);
            
            ctx.font = '16px "Segoe UI", Arial, sans-serif';
            ctx.fillStyle = '#bbbbbb';
            ctx.fillText(`${elo} ELO`, x + cardWidth/2, y + cardHeight - 10);
            
        } catch (e) {
            console.error('Error drawing card:', e);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(x + 10, y + 10, cardWidth - 20, cardHeight - 70);
            
            ctx.fillStyle = '#ffffff';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Card not found', x + cardWidth/2, y + cardHeight/2);
        }
    };

    await drawCard(leftCardX, cardY, yourCard, true, requester, target);
    await drawCard(rightCardX, cardY, theirCard, false, requester, target);

    const arrowY = cardY + (cardHeight / 2);
    
    const arrowGradient = ctx.createRadialGradient(
        centerX, arrowY, 0,
        centerX, arrowY, 40
    );
    arrowGradient.addColorStop(0, 'rgba(138, 43, 226, 0.8)');
    arrowGradient.addColorStop(1, 'transparent');
    
    ctx.fillStyle = arrowGradient;
    ctx.fillRect(centerX - 40, arrowY - 40, 80, 80);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⇄', centerX, arrowY);
    
    if (note) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '18px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        
        const maxWidth = canvas.width - 200;
        const words = note.split(' ');
        let line = '';
        let y = cardY + cardHeight + 40;
        
        for (const word of words) {
            const testLine = line + word + ' ';
            const metrics = ctx.measureText(testLine);
            if (metrics.width > maxWidth && line.length > 0) {
                ctx.fillText(line, centerX, y);
                line = word + ' ';
                y += 25;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line, centerX, y);
    }

    const buffer = canvas.toBuffer('image/png');
    return new AttachmentBuilder(buffer, { name: 'trade_offer.png' });
}