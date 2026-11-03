FROM node:24-alpine
WORKDIR /app
RUN apk add --no-cache ffmpeg su-exec
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY app.config.mjs ./
COPY server ./server
COPY server/docker-entrypoint.sh /usr/local/bin/eatandfit-api-entrypoint
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/eatandfit-api-entrypoint"]
CMD ["node","server/api.mjs"]

