# TGC Game - Discord Bot

The TGC Game is a Discord bot that allows users to play a trading card game (TCG) within Discord.

## ⚙️ Prerequisites

- [Bun](https://bun.sh/) (for package management and running scripts)
- A Discord Bot Token from the [Discord Developer Portal](https://discord.com/developers/applications)

## 🛠️ Setup Instructions

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/tgc-game-bot.git
   cd tgc-game-bot
   ```

2. **Install dependencies**
   ```bash
   bun install
   ```

3. **Configure the bot**
   - Rename `src/config/config.example.conf` to `config.json`
   - Update the configuration with your bot token and other settings.

4. **Start the bot**
   ```bash
   # Development mode with auto-restart (don't use in production)
   bun run dev
   
   # Production
   bun start
   ```

## 🙏 Acknowledgments

- Built with [Discord.js](https://discord.js.org/)
- Uses [Canvas](https://www.npmjs.com/package/canvas) for image generation
