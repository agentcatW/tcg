const { SlashCommandBuilder, EmbedBuilder } = require('@discordjs/builders');
const db = require('../../utils/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily-coins')
        .setDescription('Claim your daily coins (24h cooldown)'),
    async execute(interaction) {
        const userId = interaction.user.id;
        const now = Date.now();
        const user = await db.getUser(userId);
        
        const lastClaim = user.lastCoinClaim || 0;
        const cooldown = 24 * 60 * 60 * 1000;
        const timeRemaining = (lastClaim + cooldown) - now;

        if (timeRemaining > 0) {
            const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
            const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
            
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Cooldown Active')
                .setDescription(`You've already claimed your daily coins. Please wait **${hours}h ${minutes}m** before claiming again.`);
                
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const coinsEarned = Math.floor(Math.random() * 2001) + 500;
        user.currency = (user.currency || 0) + coinsEarned;
        user.lastCoinClaim = now;
        db.saveUsers();

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Daily Coins Claimed!')
            .setDescription(`You've claimed your daily **${coinsEarned} coins**!\nYour new balance: **${user.currency} coins**`);
            
        interaction.reply({ embeds: [embed] });
    },
};
