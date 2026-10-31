FROM node:24-alpine
WORKDIR /app
RUN apk add --no-cache ffmpeg
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
USER node
EXPOSE 3000
CMD ["node","server/api.mjs"]

