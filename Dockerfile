FROM node:20-slim

WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev --legacy-peer-deps

# Copy application source code
COPY . .

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
