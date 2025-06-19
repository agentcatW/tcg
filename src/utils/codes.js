const CODES = {
    'TEST': {
        coins: 20000,
        packs: {},
        reusable: false,
        description: 'Test code for 20,000 coins'
    },
    'WELCOME': {
        coins: 5000,
        packs: { beginner: 1 },
        reusable: false,
        description: 'Welcome bonus: 5,000 coins + 1 Beginner Pack'
    }
};

function getCodeData(code) {
    const upperCode = code.toUpperCase();
    return CODES[upperCode] || null;
}

function hasUsedCode(user, code) {
    const upperCode = code.toUpperCase();
    return user.redeemedCodes && user.redeemedCodes.includes(upperCode);
}
function markCodeAsUsed(user, code) {
    const upperCode = code.toUpperCase();
    if (!user.redeemedCodes) {
        user.redeemedCodes = [];
    }
    
    if (!user.redeemedCodes.includes(upperCode)) {
        user.redeemedCodes.push(upperCode);
        return true;
    }
    return false;
}

function applyCodeRewards(user, codeData) {
    if (codeData.coins) {
        user.currency = (user.currency || 0) + codeData.coins;
    }
    
    if (codeData.packs) {
        for (const [packType, quantity] of Object.entries(codeData.packs)) {
            if (user.packs[packType] !== undefined) {
                user.packs[packType] = (user.packs[packType] || 0) + quantity;
            }
        }
    }
    
    return user;
}

module.exports = {
    CODES,
    getCodeData,
    hasUsedCode,
    markCodeAsUsed,
    applyCodeRewards
};
