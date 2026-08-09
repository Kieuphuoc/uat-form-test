FROM node:lts-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
ENV PORT=3008

EXPOSE 3008

CMD ["sh", "-c", "npm run build && node serve.cjs"]
