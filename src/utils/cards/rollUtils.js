const { RARITIES } = require('./cardTemplate');
const path = require('path');
const { calculateOVR } = require('./cardUtils');

const ROLL_WEIGHTS = {
    hourly: {
        'C': 50,
        'B': 30,
        'A': 14,
        'S': 4.99,
        'SS': 1,
        'SSR': 0.1
    },
    daily: {
        'C': 30,
        'B': 35,
        'A': 25,
        'S': 8,
        'SS': 1.9,
        'SSR': 0.1
    },
    weekly: {
        'C': 15,
        'B': 30,
        'A': 35,
        'S': 15,
        'SS': 4,
        'SSR': 1
    }
};

const CHARACTERS = {
    'SSR': [
        {
            name: 'Choji Tomiyama',
            stats: { hp: 250, strength: 95, defense: 90, speed: 95 },
            image: path.join(__dirname, '../../../public/cards/Mchoji.png'),
            playstyle: 'SPIRIT' 
        },
        {
            name: 'Yamato Endo',
            stats: { hp: 220, strength: 98, defense: 90, speed: 94 },
            image: path.join(__dirname, '../../../public/cards/Mendo.png'),
            playstyle: 'FEAR' 
        },
        {
            name: 'Chika Takishi',
            stats: { hp: 240, strength: 99, defense: 90, speed: 96 },
            image: path.join(__dirname, '../../../public/cards/Mtakishi.png'),
            playstyle: 'LONER' 
        },
        {
            name: 'Togame Jo',
            stats: { hp: 220, strength: 96, defense: 94, speed: 93 },
            image: path.join(__dirname, '../../../public/cards/MTogame.png'),
            playstyle: 'LEADER' 
        },
        {
            name: 'Hajime Umeiya',
            stats: { hp: 240, strength: 99, defense: 93, speed: 95 },
            image: path.join(__dirname, '../../../public/cards/Mume.png'),
            playstyle: 'LEADER' 
        }
    ],
    'SS': [
        {
            name: 'Kaji Ren',
            stats: { hp: 200, strength: 95, defense: 93, speed: 94 },
            image: path.join(__dirname, '../../../public/cards/Mkaji.png'),
        },
        {
            name: 'Kaji Nakamura',
            stats: { hp: 220, strength: 95, defense: 92, speed: 92 },
            image: path.join(__dirname, '../../../public/cards/Mkanji.png'),
            playstyle: 'LEADER' 
        },
        {
            name: 'Mitsuki Kiryu',
            stats: { hp: 200, strength: 93, defense: 93, speed: 96 },
            image: path.join(__dirname, '../../../public/cards/Mkiryu.png'),
        },
        {
            name: 'Akihiko Nirei',
            stats: { hp: 220, strength: 89, defense: 95, speed: 91 },
            image: path.join(__dirname, '../../../public/cards/Mnirei.png'),
            playstyle: 'VIP' 
        },
        {
            name: 'Sakura Haruka',
            stats: { hp: 220, strength: 94, defense: 89, speed: 96 },
            image: path.join(__dirname, '../../../public/cards/Msakura.png'),
            playstyle: 'LONER' 
        },
        {
            name: 'Kyotaro Sugishita',
            stats: { hp: 200, strength: 96, defense: 94, speed: 92 },
            image: path.join(__dirname, '../../../public/cards/Msugi.png'),
        },
        {
            name: 'Suo Hayato',
            stats: { hp: 220, strength: 90, defense: 93, speed: 95 },
            image: path.join(__dirname, '../../../public/cards/Msuo.png'),
            playstyle: 'TACTIC' 
        },
        {
            name: 'Shuhei Suzui',
            stats: { hp: 220, strength: 96, defense: 92, speed: 91 },
            image: path.join(__dirname, '../../../public/cards/Msuzuri.png'),
            playstyle: 'LEADER' 
        },
        {
            name: 'Taiga Tsugeura',
            stats:  { hp: 200, strength: 96, defense: 94, speed: 91 },
            image: path.join(__dirname, '../../../public/cards/Mtsuge.png'),
        }
    ],
    'S': [
        {
            name: 'Choji Tomiyama',
            stats: { hp: 195, strength: 86, defense: 85, speed: 90 },
            image: path.join(__dirname, '../../../public/cards/choji.png')
        },
        {
            name: 'Yamato Endo',
            stats: { hp: 195, strength: 90, defense: 85, speed: 88 },
            image: path.join(__dirname, '../../../public/cards/endo.png')
        },
        {
            name: 'Chika Takishi',
            stats: { hp: 205, strength: 89, defense: 86, speed: 92 },
            image: path.join(__dirname, '../../../public/cards/shika.png')
        },
        {
            name: 'Hajime Umeiya',
            stats: { hp: 200, strength: 92, defense: 89, speed: 87 },
            image: path.join(__dirname, '../../../public/cards/Ume.png')
        }
    ],
    'A': [
        {
            name: 'Hiiragi Toma',
            stats: { hp: 180, strength: 87, defense: 85, speed: 84 },
            image: path.join(__dirname, '../../../public/cards/hiiragi.png')
        },
        {
            name: 'Kaji Ren',
            stats: { hp: 180, strength: 85, defense: 82, speed: 83 },
            image: path.join(__dirname, '../../../public/cards/kaji.png')
        },
        {
            name: 'Kanon Banji',
            stats: { hp: 190, strength: 87, defense: 85, speed: 89 },
            image: path.join(__dirname, '../../../public/cards/kanon.png')
        },
        {
            name: 'Saku Mizuki',
            stats: { hp: 180, strength: 85, defense: 85, speed: 86 },
            image: path.join(__dirname, '../../../public/cards/Mizuki.png')
        },
        {
            name: 'Takumi Momose',
            stats: { hp: 180, strength: 85, defense: 84, speed: 87 },
            image: path.join(__dirname, '../../../public/cards/momose.png')
        },
        {
            name: 'Ritsu Otowa',
            stats: { hp: 170, strength: 80, defense: 85, speed: 84 },
            image: path.join(__dirname, '../../../public/cards/Ritsu.png')
        },
        {
            name: 'Chihiro Shakushi',
            stats: { hp: 200, strength: 89, defense: 83, speed: 85 },
            image: path.join(__dirname, '../../../public/cards/shakushi.png')
        },
        {
            name: 'Tsubakino',
            stats: { hp: 180, strength: 87, defense: 83, speed: 86 },
            image: path.join(__dirname, '../../../public/cards/Tsubakino.png')
        },
        {
            name: 'Kanji Nakamura',
            stats: { hp: 180, strength: 84, defense: 85, speed: 82 },
            image: path.join(__dirname, '../../../public/cards/nakamura.png')
        }
    ],
    'B': [
        {
            name: 'Akihito Miyoshi',
            stats: { hp: 170, strength: 81, defense: 84, speed: 85 },
            image: path.join(__dirname, '../../../public/cards/akihito.png')
        },
        {
            name: 'Yoshitaka Kato',
            stats: { hp: 160, strength: 80, defense: 79, speed: 83 },
            image: path.join(__dirname, '../../../public/cards/arima.png')
        },
        {
            name: 'Kota Sako',
            stats: { hp: 170, strength: 85, defense: 82, speed: 81 },
            image: path.join(__dirname, '../../../public/cards/kota.png')
        },
        {
            name: 'Sakura Haruka',
            stats: { hp: 150, strength: 81, defense: 79, speed: 83 },
            image: path.join(__dirname, '../../../public/cards/Sakura.png')
        },
        {
            name: 'Shingo Natori',
            stats: { hp: 160, strength: 86, defense: 80, speed: 82 },
            image: path.join(__dirname, '../../../public/cards/shingo.png')
        },
        {
            name: 'Shogo Hidaka',
            stats: { hp: 180, strength: 85, defense: 82, speed: 80 },
            image: path.join(__dirname, '../../../public/cards/shogo.png')
        },
        {
            name: 'Shyu Kirishima',
            stats: { hp: 160, strength: 81, defense: 80, speed: 78 },
            image: path.join(__dirname, '../../../public/cards/shyu.png')
        },
        {
            name: 'Sugishita',
            stats: { hp: 170, strength: 83, defense: 80, speed: 79 },
            image: path.join(__dirname, '../../../public/cards/sugi.png')
        },
        {
            name: 'Hayato Suo',
            stats: { hp: 170, strength: 79, defense: 85, speed: 82 },
            image: path.join(__dirname, '../../../public/cards/suo.png')
        },
        {
            name: 'Shuhei Suzuri',
            stats: { hp: 170, strength: 83, defense: 84, speed: 85 },
            image: path.join(__dirname, '../../../public/cards/suzuri.png')
        },
        {
            name: 'Taishi Mogami',
            stats: { hp: 160, strength: 72, defense: 80, speed: 82 },
            image: path.join(__dirname, '../../../public/cards/taishi.png')
        },
        {
            name: 'Togame Jo',
            stats: { hp: 175, strength: 85, defense: 85, speed: 79 },
            image: path.join(__dirname, '../../../public/cards/togame.png')
        },
        {
            name: 'Taiga Tsugeura',
            stats: { hp: 165, strength: 85, defense: 80, speed: 78 },
            image: path.join(__dirname, '../../../public/cards/Tseugeira.png')
        },
        {
            name: 'Yugo Wanijima',
            stats: { hp: 180, strength: 85, defense: 80, speed: 82 },
            image: path.join(__dirname, '../../../public/cards/yugo.png')
        }
    ],
    'C': [
        {
            name: 'Masaki Anzai',
            stats: { hp: 140, strength: 79, defense: 78, speed: 80 },
            image: path.join(__dirname, '../../../public/cards/anzai.png')
        },
        {
            name: 'Hansuke Tune',
            stats: { hp: 150, strength: 80, defense: 77, speed: 78 },
            image: path.join(__dirname, '../../../public/cards/hansuke.png')
        },
        {
            name: 'Minoru Kanuma',
            stats: { hp: 160, strength: 80, defense: 77, speed: 79 },
            image: path.join(__dirname, '../../../public/cards/kanuma.png')
        },
        {
            name: 'Kotoha',
            stats: { hp: 160, strength: 76, defense: 81, speed: 77 },
            image: path.join(__dirname, '../../../public/cards/kotoha.png')
        },
        {
            name: 'Akihiko Nirei',
            stats: { hp: 140, strength: 79, defense: 78, speed: 85 },
            image: path.join(__dirname, '../../../public/cards/nirei.png')
        },
        {
            name: 'Renji Kaga',
            stats: { hp: 160, strength: 76, defense: 81, speed: 77 },
            image: path.join(__dirname, '../../../public/cards/renji.png')
        },
        {
            name: 'Shizuki',
            stats: { hp: 160, strength: 76, defense: 80, speed: 79 },
            image: path.join(__dirname, '../../../public/cards/shizuki.png')
        },
        {
            name: 'Takeru Kongo',
            stats: { hp: 150, strength: 78, defense: 81, speed: 80 },
            image: path.join(__dirname, '../../../public/cards/takeru.png')
        },
        {
            name: 'Teruomi Inugami',
            stats: { hp: 160, strength: 81, defense: 78, speed: 79 },
            image: path.join(__dirname, '../../../public/cards/teruomi.png')
        }
    ]
};

