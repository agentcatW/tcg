const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, AttachmentBuilder, MessageFlags } = require('discord.js');
const db = require('../../utils/database');
const path = require('path');
const fs = require('fs');
const { getAllCards } = require('../../utils/cards/rollUtils');
const { RARITIES } = require('../../utils/cards/cardTemplate');
const { getImageBuffer } = require('../../utils/imageCache');

const PACK_TYPES = [
    { id: 'beginner', name: 'Beginner Pack', price: 100 },
    { id: 'novice', name: 'Novice Pack', price: 250 },
    { id: 'expert', name: 'Expert Pack', price: 500 },
    { id: 'master', name: 'Master Pack', price: 1000 },
    { id: 'legend', name: 'Legend Pack', price: 2000 }
];

const RARITY_COLORS = {
    'C': 0x808080,
    'B': 0x1EFF00,
    'A': 0x0070FF,
    'S': 0xA335EE,
    'SS': 0xFF8000,
    'SSR': 0xE6CC80
};

function calculateOVR(card) {
    const ovr = Math.round((card.stats.strength + card.stats.defense + card.stats.speed + (card.stats.hp / 2)) / 4);
    return Math.min(99, ovr);
}

async function createCardEmbed(card, page, totalPages, targetUser) {
    const ovr = calculateOVR(card);
    const rarity = card.rarity || 'B';
    
    const embed = new EmbedBuilder()
        .setColor(RARITY_COLORS[rarity] || 0x808080)
        .setTitle(card.name)
        .setDescription(`**Rarity**: ${rarity} ${RARITIES[rarity]?.emoji || 'ℹ️'}\n**OVR**: ${ovr}`)
        .addFields(
            { name: 'STR', value: card.stats.strength.toString(), inline: true },
            { name: 'DEF', value: card.stats.defense.toString(), inline: true },
            { name: 'SPD', value: card.stats.speed.toString(), inline: true },
            { name: 'HP', value: card.stats.hp.toString(), inline: true },
            { name: 'ID', value: `\`${card.id}\``, inline: true }
        )
        .setFooter({ 
            text: `Card ${page + 1} of ${totalPages} | Use /catalog to find a specific card ID`,
            iconURL: targetUser.displayAvatarURL()
        });
    
    let files = [];
    const imagePath = card.image || card.imagePath;
    
    if (imagePath) {
        try {
            const imageBuffer = await getImageBuffer(imagePath);
            
            if (imageBuffer) {
                const filename = path.basename(imagePath);
                const attachment = new AttachmentBuilder(imageBuffer, { 
                    name: filename
                });
                embed.setImage(`attachment://${filename}`);
                files.push(attachment);
            } else {
                console.warn(`Failed to load image: ${imagePath}`);
            }
        } catch (error) {
            console.error('Error processing card image:', error);
            console.error('Image path that caused the error:', imagePath);
        }
    }
    
    return { embed, files };
}

