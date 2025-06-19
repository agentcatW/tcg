const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../utils/database');
const market = require('../../utils/market');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('market')
        .setDescription('View the card market')
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View market listings')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('View a specific listing by ID')
                        .setRequired(false)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'view') {
            const listingId = interaction.options.getString('id');
            
            if (listingId) {
                const listing = market.getListing(listingId);
                if (!listing) {
                    return interaction.reply({
                        content: '❌ Listing not found!',
                        ephemeral: true
                    });
                }

                const embed = createListingEmbed(listing);
                
                if (listing.sellerId === interaction.user.id) {
                    const row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`cancel_${listing.id}`)
                                .setLabel('Cancel Listing')
                                .setStyle(ButtonStyle.Danger)
                        );
                    
                    const response = await interaction.reply({
                        embeds: [embed],
                        components: [row],
                        fetchReply: true
                    });

                    const filter = i => i.user.id === interaction.user.id && i.customId === `cancel_${listing.id}`;
                    const collector = response.createMessageComponentCollector({ filter, time: 60000 });

                    collector.on('collect', async i => {
                        const canceled = market.removeListing(listing.id);
                        if (canceled) {
                            const seller = db.getUser(listing.sellerId);
                            if (seller) {
                                seller.cards = seller.cards || [];
                                seller.cards.push(listing.card);
                                db.saveUsers();
                            }
                            
                            await i.update({
                                content: '✅ Listing canceled!',
                                embeds: [],
                                components: []
                            });
                        } else {
                            await i.update({
                                content: '❌ Failed to cancel listing!',
                                ephemeral: true
                            });
                        }
                    });

                    collector.on('end', () => {
                        if (!response.editable) return;
                        response.edit({ components: [] }).catch(console.error);
                    });
                } else {
                    const row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setLabel('Buy Now')
                                .setURL(`https://discord.com/application-directory/${interaction.applicationId}/commands/command/market/buy/${listing.id}`)
                                .setStyle(ButtonStyle.Link)
                        );
                    
                    await interaction.reply({
                        embeds: [embed],
                        components: [row]
                    });
                }
            } else {
                const listings = market.getAllListings();
                if (listings.length === 0) {
                    return interaction.reply({
                        content: 'No listings available in the market!',
                        ephemeral: true
                    });
                }

                const embeds = listings.slice(0, 10).map(createListingEmbed);
                
                await interaction.reply({
                    content: '**Market Listings** (showing 10 most recent)',
                    embeds: embeds
                });
            }
        }
    }
};

function createListingEmbed(listing) {
    const card = listing.card;
    const calculateOVR = (card) => {
        if (card.ovr) return Math.min(99, card.ovr);
        const ovr = Math.round((card.stats.strength + card.stats.defense + card.stats.speed + (card.stats.hp / 2)) / 4);
        return Math.min(99, ovr);
    };
    const ovr = calculateOVR(card);

    const embed = new EmbedBuilder()
        .setTitle(`${card.name} - ${listing.price} <:coin:1381692942196150292>`)
        .addFields(
            { name: 'Rarity', value: card.rarity || 'N/A', inline: true },
            { name: 'OVR', value: ovr.toString(), inline: true },
            { name: 'Stats', value: `❤️ ${card.stats.hp} | ⚔️ ${card.stats.strength} | 🛡️ ${card.stats.defense} | 🏃 ${card.stats.speed}` },
            { name: 'Listing ID', value: `\`${listing.id}\``, inline: true },
            { name: 'Seller', value: `<@${listing.sellerId}>`, inline: true }
        )
        .setColor(0x3498db)
        .setFooter({ text: `Listing ID: ${listing.id}` });

    return embed;
}