function getRandomRarity(rollType = 'hourly') {
    const weights = ROLL_WEIGHTS[rollType] || ROLL_WEIGHTS.hourly;
    const totalWeight = Object.entries(weights).reduce((sum, [rarity, weight]) => {
        return sum + weight;
    }, 0);
    
    let random = Math.random() * totalWeight;
    
    for (const [rarity, weight] of Object.entries(weights)) {
        if (random < weight) {
            if (CHARACTERS[rarity]?.length > 0) {
                return rarity;
            }
        }
        random -= weight;
    }
    
    return 'B';
}

function getRandomCharacter(rollType = 'hourly') {
    const rarity = getRandomRarity(rollType);
    const charactersOfRarity = CHARACTERS[rarity] || CHARACTERS['B'];
    const randomIndex = Math.floor(Math.random() * charactersOfRarity.length);
    
    return {
        ...JSON.parse(JSON.stringify(charactersOfRarity[randomIndex])),
        rarity: rarity
    };
}

function getRandomCardOptions(rollType = 'hourly', count = 3) {
    const options = [];
    const usedIndices = new Set();
    
    while (options.length < count) {
        const character = getRandomCharacter(rollType);
        
        const card = {
            id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            name: character.name,
            imagePath: character.image,
            stats: character.stats,
            rarity: character.rarity,
            playstyle: character.playstyle,
            overall: Math.min(99, Math.round((character.stats.strength + character.stats.defense + character.stats.speed + (character.stats.hp / 2)) / 4))
        };
        card.rarityData = RARITIES[card.rarity] || RARITIES['B'];
        
        const cardKey = `${character.name}-${character.rarity}-${JSON.stringify(character.stats)}`;
        if (!usedIndices.has(cardKey)) {
            usedIndices.add(cardKey);
            options.push(card);
        }
    }
    
    return options;
}

