# One image for every backend process: the API, the order worker and the simulator.
# docker-compose picks which one to run with `command:`.
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

# Install dependencies first so Docker can cache this layer between code changes
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts

USER node
EXPOSE 4000
CMD ["node", "src/index.js"]
