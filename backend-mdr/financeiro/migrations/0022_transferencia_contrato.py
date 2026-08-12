"""Transferencia de contrato: liga a matricula encerrada a nova (efetivacao)."""
import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [("financeiro", "0021_salario_familia")]

    operations = [
        migrations.CreateModel(
            name="DpTransferenciaContrato",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("data_efeito", models.DateField()),
                ("motivo", models.CharField(blank=True, default="", max_length=200)),
                ("dependentes_movidos", models.IntegerField(default=0)),
                ("dependentes_ids", models.JSONField(blank=True, default=list)),
                ("registrado_por", models.CharField(blank=True, default="", max_length=150)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("origem", models.OneToOneField(help_text="Matrícula encerrada (o contrato anterior)", on_delete=django.db.models.deletion.CASCADE, related_name="transferencia_saida", to="financeiro.dpcolaborador")),
                ("destino", models.OneToOneField(help_text="Matrícula nova (o contrato atual)", on_delete=django.db.models.deletion.CASCADE, related_name="transferencia_entrada", to="financeiro.dpcolaborador")),
            ],
            options={
                "db_table": "dp_transferencias_contrato",
                "ordering": ["-data_efeito"],
            },
        ),
        migrations.AddConstraint(
            model_name="dptransferenciacontrato",
            constraint=models.CheckConstraint(
                check=models.Q(("origem", models.F("destino")), _negated=True),
                name="ck_transf_origem_diferente_destino"),
        ),
    ]
