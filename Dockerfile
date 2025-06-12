# Use official Playwright docker image with all dependencies pre-installed
FROM mcr.microsoft.com/playwright:v1.44.0-jammy

WORKDIR /app

# Copy package files and install
COPY package.json package-lock.json ./
RUN npm install

# Copy remaining app files
COPY . .

# Start app
CMD ["npm", "start"]
