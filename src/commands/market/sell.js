const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder, AttachmentBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const db = require('../../utils/database');
const market = require('../../utils/market');
const { getImageBuffer } = require('../../utils/imageCache');
const { getSellPriceByOVR } = require('../../utils/cards/cardTemplate');
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

async function createCardEmbed(card, page, totalPages) {
    const ovr = calculateOVR(card);
    const rarity = card.rarity || 'B';
    const baseSellPrice = getSellPriceByOVR(ovr);
    
    const embed = new EmbedBuilder()
        .setColor(RARITY_COLORS[rarity] || 0x808080)
        .setTitle(card.name)
        .setDescription(`**Rarity**: ${rarity} ${getRarityEmoji(rarity)}\n**OVR**: ${ovr}`)
        .addFields(
            { name: 'STR', value: card.stats.strength.toString(), inline: true },
            { name: 'DEF', value: card.stats.defense.toString(), inline: true },
            { name: 'SPD', value: card.stats.speed.toString(), inline: true },
            { name: 'HP', value: card.stats.hp.toString(), inline: true },
            { name: 'Base Value', value: `${baseSellPrice} <:coin:1381692942196150292>`, inline: true }
        )
        .setFooter({ 
            text: `Card ${page + 1} of ${totalPages} | Select a card to list on the market`
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
                .setCustomId(`list_${cardIndex}`)
                .setLabel('📝 List on Market')
                .setStyle(ButtonStyle.Primary)
        );
    
    return row;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sell')
        .setDescription('List a card on the market'),

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
                content: "You don't have any cards to list on the market!",
                ephemeral: true
            });
        }
        
        interaction.cards = sortedCards;
        let currentPage = 0;
        const totalPages = sortedCards.length;
        
        const { embed, files } = await createCardEmbed(sortedCards[currentPage], currentPage, totalPages);
        const row = createActionRow(
            false,
            totalPages > 1,
            currentPage
        );
        
        const response = await interaction.reply({
            content: '**Marketplace - List a Card**\n*Browse your collection and select a card to list on the market*',
            embeds: [embed],
            components: [row],
            files: files,
            fetchReply: true,
            ephemeral: true
        });
        
        const filter = i => i.user.id === interaction.user.id;
        const collector = response.createMessageComponentCollector({ 
            filter,
            componentType: ComponentType.Button,
            time: 300000
        });
        
        collector.on('collect', async i => {
            if (i.customId.startsWith('list_')) {
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
                        content: '❌ This card is currently in one of your teams. Please remove it from the team before listing it on the market.',
                        embeds: [],
                        components: []
                    });
                    return;
                }
                
                const ovr = cardToSell.ovr || calculateOVR(cardToSell);
                const baseSellPrice = getSellPriceByOVR(ovr);
                const minPrice = Math.ceil(baseSellPrice * 1);
                const maxPrice = baseSellPrice * 1.25;
                
                const modal = new ModalBuilder()
                    .setCustomId(`sell_modal_${cardToSell.id}`)
                    .setTitle(`List ${cardToSell.name} on Market`);
                
                const priceInput = new TextInputBuilder()
                    .setCustomId('price_input')
                    .setLabel(`Price (${minPrice} - ${maxPrice} coins)`)
                    .setPlaceholder(`Enter price between ${minPrice} and ${maxPrice} coins`)
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMinLength(minPrice.toString().length)
                    .setMaxLength(maxPrice.toString().length + 2);
                
                const actionRow = new ActionRowBuilder().addComponents(priceInput);
                modal.addComponents(actionRow);
                
                await i.showModal(modal);
                
                try {
                    const modalSubmit = await i.awaitModalSubmit({
                        time: 300000,
                        filter: mi => mi.customId === `sell_modal_${cardToSell.id}`
                    });
                    
                    const price = parseInt(modalSubmit.fields.getTextInputValue('price_input'));
                    
                    if (isNaN(price) || price < minPrice || price > maxPrice) {
                        await modalSubmit.reply({
                            content: `❌ Invalid price. Please enter a number between ${minPrice} and ${maxPrice}.`,
                            ephemeral: true
                        });
                        return;
                    }
                    
                    const listing = market.addListing(userId, cardToSell, price);
                    const success = !!listing;
                    
                    if (success) {
                        user.cards = user.cards.filter(c => c.id !== cardToSell.id);
                        interaction.cards = interaction.cards.filter(c => c.id !== cardToSell.id);
                        db.saveUsers();
                        
                        if (interaction.cards.length === 0) {
                            await modalSubmit.update({
                                content: '✅ Successfully listed your card on the market! You have no more cards to list.',
                                embeds: [],
                                components: []
                            });
                            collector.stop();
                            return;
                        }
                        
                        currentPage = Math.min(currentPage, interaction.cards.length - 1);
                        const newCard = interaction.cards[currentPage];
                        const { embed: newEmbed, files: newFiles } = await createCardEmbed(
                            newCard, 
                            currentPage, 
                            interaction.cards.length
                        );
                        
                        const newRow = createActionRow(
                            currentPage > 0,
                            currentPage < interaction.cards.length - 1,
                            currentPage
                        );
                        
                        await modalSubmit.update({
                            content: `✅ Successfully listed **${cardToSell.name}** for ${price} <:coin:1381692942196150292>!`,
                            embeds: [newEmbed],
                            components: [newRow],
                            files: newFiles
                        });
                    } else {
                        await modalSubmit.reply({
                            content: '❌ Failed to list the card. Please try again later.',
                            ephemeral: true
                        });
                    }
                } catch (error) {
                    console.error('Error in sell modal:', error);
                    await i.followUp({
                        content: 'The listing was cancelled or an error occurred.',
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
                
                const { embed: newEmbed, files: newFiles } = await createCardEmbed(
                    newCard, 
                    currentPage, 
                    interaction.cards.length
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
                    content: 'Timed out. Use the command again if you want to list more cards.',
                    components: [] 
                }).catch(console.error);
            }
        });
    }
};

function getRarityEmoji(rarity) {
    const emojis = {
        'SSR': '🟠',
        'SS': '🟡',
        'S': '🟣',
        'A': '🟢',
        'B': '🔵',
        'C': '⚪'
    };
    return emojis[rarity] || '⚪';
}
