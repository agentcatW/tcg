const fs = require('fs');
const path = require('path');

const teamsDir = path.join(__dirname, '../../data/teams');
if (!fs.existsSync(teamsDir)) {
    fs.mkdirSync(teamsDir, { recursive: true });
}

const TEAMS_FILE = path.join(teamsDir, 'teams.json');

if (!fs.existsSync(TEAMS_FILE)) {
    fs.writeFileSync(TEAMS_FILE, JSON.stringify([], null, 2));
}

function createTeam(teamName, user) {
    try {
        const data = fs.readFileSync(TEAMS_FILE, 'utf8');
        const teams = JSON.parse(data);

        const teamExists = teams.some(team => team.name.toLowerCase() === teamName.toLowerCase() && team.owner === user.id);
        if (teamExists) {
            return { 
                success: false, 
                message: `❌ You already have a team with the name "${teamName}"!` 
            };
        }

        const userTeams = teams.filter(team => team.owner === user.id);
        
        if (userTeams.length >= 6) {
            return { 
                success: false, 
                message: '❌ You can only have 6 teams!' 
            };
        }

        const newTeam = {
            id: Date.now().toString(),
            name: teamName,
            owner: user.id,
            username: user.username,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        teams.push(newTeam);
        fs.writeFileSync(TEAMS_FILE, JSON.stringify(teams, null, 2));
        
        return { 
            success: true, 
            message: `✅ Team **${teamName}** created successfully!`,
            team: newTeam
        };
    } catch (error) {
        console.error('Team creation error:', error);
        return { 
            success: false, 
            message: '❌ An error occurred while processing your request.' 
        };
    }
}

function getUserOwnedTeams(userId) {
    try {
        const data = fs.readFileSync(TEAMS_FILE, 'utf8');
        const teams = JSON.parse(data);
        return teams.filter(team => team.owner === userId);
    } catch (error) {
        console.error('Error reading teams file:', error);
        return [];
    }
}

function deleteTeam(teamId, userId) {
    try {
        const data = fs.readFileSync(TEAMS_FILE, 'utf8');
        const teams = JSON.parse(data);
        const teamToDelete = teams.find(team => team.id === teamId);
        
        if (!teamToDelete) {
            return {
                success: false,
                message: '❌ Team not found!'
            };
        }
        
        if (teamToDelete.owner !== userId) {
            return {
                success: false,
                message: '❌ You do not have permission to delete this team!'
            };
        }
        
        const updatedTeams = teams.filter(team => team.id !== teamId);
        fs.writeFileSync(TEAMS_FILE, JSON.stringify(updatedTeams, null, 2));
        
        return {
            success: true,
            message: `✅ Team "${teamToDelete.name}" has been deleted successfully!`
        };
    } catch (error) {
        console.error('Error deleting team:', error);
        return {
            success: false,
            message: '❌ An error occurred while deleting the team.'
        };
    }
}

function getTeamById(teamId) {
    try {
        const data = fs.readFileSync(TEAMS_FILE, 'utf8');
        const teams = JSON.parse(data);
        return teams.find(team => team.id === teamId) || null;
    } catch (error) {
        console.error('Error reading teams file:', error);
        return null;
    }
}

function updateTeamSlot(teamId, slot, card) {
    try {
        if (slot < 1 || slot > 4) {
            return {
                success: false,
                message: '❌ Invalid slot number. Please choose a slot between 1 and 4.'
            };
        }

        const data = fs.readFileSync(TEAMS_FILE, 'utf8');
        const teams = JSON.parse(data);
        const teamIndex = teams.findIndex(team => team.id === teamId);
        
        if (teamIndex === -1) {
            return {
                success: false,
                message: '❌ Team not found!'
            };
        }

        const team = teams[teamIndex];
        for (let i = 1; i <= 4; i++) {
            if (team[`slot${i}`] && team[`slot${i}`].id === card.id) {
                team[`slot${i}`] = null;
                break;
            }
        }

        team[`slot${slot}`] = card;
        team.updatedAt = new Date().toISOString();
        
        fs.writeFileSync(TEAMS_FILE, JSON.stringify(teams, null, 2));
        
        return {
            success: true,
            message: `✅ Card added to slot ${slot} successfully!`,
            team: team
        };
    } catch (error) {
        console.error('Error updating team slot:', error);
        return {
            success: false,
            message: '❌ An error occurred while updating the team.'
        };
    }
}

function removeTeamSlot(teamId, slot) {
    try {
        if (slot < 1 || slot > 4) {
            return {
                success: false,
                message: '❌ Invalid slot number. Please choose a slot between 1 and 4.'
            };
        }

        const data = fs.readFileSync(TEAMS_FILE, 'utf8');
        const teams = JSON.parse(data);
        const teamIndex = teams.findIndex(team => team.id === teamId);
        
        if (teamIndex === -1) {
            return {
                success: false,
                message: '❌ Team not found.'
            };
        }

        const team = teams[teamIndex];
        const slotKey = `slot${slot}`;
        
        if (!team[slotKey]) {
            return {
                success: false,
                message: `❌ No card found in slot ${slot}.`
            };
        }

        team[slotKey] = null;
        team.updatedAt = new Date().toISOString();
        
        fs.writeFileSync(TEAMS_FILE, JSON.stringify(teams, null, 2));
        
        return {
            success: true,
            message: `✅ Card removed from slot ${slot}.`
        };
    } catch (error) {
        console.error('Error removing card from team slot:', error);
        return {
            success: false,
            message: '❌ An error occurred while removing the card from the team.'
        };
    }
}

function isCardInAnyTeam(cardId) {
    try {
        const data = fs.readFileSync(TEAMS_FILE, 'utf8');
        const teams = JSON.parse(data);
        
        return teams.some(team => 
            team.slot1?.id === cardId ||
            team.slot2?.id === cardId ||
            team.slot3?.id === cardId ||
            team.slot4?.id === cardId ||
            team.slot5?.id === cardId
        );
    } catch (error) {
        console.error('Error checking if card is in any team:', error);
        return false;
    }
}

module.exports = {
    createTeam,
    deleteTeam,
    getTeamById,
    updateTeamSlot,
    removeTeamSlot,
    getUserOwnedTeams,
    isCardInAnyTeam
};
