"""Férias como ocorrência da folha do mês (versão simples pedida pelo DP).

Não é controle de período aquisitivo: o operador informa que a pessoa sai de
férias naquele mês e o motor calcula o que muda no pagamento — remuneração dos
dias, 1/3 constitucional, abono pecuniário e os reflexos em INSS, VT e VA.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [("financeiro", "0012_documentos_colaborador")]

    operations = [
        # entrada (o que o operador informa)
        migrations.AddField(model_name="dplancamento", name="ferias_inicio",
                            field=models.DateField(blank=True, null=True)),
        migrations.AddField(model_name="dplancamento", name="ferias_dias",
                            field=models.IntegerField(default=0)),
        migrations.AddField(model_name="dplancamento", name="ferias_abono_dias",
                            field=models.IntegerField(default=0)),
        # saída (o que o motor calculou naquele mês)
        migrations.AddField(model_name="dpfolhaitem", name="ferias_dias",
                            field=models.IntegerField(default=0)),
        migrations.AddField(model_name="dpfolhaitem", name="ferias_valor",
                            field=models.FloatField(default=0)),
        migrations.AddField(model_name="dpfolhaitem", name="ferias_terco",
                            field=models.FloatField(default=0)),
        migrations.AddField(model_name="dpfolhaitem", name="ferias_abono",
                            field=models.FloatField(default=0)),
        migrations.AddField(model_name="dpfolhaitem", name="ferias_inicio",
                            field=models.DateField(blank=True, null=True)),
        migrations.AddField(model_name="dpfolhaitem", name="ferias_fim",
                            field=models.DateField(blank=True, null=True)),
    ]
