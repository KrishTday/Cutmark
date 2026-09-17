# Multi-stage build for Next.js frontend (static export)
# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build static export
RUN npm run export

# Stage 2: Serve (lightweight runtime)
FROM node:20-alpine

WORKDIR /app

# Install static file server
RUN npm install -g serve

# Copy built static files from builder
COPY --from=builder /app/out ./out

EXPOSE 3000

# Serve the static export
CMD ["serve", "-s", "out", "-l", "3000"]
