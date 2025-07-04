const { 
    SlashCommandBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    EmbedBuilder,
    AttachmentBuilder,
    MessageFlags
} = require('discord.js');
const badWordsList = require('badwords-list');

const INAPPROPRIATE_WORDS = [
    ...badWordsList.array,  
];

const profanityPattern = new RegExp(
    INAPPROPRIATE_WORDS
        .map(word => word.replace(/([.*+?^${}()|[\]\\])/g, '\\$1')) 
        .join('|'),
    'i' 
);

function isProfane(text) {
    if (!text || typeof text !== 'string') return false;
    
    const cleanedText = text
        .toLowerCase()
        .replace(/[^a-z]/g, '');
    
    return profanityPattern.test(cleanedText);
}

function cleanProfanity(text) {
    if (!text || typeof text !== 'string') return '';
    
    return text.replace(/\b\w+\b/g, word => {
        const cleanWord = word.replace(/[^a-z]/gi, '').toLowerCase();
        return INAPPROPRIATE_WORDS.some(badWord => cleanWord.includes(badWord))
            ? '❤️'.repeat(word.length)
            : word;
    });
}

const db = require('../../utils/database');
const { 
    createTeam, 
    getUserOwnedTeams, 
    deleteTeam,
    getTeamById,
    updateTeamSlot,
    removeTeamSlot
} = require('../../utils/teamUtils');
const { getImageBuffer } = require('../../utils/imageCache');
const path = require('path');
const { calculateOVR } = require('../../utils/cards/cardUtils');

const RARITY_COLORS = {
    'C': 0x808080,  
    'B': 0x1EFF00,  
    'A': 0x0070FF,  
    'S': 0xA335EE,  
    'SS': 0xFF8000, 
    'SSR': 0xE6CC80  
};

function getRarityEmoji(rarity) {
    const emojis = {
        'C': '⚪',
        'B': '🟢',
        'A': '🔵',
        'S': '🟣',
        'SS': '🟠',
        'SSR': '🌟'
    };
    return emojis[rarity] || '';
}

async function createCardEmbed(card, slot) {
    const ovr = card.ovr || calculateOVR(card);
    const rarity = card.rarity || 'C';
    
    const embed = new EmbedBuilder()
        .setColor(RARITY_COLORS[rarity] || 0x808080)
        .setTitle(`${card.name} (Slot ${slot})`)
        .setDescription(`**Rarity:** ${rarity} ${getRarityEmoji(rarity)}\n**OVR:** ${ovr}`)
        .addFields(
            { name: 'STR', value: card.stats.strength.toString(), inline: true },
            { name: 'DEF', value: card.stats.defense.toString(), inline: true },
            { name: 'SPD', value: card.stats.speed.toString(), inline: true },
            { name: 'HP', value: card.stats.hp.toString(), inline: true },
            { name: 'Playstyle', value: card.playstyle || 'None', inline: true }
        );

    let files = [];
    const imagePath = card.image || card.imagePath;
    
    if (imagePath) {
        try {
            const imageBuffer = await getImageBuffer(imagePath);
            if (imageBuffer) {
                const filename = path.basename(imagePath);
                const attachment = new AttachmentBuilder(imageBuffer, { name: filename });
                embed.setThumbnail(`attachment://${filename}`);
                files.push(attachment);
            }
        } catch (error) {
            console.error('Error loading card image:', error);
        }
    }

    return { embed, files };
};

