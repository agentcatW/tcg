const { tradeOffers } = require('./tradeStore');

function isUserInTrade(userId) {
    for (const [tradeId, trade] of tradeOffers.entries()) {
        if (trade.from === userId || trade.to === userId) {
            return true;
        }
    }
    return false;
}

async function checkTradeStatus(interaction) {
    if (isUserInTrade(interaction.user.id)) {
        await interaction.reply({
            content: '❌ You cannot use this command while you have an active trade in progress. Please complete or cancel your current trade first.',
            ephemeral: true
        });
        return false;
    }
    return true;
}

module.exports = {
    isUserInTrade,
    checkTradeStatus
};
