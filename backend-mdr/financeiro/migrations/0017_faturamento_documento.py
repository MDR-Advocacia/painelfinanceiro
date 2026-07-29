"""Anexo de documento no faturamento da linha."""
import uuid

from django.db import migrations, models
import django.db.models.deletion

import financeiro.models_estrutura


class Migration(migrations.Migration):

    dependencies = [("financeiro", "0016_sede_na_estrutura")]

    operations = [
        migrations.CreateModel(
            name="FaturamentoDocumento",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("periodo", models.CharField(help_text="AAAA-MM", max_length=7)),
                ("tipo", models.CharField(choices=[("nota", "Nota fiscal"), ("medicao", "Relatório de medição"), ("contrato", "Contrato / aditivo"), ("comprovante", "Comprovante de pagamento"), ("outro", "Outro documento")], default="nota", max_length=20)),
                ("arquivo", models.FileField(upload_to=financeiro.models_estrutura._caminho_doc_faturamento)),
                ("nome_original", models.CharField(max_length=255)),
                ("tamanho", models.IntegerField(default=0)),
                ("descricao", models.CharField(blank=True, default="", max_length=200)),
                ("enviado_por", models.CharField(blank=True, default="", max_length=150)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("linha", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="documentos", to="financeiro.linhafaturamento")),
            ],
            options={"db_table": "ef_faturamento_documentos", "ordering": ["-created_at"]},
        ),
        migrations.AddIndex(
            model_name="faturamentodocumento",
            index=models.Index(fields=["linha", "periodo"], name="ef_fat_doc_linha_per_idx"),
        ),
    ]
