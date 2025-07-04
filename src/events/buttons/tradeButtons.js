const { EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../../utils/database');
const { tradeOffers } = require('../../utils/tradeStore');
const { logTrade } = require('../../utils/tradeHistory');

async function handleTradeButton(interaction) {
    if (!interaction.replied && !interaction.deferred) {
        await interaction.deferUpdate();
    }
    
    const [action, tradeId] = interaction.customId.split('_').slice(1);
    const trade = tradeOffers.get(tradeId);

    if (!trade) {
        if (!interaction.replied && !interaction.deferred) {
            return interaction.reply({
                content: '❌ This trade offer has expired or is invalid!',
                flags: MessageFlags.Ephemeral
            });
        }
        return;
    }

    if (interaction.user.id !== trade.to && interaction.user.id !== trade.from) {
        if (interaction.deferred || interaction.replied) {
            return interaction.followUp({
                content: '❌ This trade offer is not for you!',
                flags: MessageFlags.Ephemeral
            });
        }
        return interaction.reply({
            content: '❌ This trade offer is not for you!',
            flags: MessageFlags.Ephemeral
        });
    }

    if (action === 'accept') {
        const fromUser = db.getUser(trade.from);
        const toUser = db.getUser(trade.to);
        
        const calculateOVR = (card) => {
            if (card.ovr) return Math.min(99, card.ovr);
            const ovr = Math.round((card.stats.strength + card.stats.defense + card.stats.speed + (card.stats.hp / 2)) / 4);
            return Math.min(99, ovr);
        };

        const sortCards = (cards) => {
            return [...cards].sort((a, b) => {
                const ovrA = calculateOVR(a);
                const ovrB = calculateOVR(b);
                if (ovrB !== ovrA) return ovrB - ovrA;
                return a.name.localeCompare(b.name);
            });
        };
        
        const fromUserCards = sortCards(fromUser.cards || []);
        const toUserCards = sortCards(toUser.cards || []);
        
        const userCardFromSorted = fromUserCards[trade.yourCard.originalIndex];
        const targetCardFromSorted = toUserCards[trade.theirCard.originalIndex];
        
        if (!userCardFromSorted || !targetCardFromSorted) {
            tradeOffers.delete(tradeId);
            return interaction.reply({
                content: '❌ One or both cards are no longer available for trade!',
                flags: MessageFlags.Ephemeral
            });
        }
        
        const userCardIndex = fromUser.cards.findIndex(card => card.id === userCardFromSorted.id);
        const targetCardIndex = toUser.cards.findIndex(card => card.id === targetCardFromSorted.id);

        if (userCardIndex === -1 || targetCardIndex === -1) {
            tradeOffers.delete(tradeId);
            return interaction.reply({
                content: '❌ One or both cards are no longer available for trade!',
                flags: MessageFlags.Ephemeral
            });
        }
        
        const tradeData = { ...trade };
        
        const paymentRequired = trade.payment.required ? trade.payment.amount : 0;
        let payer = null;
        let recipient = null;
        
        if (trade.payment.required) {
            if (trade.payment.from === 'you') {
                payer = fromUser;
                recipient = toUser;
            } else {
                payer = toUser;
                recipient = fromUser;
            }
            
            if (payer.currency < paymentRequired) {
                tradeOffers.delete(tradeId);
                const content = `❌ Trade auto-declined! ${payer.id === interaction.user.id ? 'You don\'t' : 'The other user doesn\'t'} have enough coins to complete this trade.`;
                
                const fromUser = interaction.client.users.cache.get(tradeData.from) || { username: 'Unknown User' };
                const toUser = interaction.client.users.cache.get(tradeData.to) || { username: 'Unknown User' };
                
                const declineEmbed = new EmbedBuilder()
                    .setTitle('❌ Trade Canceled')
                    .setDescription(`**${fromUser.username}** and **${toUser.username}** could not complete their trade.`)
                    .addFields(
                        { name: 'Reason', value: `${payer.id === tradeData.from ? fromUser.username : toUser.username} doesn't have enough coins to complete this trade.` }
                    )
                    .setColor(0xe74c3c);
                
                try {
                    if (tradeData.messageId && tradeData.channelId) {
                        const channel = await interaction.client.channels.fetch(tradeData.channelId).catch(() => null);
                        if (channel) {
                            const message = await channel.messages.fetch(tradeData.messageId).catch(() => null);
                            if (message && message.editable) {
                                await message.edit({
                                    content: `<@${tradeData.from}>, <@${tradeData.to}>`,
                                    embeds: [declineEmbed],
                                    components: []
                                });
                            }
                        }
                    }
                } catch (e) {
                    console.error('Error updating trade message:', e);
                }
                
                if (interaction.replied || interaction.deferred) {
                    return interaction.editReply({
                        content: `<@${tradeData.from}>, <@${tradeData.to}>`,
                        embeds: [declineEmbed],
                        components: []
                    });
                }
                return interaction.reply({
                    content: `<@${tradeData.from}>, <@${tradeData.to}>`,
                    embeds: [declineEmbed],
                    components: []
                });
            }
        }

        if (paymentRequired > 0) {
            payer.currency -= paymentRequired;
            recipient.currency += paymentRequired;
        }

        const userCard = fromUser.cards[userCardIndex];
        const targetCard = toUser.cards[targetCardIndex];

        fromUser.cards.splice(userCardIndex, 1);
        toUser.cards.splice(targetCardIndex, 1);
        fromUser.cards.push(targetCard);
        toUser.cards.push(userCard);

        await logTrade({
            tradeId,
            user1: {
                id: tradeData.from,
                username: interaction.client.users.cache.get(tradeData.from)?.username || 'Unknown User',
                card: {
                    id: tradeData.yourCard.id,
                    name: tradeData.yourCard.name,
                    ovr: tradeData.yourCard.ovr
                },
                payment: tradeData.payment.from === 'you' ? tradeData.payment.amount : 0
            },
            user2: {
                id: tradeData.to,
                username: interaction.client.users.cache.get(tradeData.to)?.username || 'Unknown User',
                card: {
                    id: tradeData.theirCard.id,
                    name: tradeData.theirCard.name,
                    ovr: tradeData.theirCard.ovr
                },
                payment: tradeData.payment.from === 'them' ? tradeData.payment.amount : 0
            },
            totalValue: tradeData.payment.totalPrice
        });

        db.saveUsers();
        
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Trade Completed!')
            .setDescription(`**${interaction.client.users.cache.get(tradeData.from)?.username || 'User'}** and **${interaction.client.users.cache.get(tradeData.to)?.username || 'User'}** have completed a trade!`)
            .addFields(
                { name: `${interaction.client.users.cache.get(tradeData.from)?.username || 'User'} received:`, value: targetCard.name, inline: true },
                { name: 'for', value: '↔️', inline: true },
                { name: `${interaction.client.users.cache.get(tradeData.to)?.username || 'User'} received:`, value: userCard.name, inline: true }
            )
            .setColor(0x2ecc71);

        if (paymentRequired > 0) {
            successEmbed.addFields({
                name: 'Payment',
                value: `${interaction.client.users.cache.get(payer.id)?.username || 'User'} paid ${paymentRequired} <:coin:1381692942196150292> to ${interaction.client.users.cache.get(recipient.id)?.username || 'User'}`
            });
        }

        try {
            if (tradeData.messageId && tradeData.channelId) {
                const channel = await interaction.client.channels.fetch(tradeData.channelId).catch(() => null);
                if (channel) {
                    const message = await channel.messages.fetch(tradeData.messageId).catch(() => null);
                    if (message && message.editable) {
                        await message.edit({
                            content: `<@${tradeData.from}>, <@${tradeData.to}>`,
                            embeds: [successEmbed],
                            components: []
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Error updating trade message:', error);
        } finally {
            tradeOffers.delete(tradeId);
        }
        
        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.deferUpdate();
            } catch (error) {
                try {
                    await interaction.reply({ content: 'Trade completed!', flags: MessageFlags.Ephemeral });
                } catch (replyError) {
                    console.error('Failed to acknowledge trade completion:', replyError);
                }
            }
        }

    } else if (action === 'decline') {
        const otherUserId = interaction.user.id === trade.to ? trade.from : trade.to;
        
        const declineEmbed = new EmbedBuilder()
            .setTitle('❌ Trade Declined')
            .setDescription(`<@${interaction.user.id}> has declined the trade.`)
            .setColor(0xe74c3c);
        
        const tradeData = { ...trade };
        
        tradeOffers.delete(tradeId);
            
        try {
            try {
                if (tradeData.messageId && tradeData.channelId) {
                    const channel = await interaction.client.channels.fetch(tradeData.channelId).catch(() => null);
                    if (channel) {
                        const message = await channel.messages.fetch(tradeData.messageId).catch(() => null);
                        if (message && message.editable) {
                            await message.edit({
                                content: `<@${tradeData.from}>, <@${tradeData.to}>`,
                                embeds: [declineEmbed],
                                components: []
                            });
                        }
                    }
                }
            } catch (error) {
                console.error('Error updating trade message:', error);
            } finally {
                tradeOffers.delete(tradeId);
            }
        
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.deferUpdate();
                } catch (error) {
                    try {
                        await interaction.reply({ content: 'Trade declined.', flags: MessageFlags.Ephemeral });
                    } catch (replyError) {
                        console.error('Failed to acknowledge trade decline:', replyError);
                    }
                }
            }
        } catch (error) {
            console.error('Error handling trade decline:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'There was an error processing your decline. Please try again.',
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    }
}

const TRADE_EXPIRY_TIME = 10 * 60 * 1000;

setInterval(() => {
    const now = Date.now();
    for (const [id, trade] of tradeOffers.entries()) {
        if (now - trade.timestamp > TRADE_EXPIRY_TIME) { 
            tradeOffers.delete(id);
        }
    }
}, TRADE_EXPIRY_TIME);

module.exports = {
    handleTradeButton
};
