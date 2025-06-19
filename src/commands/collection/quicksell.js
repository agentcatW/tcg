const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const db = require('../../utils/database');
const { getSellPriceByOVR } = require('../../utils/cards/cardTemplate');
const { getImageBuffer } = require('../../utils/imageCache');
const { checkTradeStatus } = require('../../utils/tradeUtils');
const path = require('path');

const RARITY_COLORS = {
    'C': 0x808080,
    'B': 0x1EFF00,
    'A': 0x0070FF,
    'S': 0xA335EE,
    'SS': 0xFF8000,
    'SSR': 0xE6CC80
};

function calculateOVR(card) {
    const ovr = Math.round((card.stats.strength + card.stats.defense + card.stats.speed + (card.stats.hp / 2)) / 4);
    return Math.min(99, ovr);
}

async function createCardEmbed(card, page, totalPages, sellPrice) {
    const ovr = calculateOVR(card);
    const rarity = card.rarity || 'B';
    
    const embed = new EmbedBuilder()
        .setColor(RARITY_COLORS[rarity] || 0x808080)
        .setTitle(card.name)
        .setDescription(`**Rarity**: ${rarity} ${getRarityEmoji(rarity)}\n**OVR**: ${ovr}`)
        .addFields(
            { name: 'STR', value: card.stats.strength.toString(), inline: true },
            { name: 'DEF', value: card.stats.defense.toString(), inline: true },
            { name: 'SPD', value: card.stats.speed.toString(), inline: true },
            { name: 'HP', value: card.stats.hp.toString(), inline: true },
            { name: 'Sell Price', value: `${sellPrice} <:coin:1381692942196150292>`, inline: true }
        )
        .setFooter({ 
            text: `Card ${page + 1} of ${totalPages} | Select a card to sell`
        });
    
    let files = [];
    const imagePath = card.image || card.imagePath;
    
    if (imagePath) {
        try {
            const imageBuffer = await getImageBuffer(imagePath);
            if (imageBuffer) {
                const filename = path.basename(imagePath);
                const attachment = new AttachmentBuilder(imageBuffer, { name: filename });
                embed.setThumbnail(`attachment://${filename}`);
                files.push(attachment);
            }
        } catch (error) {
            console.error('Error loading card image:', error);
        }
    }
    
    return { embed, files };
}

