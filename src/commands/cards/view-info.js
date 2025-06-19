const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { getCardById } = require('../../utils/cards/rollUtils');
const { RARITIES } = require('../../utils/cards/cardTemplate');
const { getImageBuffer } = require('../../utils/imageCache');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('view-info')
        .setDescription('View detailed information about a specific card')
        .addStringOption(option =>
            option.setName('id')
                .setDescription('The ID of the card to view')
                .setRequired(true)
        ),

    async execute(interaction) {
        const cardId = interaction.options.getString('id');
        const card = getCardById(cardId);

        if (!card) {
            return interaction.reply({
                content: '❌ No card found with that ID. Use `/catalog` to browse available cards.',
                ephemeral: true
            });
        }

        const rarityData = RARITIES[card.rarity] || {};
        const rarityName = rarityData.name || 'Unknown';
        const rarityColor = rarityData.color || 0x808080;
        const ovr = Math.min(99, Math.round((card.stats.strength + card.stats.defense + card.stats.speed + (card.stats.hp / 2)) / 4));

        const embed = new EmbedBuilder()
            .setColor(rarityColor)
            .setTitle(card.name)
            .setDescription(`**${rarityName}** • OVR: ${ovr}`)
            .addFields(
                { name: 'HP', value: card.stats.hp.toString(), inline: true },
                { name: 'Strength', value: card.stats.strength.toString(), inline: true },
                { name: 'Defense', value: card.stats.defense.toString(), inline: true },
                { name: 'Speed', value: card.stats.speed.toString(), inline: true },
                { name: 'ID', value: `\`${card.id || 'N/A'}\``, inline: false }
            );

        if (card.playstyle) {
            embed.addFields({
                name: 'Playstyle',
                value: card.playstyle,
                inline: false
            });
        }

        try {
            if (card.imagePath) {
                const imageBuffer = await getImageBuffer(card.imagePath);
                if (imageBuffer) {
                    const filename = path.basename(card.imagePath);
                    const attachment = new AttachmentBuilder(imageBuffer, { name: filename });
                    embed.setImage(`attachment://${filename}`);
                    return interaction.reply({
                        embeds: [embed],
                        files: [attachment]
                    });
                }
            }
        } catch (error) {
            console.error('Error loading card image:', error);
        }

        await interaction.reply({ embeds: [embed] });
    }
};
