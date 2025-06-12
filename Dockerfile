# Start from Playwright base image (keeps Playwright installed)
FROM mcr.microsoft.com/playwright:v1.44.0-jammy

# Install required system dependencies for video playback
RUN apt-get update && apt-get install -y \
  wget \
  gnupg \
  fonts-liberation \
  libasound2 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libnss3 \
  libxcomposite1 \
  libxrandr2 \
  libgbm1 \
  libgtk-3-0 \
  libxdamage1 \
  ffmpeg

# Install full Google Chrome with H.264/AAC codec support
RUN wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb && \
    dpkg -i google-chrome-stable_current_amd64.deb || true && \
    apt-get -f install -y

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy application files
COPY . .

# Start application
CMD ["npm", "start"]
