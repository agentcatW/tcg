function calculateOVR(card) {
    if (!card || !card.stats) return 0;
    const { strength = 0, defense = 0, speed = 0, hp = 0 } = card.stats;
    return Math.min(99, Math.round((strength + defense + speed + (hp / 2)) / 4));
}

module.exports = {
    calculateOVR
};
