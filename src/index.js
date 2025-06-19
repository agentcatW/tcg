const { 
    Client, 
    Collection, 
    GatewayIntentBits, 
    ActionRowBuilder,
    ButtonBuilder,
    EmbedBuilder
} = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const fs = require('fs');
const path = require('path');
const config = require('./config/config.json');
const { handleTradeButton } = require('./events/buttons/tradeButtons');

const commandUsage = [];
const userCooldowns = new Map();

const COOLDOWN_CONFIG = {
    BASE: 3000,           
    MAX: 30000,          
    WINDOW: 60000,       
    HIGH_LOAD: 100,       
    ADMIN_BYPASS: true  
};

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ] 
});
client.commands = new Collection();

const arenaMatchmaker = require('./utils/arena');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');

function loadCommands(dir) {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            loadCommands(fullPath);
        } else if (file.endsWith('.js')) {
            try {
                const command = require(fullPath);
                if ('data' in command && 'execute' in command) {
                    client.commands.set(command.data.name, command);
                    commands.push(command.data.toJSON());
                } else {
                    console.log(`[WARNING] The command at ${fullPath} is missing a required "data" or "execute" property.`);
                }
            } catch (error) {
                console.error(`Error loading command ${fullPath}:`, error);
            }
        }
    }
}

loadCommands(commandsPath);

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    arenaMatchmaker.setClient(client);
    
    const friendlyCommand = client.commands.get('friendly');
    if (friendlyCommand && typeof friendlyCommand.setClient === 'function') {
        friendlyCommand.setClient(client);
    }
    
    const rest = new REST({ version: '10' }).setToken(config.token);
    
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Error refreshing commands:', error);
    }
});

client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isAutocomplete()) {
            const command = client.commands.get(interaction.commandName);
            if (!command?.autocomplete) return;
            
            try {
                await command.autocomplete(interaction);
            } catch (error) {
                console.error('Error handling autocomplete:', error);
            }
            return;
        }
        
        if (interaction.isButton()) {
            if (interaction.customId.startsWith('trade_')) {
                await handleTradeButton(interaction);
            } else if (interaction.customId === 'arena_attack') {
                const arenaCommand = client.commands.get('arena');
                if (arenaCommand) {
                    await arenaCommand.handleAttack(interaction);
                }
            }
            
            if (interaction.customId.startsWith('confirm_delete_')) {
                const teamId = interaction.customId.replace('confirm_delete_', '');
                const { deleteTeam } = require('./utils/teamUtils');
                
                const result = await deleteTeam(teamId, interaction.user.id);
                
                const row = new ActionRowBuilder()
                    .addComponents(
                        ButtonBuilder.from(interaction.message.components[0].components[0])
                            .setDisabled(true),
                        ButtonBuilder.from(interaction.message.components[0].components[1])
                            .setDisabled(true)
                    );
                
                const resultEmbed = new EmbedBuilder()
                    .setColor(result.success ? 0x00FF00 : 0xFF0000)
                    .setTitle(result.success ? '✅ Team Deleted' : '❌ Error')
                    .setDescription(result.message)
                    .setTimestamp();
                
                await interaction.update({
                    embeds: [resultEmbed],
                    components: [row],
                    content: null
                });
                return;
            }
            
            if (interaction.customId === 'cancel_delete') {
                const row = new ActionRowBuilder()
                    .addComponents(
                        ButtonBuilder.from(interaction.message.components[0].components[0])
                            .setDisabled(true),
                        ButtonBuilder.from(interaction.message.components[0].components[1])
                            .setDisabled(true)
                    );
                
                const cancelEmbed = new EmbedBuilder()
                    .setColor(0x3498db)
                    .setTitle('❌ Deletion Cancelled')
                    .setDescription('The team was not deleted.')
                    .setTimestamp();
                
                await interaction.update({
                    embeds: [cancelEmbed],
                    components: [row],
                    content: null
                });
                return;
            }
        }
        
        if (interaction.isCommand()) {
            const userId = interaction.user.id;
            const now = Date.now();
            const isAdmin = config.adminUserIds?.includes(userId);
            
            const oneMinuteAgo = now - COOLDOWN_CONFIG.WINDOW;
            while (commandUsage.length > 0 && commandUsage[0].timestamp < oneMinuteAgo) {
                commandUsage.shift();
            }
            
            const recentCommands = commandUsage.length;
            const loadFactor = Math.min(recentCommands / COOLDOWN_CONFIG.HIGH_LOAD, 5); 
            const dynamicCooldown = Math.min(
                COOLDOWN_CONFIG.BASE * (1 + loadFactor),
                COOLDOWN_CONFIG.MAX
            );
            
            if (!userCooldowns.has(userId)) {
                userCooldowns.set(userId, { lastUsed: 0, cooldown: COOLDOWN_CONFIG.BASE });
            }
            
            const userCooldown = userCooldowns.get(userId);
            const remainingTime = (userCooldown.lastUsed + userCooldown.cooldown - now) / 1000;
            
            if (remainingTime > 0 && !(COOLDOWN_CONFIG.ADMIN_BYPASS && isAdmin)) {
                return interaction.reply({
                    content: `⏱️ Please wait ${remainingTime.toFixed(1)} more seconds before using another command.`,
                    ephemeral: true
                });
            }
            
            userCooldown.lastUsed = now;
            userCooldown.cooldown = dynamicCooldown;
            
            commandUsage.push({
                userId: userId,
                command: interaction.commandName,
                timestamp: now
            });
            
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            await command.execute(interaction);
        } 
        else if (interaction.isButton()) {
            if (interaction.customId.startsWith('trade_')) {
                await handleTradeButton(interaction);
            }
        }
    } catch (error) {
        console.error('Error handling interaction:', error);
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ 
                    content: '❌ There was an error processing this interaction!', 
                    ephemeral: true 
                });
            } else {
                await interaction.reply({ 
                    content: '❌ There was an error processing this interaction!', 
                    ephemeral: true 
                });
            }
        } catch (e) {
            console.error('Failed to send error message:', e);
        }
    }
});

client.login(config.token).catch(error => {
    console.error('Failed to log in:', error);
    process.exit(1);
});
