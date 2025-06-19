const { SlashCommandBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');
const db = require('../../utils/database');
const { getTeamById, getUserOwnedTeams } = require('../../utils/teamUtils');
const arena = require('../../utils/arena');

const activeBattles = new Map();
let clientInstance = null;

module.exports = {
    setClient(client) {
        clientInstance = client;
    },
    
    getClient() {
        return clientInstance;
    },
    data: new SlashCommandBuilder()
        .setName('friendly')
        .setDescription('Challenge another player to a friendly battle')
        .addStringOption(option =>
            option.setName('team')
                .setDescription('The team to use for the battle')
                .setRequired(true)
                .setAutocomplete(true))
        .addUserOption(option =>
            option.setName('opponent')
                .setDescription('The player to challenge')
                .setRequired(true)),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        const teams = getUserOwnedTeams(interaction.user.id) || [];
        
        const filtered = teams
            .filter(team => {
                const nameMatch = team.name && team.name.toLowerCase().includes(focusedValue.toLowerCase());
                const idMatch = team.id && team.id.toLowerCase().includes(focusedValue.toLowerCase());
                return nameMatch || idMatch;
            })
            .slice(0, 25);

        await interaction.respond(
            filtered.map(team => ({
                name: team.name || `Team ${team.id.slice(-4)}`,
                value: team.id
            }))
        );
    },

    async execute(interaction) {
        const challengerId = interaction.user.id;
        const opponent = interaction.options.getUser('opponent');
        const teamId = interaction.options.getString('team');

        if (opponent.bot) {
            return interaction.reply({
                content: 'You cannot challenge a bot to a friendly match!',
                ephemeral: true
            });
        }

        if (opponent.id === challengerId) {
            return interaction.reply({
                content: 'You cannot challenge yourself!',
                ephemeral: true
            });
        }

        const team = getTeamById(teamId);
        if (!team || team.owner !== challengerId) {
            return interaction.reply({
                content: 'You do not own this team or it does not exist!',
                ephemeral: true
            });
        }

        if (arena.userToMatch.has(opponent.id)) {
            return interaction.reply({
                content: `${opponent.username} is already in a match!`,
                ephemeral: true
            });
        }

        const challengeEmbed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle('🎮 Friendly Battle Challenge')
            .setDescription(`${interaction.user} has challenged ${opponent} to a friendly battle!`)
            .addFields(
                { name: 'Challenger', value: interaction.user.username, inline: true },
                { name: 'Team', value: team.name || 'Unnamed Team', inline: true },
                { name: 'No ELO', value: 'This is a friendly match - no ELO will be affected', inline: false }
            )
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`accept_${challengerId}_${teamId}`)
                    .setLabel('Accept Challenge')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('decline')
                    .setLabel('Decline')
                    .setStyle(ButtonStyle.Danger)
            );

        const challengeMessage = await interaction.reply({
            content: `${opponent}, you've been challenged to a friendly battle!`,
            embeds: [challengeEmbed],
            components: [row],
            fetchReply: true
        });

        const filter = i => {
            if (i.customId === 'decline') return i.user.id === opponent.id;
            return i.customId.startsWith('accept_') && i.user.id === opponent.id;
        };

        try {
            const response = await challengeMessage.awaitMessageComponent({
                filter,
                time: 60000
            });

            if (response.customId === 'decline') {
                await response.update({
                    content: `${opponent.username} has declined the friendly battle challenge.`,
                    embeds: [],
                    components: []
                });
                return;
            }
            
            const [_, challengerIdFromButton, challengerTeamId] = response.customId.split('_');
            
            if (challengerIdFromButton !== challengerId) {
                await response.update({
                    content: 'This challenge is no longer valid.',
                    embeds: [],
                    components: []
                });
                return;
            }

            const opponentTeams = getUserOwnedTeams(opponent.id);
            if (opponentTeams.length === 0) {
                await response.update({
                    content: 'You need to create a team first!',
                    ephemeral: true
                });
                return;
            }

            const teamSelect = new StringSelectMenuBuilder()
                .setCustomId('team_select')
                .setPlaceholder('Select a team to use')
                .addOptions(
                    opponentTeams.map(team => ({
                        label: team.name || `Team ${team.id.slice(-4)}`,
                        description: `Cards: ${[team.slot1, team.slot2, team.slot3, team.slot4].filter(Boolean).length}/4`,
                        value: team.id
                    }))
                );
            
            interaction.challengerTeamId = challengerTeamId;

            const selectRow = new ActionRowBuilder().addComponents(teamSelect);
            
            await response.update({
                content: `${opponent}, select a team to use for the friendly battle:`,
                components: [selectRow],
                embeds: []
            });

            try {
                const teamSelectInteraction = await challengeMessage.awaitMessageComponent({
                    filter: i => i.user.id === opponent.id && i.customId === 'team_select',
                    time: 60000
                });

                const selectedTeamId = teamSelectInteraction.values[0];
                await this.startFriendlyBattle(interaction, challengerId, challengerTeamId, opponent.id, selectedTeamId, teamSelectInteraction);
            } catch (error) {
                if (error.name === 'Error [InteractionCollectorError]') {
                    await interaction.followUp({
                        content: 'Team selection timed out. The challenge has been cancelled.',
                        ephemeral: true
                    });
                } else {
                    console.error('Error in team selection:', error);
                    await interaction.followUp({
                        content: 'An error occurred while selecting a team.',
                        ephemeral: true
                    });
                }
            }

        } catch (error) {
            if (error.name === 'Error [InteractionCollectorError]') {
                await interaction.editReply({
                    content: 'The challenge timed out.',
                    components: []
                });
            } else {
                console.error('Error in friendly command:', error);
                await interaction.editReply({
                    content: 'An error occurred while processing the challenge.',
                    components: []
                });
            }
        }
    },

    async updateBattleDisplay(match, client) {
        const battleInfo = activeBattles.get(match.id);
        if (!battleInfo) return;
        
        try {
            const { message } = battleInfo;
            
            const winnerUser = db.getUser(match.winner);
            const loserUser = db.getUser(match.loser);
            const winnerElo = winnerUser?.elo || 100;
            const loserElo = loserUser?.elo || 100;
            
            const matchForRender = {
                ...match,
                logs: [],
                winnerElo: winnerElo,
                loserElo: loserElo,
                stats: {
                    ...(match.stats || {}),
                    winner: {
                        ...((match.stats || {}).winner || {}),
                        elo: winnerElo,
                        eloChange: 0,
                        cardsDefeated: (match.stats?.winner?.cardsDefeated) || 0,
                        damageDealt: (match.stats?.winner?.damageDealt) || 0
                    },
                    loser: {
                        ...((match.stats || {}).loser || {}),
                        elo: loserElo,
                        eloChange: 0,
                        cardsDefeated: (match.stats?.loser?.cardsDefeated) || 0,
                        damageDealt: (match.stats?.loser?.damageDealt) || 0
                    }
                }
            };
            
            const attachment = await arena.renderMatch(matchForRender, client);
            
            if (match.winner) {
                const winner = match.players.find(p => p.userId === match.winner);
                const loser = match.players.find(p => p.userId === match.loser);
                
                const winnerTeamStats = this.calculateTeamStats(winner.team);
                const loserTeamStats = this.calculateTeamStats(loser.team);
                
                const embed = new EmbedBuilder()
                    .setTitle('🏆 Friendly Match Finished! 🏆')
                    .setDescription(`**${winner.username}** has defeated **${loser.username}**!`)
                    .addFields([
                        { name: 'Winner', value: winner.username, inline: true },
                        { name: 'Loser', value: loser.username, inline: true },
                        { name: 'Cards Defeated', value: `${match.stats.winner.cardsDefeated} / ${match.stats.loser.cardsDefeated}`, inline: true },
                        { name: 'Damage Dealt', value: `${match.stats.winner.damageDealt} / ${match.stats.loser.damageDealt}`, inline: true }
                    ])
                    .setColor('#00ff00')
                    .setTimestamp();
                
                await message.edit({
                    content: `🎉 <@${winner.userId}> defeated <@${loser.userId}> in a friendly match!`,
                    embeds: [embed],
                    files: [attachment],
                    components: []
                });
                
                activeBattles.delete(match.id);
            } else {
                const currentPlayer = match.players[match.currentPlayer || 0];
                const opponent = match.players[1 - (match.currentPlayer || 0)];
                
                const embed = new EmbedBuilder()
                    .setTitle('⚔️ Friendly Battle in Progress')
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
            console.error('Error updating friendly battle display:', error);
        }
    },

    async startFriendlyBattle(interaction, challengerId, challengerTeamId, opponentId, opponentTeamId, buttonInteraction) {
        await buttonInteraction.update({
            content: 'Starting friendly battle...',
            components: []
        });

        try {
            const challengerTeam = getTeamById(challengerTeamId);
            const opponentTeam = getTeamById(opponentTeamId);
            const opponent = await interaction.client.users.fetch(opponentId);

            if (!challengerTeam || !opponentTeam) {
                return buttonInteraction.followUp({
                    content: 'One of the teams could not be found.',
                    ephemeral: true
                });
            }

            const prepareTeamCards = (team) => {
                return [
                    team.slot1,
                    team.slot2,
                    team.slot3,
                    team.slot4
                ].filter(Boolean).map(card => {
                    const preparedCard = {
                        ...card,
                        id: card.id || card._id || `temp-${Math.random().toString(36).substr(2, 9)}`,
                        currentHp: card.stats?.hp || 100,
                        defeated: false,
                        stats: {
                            hp: card.stats?.hp || 100,
                            strength: card.stats?.strength || 50,
                            defense: card.stats?.defense || 50,
                            speed: card.stats?.speed || 50
                        },
                        name: card.name || 'Unknown Card',
                        rarity: card.rarity || 'C',
                        playstyle: card.playstyle || null
                    };

                    if (card.image) {
                        preparedCard.imagePath = card.image;
                    } else if (card.imagePath) {
                        preparedCard.imagePath = card.imagePath;
                    } else if (card.name) {
                        const formattedName = card.name.toLowerCase().replace(/\s+/g, '');
                        preparedCard.imagePath = `${formattedName}.png`;
                    }


                    return preparedCard;
                });
            };

            const preparedChallengerTeam = prepareTeamCards(challengerTeam);
            const preparedOpponentTeam = prepareTeamCards(opponentTeam);
            
            const matchId = `${challengerId}-${Date.now()}`;
            const match = {
                id: matchId,
                players: [
                    {
                        userId: challengerId,
                        username: interaction.user.username,
                        elo: 0,
                        remainingCards: 4,
                        cardsDefeated: 0,
                        damageDealt: 0,
                        teamId: challengerTeamId,
                        health: 3,
                        team: preparedChallengerTeam.map(card => ({
                            ...card,
                            currentHp: card.stats.hp,
                            defeated: false
                        }))
                    },
                    {
                        userId: opponentId,
                        username: opponent.username,
                        elo: 0,
                        remainingCards: 4,
                        cardsDefeated: 0,
                        damageDealt: 0,
                        teamId: opponentTeamId,
                        health: 3,
                        team: preparedOpponentTeam.map(card => ({
                            ...card,
                            currentHp: card.stats.hp,
                            defeated: false
                        }))
                    }
                ],
                currentPlayer: 0,
                currentRound: 0,
                logs: [],
                isFriendly: true,
                channelId: interaction.channelId,
                arenaCommand: this,
                client: interaction.client
            };

            const message = await buttonInteraction.followUp({ 
                content: 'Starting friendly battle...',
                fetchReply: true 
            });

            activeBattles.set(matchId, { message });
            
            try {
                arena.activeMatches.set(matchId, match);
                arena.userToMatch.set(challengerId, matchId);
                arena.userToMatch.set(opponentId, matchId);
                
                arena.setClient(interaction.client);
                
                await arena.processBattle(matchId);
                
            } catch (error) {
                console.error('Error in friendly battle:', error);
                await buttonInteraction.followUp({
                    content: 'An error occurred during the battle.',
                    ephemeral: true
                });
            } finally {
                db.saveUsers();
                
                const friendlyCommand = interaction.client.commands?.get('friendly');
                if (friendlyCommand?.updateBattleDisplay) {
                    await friendlyCommand.updateBattleDisplay(match, interaction.client);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                activeBattles.delete(matchId);
                arena.activeMatches.delete(matchId);
                arena.userToMatch.delete(challengerId);
                arena.userToMatch.delete(opponentId);
            }

        } catch (error) {
            console.error('Error starting friendly battle:', error);
            try {
                await buttonInteraction.followUp({
                    content: 'An error occurred while starting the friendly battle.',
                    ephemeral: true
                });
            } catch (e) {
                console.error('Failed to send error message:', e);
            }
        }
    },

    calculateTeamStats(team) {
        if (!team || !Array.isArray(team)) {
            return { totalHp: 0, totalStr: 0, totalDef: 0, totalSpd: 0 };
        }
        
        return team.reduce((stats, card) => {
            const statsObj = card.stats || {};
            return {
                totalHp: stats.totalHp + (statsObj.hp || 0),
                totalStr: stats.totalStr + (statsObj.str || 0),
                totalDef: stats.totalDef + (statsObj.def || 0),
                totalSpd: stats.totalSpd + (statsObj.spd || 0)
            };
        }, { totalHp: 0, totalStr: 0, totalDef: 0, totalSpd: 0 });
    }
    
};
