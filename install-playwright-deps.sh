#!/bin/bash

# Install Playwright browser dependencies on Ubuntu
# Run this on both WSL and your DigitalOcean droplet

echo "🔧 Installing Playwright browser dependencies..."

# Update package list
sudo apt-get update

# Install core dependencies needed for Playwright browsers
sudo apt-get install -y --no-install-recommends \
    libasound2t64 \
    libatk-bridge2.0-0t64 \
    libatk1.0-0t64 \
    libatspi2.0-0t64 \
    libcairo2 \
    libcups2t64 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0t64 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libcairo-gobject2 \
    libfontconfig1 \
    libfreetype6 \
    libgdk-pixbuf-2.0-0 \
    libgtk-3-0t64 \
    libpangocairo-1.0-0 \
    libx11-xcb1 \
    libxcb-shm0 \
    libxcursor1 \
    libxi6 \
    libxrender1 \
    xvfb \
    fonts-noto-color-emoji \
    fonts-unifont \
    xfonts-cyrillic \
    xfonts-scalable \
    fonts-liberation

echo "✅ Playwright dependencies installed!"
echo "🚀 You can now run: node test-skool-login.js"