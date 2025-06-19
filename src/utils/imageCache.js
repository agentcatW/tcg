const fs = require('fs').promises;
const path = require('path');

const imageCache = new Map();

async function getImageBuffer(imagePath) {
    if (!imagePath) return null;
    
    const normalizedPath = path.normalize(imagePath);
    
    if (imageCache.has(normalizedPath)) {
        return imageCache.get(normalizedPath);
    }
    
    try {
        const buffer = await fs.readFile(normalizedPath);
        imageCache.set(normalizedPath, buffer);
        return buffer;
    } catch (error) {
        console.error(`Error loading image ${normalizedPath}:`, error);
        return null;
    }
}

function clearCache() {
    imageCache.clear();
}

module.exports = {
    getImageBuffer,
    clearCache
};
