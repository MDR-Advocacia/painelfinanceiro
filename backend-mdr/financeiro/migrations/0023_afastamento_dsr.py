"""Afastamentos/suspensao, falta injustificada e desconto de DSR."""
import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [("financeiro", "0022_transferencia_contrato")]

    operations = [
        migrations.CreateModel(
            name="DpAfastamento",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("tipo", models.CharField(choices=[("doenca", "Atestado / auxílio-doença"), ("acidente", "Acidente de trabalho"), ("maternidade", "Licença-maternidade"), ("paternidade", "Licença-paternidade"), ("suspensao", "Suspensão disciplinar"), ("outro", "Outro afastamento")], max_length=20)),
                ("data_inicio", models.DateField()),
                ("data_prevista_retorno", models.DateField(blank=True, null=True)),
                ("data_retorno", models.DateField(blank=True, help_text="Vazio = ainda afastado", null=True)),
                ("estabilidade_ate", models.DateField(blank=True, null=True)),
                ("observacao", models.CharField(blank=True, default="", max_length=250)),
                ("registrado_por", models.CharField(blank=True, default="", max_length=150)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("colaborador", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="afastamentos", to="financeiro.dpcolaborador")),
            ],
            options={"db_table": "dp_afastamentos", "ordering": ["-data_inicio"]},
        ),
        migrations.AddField(
            model_name="dplancamento",
            name="faltas_injustificadas_dias",
            field=models.FloatField(default=0),
        ),
        migrations.AddField(
            model_name="dpfolhaitem",
            name="faltas_injustificadas_dias",
            field=models.FloatField(default=0),
        ),
        migrations.AddField(
            model_name="dpfolhaitem",
            name="desc_dsr",
            field=models.FloatField(default=0),
        ),
        migrations.AddField(
            model_name="dpfolhaitem",
            name="afastamento_tipo",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
        migrations.AddField(
            model_name="dpfolhaitem",
            name="afastamento_dias_empresa",
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name="dpfolhaitem",
            name="afastamento_dias_inss",
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name="dpfolhaitem",
            name="desc_afastamento",
            field=models.FloatField(default=0, help_text="Dias custeados pelo INSS, descontados do salário"),
        ),
    ]
