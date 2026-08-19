# Use official Node.js image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy application source code
COPY . .

# Build frontend assets
RUN npm run build

# Expose port 3000
EXPOSE 3000

# Start server using tsx
CMD ["npx", "tsx", "server.ts"]
