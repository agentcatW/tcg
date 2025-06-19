const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const db = require('../../utils/database');
const { packs } = require('../../utils/shopItems');
const { getAllCards, getRandomCharacter, generateCard } = require('../../utils/cards/rollUtils');
const { getSellPriceByOVR } = require('../../utils/cards/cardTemplate');
const { calculateOVR } = require('../../utils/cards/cardUtils');
const fs = require('fs');
const path = require('path');

function getCardsInOvrRange(cards, min, max) {
    if (!Array.isArray(cards)) {
        console.error('getCardsInOvrRange: cards parameter is not an array');
        return [];
    }
    return cards.filter(card => {
        const ovr = Math.min(99, Math.round((card.stats.strength + card.stats.defense + card.stats.speed + (card.stats.hp / 2)) / 4));
        return ovr >= min && ovr <= max;
    });
}

function selectOvrRange(ovrChances) {
    const roll = Math.random() * 100;
    let cumulativeChance = 0;
    
    for (const range of ovrChances) {
        cumulativeChance += range.chance;
        if (roll <= cumulativeChance) {
            return {
                min: range.min,
                max: range.max
            };
        }
    }
    
    return {
        min: ovrChances[0].min,
        max: ovrChances[0].max
    };
}

function createCardWithOvrChances(ovrChances) {
    const selectedRange = selectOvrRange(ovrChances);
    const allCards = getAllCards();
    
    const eligibleCards = getCardsInOvrRange(allCards, selectedRange.min, selectedRange.max);
    
    let card;
    if (eligibleCards.length === 0) {
        const character = getRandomCharacter('hourly');
        card = generateCard(character);
    } else {
        const randomCard = eligibleCards[Math.floor(Math.random() * eligibleCards.length)];
        card = generateCard({
            ...randomCard,
            rarity: randomCard.rarity || 'C'
        });
    }
    
    if (!card.ovr || isNaN(card.ovr)) {
        card.ovr = calculateOVR(card);
    }
    
    return card;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('open')
        .setDescription('Open a card pack from your collection'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const user = db.getUser(userId);
        
        const userPacks = Object.entries(user.packs || {})
            .filter(([_, count]) => count > 0)
            .map(([packId]) => ({
                label: packs[packId]?.name || packId,
                description: `You have ${user.packs[packId]}x`,
                value: packId,
                emoji: packs[packId]?.emoji || '❓'
            }));

        if (userPacks.length === 0) {
            return interaction.reply({
                content: "You don't have any packs to open! Visit the shop with `/shop` to buy some.",
            });
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_pack')
            .setPlaceholder('Select a pack to open')
            .addOptions(userPacks);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const response = await interaction.reply({
            content: 'Select a pack to open:',
            components: [row],
        });

        try {
            const collectorFilter = i => i.user.id === interaction.user.id;
            const collector = response.createMessageComponentCollector({ 
                componentType: ComponentType.StringSelect,
                filter: collectorFilter,
                time: 30000
            });

            collector.on('collect', async i => {
                if (i.customId === 'select_pack') {
                    const packId = i.values[0];
                    const pack = packs[packId];
                    
                    if (!pack) {
                        await i.update({ 
                            content: '❌ Invalid pack selected.', 
                            components: [] 
                        });
                        return;
                    }

                    if ((user.packs[packId] || 0) < 1) {
                        await i.update({ 
                            content: "❌ You don't have any of those packs left!", 
                            components: [] 
                        });
                        return;
                    }

                    user.packs[packId]--;
                    db.saveUsers();

                    const card = createCardWithOvrChances(pack.ovrChances);
                    const originalPrice = getSellPriceByOVR(card.ovr);
                    const sellValue = Math.floor(originalPrice * 0.6); 

                    let imageUrl = 'https://i.imgur.com/placeholder.png';
                    let files = [];
                    
                    const possibleImagePaths = [
                        card.imagePath,
                        card.image,
                        card.imageUrl,
                        `public/cards/${card.id}.png`,
                        `public/cards/${card.name.toLowerCase().replace(/\s+/g, '')}.png`
                    ].filter(Boolean);
                    
                    for (const imgPath of possibleImagePaths) {
                        try {
                            let absolutePath = imgPath;
                            if (!path.isAbsolute(imgPath)) {
                                absolutePath = path.join(process.cwd(), imgPath);
                            }
                            
                            if (fs.existsSync(absolutePath)) {
                                const fileName = path.basename(absolutePath);
                                files.push({
                                    attachment: absolutePath,
                                    name: fileName
                                });
                                imageUrl = `attachment://${fileName}`;
                                break;
                            }
                        } catch (error) {
                            console.error('Error processing image path:', imgPath, error);
                            continue;
                        }
                    }

                    const embed = new EmbedBuilder()
                        .setColor(0x3498db)
                        .setTitle(`🎉 You opened a ${pack.name}!`)
                        .setDescription(`**${card.name}**`)
                        .setThumbnail(imageUrl)
                        .addFields(
                            { name: 'Rarity', value: card.rarity || 'Common', inline: true },
                            { name: 'OVR', value: `**${card.ovr}**`, inline: true },
                            { name: 'Sell Value', value: `${sellValue} <:coin:1381692942196150292>`, inline: true }
                        )
                        .setImage(imageUrl);

                    const row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('keep_card')
                                .setLabel('Keep Card')
                                .setStyle(ButtonStyle.Success),
                            new ButtonBuilder()
                                .setCustomId('sell_card')
                                .setLabel(`Sell for ${sellValue} coins`)
                                .setStyle(ButtonStyle.Secondary)
                        );

                    try {
                        const updateOptions = { 
                            content: null, 
                            embeds: [embed], 
                            components: [row],
                            files: files.length > 0 ? files : undefined
                        };
                        await i.update(updateOptions);

                        const buttonCollector = i.message.createMessageComponentCollector({ 
                            componentType: ComponentType.Button,
                            filter: (b) => b.user.id === interaction.user.id,
                            time: 30000, 
                            dispose: true
                        });
                        
                        console.log(`Created button collector for ${card.name}`);

                        let timeout = setTimeout(async () => {
                            if (!buttonCollector.ended) {
                                console.log('Button collector timeout triggered');
                                buttonCollector.stop('time');
                            }
                        }, 30000); 

                        buttonCollector.on('collect', async button => {
                            try {
                                clearTimeout(timeout);
                                
                                if (button.customId === 'keep_card') {
                                    db.addCard(userId, card);
                                    db.saveUsers();
                                    await button.update({ 
                                        content: `✅ **${card.name}** has been added to your collection!`,
                                        embeds: [embed],
                                        components: [] 
                                    });
                                } else if (button.customId === 'sell_card') {
                                    user.currency = (user.currency || 0) + sellValue;
                                    db.saveUsers();
                                    await button.update({ 
                                        content: `💰 You sold **${card.name}** for ${sellValue} <:coin:1381692942196150292>!`,
                                        embeds: [embed],
                                        components: [] 
                                    });
                                }
                                
                                buttonCollector.stop('user');
                            } catch (error) {
                                console.error('Error handling button interaction:', error);
                                await button.reply({ 
                                    content: 'An error occurred while processing your request.', 
                                    ephemeral: true 
                                });
                                buttonCollector.stop('error');
                            }
                        });

                        buttonCollector.on('end', async (collected, reason) => {
                            clearTimeout(timeout); 
                            
                            if (reason === 'time') {
                                try {
                                    db.addCard(userId, card);
                                    db.saveUsers();
                                    console.log(`Auto-kept card: ${card.name}`);
                                    
                                    await i.editReply({ 
                                        content: `⏰ Time's up! Automatically kept **${card.name}**.`,
                                        embeds: [embed],
                                        components: [] 
                                    }).catch(console.error);
                                } catch (error) {
                                    console.error('Error in auto-keep:', error);
                                    await i.followUp({ 
                                        content: 'An error occurred while processing your card.', 
                                        ephemeral: true 
                                    });
                                }
                            }
                        });

                    } catch (error) {
                        console.error('Error updating message with card:', error);
                        await i.followUp({ 
                            content: 'An error occurred while showing your card.', 
                            ephemeral: true 
                        });
                    }
                }
            });

            collector.on('end', collected => {
                if (collected.size === 0) {
                    interaction.editReply({ 
                        content: 'You took too long to select a pack!', 
                        components: [] 
                    }).catch(console.error);
                }
            });

        } catch (error) {
            console.error('Error in open command:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: 'An error occurred while processing your request.', 
                    ephemeral: true 
                });
            } else {
                await interaction.editReply({ 
                    content: 'An error occurred while processing your request.', 
                    components: [] 
                });
            }
        }
    }
};