function generateCard(character) {
    const card = {
        id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        name: character.name,
        imagePath: character.image,
        stats: character.stats,
        rarity: character.rarity,
        playstyle: character.playstyle || null,
        overall: calculateOVR(character)
    };
    
    card.rarityData = RARITIES[card.rarity] || RARITIES['B'];
    
    if ((card.rarity === 'SS' || card.rarity === 'SSR') && !card.playstyle) {
        const playstyles = Object.keys(require('./cardTemplate').PLAYSTYLES);
        card.playstyle = playstyles[Math.floor(Math.random() * playstyles.length)];
    }
    
    return card;
}

function getAllCards() {
    const allCards = [];
    for (const rarity in CHARACTERS) {
        CHARACTERS[rarity].forEach(char => {
            allCards.push({
                ...char,
                rarity,
                id: char.id || `${rarity}_${char.name.toLowerCase().replace(/\s+/g, '_')}`
            });
        });
    }
    return allCards;
}

function getCardById(id) {
    const allCards = getAllCards();
    const card = allCards.find(card => card.id === id);
    if (!card) return null;
    
    return {
        ...card,
        imagePath: card.image || card.imagePath,
        stats: card.stats || { hp: 0, strength: 0, defense: 0, speed: 0 },
        rarity: card.rarity || 'C',
        playstyle: card.playstyle || null
    };
}

module.exports = {
    getRandomCharacter,
    generateCard,
    getRandomCardOptions,
    getRandomRarity,
    getAllCards,
    getCardById,
    RARITIES
};