function createActionRow(hasPrev, hasNext, cardIndex) {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('prev')
                .setLabel('Previous')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(!hasPrev),
            new ButtonBuilder()
                .setCustomId('next')
                .setLabel('Next')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(!hasNext),
            new ButtonBuilder()
                .setCustomId(`give_${cardIndex}`)
                .setLabel('Give This Card')
                .setStyle(ButtonStyle.Success)
        );
    
    return row;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('give')
        .setDescription('[Admin] Give items to users')
        .addSubcommand(subcommand =>
            subcommand
                .setName('card')
                .setDescription('Give a card to a user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to give the card to')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('card_id')
                        .setDescription('The ID of the card to give (leave empty to browse)')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('pack_id')
                        .setDescription('The ID of the pack to give (leave empty to browse)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('coins')
                .setDescription('Give coins to a user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to give coins to')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('Amount of coins to give')
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('pack')
                .setDescription('Give a pack to a user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to give the pack to')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('pack_type')
                        .setDescription('Type of pack to give')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Beginner Pack', value: 'beginner' },
                            { name: 'Novice Pack', value: 'novice' },
                            { name: 'Expert Pack', value: 'expert' },
                            { name: 'Master Pack', value: 'master' },
                            { name: 'Legend Pack', value: 'legend' }
                        )
                )
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('Number of packs to give (default: 1)')
                        .setRequired(false)
                        .setMinValue(1)
                )
        ),

    async execute(interaction) {
        const config = require('../../config/config.json');
        const isAdmin = config.adminUserIds && config.adminUserIds.includes(interaction.user.id);
        
        if (!interaction.cards) {
            interaction.cards = [];
        }
        
        if (!isAdmin) {
            return interaction.reply({
                content: '❌ This command is only available to administrators.',
                flags: MessageFlags.Ephemeral
            });
        }

        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'card') {
            const targetUser = interaction.options.getUser('user');
            const cardId = interaction.options.getString('card_id');
            const packId = interaction.options.getString('pack_id');
            const allCards = getAllCards();
            
            if (cardId) {
                const card = allCards.find(c => c.id === cardId);
                if (!card) {
                    return interaction.reply({
                        content: '❌ Card not found!',
                        flags: MessageFlags.Ephemeral
                    });
                }
                return this.giveCard(interaction, targetUser, card);
            } else if (packId) {
                const pack = allCards.find(c => c.packId === packId);
                if (!pack) {
                    return interaction.reply({
                        content: '❌ Pack not found!',
                        flags: MessageFlags.Ephemeral
                    });
                }
                return this.givePack(interaction, targetUser, pack);
            } else {
                interaction.cards = [...allCards];
                let currentPage = 0;
                const totalPages = interaction.cards.length;
                
                if (totalPages === 0) {
                    return interaction.reply({
                        content: 'No cards available!',
                        flags: MessageFlags.Ephemeral
                    });
                }
                
                const { embed, files } = await createCardEmbed(interaction.cards[currentPage], currentPage, totalPages, targetUser);
                const row = createActionRow(false, totalPages > 1, currentPage);
                
                const response = await interaction.reply({
                    embeds: [embed],
                    components: [row],
                    files: files
                });
                
                const filter = i => i.user.id === interaction.user.id;
                let sessionTimeout = setTimeout(() => collector.stop('time'), 300000);

                const handleCollect = async (i) => {
                    try {
                        clearTimeout(sessionTimeout);
                        
                        if (i.customId === 'prev' || i.customId === 'next') {
                            currentPage += (i.customId === 'next') ? 1 : -1;
                            const { embed: newEmbed, files: newFiles } = await createCardEmbed(
                                interaction.cards[currentPage], 
                                currentPage, 
                                totalPages, 
                                targetUser
                            );
                            
                            const newRow = createActionRow(
                                currentPage > 0,
                                currentPage < totalPages - 1,
                                currentPage
                            );
                            
                            await i.update({
                                embeds: [newEmbed],
                                components: [newRow],
                                files: newFiles
                            });
                            
                            sessionTimeout = setTimeout(() => collector.stop('time'), 300000);
                        } else if (i.customId.startsWith('give_')) {
                            try {
                                const cardIndex = parseInt(i.customId.split('_')[1]);
                                const card = interaction.cards[cardIndex];
                                if (card) {
                                    await this.giveCard(interaction, targetUser, card, i);
                                    collector.stop();
                                    return;
                                }
                            } catch (error) {
                                console.error('Error in button handler:', error);
                                if (!i.replied && !i.deferred) {
                                    await i.reply({
                                        content: '❌ An error occurred while processing your request.',
                                        flags: MessageFlags.Ephemeral
                                    }).catch(console.error);
                                }
                            }
                        }
                    } catch (error) {
                        console.error('Error in collector handler:', error);
                    }
                };

                const handleEnd = async (collected, reason) => {
                    clearTimeout(sessionTimeout);
                    try {
                        if (reason === 'time') {
                            const expiredEmbed = new EmbedBuilder()
                                .setColor(0x888888)
                                .setTitle('Session Expired')
                                .setDescription('This card selection has expired. Use the command again to browse cards.');
                            
                            await response.edit({ 
                                embeds: [expiredEmbed], 
                                components: [] 
                            }).catch(() => {});
                        } else if (reason !== 'messageDelete') {
                            await response.edit({ components: [] }).catch(() => {});
                        }
                    } catch (error) {
                        if (error.code !== 10008) {
                            console.error('Error cleaning up components:', error);
                        }
                    }
                };

                const collector = response.createMessageComponentCollector({ 
                    filter, 
                    componentType: ComponentType.Button,
                    time: 300000 
                });
                
                collector.on('collect', handleCollect);
                collector.on('end', handleEnd);
            }
        } else if (subcommand === 'coins') {
            const targetUser = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');
            const newBalance = db.addCurrency(targetUser.id, amount);
            
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setDescription(`✅ Successfully gave ${amount} coins to ${targetUser}!\nNew balance: ${newBalance}`);
                
            return interaction.reply({ embeds: [embed] });
            
        } else if (subcommand === 'pack') {
            const targetUser = interaction.options.getUser('user');
            const packType = interaction.options.getString('pack_type');
            const amount = interaction.options.getInteger('amount') || 1;
            
            const pack = PACK_TYPES.find(p => p.id === packType);
            if (!pack) {
                return interaction.reply({
                    content: '❌ Invalid pack type!',
                    flags: MessageFlags.Ephemeral
                });
            }
            
            const user = db.getUser(targetUser.id);
            if (!user.packs) user.packs = {};
            user.packs[packType] = (user.packs[packType] || 0) + amount;
            db.saveUsers();
            
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle(`✅ ${pack.name} x${amount} Given`)
                .setDescription(`Successfully gave ${amount} ${pack.name}${amount > 1 ? 's' : ''} to ${targetUser}!`)
                .addFields(
                    { name: 'Pack Type', value: pack.name, inline: true },
                    { name: 'Amount Given', value: amount.toString(), inline: true },
                    { name: 'Total Packs', value: user.packs[packType].toString(), inline: true }
                );
                
            return interaction.reply({ embeds: [embed] });
        }
    },
    
    async giveCard(interaction, targetUser, card, buttonInteraction) {
        try {
            if (!card || !card.id) {
                console.error('Invalid card data:', card);
                const errorEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setDescription('❌ Invalid card data. Please try again.');
                
                if (buttonInteraction) {
                    if (buttonInteraction.deferred || buttonInteraction.replied) {
                        return buttonInteraction.editReply({ 
                            embeds: [errorEmbed],
                            components: [] 
                        });
                    }
                    return buttonInteraction.update({ 
                        embeds: [errorEmbed],
                        components: [] 
                    });
                } else if (!interaction.replied && !interaction.deferred) {
                    return interaction.reply({ 
                        embeds: [errorEmbed],
                        flags: MessageFlags.Ephemeral
                    });
                } else {
                    return interaction.editReply({ 
                        embeds: [errorEmbed],
                        components: [] 
                    });
                }
            }
            
            console.log('Giving card to user:', targetUser.username);
            console.log('Card details:', {
                id: card.id,
                name: card.name,
                image: card.image,
                imagePath: card.imagePath,
                rarity: card.rarity
            });

            const user = db.getUser(targetUser.id);
            if (!user.cards) user.cards = [];
            
            const cardExists = user.cards.some(c => c.id === card.id);
            if (cardExists) {
                console.log('Card already exists in user\'s collection:', card.id);
                const errorEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setDescription(`❌ ${targetUser} already has **${card.name}** in their collection.`);
                
                if (buttonInteraction) {
                    if (buttonInteraction.deferred || buttonInteraction.replied) {
                        return buttonInteraction.editReply({ 
                            embeds: [errorEmbed],
                            components: [] 
                        });
                    }
                    return buttonInteraction.update({ 
                        embeds: [errorEmbed],
                        components: [] 
                    });
                } else if (!interaction.replied && !interaction.deferred) {
                    return interaction.reply({ 
                        embeds: [errorEmbed],
                        flags: MessageFlags.Ephemeral
                    });
                } else {
                    return interaction.editReply({ 
                        embeds: [errorEmbed],
                        components: [] 
                    });
                }
            } else {
                user.cards.push(card);
                db.saveUsers();
            }

            const successEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setDescription(`✅ Successfully gave **${card.name}** to ${targetUser}!`);

            if (buttonInteraction) {
                if (buttonInteraction.deferred || buttonInteraction.replied) {
                    return buttonInteraction.editReply({
                        embeds: [successEmbed],
                        components: []
                    });
                }
                return buttonInteraction.update({
                    embeds: [successEmbed],
                    components: []
                });
            } else if (!interaction.replied && !interaction.deferred) {
                return interaction.reply({
                    embeds: [successEmbed]
                });
            } else {
                return interaction.editReply({
                    embeds: [successEmbed],
                    components: []
                });
            }
        } catch (error) {
            console.error('Error giving card:', error);
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setDescription('❌ An error occurred while processing your request.');
                
            if (buttonInteraction) {
                if (buttonInteraction.deferred || buttonInteraction.replied) {
                    return buttonInteraction.editReply({ 
                        embeds: [errorEmbed],
                        components: [] 
                    });
                }
                return buttonInteraction.update({ 
                    embeds: [errorEmbed],
                    components: [] 
                });
            } else if (!interaction.replied && !interaction.deferred) {
                return interaction.reply({ 
                    embeds: [errorEmbed],
                    flags: MessageFlags.Ephemeral
                });
            } else {
                return interaction.editReply({ 
                    embeds: [errorEmbed],
                    components: [] 
                });
            }
        }
            
        let files = [];
        const imagePath = card.image || card.imagePath;
        console.log('Attempting to load image from path:', imagePath);
        
        if (imagePath) {
            try {
                const imageBuffer = await getImageBuffer(imagePath);
                
                if (imageBuffer) {
                    const filename = path.basename(imagePath);
                    const attachment = new AttachmentBuilder(imageBuffer, { 
                        name: filename
                    });
                    embed.setImage(`attachment://${filename}`);
                    files.push(attachment);
                } else {
                    console.warn(`Failed to load image: ${imagePath}`);
                }
            } catch (error) {
                console.error('Error processing card image:', error);
                console.error('Image path that caused the error:', imagePath);
                console.error('Full card object:', JSON.stringify(card, null, 2));
            }
        }
        
        const content = buttonInteraction ? null : `✅ Successfully gave card to ${targetUser.tag}!`;
        
        const responseOptions = {
            content,
            embeds: [embed],
            components: [],
            files: files.length > 0 ? files : undefined,
        };
        
        if (buttonInteraction) {
            if (buttonInteraction.deferred || buttonInteraction.replied) {
                await buttonInteraction.editReply(responseOptions);
            } else {
                await buttonInteraction.update(responseOptions);
            }
        } else {
            await interaction.editReply(responseOptions);
        }
        
        try {
            await targetUser.send({
                content: '🎉 You\'ve been given a new card by an admin!',
                embeds: [embed]
            });
        } catch (error) {
            console.error(`Could not send DM to ${targetUser.tag}:`, error);
        }
    }
};
