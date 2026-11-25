# Stage 1: build the React dashboard into static files
FROM node:24-alpine AS dashboard
WORKDIR /client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client ./
RUN npm run build

# Stage 2: Nginx serves those files AND load-balances the API
FROM nginx:1.27-alpine
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY --from=dashboard /client/dist /usr/share/nginx/html
EXPOSE 80
