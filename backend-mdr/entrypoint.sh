#!/bin/sh
# Boot do backend: aplica as migrations ANTES de subir o gunicorn.
# Sem isso, um deploy com código novo + banco velho derruba o painel
# (foi o que aconteceu em 28/07/2026: tabela perfis_usuario inexistente).
set -e

echo "[boot] aplicando migrations..."
python manage.py migrate --noinput

echo "[boot] subindo o gunicorn..."
exec gunicorn --bind 0.0.0.0:8080 --timeout 120 backend.wsgi:application
