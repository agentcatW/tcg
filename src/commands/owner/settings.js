const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { ownerOnly } = require('../../utils/permissions');

const configPath = path.join(__dirname, '../../config/config.json');
let config = require('../../config/config.json');

function saveConfig() {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 4), 'utf8');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('settings')
        .setDescription('[Owner] Manage bot settings')
        .addSubcommand(subcommand =>
            subcommand
                .setName('reload')
                .setDescription('Reload bot configuration')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('admins')
                .setDescription('Manage bot admins')
                .addStringOption(option =>
                    option.setName('action')
                        .setDescription('Action to perform')
                        .setRequired(true)
                        .addChoices(
                            { name: 'List', value: 'list' },
                            { name: 'Add', value: 'add' },
                            { name: 'Remove', value: 'remove' }
                        )
                )
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to add/remove as admin')
                        .setRequired(false)
                )
        ),

    async execute(interaction) {
        const isAllowed = await ownerOnly(interaction, () => true);
        if (!isAllowed) return;

        delete require.cache[require.resolve('../../config/config.json')];
        config = require('../../config/config.json');

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'reload') {
            await interaction.reply({
                content: '✅ Configuration reloaded!',
                ephemeral: true
            });
            return;
        }

        if (subcommand === 'admins') {
            const action = interaction.options.getString('action');
            const user = interaction.options.getUser('user');
            
            if (!config.adminUserIds) {
                config.adminUserIds = [];
            }

            const embed = new EmbedBuilder().setColor(0x3498db);

            switch (action) {
                case 'list':
                    const adminList = config.adminUserIds.length > 0 
                        ? config.adminUserIds.map(id => `<@${id}>`).join('\n')
                        : 'No admins configured.';
                    
                    embed.setTitle('🛡️ Bot Admins')
                         .setDescription(adminList);
                    break;

                case 'add':
                    if (!user) {
                        return interaction.reply({
                            content: '❌ Please specify a user to add as admin.',
                            ephemeral: true
                        });
                    }

                    if (user.id === interaction.client.user.id) {
                        return interaction.reply({
                            content: "❌ You can't add the bot as an admin.",
                            ephemeral: true
                        });
                    }

                    if (config.adminUserIds.includes(user.id)) {
                        return interaction.reply({
                            content: `❌ ${user} is already an admin.`,
                            ephemeral: true
                        });
                    }

                    config.adminUserIds.push(user.id);
                    saveConfig();
                    
                    embed.setTitle('✅ Admin Added')
                         .setDescription(`Successfully added ${user} as an admin.`);
                    break;

                case 'remove':
                    if (!user) {
                        return interaction.reply({
                            content: '❌ Please specify a user to remove from admins.',
                            ephemeral: true
                        });
                    }

                    if (user.id === config.ownerId) {
                        return interaction.reply({
                            content: '❌ You cannot remove the owner as an admin.',
                            ephemeral: true
                        });
                    }

                    const index = config.adminUserIds.indexOf(user.id);
                    if (index === -1) {
                        return interaction.reply({
                            content: `❌ ${user} is not an admin.`,
                            ephemeral: true
                        });
                    }

                    config.adminUserIds.splice(index, 1);
                    saveConfig();
                    
                    embed.setTitle('✅ Admin Removed')
                         .setDescription(`Successfully removed ${user} from admins.`);
                    break;
            }

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
};