function createActionRow(hasPrev, hasNext, cardIndex) {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('prev')
                .setLabel('◀️ Previous')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(!hasPrev),
            new ButtonBuilder()
                .setCustomId('next')
                .setLabel('Next ▶️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(!hasNext),
            new ButtonBuilder()
                .setCustomId(`sell_${cardIndex}`)
                .setLabel('💰 Sell Card')
                .setStyle(ButtonStyle.Danger)
        );
    
    return row;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('quick-sell')
        .setDescription('Quickly sell cards from your collection')
        .addIntegerOption(option =>
            option.setName('page')
                .setDescription('Page number to start at (1-based index)')
                .setMinValue(1)
                .setRequired(false)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        
        if (!(await checkTradeStatus(interaction))) {
            return;
        }
        
        const user = db.getUser(userId);

        if (!user.cards || user.cards.length === 0) {
            return interaction.reply({
                content: "You don't have any cards to sell!",
            });
        }

        const rarityOrder = { 'SSR': 1, 'SS': 2, 'S': 3, 'A': 4, 'B': 5, 'C': 6 };
        const sortedCards = [...user.cards].sort((a, b) => {
            const rarityA = rarityOrder[a.rarity] || 6;
            const rarityB = rarityOrder[b.rarity] || 6;
            if (rarityA !== rarityB) return rarityA - rarityB;
            const ovrA = calculateOVR(a);
            const ovrB = calculateOVR(b);
            return ovrB - ovrA;
        });
        
        if (sortedCards.length === 0) {
            return interaction.reply({
                content: "You don't have any cards to sell!",
                ephemeral: true
            });
        }
        
        interaction.cards = sortedCards;
        let currentPage = interaction.options.getInteger('page') ? interaction.options.getInteger('page') - 1 : 0;
        const totalPages = sortedCards.length;
        
        currentPage = Math.max(0, Math.min(currentPage, totalPages - 1));
        
        const currentCard = sortedCards[currentPage];
        const ovr = currentCard.ovr || calculateOVR(currentCard);
        const baseSellPrice = getSellPriceByOVR(ovr);
        const sellPrice = Math.floor(baseSellPrice * 0.6);
        
        const { embed, files } = await createCardEmbed(currentCard, currentPage, totalPages, sellPrice);
        const row = createActionRow(
            false,
            totalPages > 1,
            currentPage
        );
        
        const response = await interaction.reply({
            content: `**Selling Cards**\n*Browse your collection and select a card to sell*`,
            embeds: [embed],
            components: [row],
            files: files,
            fetchReply: true
        });
        
        const filter = i => i.user.id === interaction.user.id;
        const collector = response.createMessageComponentCollector({ 
            filter,
            componentType: ComponentType.Button,
            time: 300000
        });
        
        collector.on('collect', async i => {
            if (i.customId.startsWith('sell_')) {
                const cardIndex = parseInt(i.customId.split('_')[1]);
                const cardToSell = interaction.cards[cardIndex];
                
                if (!cardToSell) {
                    await i.update({
                        content: '❌ Card not found!',
                        embeds: [],
                        components: []
                    });
                    return;
                }
                
                if (db.isCardInAnyTeam(cardToSell.id)) {
                    await i.update({
                        content: '❌ This card is currently in one of your teams. Please remove it from the team before selling.',
                        embeds: [],
                        components: []
                    });
                    return;
                }
                
                const ovr = cardToSell.ovr || calculateOVR(cardToSell);
                const baseSellPrice = getSellPriceByOVR(ovr);
                const sellPrice = Math.floor(baseSellPrice * 0.6);
                
                const confirmEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle(`Sell ${cardToSell.name}?`)
                    .setDescription(`You will receive ${sellPrice} <:coin:1381692942196150292> for this card.`)
                    .addFields(
                        { name: 'Rarity', value: cardToSell.rarity || 'N/A', inline: true },
                        { name: 'OVR', value: ovr.toString(), inline: true }
                    );
                
                const confirmRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('confirm_sell')
                            .setLabel('✅ Sell')
                            .setStyle(ButtonStyle.Danger),
                        new ButtonBuilder()
                            .setCustomId('cancel_sell')
                            .setLabel('❌ Keep')
                            .setStyle(ButtonStyle.Secondary)
                    );
                
                await i.update({
                    content: '\u200b',
                    embeds: [confirmEmbed],
                    components: [confirmRow],
                    files: []
                });
                
                try {
                    const confirmation = await response.awaitMessageComponent({
                        filter,
                        componentType: ComponentType.Button,
                        time: 30000
                    });
                    
                    if (confirmation.customId === 'confirm_sell') {
                        const cardId = cardToSell.id;
                        user.cards = user.cards.filter(c => c.id !== cardId);
                        user.currency = (user.currency || 0) + sellPrice;
                        db.saveUsers();
                        
                        interaction.cards = interaction.cards.filter(c => c.id !== cardId);
                        
                        await confirmation.update({
                            content: `✅ Sold **${cardToSell.name}** for ${sellPrice} <:coin:1381692942196150292>!`,
                            embeds: [],
                            components: []
                        });
                        collector.stop();
                    } else {
                        const newPage = interaction.cards.findIndex(c => c.id === cardToSell.id);
                        if (newPage >= 0) {
                            const newCard = interaction.cards[newPage];
                            const newOvr = newCard.ovr || calculateOVR(newCard);
                            const newBaseSellPrice = getSellPriceByOVR(newOvr);
                            const newSellPrice = Math.floor(newBaseSellPrice * 0.6);
                            
                            const { embed: newEmbed, files: newFiles } = await createCardEmbed(
                                newCard, 
                                newPage, 
                                interaction.cards.length, 
                                newSellPrice
                            );
                            
                            const newRow = createActionRow(
                                newPage > 0,
                                newPage < interaction.cards.length - 1,
                                newPage
                            );
                            
                            await confirmation.update({
                                content: `**Selling Cards**\n*Browse your collection and select a card to sell*`,
                                embeds: [newEmbed],
                                components: [newRow],
                                files: newFiles
                            });
                        } else {
                            await confirmation.update({
                                content: '✅ Operation cancelled.',
                                embeds: [],
                                components: []
                            });
                            collector.stop();
                        }
                    }
                } catch (error) {
                    console.error('Error in sell confirmation:', error);
                    await interaction.followUp({
                        content: 'The confirmation timed out. Please use the command again if you want to sell a card.',
                        ephemeral: true
                    });
                }
                
            } else if (i.customId === 'prev' || i.customId === 'next') {
                currentPage += (i.customId === 'next') ? 1 : -1;
                const newCard = interaction.cards[currentPage];
                
                if (!newCard) {
                    await i.update({
                        content: '❌ Error: Card not found!',
                        embeds: [],
                        components: []
                    });
                    return;
                }
                
                const newOvr = newCard.ovr || calculateOVR(newCard);
                const newBaseSellPrice = getSellPriceByOVR(newOvr);
                const newSellPrice = Math.floor(newBaseSellPrice * 0.6);
                
                const { embed: newEmbed, files: newFiles } = await createCardEmbed(
                    newCard, 
                    currentPage, 
                    interaction.cards.length, 
                    newSellPrice
                );
                
                const newRow = createActionRow(
                    currentPage > 0,
                    currentPage < interaction.cards.length - 1,
                    currentPage
                );
                
                await i.update({
                    embeds: [newEmbed],
                    components: [newRow],
                    files: newFiles
                });
            }
        });
        
        collector.on('end', (collected, reason) => {
            if (reason === 'time') {
                response.edit({ 
                    content: 'Timed out. Use the command again if you want to sell more cards.',
                    components: [] 
                }).catch(console.error);
            }
        });
    }
};

function getRarityEmoji(rarity) {
    const emojis = {
        'C': '⚪',
        'B': '🔵',
        'A': '🟣',
        'S': '🟠',
        'SS': '🟡',
        'SSR': '🔴'
    };
    return emojis[rarity] || '❓';
}
