const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, AttachmentBuilder } = require('discord.js');
const db = require('../../utils/database');
const path = require('path');
const fs = require('fs');
const { getAllCards } = require('../../utils/cards/rollUtils');
const { RARITIES } = require('../../utils/cards/cardTemplate');
const { getImageBuffer } = require('../../utils/imageCache');

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
                        .setDescription('The ID of the card to give')
                        .setRequired(true)
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
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'coins') {
            const targetUser = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');
            const newBalance = db.addCurrency(targetUser.id, amount);
            
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ Coins Given')
                .setDescription(`Successfully gave **${amount.toLocaleString()}** <:coin:1381692942196150292> to ${targetUser}`)
                .setFooter({ text: `New balance: ${newBalance.toLocaleString()} coins` });
                
            return interaction.reply({ embeds: [embed] });
        }
        
        const targetUser = interaction.options.getUser('user');
        const cardId = interaction.options.getString('card_id');
        const allCards = getAllCards();
        const totalPages = allCards.length;
        let currentPage = 0;
        
        interaction.cards = allCards;
        
        const card = allCards.find(c => c.id === cardId);
        if (!card) {
            return interaction.reply({
                content: '❌ Card not found. Use /catalog to find card IDs.',
                ephemeral: true
            });
        }
        
        await this.giveCard(interaction, targetUser, card);
        
        const { embed, files } = await createCardEmbed(interaction.cards[currentPage], currentPage, totalPages, targetUser);
        const row = createActionRow(
            false,
            totalPages > 1,
            currentPage
        );
        
        const response = await interaction.reply({
            embeds: [embed],
            components: [row],
            files: files,
            ephemeral: true
        });
        
        const filter = i => i.user.id === interaction.user.id;
        const collector = response.createMessageComponentCollector({ 
            filter,
            componentType: ComponentType.Button,
            time: 300000
        });
        
        collector.on('collect', async i => {
            if (i.customId === 'prev' || i.customId === 'next') {
                currentPage += (i.customId === 'next') ? 1 : -1;
                const newCard = allCards[currentPage];
                
                const { embed: newEmbed, files: newFiles } = await createCardEmbed(newCard, currentPage, totalPages, targetUser);
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
            } else if (i.customId.startsWith('give_')) {
                try {
                    console.log('Give button clicked with ID:', i.customId);
                    const cardIndex = parseInt(i.customId.split('_')[1]);
                    console.log('Card index:', cardIndex);
                    
                    const card = allCards[cardIndex];
                    console.log('Found card:', card ? card.name : 'Not found');
                    
                    if (card) {
                        console.log('Calling giveCard with card:', card.name);
                        await this.giveCard(interaction, targetUser, card, i);
                        collector.stop();
                    } else {
                        console.error('Card not found at index:', cardIndex);
                        await i.reply({
                            content: '❌ Error: Could not find the selected card. Please try again.',
                            ephemeral: true
                        });
                    }
                } catch (error) {
                    console.error('Error in button handler:', error);
                    if (!i.replied && !i.deferred) {
                        await i.reply({
                            content: '❌ An error occurred while processing your request.',
                            ephemeral: true
                        }).catch(console.error);
                    }
                }
            }
        });
        
        collector.on('end', (collected, reason) => {
            console.log('Collector ended with reason:', reason);
            response.edit({ components: [] }).catch(console.error);
        });
        
        collector.on('error', error => {
            console.error('Collector error:', error);
        });
    },
    
    async giveCard(interaction, targetUser, card, buttonInteraction) {
        if (!card) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('❌ Error')
                .setDescription('Card not found!');
            
            if (buttonInteraction) {
                return buttonInteraction.update({ embeds: [embed], components: [] });
            } else {
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
        }
        console.log('Giving card to user:', targetUser.username);
        console.log('Card being given:', {
            id: card.id,
            name: card.name,
            image: card.image,
            imagePath: card.imagePath,
            rarity: card.rarity
        });
        
        if (!buttonInteraction) {
            await interaction.deferReply({ ephemeral: true });
        }
        
        db.addCard(targetUser.id, card);
        
        const embed = new EmbedBuilder()
            .setColor(RARITY_COLORS[card.rarity] || 0x808080)
            .setTitle(`✅ Card Given to ${targetUser.username}`)
            .setDescription(`**${card.name}** has been added to ${targetUser}'s collection.`)
            .addFields(
                { name: 'Rarity', value: card.rarity, inline: true },
                { name: 'OVR', value: calculateOVR(card).toString(), inline: true },
                { name: 'ID', value: `\`${card.id}\``, inline: true }
            )
            .setTimestamp();
            
        let files = [];
        const imagePath = card.image || card.imagePath;
        console.log('Attempting to load image from path:', imagePath);
        
        if (imagePath) {
            console.log('Processing image path:', imagePath);
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
