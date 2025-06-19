class PlayerStatsDisplay {
    constructor() {}

    drawPlayerStatsSection(ctx, match, x, y, width, height) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.drawRoundedRect(ctx, x, y, width, height, 10);
        ctx.fill();
        
        ctx.fillStyle = 'rgba(76, 181, 245, 0.3)';
        this.drawRoundedRect(ctx, x, y, width, 40, 10);
        ctx.fill();
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('TEAM STATS', x + width / 2, y + 20);
        
        const midX = x + width / 2;
        ctx.beginPath();
        ctx.moveTo(midX, y + 50);
        ctx.lineTo(midX, y + height - 20);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.stroke();
        
        this.drawPlayerStatsPanel(ctx, match.players[0], x + 20, y + 60, width / 2 - 30, height - 90);
        this.drawPlayerStatsPanel(ctx, match.players[1], midX + 10, y + 60, width / 2 - 30, height - 90);
    }
    
    drawPlayerStatsPanel(ctx, player, x, y, width, height) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        this.drawRoundedRect(ctx, x, y, width, height, 8);
        ctx.fill();
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(player.username, x + 10, y + 25);
        
        const stats = {
            hp: 0,
            str: 0,
            def: 0,
            spd: 0,
            active: 0,
            total: player.team ? player.team.length : 0
        };
        
        if (player.team) {
            player.team.forEach(card => {
                if (!card.defeated) {
                    stats.active++;
                    stats.hp += card.currentHp || 0;
                    stats.str += card.stats?.strength || 0;
                    stats.def += card.stats?.defense || 0;
                    stats.spd += card.stats?.speed || 0;
                }
            });
        }
        
        const drawStat = (label, value, icon, yPos) => {
            ctx.fillStyle = '#bbbbbb';
            ctx.font = '14px "Segoe UI", Arial, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(label, x + 15, yPos);
            
            ctx.fillStyle = '#ffffff';
            ctx.font = '16px "Segoe UI", Arial, sans-serif';
            
            const valueText = value.toString();
            const rightPadding = 15;
            const iconPadding = 5;   
            
            if (icon) {
                const valueWidth = ctx.measureText(valueText).width;
                
                ctx.textAlign = 'right';
                ctx.fillText(valueText, x + width - rightPadding, yPos);
                
                ctx.save();
                ctx.font = '16px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
                ctx.fillText(icon, x + width - rightPadding - valueWidth - iconPadding, yPos);
                ctx.restore();
            } else {
                ctx.textAlign = 'right';
                ctx.fillText(valueText, x + width - rightPadding, yPos);
            }
        };
        
        let currentY = y + 50;
        const lineHeight = 30;
        
        drawStat('Active Cards', `${stats.active}/${stats.total}`, '🃏', currentY);
        currentY += lineHeight;
        
        drawStat('Total HP', Math.round(stats.hp), '❤️', currentY);
        currentY += lineHeight;
        
        drawStat('Total STR', Math.round(stats.str), '⚔️', currentY);
        currentY += lineHeight;
        
        drawStat('Total DEF', Math.round(stats.def), '🛡️', currentY);
        currentY += lineHeight;
        
        drawStat('Total SPD', Math.round(stats.spd), '⚡', currentY);
    }
    
    drawRoundedRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + width, y, x + width, y + height, radius);
        ctx.arcTo(x + width, y + height, x, y + height, radius);
        ctx.arcTo(x, y + height, x, y, radius);
        ctx.arcTo(x, y, x + width, y, radius);
        ctx.closePath();
    }
}

module.exports = new PlayerStatsDisplay();
