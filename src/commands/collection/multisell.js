const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const db = require('../../utils/database');
const { getSellPriceByOVR } = require('../../utils/cards/cardTemplate');
const { checkTradeStatus } = require('../../utils/tradeUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('multi-sell')
        .setDescription('Sell multiple cards within an OVR range')
        .addIntegerOption(option =>
            option.setName('min_ovr')
                .setDescription('Minimum OVR to include')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(99))
        .addIntegerOption(option =>
            option.setName('max_ovr')
                .setDescription('Maximum OVR to include')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(99)),

    async execute(interaction) {
        const userId = interaction.user.id;
        
        if (!(await checkTradeStatus(interaction))) {
            return;
        }
        
        const user = db.getUser(userId);
        const minOvr = interaction.options.getInteger('min_ovr');
        const maxOvr = interaction.options.getInteger('max_ovr');

        if (minOvr > maxOvr) {
            return interaction.reply({
                content: 'Minimum OVR cannot be greater than maximum OVR!',
                ephemeral: true
            });
        }

        const eligibleCards = (user.cards || []).filter(card => {
            const ovr = card.ovr || Math.min(99, Math.round(
                (card.stats.strength + card.stats.defense + card.stats.speed + (card.stats.hp / 2)) / 4
            ));
            return ovr >= minOvr && ovr <= maxOvr;
        }).sort((a, b) => {
            const ovrA = a.ovr || Math.min(99, Math.round(
                (a.stats.strength + a.stats.defense + a.stats.speed + (a.stats.hp / 2)) / 4
            ));
            const ovrB = b.ovr || Math.min(99, Math.round(
                (b.stats.strength + b.stats.defense + b.stats.speed + (b.stats.hp / 2)) / 4
            ));
            return ovrB - ovrA;
        });

        if (eligibleCards.length === 0) {
            return interaction.reply({
                content: `You don't have any cards between OVR ${minOvr} and ${maxOvr}!`,
                ephemeral: true
            });
        }

        let totalValue = 0;
        const cardValues = [];
        
        for (const card of eligibleCards) {
            const ovr = card.ovr || Math.min(99, Math.round(
                (card.stats.strength + card.stats.defense + card.stats.speed + (card.stats.hp / 2)) / 4
            ));
            const value = Math.floor(getSellPriceByOVR(ovr) * 0.6);
            totalValue += value;
            cardValues.push({ id: card.id, value });
        }

        const embed = new EmbedBuilder()
            .setTitle('Multi-Sell Confirmation')
            .setDescription(`You're about to sell ${eligibleCards.length} cards with OVR ${minOvr}-${maxOvr}`)
            .addFields(
                { name: 'Cards to Sell', value: eligibleCards.length.toString(), inline: true },
                { name: 'Total Value', value: `${totalValue} <:coin:1381692942196150292>`, inline: true }
            )
            .setColor(0xFFA500);

        const confirmButton = new ButtonBuilder()
            .setCustomId('confirm_sell')
            .setLabel('Sell All')
            .setStyle(ButtonStyle.Danger);

        const cancelButton = new ButtonBuilder()
            .setCustomId('cancel_sell')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

        const response = await interaction.reply({
            embeds: [embed],
            components: [row],
            fetchReply: true
        });

        const filter = i => i.user.id === interaction.user.id;
        const collector = response.createMessageComponentCollector({ filter, time: 30000 });

        collector.on('collect', async i => {
            if (i.customId === 'confirm_sell') {
                user.cards = user.cards.filter(card => 
                    !eligibleCards.some(c => c.id === card.id)
                );
                
                user.currency = (user.currency || 0) + totalValue;
                db.saveUsers();

                await i.update({
                    content: `✅ Sold ${eligibleCards.length} cards for a total of ${totalValue} <:coin:1381692942196150292>!`,
                    embeds: [],
                    components: []
                });
            } else {
                await i.update({
                    content: 'Sale cancelled.',
                    embeds: [],
                    components: []
                });
            }
            collector.stop();
        });

        collector.on('end', () => {
            if (!response.editable) return;
            response.edit({ components: [] }).catch(console.error);
        });
    }
};
