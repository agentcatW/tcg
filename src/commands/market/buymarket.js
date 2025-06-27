const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../utils/database');
const market = require('../../utils/market');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('buy-market')
        .setDescription('Buy a card from the market')
        .addStringOption(option =>
            option.setName('id')
                .setDescription('ID of the listing to buy')
                .setRequired(true)
        ),

    async execute(interaction) {
        const listingId = interaction.options.getString('id');
        const userId = interaction.user.id;
        const user = db.getUser(userId);
        
        const marketListings = market.getAllListings();
        const listing = marketListings.find(l => l.id === listingId);
        if (!listing) {
            return interaction.reply({
                content: '❌ This listing is no longer available!',
                ephemeral: true
            });
        }

        if (listing.sellerId === userId) {
            return interaction.reply({
                content: '❌ You cannot buy your own listing!',
                ephemeral: true
            });
        }

        if ((user.currency || 0) < listing.price) {
            return interaction.reply({
                content: `❌ You don't have enough coins! You need ${listing.price} but only have ${user.currency || 0}.`,
                ephemeral: true
            });
        }

        const seller = db.getUser(listing.sellerId);
        if (!seller) {
            return interaction.reply({
                content: '❌ Seller not found!',
                ephemeral: true
            });
        }

        try {
            user.currency = (user.currency || 0) - listing.price;
            seller.currency = (seller.currency || 0) + listing.price;

            user.cards = user.cards || [];
            user.cards.push(listing.card);

            market.removeListing(listingId);

            db.saveUsers();

            const embed = new EmbedBuilder()
                .setTitle('✅ Purchase Complete!')
                .setDescription(`You bought **${listing.card.name}** for ${listing.price} <:coin:1381692942196150292>`)
                .addFields(
                    { name: 'Seller', value: `<@${listing.sellerId}>`, inline: true },
                    { name: 'Your Balance', value: `${user.currency} <:coin:1381692942196150292>`, inline: true }
                )
                .setColor(0x2ecc71);

            await interaction.reply({ embeds: [embed] });

            try {
                const sellerUser = await interaction.client.users.fetch(listing.sellerId);
                await sellerUser.send({
                    content: `Your **${listing.card.name}** has been sold for ${listing.price} <:coin:1381692942196150292>!`
                });
            } catch (error) {
                console.error('Failed to DM seller:', error);
            }

        } catch (error) {
            console.error('Market purchase error:', error);
            await interaction.reply({
                content: '❌ An error occurred while processing your purchase!',
                ephemeral: true
            });
        }
    }
};