const data = new SlashCommandBuilder()
    .setName('teams')
    .setDescription('Team management commands')
    .addSubcommand(subcommand => 
        subcommand
            .setName('create')
            .setDescription('Create a new team')
            .addStringOption(option =>
                option
                    .setName('name')
                    .setDescription('The name of your team')
                    .setRequired(true)
                    .setMaxLength(32)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('delete')
            .setDescription('Delete one of your teams')
            .addStringOption(option =>
                option
                    .setName('team')
                    .setDescription('The team to delete')
                    .setRequired(true)
                    .setAutocomplete(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('view')
            .setDescription('View details of a team')
            .addStringOption(option =>
                option
                    .setName('team')
                    .setDescription('The team to view')
                    .setRequired(true)
                    .setAutocomplete(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('add')
            .setDescription('Add a card to a team slot')
            .addStringOption(option =>
                option
                    .setName('team')
                    .setDescription('The team to add the card to')
                    .setRequired(true)
                    .setAutocomplete(true)
            )
            .addStringOption(option =>
                option
                    .setName('card_id')
                    .setDescription('The ID of the card to add (use /collection to find card IDs)')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option
                    .setName('slot')
                    .setDescription('The slot to add the card to')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Slot 1', value: '1' },
                        { name: 'Slot 2', value: '2' },
                        { name: 'Slot 3', value: '3' },
                        { name: 'Slot 4', value: '4' }
                    )
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('remove')
            .setDescription('Remove a card from a team slot')
            .addStringOption(option =>
                option
                    .setName('team')
                    .setDescription('The team to modify')
                    .setRequired(true)
                    .setAutocomplete(true)
            )
            .addStringOption(option =>
                option
                    .setName('slot')
                    .setDescription('The slot to remove the card from (1-4)')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Slot 1', value: '1' },
                        { name: 'Slot 2', value: '2' },
                        { name: 'Slot 3', value: '3' },
                        { name: 'Slot 4', value: '4' }
                    )
            )
    );

function validateTeamName(name) {
    const trimmedName = name.trim();
    
    if (trimmedName.length < 2 || trimmedName.length > 20) {
        return { valid: false, message: '❌ Team name must be between 2 and 20 characters long.' };
    }
    
    if (isProfane(trimmedName.toLowerCase())) {
        return { valid: false, message: '❌ Profanity detected. Team was not created.' };
    }
    
    if (!/^[\w\s.,!?-]+$/i.test(trimmedName)) {
        return { valid: false, message: '❌ Team name can only contain letters, numbers, spaces, and basic punctuation.' };
    }
    
    if (/\s{2,}/.test(trimmedName) || trimmedName.startsWith(' ') || trimmedName.endsWith(' ')) {
        return { valid: false, message: '❌ Team name cannot start/end with spaces or have multiple spaces in a row.' };
    }
    
    if (/(.)\1{4,}/i.test(trimmedName)) {
        return { valid: false, message: '❌ Team name contains too many repeated characters.' };
    }
    
    if (/^\d+$/.test(trimmedName)) {
        return { valid: false, message: '❌ Team name cannot be just numbers.' };
    }
    
    return { valid: true };
}

async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const user = db.getUser(userId);

    if (subcommand === 'create') {
        let name = interaction.options.getString('name').trim();
        
        const validation = validateTeamName(name);
        if (!validation.valid) {
            return interaction.reply({
                content: validation.message,
                flags: MessageFlags.Ephemeral
            });
        }
        
        name = name.replace(/\s+/g, ' ').trim();
        
        const existingTeams = getUserOwnedTeams(userId);
        const nameLower = name.toLowerCase();
        if (existingTeams.some(team => team.name.toLowerCase() === nameLower)) {
            return interaction.reply({
                content: '❌ You already have a team with that name!',
                flags: MessageFlags.Ephemeral
            });
        }
        
        if (existingTeams.length >= 5) {
            return interaction.reply({
                content: '❌ You can only have up to 5 teams!',
                flags: MessageFlags.Ephemeral
            });
        }
        
        try {
            if (isProfane(name)) {
                return interaction.reply({
                    content: '❌ Inappropriate team name detected. Please choose a different name.',
                    flags: MessageFlags.Ephemeral
                });
            }
            
            const cleanedName = name.trim().replace(/\s+/g, ' ');
            
            const validation = validateTeamName(cleanedName);
            if (!validation.valid) {
                return interaction.reply({
                    content: validation.message,
                    flags: MessageFlags.Ephemeral
                });
            }
            
            const existingTeams = getUserOwnedTeams(userId);
            const nameLower = cleanedName.toLowerCase();
            if (existingTeams.some(team => team.name.toLowerCase() === nameLower)) {
                return interaction.reply({
                    content: '❌ You already have a team with that name!',
                    flags: MessageFlags.Ephemeral
                });
            }
            
            if (existingTeams.length >= 5) {
                return interaction.reply({
                    content: '❌ You can only have up to 5 teams!',
                    flags: MessageFlags.Ephemeral
                });
            }
            
            const result = createTeam(cleanedName, { id: userId, username: interaction.user.username });
            if (result && result.success) {
                return interaction.reply({
                    content: `✅ Team **${cleanedName}** has been created!`,
                });
            } else {
                return interaction.reply({
                    content: result?.message || '❌ Failed to create team. Please try again.',
                    flags: MessageFlags.Ephemeral
                });
            }
        } catch (error) {
            console.error('Error creating team:', error);
            return interaction.reply({
                content: '❌ An error occurred while creating the team. Please try again later.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
    
    if (subcommand === 'add') {
        const teamId = interaction.options.getString('team');
        const cardNumber = parseInt(interaction.options.getString('card_id'));
        const slot = interaction.options.getString('slot');
        
        const sortedCards = [...(user.cards || [])].sort((a, b) => {
            const calculateOVR = (card) => {
                if (card.ovr) return Math.min(99, card.ovr);
                const ovr = Math.round((card.stats.strength + card.stats.defense + card.stats.speed + (card.stats.hp / 2)) / 4);
                return Math.min(99, ovr);
            };
            const ovrA = calculateOVR(a);
            const ovrB = calculateOVR(b);
            if (ovrB !== ovrA) return ovrB - ovrA;
            return a.name.localeCompare(b.name);
        });

        if (isNaN(cardNumber) || cardNumber < 1 || cardNumber > sortedCards.length) {
            return interaction.reply({
                content: `❌ Invalid card number! Please use a number between 1 and ${sortedCards.length} from your collection.`,
                flags: MessageFlags.Ephemeral
            });
        }
        
        const team = getTeamById(teamId);
        if (!team) {
            return interaction.reply({
                content: '❌ Team not found!',
                flags: MessageFlags.Ephemeral
            });
        }
        
        if (team.owner !== userId) {
            return interaction.reply({
                content: '❌ You do not have permission to modify this team!',
                flags: MessageFlags.Ephemeral
            });
        }
        
        const card = sortedCards[cardNumber - 1];
        if (!card) {
            return interaction.reply({
                content: '❌ Card not found in your collection!',
                flags: MessageFlags.Ephemeral
            });
        }
        
        const result = updateTeamSlot(team.id, parseInt(slot), card);
        if (!result.success) {
            return interaction.reply({
                content: `❌ Error: ${result.message}`,
                flags: MessageFlags.Ephemeral
            });
        }
        
        const { embed, files } = await createCardEmbed(card, slot);
        
        return interaction.reply({
            content: `✅ Successfully added **${card.name}** to Slot ${slot} of team **${team.name}**!`,
            embeds: [embed],
            files: files,
            flags: MessageFlags.Ephemeral
        });
    }
    
    if (subcommand === 'view') {
        const teamId = interaction.options.getString('team');
        const team = getTeamById(teamId);
        
        if (!team) {
            return interaction.reply({
                content: '❌ Team not found!',
                flags: MessageFlags.Ephemeral
            });
        }
        
        const positions = ['S1', 'S2', 'S3', 'S4'].join(' • ');
        
        const cardSlots = [1, 2, 3, 4].map(slot => {
            const card = team[`slot${slot}`];
            if (!card) return `SLOT ${slot} HAS S${slot} • EMPTY`;
            
            return `SLOT ${slot} HAS S${slot} • ${card.name} • ${card.stats.hp} • ${card.stats.strength} • ${card.stats.defense} • ${card.stats.speed}`;
        }).join('\n');
        
        const teamInfo = [
            `**Team Positions:** ${positions}\n`,
            '**Cards in this team:**',
            cardSlots,
            '',
            `**Team ID:** ${team.id}`
        ].join('\n');
        
        const embed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle(`Team ${team.name}`)
            .setDescription(teamInfo)
            .setTimestamp();
            
        return interaction.reply({
            embeds: [embed],
        });
    }
    
    if (subcommand === 'remove') {
        const teamId = interaction.options.getString('team');
        const slot = parseInt(interaction.options.getString('slot'));
        
        const team = getTeamById(teamId);
        if (!team) {
            return interaction.reply({
                content: '❌ Team not found!',
                flags: MessageFlags.Ephemeral
            });
        }
        
        if (team.owner !== userId) {
            return interaction.reply({
                content: '❌ You do not have permission to modify this team!',
                flags: MessageFlags.Ephemeral
            });
        }
        
        const result = removeTeamSlot(team.id, slot);
        return interaction.reply({
            content: result.message,
            flags: MessageFlags.Ephemeral
        });
    }
    
    if (subcommand === 'delete') {
        const teamId = interaction.options.getString('team');
        const ownedTeams = getUserOwnedTeams(userId);
        const teamToDelete = ownedTeams.find(team => team.id === teamId);
        
        if (!teamToDelete) {
            return interaction.reply({
                content: '❌ Team not found or you do not have permission to delete it!',
                flags: MessageFlags.Ephemeral
            });
        }
        
        const confirmEmbed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle('⚠️ Confirm Team Deletion')
            .setDescription(`You are about to delete the team **${teamToDelete.name}**`)
            .addFields(
                { name: 'Team ID', value: teamToDelete.id, inline: true },
                { name: 'Owner', value: teamToDelete.username, inline: true },
                { name: 'Created', value: `<t:${Math.floor(new Date(teamToDelete.createdAt).getTime() / 1000)}:R>`, inline: true },
                { name: '\u200B', value: '**This action cannot be undone!**' }
            )
            .setFooter({ text: 'This action is irreversible' })
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`confirm_delete_${teamId}`)
                    .setLabel('Delete Team')
                    .setEmoji('✅')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('cancel_delete')
                    .setLabel('Cancel')
                    .setEmoji('❌')
                    .setStyle(ButtonStyle.Danger)
            );
        
        return interaction.reply({
            embeds: [confirmEmbed],
            components: [row],
            flags: MessageFlags.Ephemeral
        });
    }
    
    return interaction.reply({
        content: '❌ Unknown subcommand!',
        flags: MessageFlags.Ephemeral
    });
}

async function autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    const userId = interaction.user.id;
    const user = db.getUser(userId);
    
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
}

module.exports = {
    data,
    execute,
    autocomplete
};
