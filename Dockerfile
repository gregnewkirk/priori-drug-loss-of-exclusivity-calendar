# Build stage: compile TypeScript to dist/
FROM apify/actor-node:22 AS builder
COPY package*.json ./
RUN npm install --include=dev --audit=false --no-fund
COPY . ./
RUN npm run build

# Runtime stage: production deps only + compiled output
FROM apify/actor-node:22
COPY package*.json ./
RUN npm --quiet set progress=false \
 && npm install --omit=dev --omit=optional --audit=false --no-fund \
 && echo "Installed NPM packages:" \
 && (npm list --omit=dev --all || true)
COPY --from=builder /usr/src/app/dist ./dist
COPY . ./
CMD ["npm", "run", "start"]
