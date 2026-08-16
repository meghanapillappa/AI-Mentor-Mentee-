# front2/Dockerfile
# Build context should be the `front2/` directory.

# ---- Stage 1: build the Vite app ----
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# API_BASE resolution order in src/config.js is query param -> localStorage -> .env -> default.
# Bake a build-time .env so the built bundle points at the backend service by default.
# Override at build time with: --build-arg VITE_API_BASE=http://localhost:5000
ARG VITE_API_BASE=http://localhost:5000
RUN echo "VITE_API_BASE=${VITE_API_BASE}" > .env.production

RUN npm run build

# ---- Stage 2: serve the static build with nginx ----
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
