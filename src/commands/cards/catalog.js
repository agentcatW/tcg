const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getAllCards } = require('../../utils/cards/rollUtils');
const { RARITIES } = require('../../utils/cards/cardTemplate');

const CARDS_PER_PAGE = 6;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('catalog')
        .setDescription('View all available cards in the game')
        .addIntegerOption(option =>
            option.setName('page')
                .setDescription('Page number')
                .setRequired(false)
        ),

    async execute(interaction) {
        const allCards = getAllCards();
        const totalPages = Math.ceil(allCards.length / CARDS_PER_PAGE);
        let currentPage = interaction.options.getInteger('page') || 1;
        
        if (currentPage < 1) currentPage = 1;
        if (currentPage > totalPages) currentPage = totalPages;

        const startIdx = (currentPage - 1) * CARDS_PER_PAGE;
        const endIdx = startIdx + CARDS_PER_PAGE;
        const pageCards = allCards.slice(startIdx, endIdx);

        const embed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle('📚 Card Catalog')
            .setDescription(`Page ${currentPage} of ${totalPages} • Showing ${pageCards.length} cards`)
            .setFooter({ text: 'Use /view-info <id> to see detailed information about a card' });

        pageCards.forEach(card => {
            const rarityData = RARITIES[card.rarity] || {};
            const rarityName = rarityData.name || 'Unknown';
            const ovr = card.ovr !== undefined ? 
                Math.min(99, card.ovr) : 
                Math.min(99, Math.round((card.stats.strength + card.stats.defense + card.stats.speed + (card.stats.hp / 2)) / 4));
            
            embed.addFields({
                name: `${card.name} (${rarityName})`,
                value: `ID: \`${card.id || 'N/A'}\` • OVR: ${ovr}${card.playstyle ? ` • ${card.playstyle}` : ''}`,
                inline: false
            });
        });

        const row = new ActionRowBuilder();
        
        if (currentPage > 1) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('prev')
                    .setLabel('Previous')
                    .setStyle(ButtonStyle.Primary)
            );
        }
        
        if (currentPage < totalPages) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Primary)
            );
        }

        const response = await interaction.reply({
            embeds: [embed],
            components: row.components.length > 0 ? [row] : [],
            fetchReply: true
        });

        if (row.components.length > 0) {
            const filter = i => i.customId === 'prev' || i.customId === 'next';
            const collector = response.createMessageComponentCollector({ filter, time: 60000 });

            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: 'Only the command user can interact with these buttons.', ephemeral: true });
                }

                if (i.customId === 'prev' && currentPage > 1) {
                    currentPage--;
                } else if (i.customId === 'next' && currentPage < totalPages) {
                    currentPage++;
                }

                const newStartIdx = (currentPage - 1) * CARDS_PER_PAGE;
                const newEndIdx = newStartIdx + CARDS_PER_PAGE;
                const newPageCards = allCards.slice(newStartIdx, newEndIdx);

                const newEmbed = new EmbedBuilder()
                    .setColor(0x3498db)
                    .setTitle('📚 Card Catalog')
                    .setDescription(`Page ${currentPage} of ${totalPages} • Showing ${newPageCards.length} cards`)
                    .setFooter({ text: 'Use /view-info <id> to see detailed information about a card' });

                newPageCards.forEach(card => {
                    const rarityData = RARITIES[card.rarity] || {};
                    const rarityName = rarityData.name || 'Unknown';
                    const calculateOVR = (card) => {
                        if (card.ovr) return Math.min(99, card.ovr);
                        const ovr = Math.round((card.stats.strength + card.stats.defense + card.stats.speed + (card.stats.hp / 2)) / 4);
                        return Math.min(99, ovr);
                    };
                    const ovr = calculateOVR(card);
                    
                    newEmbed.addFields({
                        name: `${card.name} (${rarityName})`,
                        value: `ID: \`${card.id || 'N/A'}\` • OVR: ${ovr}${card.playstyle ? ` • ${card.playstyle}` : ''}`,
                        inline: false
                    });
                });

                const newRow = new ActionRowBuilder();
                
                if (currentPage > 1) {
                    newRow.addComponents(
                        new ButtonBuilder()
                            .setCustomId('prev')
                            .setLabel('Previous')
                            .setStyle(ButtonStyle.Primary)
                    );
                }
                
                if (currentPage < totalPages) {
                    newRow.addComponents(
                        new ButtonBuilder()
                            .setCustomId('next')
                            .setLabel('Next')
                            .setStyle(ButtonStyle.Primary)
                    );
                }

                await i.update({ 
                    embeds: [newEmbed],
                    components: newRow.components.length > 0 ? [newRow] : []
                });
            });

            collector.on('end', () => {
                const disabledRow = new ActionRowBuilder();
                row.components.forEach(component => {
                    disabledRow.addComponents(component.setDisabled(true));
                });
                response.edit({ components: [disabledRow] }).catch(console.error);
            });
        }
    }
};
