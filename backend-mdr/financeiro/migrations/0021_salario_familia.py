"""Salario-familia: dependentes do colaborador, parametros versionados e verba na folha."""
import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [("financeiro", "0020_arquivo_contabil")]

    operations = [
        migrations.CreateModel(
            name="DpDependente",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("nome", models.CharField(max_length=150)),
                ("data_nascimento", models.DateField()),
                ("tipo", models.CharField(choices=[("filho", "Filho(a)"), ("enteado", "Enteado(a)"), ("tutelado", "Menor sob tutela")], default="filho", max_length=20)),
                ("cpf", models.CharField(blank=True, default="", max_length=14)),
                ("invalido", models.BooleanField(default=False, help_text="Dependente inválido — sem limite de idade")),
                ("vacinacao_valida_ate", models.DateField(blank=True, null=True)),
                ("frequencia_escolar_valida_ate", models.DateField(blank=True, null=True)),
                ("ativo", models.BooleanField(default=True)),
                ("observacao", models.CharField(blank=True, default="", max_length=250)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("colaborador", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="dependentes", to="financeiro.dpcolaborador")),
            ],
            options={
                "db_table": "dp_dependentes",
                "ordering": ["colaborador__nome", "data_nascimento"],
            },
        ),
        migrations.AddField(
            model_name="dptabelafiscal",
            name="salario_familia_cota",
            field=models.FloatField(default=67.54, help_text="Valor da cota por dependente elegível"),
        ),
        migrations.AddField(
            model_name="dptabelafiscal",
            name="salario_familia_teto",
            field=models.FloatField(default=1980.38, help_text="Remuneração mensal máxima para ter direito"),
        ),
        migrations.AddField(
            model_name="dpfolhaitem",
            name="salario_familia",
            field=models.FloatField(default=0),
        ),
        migrations.AddField(
            model_name="dpfolhaitem",
            name="salario_familia_cotas",
            field=models.IntegerField(default=0),
        ),
    ]
