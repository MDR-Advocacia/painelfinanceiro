"""Foto do enquadramento e das alocacoes no fechamento da competencia."""
import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [("financeiro", "0018_permissoes_granulares")]

    operations = [
        migrations.CreateModel(
            name="CompetenciaEnquadramento",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("colaborador", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="fotos_enquadramento", to="financeiro.dpcolaborador")),
                ("competencia", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="foto_enquadramentos", to="financeiro.dpcompetencia")),
                ("equipe", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="fotos_enquadramento", to="financeiro.equipe")),
            ],
            options={"db_table": "ef_foto_enquadramentos"},
        ),
        migrations.CreateModel(
            name="CompetenciaAlocacao",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("percentual", models.FloatField(default=0)),
                ("centro", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="fotos_alocacao", to="financeiro.centrofaturamento")),
                ("competencia", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="foto_alocacoes", to="financeiro.dpcompetencia")),
                ("equipe", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="fotos_alocacao", to="financeiro.equipe")),
                ("linha", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="fotos_alocacao", to="financeiro.linhafaturamento")),
            ],
            options={"db_table": "ef_foto_alocacoes"},
        ),
        migrations.AddConstraint(
            model_name="competenciaenquadramento",
            constraint=models.UniqueConstraint(fields=("competencia", "colaborador"), name="uq_foto_enq_comp_colab"),
        ),
    ]
