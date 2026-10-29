FROM node:24-alpine
WORKDIR /app
COPY server ./server
USER node
EXPOSE 3000
CMD ["node","server/api.mjs"]

