const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../utils/database');
const { packs } = require('../../utils/shopItems');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('View and purchase items from the shop'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const user = db.getUser(userId);

        const embed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle('🛒 Card Pack Shop')
            .setDescription('Browse and purchase card packs with your coins')
            .addFields(
                { name: '\u200B', value: '**Available Packs**', inline: false },
                ...Object.entries(packs).map(([id, pack]) => ({
                    name: `${pack.emoji} ${pack.name} - ${pack.price.toLocaleString()} <:coin:1381692942196150292>`,
                    value: `${pack.description}\nUse: \`/buy ${id}\``,
                    inline: true
                }))
            )
            .setFooter({ text: `Your balance: ${user.currency.toLocaleString()} coins` });

        await interaction.reply({ embeds: [embed] });
    }
};
