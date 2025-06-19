const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const db = require('../../utils/database');
const { getRandomCardOptions, RARITIES } = require('../../utils/cards/rollUtils');
const { getSellPriceByOVR } = require('../../utils/cards/cardTemplate');
const { getImageBuffer } = require('../../utils/imageCache');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('weekly-roll')
        .setDescription('Roll for random cards with better odds (7-day cooldown)'),
    async execute(interaction) {
        const userId = interaction.user.id;
        
        if (db.hasActiveRoll(userId)) {
            return interaction.reply({
                content: 'You already have a roll in progress! Please complete or wait for it to time out.',
                ephemeral: true
            });
        }

        if (!db.canRoll(userId, 'weekly')) {
            const timeRemaining = db.getTimeUntilNextRoll(userId, 'weekly');
            const formattedTime = db.formatTime(timeRemaining);
            
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Cooldown Active')
                .setDescription(`You've already used your weekly roll. Please wait **${formattedTime}** before trying again.`);
                
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        db.setRollActive(userId, 'weekly');

        await interaction.deferReply();

        try {
            const options = getRandomCardOptions('weekly', 3);
            
            let currentPage = 0;
            
            const createCardEmbed = async (card, index) => {
                const rarityData = card.rarityData || RARITIES['B'];
                const embed = new EmbedBuilder()
                    .setColor(rarityData.color || 0x808080)
                    .setTitle(card.name)
                    .setFooter({ text: `Card ${index + 1} of ${options.length}` })
                    .addFields({
                        name: 'Rarity',
                        value: `${card.rarity} (${rarityData.name || 'Unknown'})`
                    });
                
                let files = [];
                if (card.imagePath) {
                    try {
                        const imageBuffer = await getImageBuffer(card.imagePath);
                        if (imageBuffer) {
                            const filename = path.basename(card.imagePath);
                            const attachment = new AttachmentBuilder(imageBuffer, { name: filename });
                            embed.setImage(`attachment://${filename}`);
                            files.push(attachment);
                        }
                    } catch (error) {
                        console.error('Error loading card image:', error);
                    }
                }
                
                if (card.playstyle) {
                    embed.addFields({
                        name: 'Playstyle',
                        value: `**${card.playstyle}**`,
                        inline: false
                    });
                }
                
                return { embed, files };
            };

            const navRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('prev_card')
                        .setLabel('◀️ Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('next_card')
                        .setLabel('Next ▶️')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(options.length <= 1),
                    new ButtonBuilder()
                        .setCustomId('select_card')
                        .setLabel('Select Card')
                        .setStyle(ButtonStyle.Primary)
                );
            
            const { embed, files } = await createCardEmbed(options[0], 0);
            const message = await interaction.editReply({
                content: '**Weekly Roll** - Browse and select a card to keep:',
                embeds: [embed],
                components: [navRow],
                files: files,
                fetchReply: true
            });

            const filter = i => i.user.id === interaction.user.id && 
                              (i.customId === 'prev_card' || i.customId === 'next_card' || i.customId === 'select_card');
            
            const collector = message.createMessageComponentCollector({ filter, time: 60000 });
            
            collector.on('collect', async i => {
                if (i.customId === 'next_card') {
                    currentPage = (currentPage + 1) % options.length;
                } else if (i.customId === 'prev_card') {
                    currentPage = (currentPage - 1 + options.length) % options.length;
                } else if (i.customId === 'select_card') {
                    const selectedCard = options[currentPage];
                    db.setCooldown(userId, 'weekly');
                    
                    const { embed: cardEmbed, files } = await createCardEmbed(selectedCard, currentPage);
                    const originalPrice = getSellPriceByOVR(selectedCard.overall);
                    const sellPrice = Math.floor(originalPrice * 0.6);
                    
                    const buttonRow = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('keep_card')
                                .setLabel('Keep Card')
                                .setStyle(ButtonStyle.Success),
                            new ButtonBuilder()
                                .setCustomId('quick_sell')
                                .setLabel(`Sell for ${sellPrice} coins`)
                                .setStyle(ButtonStyle.Danger)
                        );

                    const msg = await i.update({
                        content: `✅ **You selected:** ${selectedCard.name}\nWould you like to keep or sell this card?`,
                        embeds: [cardEmbed],
                        components: [buttonRow],
                        files: files,
                        fetchReply: true
                    });

                    const buttonFilter = i => i.user.id === interaction.user.id && 
                                        (i.customId === 'quick_sell' || i.customId === 'keep_card');
                    const buttonCollector = msg.createMessageComponentCollector({ 
                        filter: buttonFilter, 
                        time: 30000,
                        max: 1 
                    });

                    buttonCollector.on('collect', async buttonInteraction => {
                        if (buttonInteraction.customId === 'quick_sell') {
                            db.addCurrency(userId, sellPrice);
                            await buttonInteraction.update({
                                content: `<:coin:1381692942196150292> **Sold ${selectedCard.name} for ${sellPrice} coins!**`,
                                components: []
                            });
                        } else if (buttonInteraction.customId === 'keep_card') {
                            db.addCard(userId, selectedCard);
                            await buttonInteraction.update({
                                content: `✅ **You kept:** ${selectedCard.name}`,
                                components: []
                            });
                        }
                    });

                    buttonCollector.on('end', async (collected, reason) => {
                        if (reason === 'time') {
                            await msg.edit({
                                content: `⏰ Time's up! **You kept:** ${selectedCard.name}`,
                                components: []
                            });
                        }
                    });

                    collector.stop();
                    return;
                }

                navRow.components[0].setDisabled(currentPage === 0);
                navRow.components[1].setDisabled(currentPage === options.length - 1);
                
                const { embed: updatedEmbed, files: updatedFiles } = await createCardEmbed(options[currentPage], currentPage);
                await i.update({
                    embeds: [updatedEmbed],
                    components: [navRow],
                    files: updatedFiles
                });
            });

            collector.on('end', async (collected, reason) => {
                try {
                    if (reason === 'time') {
                        const randomIndex = Math.floor(Math.random() * options.length);
                        const selectedCard = options[randomIndex];
                        
                        db.addCard(userId, selectedCard);
                        
                        await interaction.editReply({ 
                            content: `⏰ Time's up! You received: **${selectedCard.name}** (${selectedCard.rarity})`,
                            components: [] 
                        });
                    }
                } catch (error) {
                    console.error('Error in weeklyroll collector end:', error);
                } finally {
                    db.clearActiveRoll(userId);
                }
            });

        } catch (error) {
            console.error('Error in weeklyroll command:', error);
            await interaction.editReply({ 
                content: 'An error occurred while processing your roll. Please try again later.',
                ephemeral: true 
            });
        }
    }
};
