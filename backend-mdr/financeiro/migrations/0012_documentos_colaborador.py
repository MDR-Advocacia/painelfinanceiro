"""Documentos do colaborador (contrato em PDF anexado na ficha).

O arquivo vai pro MEDIA_ROOT, que aponta pra dentro da pasta de dados — o
mesmo volume persistente do SQLite. Download só por endpoint autenticado.
"""
import uuid

import django.db.models.deletion
from django.db import migrations, models

import financeiro.models


class Migration(migrations.Migration):

    dependencies = [("financeiro", "0011_liderancas_auditoria_colaborador")]

    operations = [
        migrations.CreateModel(
            name="DpDocumento",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False,
                                        primary_key=True, serialize=False)),
                ("tipo", models.CharField(choices=[("contrato", "Contrato de trabalho"),
                                                   ("tce", "Termo de Compromisso de Estágio"),
                                                   ("aditivo", "Aditivo contratual"),
                                                   ("rescisao", "Termo de rescisão"),
                                                   ("outro", "Outro documento")],
                                          default="contrato", max_length=20)),
                ("arquivo", models.FileField(upload_to=financeiro.models._caminho_documento)),
                ("nome_original", models.CharField(max_length=255)),
                ("tamanho", models.IntegerField(default=0)),
                ("descricao", models.CharField(blank=True, default="", max_length=200)),
                ("enviado_por", models.CharField(blank=True, default="", max_length=150)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("colaborador", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                                  related_name="documentos",
                                                  to="financeiro.dpcolaborador")),
            ],
            options={"db_table": "dp_documentos", "ordering": ["-created_at"]},
        ),
    ]
