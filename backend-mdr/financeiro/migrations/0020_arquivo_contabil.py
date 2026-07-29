"""Arquivo contabil: estoque permanente de relatorios tecnico-contabeis por exercicio."""
import uuid

from django.db import migrations, models

import financeiro.models_estrutura


class Migration(migrations.Migration):

    dependencies = [("financeiro", "0019_foto_competencia")]

    operations = [
        migrations.CreateModel(
            name="RelatorioExercicio",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("exercicio", models.IntegerField(help_text="Ano do exercício (ex.: 2026)")),
                ("versao", models.IntegerField(default=1)),
                ("arquivo", models.FileField(upload_to=financeiro.models_estrutura._caminho_relatorio_exercicio)),
                ("nome_arquivo", models.CharField(max_length=255)),
                ("tamanho", models.IntegerField(default=0)),
                ("sha256", models.CharField(blank=True, default="", max_length=64)),
                ("gerado_por", models.CharField(blank=True, default="", max_length=150)),
                ("gerado_em", models.DateTimeField(auto_now_add=True)),
                ("definitivo", models.BooleanField(default=False)),
                ("competencias_no_ano", models.IntegerField(default=0)),
                ("competencias_fechadas", models.IntegerField(default=0)),
                ("resumo", models.JSONField(blank=True, null=True)),
            ],
            options={
                "db_table": "ef_relatorios_exercicio",
                "ordering": ["-exercicio", "-versao"],
            },
        ),
        migrations.AddConstraint(
            model_name="relatorioexercicio",
            constraint=models.UniqueConstraint(fields=("exercicio", "versao"), name="uq_relatorio_exercicio_versao"),
        ),
    ]
