const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const db = require('../../utils/database');
const config = require('../../config/config.json');
const { getRankFromElo, getRankName, getRankColor } = require('../../utils/rankUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View different leaderboards')
        .addSubcommand(subcommand =>
            subcommand
                .setName('elo')
                .setDescription('View the ELO leaderboard'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('coins')
                .setDescription('View the coins leaderboard')),
    
    async execute(interaction) {
        try {
            const subcommand = interaction.options.getSubcommand();
            const users = Object.values(db.data.users);
            let sortedPlayers = [];
            let leaderboardType = '';

            if (subcommand === 'elo') {
                leaderboardType = 'elo';
                sortedPlayers = users
                    .filter(user => user.elo !== undefined && user.elo !== null)
                    .sort((a, b) => (b.elo || 0) - (a.elo || 0));

                if (sortedPlayers.length === 0) {
                    return interaction.reply({
                        content: 'No ranked players found!',
                        flags: MessageFlags.Ephemeral
                    });
                }
            } else if (subcommand === 'coins') {
                leaderboardType = 'coins';
                sortedPlayers = users
                    .filter(user => (user.currency || 0) > 0)
                    .sort((a, b) => (b.currency || 0) - (a.currency || 0));

                if (sortedPlayers.length === 0) {
                    const embed = new EmbedBuilder()
                        .setColor(0xffaa00)
                        .setTitle('💰 Coins Leaderboard')
                        .setDescription('No players with coins found yet!')
                        .addFields(
                            { name: 'How to get coins?', value: '• Use `/dailycoins` for your daily reward\n• Win battles in the arena\n• Complete achievements\n• Trade with other players' },
                            { name: '\u200B', value: 'Check back later or be the first to earn some coins!' }
                        )
                        .setTimestamp();

                    return interaction.reply({
                        embeds: [embed],
                        flags: MessageFlags.Ephemeral
                    });
                }
            }
            
            let currentPage = 0;
            const playersPerPage = 10;
            const totalPages = Math.ceil(sortedPlayers.length / playersPerPage);

            const getLeaderboardEmbed = async (page) => {
                const startIdx = page * playersPerPage;
                const endIdx = startIdx + playersPerPage;
                const pagePlayers = sortedPlayers.slice(startIdx, endIdx);
                
                let embedTitle = '';
                let embedColor = 0x3498db;
                
                if (leaderboardType === 'elo') {
                    const topRank = getRankFromElo(sortedPlayers[0]?.elo || 0);
                    embedColor = getRankColor(topRank?.name || 'Bronze');
                    embedTitle = '🏆 Arena Leaderboard';
                } else {
                    embedColor = 0x2ecc71;
                    embedTitle = '💰 Coins Leaderboard';
                }
                
                const leaderboardEmbed = new EmbedBuilder()
                    .setColor(embedColor)
                    .setTitle(embedTitle)
                    .setDescription(`Page ${page + 1}/${totalPages} | Showing ${startIdx + 1}-${Math.min(endIdx, sortedPlayers.length)} of ${sortedPlayers.length} players`)
                    .setTimestamp();

                const userIds = pagePlayers.map(u => u.id);
                const fetchedUsers = await Promise.all(
                    userIds.map(id => interaction.client.users.fetch(id).catch(() => null))
                );

                const leaderboardText = await Promise.all(pagePlayers.map(async (user, index) => {
                    const rankEmoji = getRankEmoji(startIdx + index + 1);
                    const leaderboardPosition = startIdx + index + 1;
                    
                const userId = user?.id || 'unknown';
                const discordUser = fetchedUsers.find(u => u?.id === userId) || 
                                     interaction.client.users.cache.get(userId);
                const displayName = discordUser?.username || 
                                 (userId !== 'unknown' ? `User ${userId.substring(0, 6)}` : 'Unknown User');
                    
                    if (leaderboardType === 'elo') {
                        const rank = getRankFromElo(user.elo, leaderboardPosition);
                        const rankName = getRankName(user.elo, leaderboardPosition);
                        const wins = user.wins || 0;
                        const losses = user.losses || 0;
                        const winRate = (wins + losses) > 0 
                            ? ((wins / (wins + losses)) * 100).toFixed(1) 
                            : '0.0';
                        
                        return `${rankEmoji} **#${leaderboardPosition}** ${displayName} - ${rankName}\n${'▰'.repeat(3)} ${user.elo || 0} ELO • ${wins}W ${losses}L (${winRate}% WR)`;
                    } else {
                        const coins = user.currency || 0;
                        const formatNumber = (num) => {
                            if (num >= 1e18) return `${(num / 1e18).toFixed(2)}Q`;
                            if (num >= 1e15) return `${(num / 1e15).toFixed(2)}q`;
                            if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
                            if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
                            if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
                            if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
                            return num.toLocaleString();
                        };
                        
                        return `${rankEmoji} **#${leaderboardPosition}** ${displayName}\n${'▰'.repeat(3)} ${formatNumber(coins)} <:coin:1381692942196150292> (${coins.toLocaleString()})`;
                    }
                }));
                
                const pageInfo = `Page ${page + 1}/${totalPages} | Showing ${startIdx + 1}-${Math.min(endIdx, sortedPlayers.length)} of ${sortedPlayers.length} players`;
                leaderboardEmbed.setDescription(
                    `${pageInfo}\n\n${leaderboardText.join('\n\n')}` || `No players on this page.`
                );
                
                if (leaderboardType === 'elo') {
                    leaderboardEmbed.setFooter({
                        text: `Top ${config.ranks?.topSupremePlayers || 250} players are Supreme`,
                    });
                } else if (leaderboardType === 'coins') {
                    leaderboardEmbed.setFooter({
                        text: '💰 I like money - agent.cat',
                    });
                } else {
                    leaderboardEmbed.setFooter({
                        text: 'Unknown leaderboard type',
                    });
                }

                const currentUser = users.find(u => u.id === interaction.user.id);
                if (currentUser) {
                    const userPosition = sortedPlayers.findIndex(user => user.id === interaction.user.id) + 1;
                    const totalPlayers = sortedPlayers.length;
                    
                    if (userPosition > 0) {
                        if (leaderboardType === 'elo' && currentUser.elo !== undefined && currentUser.elo !== null) {
                            const userRank = userPosition <= 250 
                                ? getRankFromElo(currentUser.elo, userPosition)
                                : getRankFromElo(currentUser.elo);
                            const nextRank = getNextRank(userRank.name);
                            
                            leaderboardEmbed.addFields({
                                name: '\u200B',
                                value: `Your rank: **#${userPosition}** of ${totalPlayers} players`
                            });
                        } else if (leaderboardType === 'coins' && currentUser.currency !== undefined) {
                            leaderboardEmbed.addFields({
                                name: '\u200B',
                                value: `Your rank: **#${userPosition}** of ${totalPlayers} players (${currentUser.currency?.toLocaleString() || 0} Coins)`
                            });
                        }
                    } else if (type === 'elo' && currentUser.elo !== undefined && currentUser.elo !== null) {
                        leaderboardEmbed.addFields({
                            name: '\u200B',
                            value: `Your rank: Unranked (${currentUser.elo} ELO)`
                        });
                    } else if (type === 'coins' && currentUser.coins !== undefined) {
                        leaderboardEmbed.addFields({
                            name: '\u200B',
                            value: `Your rank: Unranked (${currentUser.coins?.toLocaleString() || 0} Coins)`
                        });
                    }
                }

                return leaderboardEmbed;
            };

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('prev_page')
                        .setLabel('◀️ Previous')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('next_page')
                        .setLabel('Next ▶️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(totalPages <= 1)
                );

            const initialEmbed = await getLeaderboardEmbed(currentPage);
            await interaction.reply({
                embeds: [initialEmbed],
                components: [row]
            });

            const message = await interaction.fetchReply();

            const filter = i => i.user.id === interaction.user.id;
            const collector = message.createMessageComponentCollector({
                filter,
                componentType: ComponentType.Button,
                time: 300000
            });

            let sessionTimeout = setTimeout(() => collector.stop('time'), 300000);

            const handleCollect = async (i) => {
                try {
                    clearTimeout(sessionTimeout);
                    sessionTimeout = setTimeout(() => collector.stop('time'), 300000);

                    if (i.customId === 'prev_page' && currentPage > 0) {
                        currentPage--;
                    } else if (i.customId === 'next_page' && currentPage < totalPages - 1) {
                        currentPage++;
                    }

                    row.components[0].setDisabled(currentPage === 0);
                    row.components[1].setDisabled(currentPage === totalPages - 1);

                    const updatedEmbed = await getLeaderboardEmbed(currentPage);
                    await i.update({
                        embeds: [updatedEmbed],
                        components: [row]
                    });
                } catch (error) {
                    console.error('Error handling leaderboard pagination:', error);
                    if (!i.replied && !i.deferred) {
                        await i.reply({
                            content: '❌ An error occurred while updating the leaderboard.',
                            flags: MessageFlags.Ephemeral
                        }).catch(console.error);
                    }
                }
            };

            const handleEnd = async (collected, reason) => {
                clearTimeout(sessionTimeout);
                try {
                    if (reason === 'time') {
                        const expiredEmbed = new EmbedBuilder()
                            .setColor(0x888888)
                            .setTitle('Session Expired')
                            .setDescription('The leaderboard session has expired. Use the command again to continue browsing.');
                        
                        await message.edit({ 
                            embeds: [expiredEmbed],
                            components: [] 
                        }).catch(() => {});
                    } else if (reason !== 'messageDelete' && message.editable) {
                        await message.edit({ components: [] }).catch(() => {});
                    }
                } catch (error) {
                    if (error.code !== 10008) {
                        console.error('Error cleaning up leaderboard components:', error);
                    }
                }
            };

            collector.on('collect', handleCollect);
            collector.on('end', handleEnd);
        } catch (error) {
            console.error('Error in leaderboard command:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while fetching the leaderboard. Please try again later.',
                    flags: MessageFlags.Ephemeral
                }).catch(console.error);
            }
        }
    },
};

function getRankEmoji(rank) {
    const emojis = {
        1: '🥇',
        2: '🥈',
        3: '🥉'
    };
    return emojis[rank] || '🔹';
}

function getNextRank(currentRank) {
    const ranks = [
        { name: 'Bronze', minElo: 0 },
        { name: 'Silver', minElo: 500 },
        { name: 'Gold', minElo: 1000 },
        { name: 'Platinum', minElo: 1500 },
        { name: 'Diamond', minElo: 2000 },
        { name: 'Master', minElo: 2500 },
        { name: 'Supreme', minElo: 5000 }
    ];
    
    const currentIndex = ranks.findIndex(rank => rank.name === currentRank);
    return currentIndex < ranks.length - 1 ? ranks[currentIndex + 1] : { name: 'Max Rank', minElo: Infinity };
}
