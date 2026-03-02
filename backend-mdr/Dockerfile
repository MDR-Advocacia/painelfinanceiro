FROM python:3.11-slim

# Impede o Python de gerar arquivos .pyc e força o log a aparecer na hora
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Pasta de trabalho dentro do container
WORKDIR /app

# Instala as dependências
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia o resto do código
COPY . .

# Expõe a porta que o Django vai rodar
EXPOSE 8000

# Comando padrão (em produção o Coolify vai usar o gunicorn)
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "backend.wsgi:application"]