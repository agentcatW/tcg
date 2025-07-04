const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../../utils/database');
const { packs } = require('../../utils/shopItems');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('buy')
        .setDescription('Purchase an item from the shop')
        .addStringOption(option =>
            option.setName('item')
                .setDescription('The item to purchase')
                .setRequired(true)
                .addChoices(
                    { 
                        name: `Beginner Pack (${packs.beginner.price.toLocaleString()} coins)`, 
                        value: 'beginner' 
                    },
                    { 
                        name: `Novice Pack (${packs.novice.price.toLocaleString()} coins)`, 
                        value: 'novice' 
                    },
                    { 
                        name: `Expert Pack (${packs.expert.price.toLocaleString()} coins)`, 
                        value: 'expert' 
                    },
                    { 
                        name: `Master Pack (${packs.master.price.toLocaleString()} coins)`, 
                        value: 'master' 
                    },
                    { 
                        name: `Legend Pack (${packs.legend.price.toLocaleString()} coins)`, 
                        value: 'legend' 
                    }
                ))
        .addIntegerOption(option =>
            option.setName('quantity')
                .setDescription('Number of packs to buy (default: 1)')
                .setMinValue(1)
                .setMaxValue(1000)),

    async execute(interaction) {
        const userId = interaction.user.id;
        const itemId = interaction.options.getString('item');
        const quantity = interaction.options.getInteger('quantity') || 1;
        
        const pack = packs[itemId];
        if (!pack) {
            return interaction.reply({
                content: '❌ Invalid item selected.',
                flags: MessageFlags.Ephemeral
            });
        }

        const user = db.getUser(userId);
        const totalCost = pack.price * quantity;

        if (user.currency < totalCost) {
            return interaction.reply({
                content: `❌ You don't have enough coins. You need ${totalCost.toLocaleString()} <:coin:1381692942196150292> but only have ${user.currency.toLocaleString()}.`,
                flags: MessageFlags.Ephemeral
            });
        }

        user.currency -= totalCost;
        user.packs[itemId] = (user.packs[itemId] || 0) + quantity;
        db.saveUsers();

        const embed = new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle('✅ Purchase Successful')
            .setDescription(`You've purchased **${quantity}x ${pack.name}** for ${totalCost.toLocaleString()} <:coin:1381692942196150292>`)
            .addFields(
                { name: 'Item', value: `${pack.emoji} ${pack.name}`, inline: true },
                { name: 'Quantity', value: quantity.toString(), inline: true },
                { name: 'Total Cost', value: `${totalCost.toLocaleString()} <:coin:1381692942196150292>`, inline: true },
                { name: 'New Balance', value: `${user.currency.toLocaleString()} <:coin:1381692942196150292>`, inline: false },
                { name: '\u200B', value: `Use \`/collection type:packs\` to view your packs.` }
            );

        await interaction.reply({ embeds: [embed] });
    }
};
