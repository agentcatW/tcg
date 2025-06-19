const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const arena = require('../../utils/arena');
const { getUserOwnedTeams } = require('../../utils/teamUtils');

const activeBattles = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('arena')
        .setDescription('Enter the arena to battle other players')
        .addStringOption(option =>
            option.setName('team')
                .setDescription('Select your team')
                .setRequired(true)
                .setAutocomplete(true)
        ),
    
    async autocomplete(interaction) {
        const focusedOption = interaction.options.getFocused(true);
        const userId = interaction.user.id;
        
        if (focusedOption.name === 'team') {
            const teams = getUserOwnedTeams(userId);
            const filtered = teams
                .filter(team => team.name.toLowerCase().includes(focusedOption.value.toLowerCase()))
                .slice(0, 25)
                .map(team => ({
                    name: team.name,
                    value: team.id
                }));
                
            await interaction.respond(filtered);
        }
    },
    
    async execute(interaction) {
        await interaction.deferReply();
        
        const userId = interaction.user.id;
        const teamId = interaction.options.getString('team');
        
        try {
            const currentMatch = arena.getMatch(userId);
            if (currentMatch) {
                const attachment = await arena.renderMatch(currentMatch, interaction.client);
                return interaction.editReply({ 
                    content: 'You are already in a match!',
                    files: [attachment] 
                });
            }
            
            const joinResult = await arena.joinQueue(userId, teamId);
            
            if (!joinResult.success) {
                if (joinResult.message === 'You are already in queue or in a match!') {
                    const match = arena.getMatch(userId);
                    if (match) {
                        const attachment = await battleDisplay.renderMatch(match, interaction.client);
                        return interaction.editReply({ 
                            content: 'You are already in a match!',
                            files: [attachment] 
                        });
                    } else {
                        return interaction.editReply({ 
                            content: 'You are already in the queue.'
                        });
                    }
                }
                return interaction.editReply({ 
                    content: joinResult.message || 'Failed to join queue.'
                });
            }
            
            const matchResult = await arena.tryFindMatch(userId);
            
            if (matchResult.inQueue) {
                return interaction.editReply({ 
                    content: `🔍 Searching for opponent... (Position in queue: ${matchResult.position})`
                });
            }
            
            const match = arena.getMatch(userId);
            if (!match) {
                return interaction.editReply({ 
                    content: 'Match found but could not be retrieved.'
                });
            }
            
            const opponent = match.players.find(p => p.userId !== userId);
            
            const attachment = await arena.renderMatch(match, interaction.client);
            const message = await interaction.editReply({ 
                content: 'Battle starting!',
                files: [attachment] 
            });
            
            activeBattles.set(match.id, { message, interaction });
            
        } catch (error) {
            console.error('Arena command error:', error);
            await interaction.editReply({
                content: 'An error occurred while processing your request.'
            });
        }
    },
    
    async updateBattleDisplay(match, client) {
        const battleInfo = activeBattles.get(match.id);
        if (!battleInfo) return;
        
        try {
            const { message } = battleInfo;
            const attachment = await arena.renderMatch(match, client);
            
            if (match.winner) {
                const winner = match.players.find(p => p.userId === match.winner);
                const loser = match.players.find(p => p.userId === match.loser);
                
                const embed = new EmbedBuilder()
                    .setTitle('🏆 Battle Finished! 🏆')
                    .setDescription(`**${winner.username}** has defeated **${loser.username}**!`)
                    .addFields(
                        { name: 'Winner', value: `${winner.username} (${match.winnerElo} ELO)`, inline: true },
                        { name: 'Loser', value: `${loser.username} (${match.loserElo} ELO)`, inline: true },
                        { name: 'ELO Change', value: `+${match.stats.winner.eloChange} / ${match.stats.loser.eloChange}`, inline: true },
                        { name: 'Cards Defeated', value: `${match.stats.winner.cardsDefeated} / ${match.stats.loser.cardsDefeated}`, inline: true },
                        { name: 'Damage Dealt', value: `${match.stats.winner.damageDealt} / ${match.stats.loser.damageDealt}`, inline: true }
                    )
                    .setColor('#00ff00')
                    .setTimestamp();
                
                await message.edit({
                    content: `🎉 <@${winner.userId}> defeated <@${loser.userId}>!`,
                    embeds: [embed],
                    files: [attachment],
                    components: []
                });
                
                activeBattles.delete(match.id);
            } else {
                const currentPlayer = match.players[match.currentPlayer || 0];
                const opponent = match.players[1 - (match.currentPlayer || 0)];
                
                const embed = new EmbedBuilder()
                    .setTitle('⚔️ Battle in Progress')
                    .setDescription(`**${currentPlayer.username}**'s turn to attack!`)
                    .addFields(
                        { name: 'Round', value: `${match.currentRound + 1}/4`, inline: true },
                        { name: 'Cards Remaining', value: `${currentPlayer.remainingCards} vs ${opponent.remainingCards}`, inline: true }
                    )
                    .setColor('#00ff00');
                
                await message.edit({
                    embeds: [embed],
                    files: [attachment]
                });
            }
        } catch (error) {
            console.error('Error updating battle display:', error);
        }
    }
};
