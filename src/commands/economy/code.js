const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../../utils/database');
const { 
    getCodeData, 
    hasUsedCode, 
    markCodeAsUsed, 
    applyCodeRewards 
} = require('../../utils/codes');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('code')
        .setDescription('Redeem a code for rewards')
        .addStringOption(option =>
            option.setName('code')
                .setDescription('The code to redeem')
                .setRequired(true)),
    async execute(interaction) {
        const userId = interaction.user.id;
        const code = interaction.options.getString('code');
        const user = await db.getUser(userId);
        
        const codeData = getCodeData(code);
        if (!codeData) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Invalid Code')
                .setDescription('The code you entered is invalid or has expired.');
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
        
        if (!codeData.reusable && hasUsedCode(user, code)) {
            const embed = new EmbedBuilder()
                .setColor(0xFFA500) 
                .setTitle('Code Already Used')
                .setDescription('You have already redeemed this code.');
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
        
        if (!codeData.reusable) {
            markCodeAsUsed(user, code);
        }
        
        applyCodeRewards(user, codeData);
        
        db.saveUsers();
        
        let rewardsDesc = [];
        if (codeData.coins) {
            rewardsDesc.push(`<:coin:1381692942196150292> **${codeData.coins.toLocaleString()} coins**`);
        }
        if (codeData.packs) {
            for (const [pack, quantity] of Object.entries(codeData.packs)) {
                if (quantity > 0) {
                    rewardsDesc.push(`🎁 **${quantity}x ${pack.charAt(0).toUpperCase() + pack.slice(1)} Pack${quantity > 1 ? 's' : ''}**`);
                }
            }
        }
        
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Code Redeemed Successfully!')
            .setDescription(`You've successfully redeemed the code: **${code.toUpperCase()}**`)
            .addFields(
                { name: 'Rewards Received', value: rewardsDesc.join('\n') || 'No rewards specified' },
                { name: 'New Balance', value: `<:coin:1381692942196150292> **${user.currency.toLocaleString()} coins**` }
            );
            
        interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    },
};
