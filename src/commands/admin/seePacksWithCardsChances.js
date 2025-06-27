const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { packs } = require('../../utils/shopItems');
const { getAllCards } = require('../../utils/cards/rollUtils');
const { RARITIES } = require('../../utils/cards/cardTemplate');

const RARITY_EMOJIS = {
    'C': 'Beginner',
    'B': 'Novice',
    'A': 'Expert',
    'S': 'Master',
    'SS': 'Legend',
    'SSR': 'Elite'
};

const RARITY_COLORS = {
    'C': 0x808080,
    'B': 0x1EFF00,
    'A': 0x0070FF,
    'S': 0xA335EE,
    'SS': 0xFF8000,
    'SSR': 0xE6CC80
};

function calculateOVR(card) {
    return Math.round((card.stats.strength + card.stats.defense + card.stats.speed + (card.stats.hp / 2)) / 4);
}

function getCardsByOVRRange(cards, min, max) {
    return cards.filter(card => {
        let ovr = calculateOVR(card);
        if (ovr > 99) ovr = 99;
        return ovr >= min && ovr <= max;
    });
}

function groupCardsByRarity(cards) {
    const groups = {};
    for (const card of cards) {
        if (!groups[card.rarity]) {
            groups[card.rarity] = [];
        }
        groups[card.rarity].push(card);
    }
    return groups;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('seepackswithcardschances')
        .setDescription('[Admin Only] Shows all cards in each pack with their rarities and drop chances'),

    async execute(interaction) {
        const config = require('../../config/config.json');
        const isAdmin = config.adminUserIds && config.adminUserIds.includes(interaction.user.id);
        
        if (!isAdmin) {
            return interaction.reply({
                content: '❌ This command is only available to administrators.',
                ephemeral: true
            });
        }
        await interaction.deferReply();
        const allCards = getAllCards();
        const packEntries = Object.entries(packs);
        const packEmbeds = [];

        for (const [packId, pack] of packEntries) {
            const fields = [];
            let totalChance = 0;
            
            for (const range of pack.ovrChances) {
                const cardsInRange = getCardsByOVRRange(allCards, range.min, range.max);
                const cardsByRarity = groupCardsByRarity(cardsInRange);
                
                let rangeInfo = `**OVR ${range.min}-${range.max}** (${range.chance.toFixed(2)}%)\n`;
                
                const sortedRarities = Object.keys(cardsByRarity).sort((a, b) => 
                    Object.keys(RARITIES).indexOf(b) - Object.keys(RARITIES).indexOf(a)
                );
                
                for (const rarity of sortedRarities) {
                    const cards = cardsByRarity[rarity];
                    const rarityName = RARITIES[rarity]?.name || rarity;
                    const rarityEmoji = RARITY_EMOJIS[rarity] || '';
                    const cardNames = cards.map(c => c.name).join(', ');
                    rangeInfo += `\n${rarityEmoji} **${rarityName}** (${cards.length}): ${cardNames}`;
                }
                
                fields.push({
                    name: `OVR ${range.min}-${range.max} (${range.chance.toFixed(2)}%)`,
                    value: rangeInfo,
                    inline: false
                });
                
                totalChance += range.chance;
            }
            
            const embed = new EmbedBuilder()
                .setColor(RARITY_COLORS[packId === 'legend' ? 'SS' : packId === 'master' ? 'S' : 'A'] || 0x3498db)
                .setTitle(`${pack.emoji} ${pack.name}`)
                .setDescription(pack.description)
                .addFields(
                    {
                        name: 'Price',
                        value: `${pack.price.toLocaleString()} <:coin:1381692942196150292>`,
                        inline: true
                    },
                    {
                        name: 'Total Chance',
                        value: `${totalChance.toFixed(2)}%`,
                        inline: true
                    },
                    { name: '\u200B', value: '**Cards by OVR Range**', inline: false },
                    ...fields
                );
                
            packEmbeds.push({
                name: pack.name,
                embed: embed
            });
        }
        
        const currentPage = 0;
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('prev')
                    .setLabel('Previous')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(currentPage === 0),
                new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(currentPage === packEmbeds.length - 1)
            );

        const response = await interaction.editReply({
            embeds: [packEmbeds[currentPage].embed],
            components: [row],
            fetchReply: true
        });

        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300000
        });

        let currentIndex = currentPage;
        let sessionTimeout = setTimeout(() => collector.stop('time'), 300000);

        const handleCollect = async (i) => {
            try {
                clearTimeout(sessionTimeout);
                
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: 'These buttons are not for you!', ephemeral: true });
                }

                if (i.customId === 'prev' && currentIndex > 0) {
                    currentIndex--;
                } else if (i.customId === 'next' && currentIndex < packEmbeds.length - 1) {
                    currentIndex++;
                }

                row.components[0].setDisabled(currentIndex === 0);
                row.components[1].setDisabled(currentIndex === packEmbeds.length - 1);

                await i.update({
                    embeds: [packEmbeds[currentIndex].embed],
                    components: [row]
                });

                sessionTimeout = setTimeout(() => collector.stop('time'), 300000);
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
                        .setDescription('This pack view has expired. Use the command again to view packs.');
                    
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
    }
};
