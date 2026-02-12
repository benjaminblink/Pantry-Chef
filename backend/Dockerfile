FROM node:20-slim

# Install OpenSSL, build dependencies, and PostgreSQL client
RUN apt-get update -y && \
    apt-get install -y openssl python3 make g++ postgresql-client && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies and rebuild native modules
RUN npm install && npm rebuild bcrypt --build-from-source

# Copy source code
COPY . .

# Generate Prisma client and build TypeScript at Docker build time
# Use a placeholder DATABASE_URL for build - real one provided at runtime
ARG DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
RUN DATABASE_URL=$DATABASE_URL npx prisma generate
RUN npm run build

# Expose port
EXPOSE 3000

# Start server: push schema and start
# DATABASE_URL will be provided by docker-compose at runtime
# For Prisma 7, we use --url flag to pass database URL to CLI commands
CMD echo "=== Database Setup ===" && \
    npx prisma db push --url="$DATABASE_URL" --accept-data-loss && \
    echo "=== Seeding Database ===" && \
    npx tsx prisma/seed.ts && \
    echo "=== Starting Server ===" && \
    node dist/index.js
