const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { PLAYSTYLES } = require('../../utils/cards/cardTemplate');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('playstyles')
        .setDescription('View all available card playstyles and their effects')
        .addStringOption(option =>
            option.setName('playstyle')
                .setDescription('View details of a specific playstyle')
                .setRequired(false)
                .addChoices(
                    ...Object.entries(PLAYSTYLES).map(([key, style]) => ({
                        name: style.name,
                        value: key
                    }))
                )
        ),

    async execute(interaction) {
        const selectedPlaystyle = interaction.options.getString('playstyle');
        
        if (selectedPlaystyle) {
            const playstyle = PLAYSTYLES[selectedPlaystyle];
            const embed = new EmbedBuilder()
                .setColor(0x3498db)
                .setTitle(`🔹 ${playstyle.name} Playstyle`)
                .setDescription(playstyle.description);

            if (playstyle.effects) {
                embed.addFields({
                    name: 'Effects',
                    value: playstyle.effects.map(effect => `• ${effect}`).join('\n')
                });
            }

            return interaction.reply({
                embeds: [embed],
                flags: 64
            });
        }

        const embed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle('Available Playstyles')
            .setDescription('Special abilities that cards can have. Use `/playstyles [name]` for more details.');

        for (const [key, playstyle] of Object.entries(PLAYSTYLES)) {
            embed.addFields({
                name: `🔹 ${playstyle.name} (${playstyle.type})`,
                value: `${playstyle.description}\n*ID: ${key}*`,
                inline: false
            });
        }

        await interaction.reply({
            embeds: [embed],
            flags: 64
        });
    }
};
