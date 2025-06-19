const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../utils/database');
const config = require('../../config/config.json');
const { getRankFromElo, getRankName, getRankColor, getRankProgress } = require('../../utils/rankUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('View your profile and statistics')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to view the profile of (defaults to you)')
                .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply();
        
        try {
            const targetUser = interaction.options.getUser('user') || interaction.user;
            const userId = targetUser.id;
            const userData = await db.getUser(userId);
            
            if (!userData) {
                return interaction.editReply({ 
                    content: targetUser.id === interaction.user.id 
                        ? "You don't have a profile yet. Play some games to create one!" 
                        : "This user doesn't have a profile yet."
                });
            }

            const { elo = 0, wins = 0, losses = 0, cardsDefeated = 0, damageDealt = 0 } = userData;
            
            const leaderboard = await db.getLeaderboard();
            const leaderboardEntry = leaderboard.find(entry => entry.id === userId);
            const leaderboardPosition = leaderboardEntry?.position || null;
            
            const currentRank = getRankFromElo(elo, leaderboardPosition);
            const rankName = getRankName(elo, leaderboardPosition);
            const displayRank = rankName; 
            
            const isSupremeRank = rankName === 'Supreme';
            let progressText;
            
            if (isSupremeRank) {
                progressText = "🏆 Max Rank Reached";
            } else {

                const eloBasedRank = getRankFromElo(elo);
                const rankInfo = getRankProgress(elo);
                const { nextRank, eloNeeded } = rankInfo;
                progressText = `⬆️ ${eloNeeded} ELO to ${nextRank?.name || 'the next rank'}`;
            }
            
            const winRate = wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : 0;
            
            const embed = new EmbedBuilder()
                .setColor(getRankColor(currentRank))
                .setAuthor({ 
                    name: `${targetUser.username}'s Profile`,
                    iconURL: targetUser.displayAvatarURL({ dynamic: true })
                })
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 128 }))
                .addFields(
                    { 
                        name: 'Rank', 
                        value: `${displayRank} (${elo} ELO)`,
                        inline: true 
                    },
                    { 
                        name: 'Rank Progress', 
                        value: progressText,
                        inline: true 
                    },
                    { 
                        name: 'Battles', 
                        value: `🎮 ${wins + losses} total\n✅ ${wins} wins\n❌ ${losses} losses\n📊 ${winRate}% win rate`,
                        inline: true 
                    },
                    { 
                        name: 'Combat Stats', 
                        value: `⚔️ ${cardsDefeated} cards defeated\n💥 ${damageDealt} total damage dealt`,
                        inline: true 
                    }
                )
                .setFooter({ text: 'Play more to improve your stats!' })
                .setTimestamp();

            if (currentRank?.image) {
                embed.setImage(currentRank.image);
            }

            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Profile command error:', error);
            await interaction.editReply({
                content: 'An error occurred while fetching the profile.'
            });
        }
    }
};
