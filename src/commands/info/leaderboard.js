const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const db = require('../../utils/database');
const config = require('../../config/config.json');
const { getRankFromElo, getRankName, getRankColor } = require('../../utils/rankUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Displays the top 10 players by ELO rating'),
    
    async execute(interaction) {
        try {
            const users = Object.values(db.data.users);
            const rankedPlayers = users
                .filter(user => user.elo !== undefined && user.elo !== null)
                .sort((a, b) => (b.elo || 0) - (a.elo || 0));

            if (rankedPlayers.length === 0) {
                return interaction.reply({
                    content: 'No ranked players found!',
                    ephemeral: true
                });
            }

            let currentPage = 0;
            const playersPerPage = 10;
            const totalPages = Math.ceil(rankedPlayers.length / playersPerPage);

            const getLeaderboardEmbed = async (page) => {
                const startIdx = page * playersPerPage;
                const endIdx = startIdx + playersPerPage;
                const pagePlayers = rankedPlayers.slice(startIdx, endIdx);
                
                const topRank = getRankFromElo(rankedPlayers[0]?.elo || 0);
                const embedColor = getRankColor(topRank.name);
                
                const leaderboardEmbed = new EmbedBuilder()
                    .setColor(embedColor)
                    .setTitle('🏆 Arena Leaderboard')
                    .setDescription(`Page ${page + 1}/${totalPages} | Showing ${startIdx + 1}-${Math.min(endIdx, rankedPlayers.length)} of ${rankedPlayers.length} players`)
                    .setTimestamp();

                const userIds = pagePlayers.map(u => u.id);
                const fetchedUsers = await Promise.all(
                    userIds.map(id => interaction.client.users.fetch(id).catch(() => null))
                );

                const leaderboardText = await Promise.all(pagePlayers.map(async (user, index) => {
                    const rankEmoji = getRankEmoji(startIdx + index + 1);
                    const leaderboardPosition = startIdx + index + 1;
                    const rank = getRankFromElo(user.elo, leaderboardPosition);
                    const rankName = getRankName(user.elo, leaderboardPosition);
                    const wins = user.wins || 0;
                    const losses = user.losses || 0;
                    const winRate = (wins + losses) > 0 
                        ? ((wins / (wins + losses)) * 100).toFixed(1) 
                        : '0.0';
                    
                    const discordUser = fetchedUsers.find(u => u?.id === user.id) || 
                                     interaction.client.users.cache.get(user.id);
                    const displayName = discordUser?.username || 
                                     `User ${user.id.substring(0, 6)}`;
                    
                    return `${rankEmoji} **#${leaderboardPosition}** ${displayName} - ${rankName}\n${'▰'.repeat(3)} ${user.elo} ELO • ${wins}W ${losses}L (${winRate}% WR)`;
                }));
                
                leaderboardEmbed.addFields({
                    name: 'Ranked Players',
                    value: leaderboardText.join('\n\n') || 'No players on this page.'
                });
                
                leaderboardEmbed.setFooter({
                    text: `Top ${config.ranks?.topSupremePlayers || 250} players are Supreme`,
                });

                const currentUser = users.find(u => u.id === interaction.user.id);
                if (currentUser?.elo !== undefined && currentUser.elo !== null) {
                    const userPosition = rankedPlayers.findIndex(user => user.id === interaction.user.id) + 1;
                    if (userPosition > 0) {
                        const totalPlayers = rankedPlayers.length;
                        const userRank = userPosition <= 250 
                            ? getRankFromElo(currentUser.elo, userPosition)
                            : getRankFromElo(currentUser.elo);
                        const userRankName = getRankName(currentUser.elo, userPosition <= 250 ? userPosition : null);
                        const nextRank = getNextRank(userRank.name);
                        const progress = Math.min(100, Math.max(0, Math.round(((currentUser.elo - userRank.minElo) / (nextRank.minElo - userRank.minElo)) * 100)));
                        
                        leaderboardEmbed.addFields({
                            name: '\u200B',
                            value: `Your rank: **#${userPosition}** of ${totalPlayers} players`
                        });
                    }
                }

                return leaderboardEmbed;
            };

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('previous')
                        .setLabel('◀️ Previous')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('next')
                        .setLabel('Next ▶️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(totalPages <= 1)
                );

            const message = await interaction.reply({
                embeds: [await getLeaderboardEmbed(currentPage)],
                components: [row],
                fetchReply: true
            });

            if (totalPages <= 1) return;

            const filter = i => i.user.id === interaction.user.id && i.message.id === message.id;
            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 20 * 60 * 1000, 
                filter
            });

            collector.on('collect', async i => {
                if (i.customId === 'previous' && currentPage > 0) {
                    currentPage--;
                } else if (i.customId === 'next' && currentPage < totalPages - 1) {
                    currentPage++;
                }

                row.components[0].setDisabled(currentPage === 0);
                row.components[1].setDisabled(currentPage === totalPages - 1);

                await i.update({
                    embeds: [await getLeaderboardEmbed(currentPage)],
                    components: [row]
                });
            });

            collector.on('end', async collected => {
                if (collected.size === 0) {
                    await message.edit({
                        content: 'This leaderboard has expired. Please run `/leaderboard` again to view the latest rankings.',
                        embeds: [],
                        components: []
                    }).catch(console.error);
                }
            });

        } catch (error) {
            console.error('Error in leaderboard command:', error);
            await interaction.reply({
                content: 'An error occurred while fetching the leaderboard. Please try again later.',
                ephemeral: true
            });
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
