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

# JUNTAR OS ARQUIVOS CSS/JS ANTES DE RODAR 
RUN python manage.py collectstatic --noinput

# Expõe a porta que o Django vai rodar
EXPOSE 8080

# Comando padrão (em produção o Coolify vai usar o gunicorn)
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "backend.wsgi:application"]