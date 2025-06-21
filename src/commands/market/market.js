const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, AttachmentBuilder } = require('discord.js');
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

                const itemsPerPage = 1;
                let currentPage = 0;
                const totalPages = Math.ceil(listings.length / itemsPerPage);

                const getCurrentPageEmbed = () => {
                    const startIdx = currentPage * itemsPerPage;
                    const endIdx = startIdx + itemsPerPage;
                    const currentListings = listings.slice(startIdx, endIdx);
                    
                    if (currentListings.length === 0) return { embed: null, files: [] };
                    
                    const result = createListingEmbed(currentListings[0]);
                    result.embed.setFooter({ 
                        text: `Page ${currentPage + 1} of ${totalPages} • Use the buttons to navigate`,
                        iconURL: interaction.user.displayAvatarURL()
                    });
                    return result;
                };

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('prev')
                            .setLabel('◀️')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(currentPage === 0),
                        new ButtonBuilder()
                            .setCustomId('buy')
                            .setLabel('Buy Now')
                            .setStyle(ButtonStyle.Success)
                            .setEmoji('💰'),
                        new ButtonBuilder()
                            .setCustomId('next')
                            .setLabel('▶️')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(currentPage >= totalPages - 1)
                    );

                const currentPageData = getCurrentPageEmbed();
                if (!currentPageData || !currentPageData.embed) {
                    return interaction.reply({
                        content: 'No listings available in the market!',
                        ephemeral: true
                    });
                }

                const replyOptions = {
                    embeds: [currentPageData.embed],
                    components: [row],
                    fetchReply: true
                };

                if (currentPageData.files && currentPageData.files.length > 0) {
                    replyOptions.files = currentPageData.files;
                }

                const response = await interaction.reply(replyOptions);

                const filter = i => i.user.id === interaction.user.id;
                const collector = response.createMessageComponentCollector({ 
                    filter, 
                    componentType: ComponentType.Button,
                    time: 300000
                });

                collector.on('collect', async i => {
                    if (i.customId === 'prev' && currentPage > 0) {
                        currentPage--;
                    } else if (i.customId === 'next' && currentPage < totalPages - 1) {
                        currentPage++;
                    } else if (i.customId === 'buy') {
                        const currentListings = listings.slice(
                            currentPage * itemsPerPage, 
                            (currentPage * itemsPerPage) + itemsPerPage
                        );
                        
                        if (currentListings.length > 0) {
                            const listing = currentListings[0];
                            const buyer = db.getUser(interaction.user.id);
                            const seller = db.getUser(listing.sellerId);
                            
                            if (buyer.currency < listing.price) {
                                return i.reply({
                                    content: '❌ You don\'t have enough coins to buy this card!',
                                    ephemeral: true
                                });
                            }
                            
                            buyer.currency -= listing.price;
                            seller.currency = (seller.currency || 0) + listing.price;
                            
                            buyer.cards = buyer.cards || [];
                            buyer.cards.push(listing.card);
                            
                            market.removeListing(listing.id);
                            
                            db.saveUsers();
                            
                            await i.update({
                                content: `✅ Successfully purchased **${listing.card.name}** for ${listing.price} <:coin:1381692942196150292>!`,
                                embeds: [],
                                components: []
                            });
                            return;
                        }
                    }
                    
                    row.components[0].setDisabled(currentPage === 0);
                    row.components[2].setDisabled(currentPage >= totalPages - 1);
                    
                    const currentPageData = getCurrentPageEmbed();
                    if (!currentPageData || !currentPageData.embed) {
                        return i.update({
                            content: 'This listing is no longer available.',
                            embeds: [],
                            components: []
                        });
                    }

                    const updateOptions = {
                        embeds: [currentPageData.embed],
                        components: [row]
                    };

                    if (currentPageData.files && currentPageData.files.length > 0) {
                        updateOptions.files = currentPageData.files;
                    }

                    await i.update(updateOptions);
                });

                collector.on('end', () => {
                    if (!response.editable) return;
                    response.edit({ components: [] }).catch(console.error);
                });
            }
        }
    }
};

function createListingEmbed(listing) {
    const card = listing.card || {};
    const stats = card.stats || { hp: 0, strength: 0, defense: 0, speed: 0 };
    
    const calculateOVR = (card) => {
        if (card.ovr) return Math.min(99, card.ovr);
        const ovr = Math.round((stats.strength + stats.defense + stats.speed + (stats.hp / 2)) / 4);
        return Math.min(99, ovr);
    };
    
    const ovr = calculateOVR(card);
    const title = `${card.name || 'Unnamed Card'} - ${listing.price?.toLocaleString() || '0'} <:coin:1381692942196150292>`;
    const description = `**${card.rarity || 'N/A'}** • OVR: ${ovr}`;

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(0x3498db);

    const statsValue = `❤️ ${stats.hp} | ⚔️ ${stats.strength} | 🛡️ ${stats.defense} | 🏃 ${stats.speed}`;
    embed.addFields(
        { name: 'Stats', value: statsValue, inline: false },
        { name: 'Seller', value: `<@${listing.sellerId || 'unknown'}>`, inline: true },
        { name: 'Listing ID', value: `\`${listing.id || 'N/A'}\``, inline: true }
    );
    
    const result = { embed, files: [] };
    
    if (card.image) {
        try {
            const filename = card.image.split('/').pop();
            const attachment = new AttachmentBuilder(card.image, { name: filename });
            embed.setThumbnail(`attachment://${filename}`);
            result.files.push(attachment);
        } catch (error) {
            console.error('Error loading image:', error);
        }
    }

    return result;
}
