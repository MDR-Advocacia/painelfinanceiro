# Estágio 1: Construção (Build) com Node.js
FROM node:20-alpine as build

WORKDIR /app

# Copia os arquivos de configuração de dependências
COPY package*.json ./

# Instala as dependências
RUN npm install

# Copia todo o código do frontend
COPY . .

# Executa o build de produção do Vite (Gera a pasta /dist)
RUN npm run build

# Estágio 2: Servidor Web Ultraleve com Nginx
FROM nginx:alpine

# Copia a configuração do Nginx que criamos no Passo 2
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Pega apenas os arquivos finais do "Estágio 1" e joga no Nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Expõe a porta padrão da web
EXPOSE 80

# Inicia o servidor Nginx
CMD ["nginx", "-g", "daemon off;"]