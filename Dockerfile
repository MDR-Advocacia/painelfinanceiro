FROM node:20-alpine

WORKDIR /app

# Instala o curl para healthchecks se necessário
RUN apk add --no-cache curl

COPY package*.json ./
# Se você usa Bun no projeto, troque para: RUN npm install -g bun && bun install
RUN npm install

COPY . .

EXPOSE 8080

# O --host é fundamental para o Docker conseguir acessar o Vite
CMD ["npm", "run", "dev", "--", "--host"]