module.exports = {
    packs: {
        beginner: {
            name: 'Beginner Pack',
            emoji: '<:beginner:1381693086501048523>',
            price: 250,
            description: 'Contains 1 random card (OVR 60-88)',
            ovrChances: [
                { min: 60, max: 65, chance: 30.00 },
                { min: 66, max: 70, chance: 35.00 },
                { min: 71, max: 75, chance: 30.00 },
                { min: 76, max: 80, chance: 3.90 },
                { min: 81, max: 84, chance: 1.00 },
                { min: 85, max: 88, chance: 0.10 }
            ]
        },
        novice: {
            name: 'Novice Pack',
            emoji: '<:novice:1381693126174969897>',
            price: 1000,
            description: 'Contains 1 random card (OVR 71-97)',
            ovrChances: [
                { min: 71, max: 75, chance: 25.00 },
                { min: 76, max: 80, chance: 38.00 },
                { min: 81, max: 84, chance: 32.00 },
                { min: 85, max: 88, chance: 3.90 },
                { min: 89, max: 92, chance: 1.00 },
                { min: 93, max: 97, chance: 0.10 }
            ]
        },
        expert: {
            name: 'Expert Pack',
            emoji: '<:expert:1381693156424159354>',
            price: 4500,
            description: 'Contains 1 random card (OVR 76-99)',
            ovrChances: [
                { min: 76, max: 80, chance: 15.00 },
                { min: 81, max: 84, chance: 35.00 },
                { min: 85, max: 88, chance: 43.00 },
                { min: 89, max: 92, chance: 6.00 },
                { min: 93, max: 97, chance: 0.90 },
                { min: 98, max: 99, chance: 0.10 }
            ]
        },
        master: {
            name: 'Master Pack',
            emoji: '<:master:1381693183880335400>',
            price: 8500,
            description: 'Contains 1 random card (OVR 81-99)',
            ovrChances: [
                { min: 81, max: 84, chance: 15.00 },
                { min: 85, max: 88, chance: 35.00 },
                { min: 89, max: 92, chance: 43.00 },
                { min: 93, max: 97, chance: 6.00 },
                { min: 98, max: 99, chance: 1.00 }
            ]
        },
        legend: {
            name: 'Legend Pack',
            emoji: '<:legend:1381693210870415400>',
            price: 19900,
            description: 'Contains 1 random card (OVR 89-99)',
            ovrChances: [
                { min: 89, max: 92, chance: 64.00 },
                { min: 93, max: 97, chance: 35.00 },
                { min: 98, max: 99, chance: 1.00 }
            ]
        }
    }
};
