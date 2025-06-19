const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const db = require('../../utils/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('collection')
        .setDescription('View your or another user\'s card collection or packs')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user whose collection to view (leave empty for your own)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('type')
                .setDescription('What would you like to view?')
                .setRequired(false)
                .addChoices(
                    { name: 'Cards', value: 'cards' },
                    { name: 'Packs', value: 'packs' }
                )),

    async execute(interaction) {
        const type = interaction.options.getString('type') || 'cards';
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const userId = targetUser.id;
        const user = db.getUser(userId);
        
        if (!user) {
            return interaction.reply({
                content: 'User not found in the database.',
                ephemeral: true
            });
        }

        try {
            if (type === 'cards') {
                await showCards(interaction, user, targetUser);
            } else if (type === 'packs') {
                await showPacks(interaction, user, targetUser);
            }
        } catch (error) {
            console.error('Error in collection command:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: 'An error occurred while processing your request.'
                });
            } else if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ 
                    content: 'An error occurred while processing your request.'
                });
            }
        }
    }
};

async function showCards(interaction, user, targetUser) {
    const cards = user.cards || [];
    const isSelf = interaction.user.id === targetUser.id;
    
    if (cards.length === 0) {
        const message = isSelf 
            ? 'You don\'t have any cards yet! Try using `/hourlyroll`, `/dailyroll`, or `/weeklyroll` to get some cards.'
            : `${targetUser.username} doesn't have any cards yet!`;
            
        return interaction.reply({ 
            content: message,
            ephemeral: !isSelf
        });
    }

    const sortedCards = [...cards].sort((a, b) => {
        const calculateOVR = (card) => {
            if (card.ovr) return Math.min(99, card.ovr);
            const ovr = Math.round((card.stats.strength + card.stats.defense + card.stats.speed + (card.stats.hp / 2)) / 4);
            return Math.min(99, ovr);
        };
        const ovrA = calculateOVR(a);
        const ovrB = calculateOVR(b);
        if (ovrB !== ovrA) return ovrB - ovrA;
        return a.name.localeCompare(b.name);
    });

    const cardsPerPage = 6;
    const totalPages = Math.ceil(sortedCards.length / cardsPerPage);
    const embeds = [];

    for (let page = 0; page < totalPages; page++) {
        const startIdx = page * cardsPerPage;
        const pageCards = sortedCards.slice(startIdx, startIdx + cardsPerPage);
        
        const cardList = pageCards.map((card, idx) => {
            const cardNumber = startIdx + idx + 1;
            const calculateOVR = (card) => {
                if (card.ovr) return Math.min(99, card.ovr);
                const ovr = Math.round((card.stats.strength + card.stats.defense + card.stats.speed + (card.stats.hp / 2)) / 4);
                return Math.min(99, ovr);
            };
            return `${cardNumber} - **${card.name}** • ${card.rarity} • OVR ${calculateOVR(card)} • ID ${cardNumber}`;
        }).join('\n');
        
        const embed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle(`${targetUser.username}'s Collection`)
            .setDescription(cardList)
            .setFooter({ text: `Page ${page + 1} of ${totalPages}` });
            
        embeds.push(embed);
    }

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('prev_page')
                .setLabel('Previous')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId('next_page')
                .setLabel('Next')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(totalPages <= 1)
        );

    const components = [row];

    const response = await interaction.reply({
        embeds: [embeds[0]],
        components: components,
        fetchReply: true,
        ephemeral: interaction.ephemeral || false
    });

    if (embeds.length <= 1) return;

    let currentPage = 0;

    try {
        const SESSION_TIMEOUT = 90000;
        const collector = response.createMessageComponentCollector({ 
            componentType: ComponentType.Button,
            time: SESSION_TIMEOUT,
            dispose: true
        });

        const sessionTimeout = setTimeout(async () => {
            try {
                const expiredEmbed = new EmbedBuilder()
                    .setColor(0x888888)
                    .setTitle('Session Expired')
                    .setDescription('This collection view has expired. Use `/collection` again to view your cards.');
                
                await response.edit({ 
                    embeds: [expiredEmbed], 
                    components: [] 
                });
            } catch (error) {
                console.error('Error updating expired session message:', error);
            }
        }, SESSION_TIMEOUT);

        const handleCollect = async (i) => {
            try {
                clearTimeout(sessionTimeout);
                
                if (i.customId === 'prev_page' && currentPage > 0) {
                    currentPage--;
                } else if (i.customId === 'next_page' && currentPage < embeds.length - 1) {
                    currentPage++;
                }

                row.components[0].setDisabled(currentPage === 0);
                row.components[1].setDisabled(currentPage === embeds.length - 1);

                await i.update({ 
                    embeds: [embeds[currentPage]],
                    components: [row]
                });
            } catch (error) {
                if (error.code !== 10008) {
                    console.error('Error handling button interaction:', error);
                }
            }
        };

        const handleEnd = async (collected, reason) => {
            clearTimeout(sessionTimeout);
            try {
                if (reason === 'time') {
                    const expiredEmbed = new EmbedBuilder()
                        .setColor(0x888888)
                        .setTitle('Session Expired')
                        .setDescription('This collection view has expired. Use `/collection` again to view your cards.');
                    
                    await response.edit({ 
                        embeds: [expiredEmbed], 
                        components: [] 
                    }).catch(() => {});
                } else if (reason !== 'messageDelete') {
                    await response.edit({ components: [] }).catch(() => {});
                }
            } catch (error) {
                if (error.code !== 10008) {
                    console.error('Error cleaning up components:', error);
                }
            }
        };

        collector.on('collect', handleCollect);
        collector.on('end', handleEnd);
    } catch (error) {
        console.error('Error setting up collector:', error);
    }
}

async function showPacks(interaction, user, targetUser) {
    const packs = user.packs || {};
    const totalPacks = Object.values(packs).reduce((a, b) => a + b, 0);
    const isSelf = interaction.user.id === targetUser.id;
    const title = isSelf ? 'Your Card Packs' : `${targetUser.username}'s Card Packs`;
    
    if (totalPacks === 0) {
        const message = isSelf
            ? 'You don\'t have any card packs yet! Try using `/hourlyroll`, `/dailyroll`, or `/weeklyroll` to get some packs.'
            : `${targetUser.username} doesn't have any card packs yet!`;
            
        return interaction.reply({ 
            content: message,
            ephemeral: !isSelf
        });
    }

    const packList = Object.entries(packs).map(([pack, count]) => {
        return `${pack.charAt(0).toUpperCase() + pack.slice(1)} Pack: ${count}`;
    }).join('\n');

    const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle(title)
        .setDescription(packList)
        .setFooter({ text: `Total: ${totalPacks} packs` });

    for (const [pack, count] of Object.entries(packs)) {
        if (count > 0) {
            embed.addFields({
                name: `${pack.charAt(0).toUpperCase() + pack.slice(1)} Pack`,
                value: `Quantity: ${count}`,
                inline: true
            });
        }
    }

    await interaction.reply({ 
        embeds: [embed]
    });
}
