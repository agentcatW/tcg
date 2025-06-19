const { AttachmentBuilder } = require('discord.js');
const { createCanvas } = require('canvas');

const activeBattles = new Map();

async function updateBattleDisplay(match, client) {
    try {
        const battleMessage = activeBattles.get(match.id);
        if (!battleMessage) return;

        const { message } = battleMessage;
        
        const attachment = await renderMatch(match, client);
        
        await message.edit({ 
            files: [attachment],
            components: []
        });
        
    } catch (error) {
        console.error('Error updating battle display:', error);
    }
}

async function renderMatch(match, client) {
    const canvas = createCanvas(1000, 800);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const player1 = match.players[0];
    const player2 = match.players[1];
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(player1.username || 'Player 1', 50, 50);
    
    ctx.textAlign = 'right';
    ctx.fillText(player2.username || 'Player 2', canvas.width - 50, 50);
    
    ctx.textAlign = 'center';
    if (match.winner) {
        const winner = match.players.find(p => p.userId === match.winner);
        ctx.fillText(`${winner?.username || 'Unknown'} wins!`, canvas.width / 2, 100);
    } else {
        ctx.fillText('Battle in progress...', canvas.width / 2, 100);
    }

    return new AttachmentBuilder(canvas.toBuffer(), { name: 'battle.png' });
}

function addBattle(matchId, message) {
    activeBattles.set(matchId, { message });
}

function removeBattle(matchId) {
    activeBattles.delete(matchId);
}

module.exports = {
    updateBattleDisplay,
    renderMatch,
    addBattle,
    removeBattle
};
