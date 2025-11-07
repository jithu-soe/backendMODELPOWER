FROM node:20-alpine

# Set working dir
WORKDIR /app

# Copy package files first to leverage layer cache
COPY package*.json ./

# Install deps
RUN npm ci --production

# Copy app source
COPY . .

# Ensure formMappings.json is writable by container
RUN touch ./formMappings.json || true && chmod 664 ./formMappings.json || true

# Expose port used by server.js
EXPOSE 4000

# Start the app
CMD ["npm", "start"]