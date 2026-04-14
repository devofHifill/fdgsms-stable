# Use lightweight Node image
FROM node:22-alpine

WORKDIR /app

# Install only production deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

# Expose port
EXPOSE 4000

# Start server
CMD ["npm", "start"]