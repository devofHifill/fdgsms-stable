# ---- BUILD STAGE ----
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

# 👇 pass build arg
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

COPY . .

RUN npm run build

# ---- PRODUCTION ----
FROM node:22-alpine

WORKDIR /app
RUN npm install -g serve

COPY --from=build /app/dist ./dist

EXPOSE 3000

CMD ["serve", "-s", "dist", "-l", "3000"]