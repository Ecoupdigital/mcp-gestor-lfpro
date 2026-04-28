FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --include=dev
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache curl
COPY --from=build /app/package.json /app/package-lock.json* ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/config ./config
RUN npm ci --omit=dev
EXPOSE 3030
CMD ["node", "dist/index.js", "--http", ":3030"]
