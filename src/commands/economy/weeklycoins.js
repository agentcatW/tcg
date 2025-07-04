const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../../utils/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('weekly-coins')
        .setDescription('Claim your weekly coins (7-day cooldown)'),
    async execute(interaction) {
        const userId = interaction.user.id;
        const now = Date.now();
        const user = await db.getUser(userId);
        
        const lastClaim = user.lastWeeklyCoinClaim || 0;
        const cooldown = 7 * 24 * 60 * 60 * 1000;
        const timeRemaining = (lastClaim + cooldown) - now;

        if (timeRemaining > 0) {
            const days = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
            const hours = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Cooldown Active')
                .setDescription(`You've already claimed your weekly coins. Please wait **${days}d ${hours}h** before claiming again.`);
                
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const coinsEarned = Math.floor(Math.random() * 20001) + 5000;
        user.currency = (user.currency || 0) + coinsEarned;
        user.lastWeeklyCoinClaim = now;
        db.saveUsers();

        const embed = new EmbedBuilder()
            .setColor(0x9B59B6)
            .setTitle('Weekly Coins Claimed!')
            .setDescription(`You've claimed your weekly **${coinsEarned.toLocaleString()} coins**!\nYour new balance: **${user.currency.toLocaleString()} coins**`);
            
        interaction.reply({ embeds: [embed] });
    },
};
