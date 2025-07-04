const config = require('../config/config.json');
const { MessageFlags } = require('discord.js');

function isOwner(userId) {
    return config.ownerId === userId;
}

function isAdmin(userId) {
    return isOwner(userId) || (Array.isArray(config.adminUserIds) && config.adminUserIds.includes(userId));
}

async function ownerOnly(interaction, next) {
    if (!isOwner(interaction.user.id)) {
        await interaction.reply({
            content: '❌ This command is only available to the bot owner.',
            flags: MessageFlags.Ephemeral
        });
        return false;
    }
    return next();
}

async function adminOnly(interaction, next) {
    if (!isAdmin(interaction.user.id)) {
        await interaction.reply({
            content: '❌ This command is only available to administrators.',
            flags: MessageFlags.Ephemeral
        });
        return false;
    }
    return next();
}

module.exports = {
    isOwner,
    isAdmin,
    ownerOnly,
    adminOnly
};
