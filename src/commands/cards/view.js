const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, AttachmentBuilder } = require('discord.js');
const db = require('../../utils/database');
const { getImageBuffer } = require('../../utils/imageCache');
const path = require('path');

const RARITY_LIST = ['SSR', 'SS', 'S', 'A', 'B', 'C'];
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
    
    const embed = new EmbedBuilder()
        .setColor(RARITY_COLORS[rarity] || 0x808080)
        .setTitle(card.name)
        .setDescription(`**Rarity**: ${rarity} ${getRarityEmoji(rarity)}\n**OVR**: ${ovr}`)
        .addFields(
            { name: 'STR', value: card.stats.strength.toString(), inline: true },
            { name: 'DEF', value: card.stats.defense.toString(), inline: true },
            { name: 'SPD', value: card.stats.speed.toString(), inline: true },
            { name: 'HP', value: card.stats.hp.toString(), inline: true },
            { name: 'Playstyle', value: card.playstyle || 'None', inline: true }
        )
        .setFooter({ 
            text: `Card ${page + 1} of ${totalPages} | Use the buttons to browse your collection`
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
                .setDisabled(!hasNext)
        );
    
    return row;
}

function sortCards(cards) {
    return [...cards].sort((a, b) => {
        const rarityA = RARITY_LIST.indexOf(a.rarity);
        const rarityB = RARITY_LIST.indexOf(b.rarity);
        
        if (rarityA !== rarityB) {
            return rarityA - rarityB;
        }
        
        const ovrA = calculateOVR(a);
        const ovrB = calculateOVR(b);
        return ovrB - ovrA;
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('view')
        .setDescription('View detailed information about a card'),

    async execute(interaction) {
        const user = db.getUser(interaction.user.id);
        const sortedCards = sortCards(user.cards || []);

        if (sortedCards.length === 0) {
            return interaction.reply({
                content: "You don't have any cards yet! Try using `/hourlyroll` to get some cards.",
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
            content: '**Your Card Collection**\n*Browse through your cards using the buttons below*',
            embeds: [embed],
            components: [row],
            files: files,
            fetchReply: true,
        });
        
        const filter = i => i.user.id === interaction.user.id;
        const collector = response.createMessageComponentCollector({ 
            filter,
            componentType: ComponentType.Button,
            time: 300000
        });
        
        collector.on('collect', async i => {
            if (i.customId === 'prev' || i.customId === 'next') {
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
                    content: 'Timed out. Use the command again if you want to view your cards.',
                    components: [] 
                }).catch(console.error);
            }
        });
        
        return response;
    }
};

const { PLAYSTYLES } = require('../../utils/cards/cardTemplate');

async function showCardDetails(interaction, card) {
    const stats = card.stats || {};
    const ovr = Math.min(99, Math.round((stats.strength + stats.defense + stats.speed + (stats.hp / 2)) / 4));

    const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(card.name)
        .setDescription(`**${card.rarity}** • OVR ${ovr}`)
        .addFields(
            { name: 'HP', value: stats.hp.toString(), inline: true },
            { name: 'Strength', value: stats.strength.toString(), inline: true },
            { name: 'Defense', value: stats.defense.toString(), inline: true },
            { name: 'Speed', value: stats.speed.toString(), inline: true }
        );

    if (card.playstyle && PLAYSTYLES[card.playstyle]) {
        const playstyle = PLAYSTYLES[card.playstyle];
        let playstyleText = `**${playstyle.name}**\n${playstyle.description}`;
        
        if (playstyle.effects && playstyle.effects.length > 0) {
            playstyleText += '\n\n**Effects:**\n' + 
                playstyle.effects.map(effect => `• ${effect}`).join('\n');
        }
        
        embed.addFields({
            name: 'Playstyle',
            value: playstyleText,
            inline: false
        });
    }

    if (card.imagePath) {
        try {
            const imageBuffer = await getImageBuffer(card.imagePath);
            if (imageBuffer) {
                const filename = path.basename(card.imagePath);
                const attachment = new AttachmentBuilder(imageBuffer, { name: filename });
                embed.setImage(`attachment://${filename}`);
                
                return interaction.update({
                    content: null,
                    embeds: [embed],
                    files: [attachment],
                    components: []
                });
            }
        } catch (error) {
            console.error('Error loading card image:', error);
        }
    }

    await interaction.update({
        content: null,
        embeds: [embed],
        components: []
    });
}

function getRarityEmoji(rarity) {
    const emojis = {
        'C': '⚪',
        'B': '🔵',
        'A': '🟢',
        'S': '🟣',
        'SS': '🟡',
        'SSR': '🟠'
    };
    return emojis[rarity] || '🔘';
}
