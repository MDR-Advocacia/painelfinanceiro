# Módulo de DESLIGAMENTO: tabela dp_rescisoes (verbas rescisórias congeladas)
# + campo coordenador no cadastro do colaborador.
import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("financeiro", "0008_cc_grupos_raiz"),
    ]

    operations = [
        migrations.AddField(
            model_name="dpcolaborador", name="coordenador",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
        migrations.CreateModel(
            name="DpRescisao",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("data_desligamento", models.DateField()),
                ("tipo", models.CharField(choices=[
                    ("sem_justa_causa", "Dispensa sem justa causa"),
                    ("pedido_demissao", "Pedido de demissão"),
                    ("acordo", "Acordo (art. 484-A)"),
                    ("justa_causa", "Dispensa por justa causa"),
                    ("termino_contrato", "Término de contrato"),
                    ("fim_estagio", "Encerramento do estágio (TCE)")], max_length=30)),
                ("motivo", models.TextField(blank=True, default="")),
                ("aviso_dias", models.IntegerField(default=0)),
                ("verbas", models.JSONField(blank=True, default=list)),
                ("descontos", models.JSONField(blank=True, default=list)),
                ("proventos", models.FloatField(default=0)),
                ("total_descontos", models.FloatField(default=0)),
                ("liquido", models.FloatField(default=0)),
                ("opcoes", models.JSONField(blank=True, default=dict)),
                ("criado_por", models.CharField(blank=True, default="", max_length=150)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("colaborador", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,
                                                  related_name="rescisoes", to="financeiro.dpcolaborador")),
            ],
            options={"db_table": "dp_rescisoes", "ordering": ["-data_desligamento", "-created_at"]},
        ),
    ]
