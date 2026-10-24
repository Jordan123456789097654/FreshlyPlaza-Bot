FROM node:22-bookworm-slim

# Install system dependencies for audio streaming and node-gyp builds
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    make \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package descriptors first to leverage Docker layer caching
COPY package*.json ./

RUN npm ci --omit=dev

# Copy project source code
COPY . .

EXPOSE 26134

ENV NODE_ENV=production

CMD ["node", "index.js"]
