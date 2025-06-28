const config = require('../config/config.json');

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
            ephemeral: true
        });
        return false;
    }
    return next();
}

async function adminOnly(interaction, next) {
    if (!isAdmin(interaction.user.id)) {
        await interaction.reply({
            content: '❌ This command is only available to administrators.',
            ephemeral: true
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
