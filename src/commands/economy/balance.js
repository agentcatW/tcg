const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../utils/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Check your current coin balance')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to check the balance of (optional)')
                .setRequired(false)
        ),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const user = db.getUser(targetUser.id);
        
        const formattedBalance = user.currency?.toLocaleString() || '0';
        
        const embed = new EmbedBuilder()
            .setColor(0xFFD700)
            .setTitle(`💰 ${targetUser.username}'s Balance`)
            .setDescription(`**${formattedBalance}** <:coin:1381692942196150292>`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .setFooter({ 
                text: targetUser.id === interaction.user.id 
                    ? 'Use /shop to see what you can buy!' 
                    : `Requested by ${interaction.user.username}`,
                iconURL: interaction.user.displayAvatarURL({ dynamic: true })
            });

        await interaction.reply({ embeds: [embed] });
    }
};
