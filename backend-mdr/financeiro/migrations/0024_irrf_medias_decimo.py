"""IRRF versionado, media de variaveis nas ferias e 13o pago no mes."""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [("financeiro", "0023_afastamento_dsr")]

    operations = [
        migrations.AddField(
            model_name="dptabelafiscal",
            name="irrf_faixas",
            field=models.JSONField(blank=True, default=list,
                                   help_text='[{"ate": 2259.20, "aliquota": 0.075, "deducao": 169.44}, ...]'),
        ),
        migrations.AddField(
            model_name="dptabelafiscal",
            name="irrf_deducao_dependente",
            field=models.FloatField(default=0, help_text="Dedução por dependente na base do IRRF"),
        ),
        migrations.AddField(
            model_name="dpdependente",
            name="conta_irrf",
            field=models.BooleanField(default=True, help_text="Entra na dedução por dependente do IRRF"),
        ),
        migrations.AddField(
            model_name="dplancamento",
            name="media_variaveis_ferias",
            field=models.FloatField(default=0),
        ),
        migrations.AddField(
            model_name="dplancamento",
            name="decimo_terceiro_pago",
            field=models.FloatField(default=0),
        ),
        migrations.AddField(
            model_name="dpfolhaitem",
            name="desc_irrf",
            field=models.FloatField(default=0),
        ),
        migrations.AddField(
            model_name="dpfolhaitem",
            name="decimo_terceiro_pago",
            field=models.FloatField(default=0),
        ),
        migrations.AddField(
            model_name="dpfolhaitem",
            name="media_variaveis_ferias",
            field=models.FloatField(default=0),
        ),
    ]
