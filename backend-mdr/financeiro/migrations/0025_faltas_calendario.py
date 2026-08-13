# Faltas por CALENDÁRIO: o DSR é semanal, então precisamos das datas.
#
# Aditiva e sem risco: a coluna nasce com lista vazia e o motor cai no
# comportamento numérico antigo enquanto ninguém lançar data. As competências
# já fechadas (jan–jul/2026) estão congeladas e não recalculam.
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [("financeiro", "0024_irrf_medias_decimo")]

    operations = [
        migrations.AddField(
            model_name="dplancamento",
            name="faltas_datas",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="dpfolhaitem",
            name="dsr_semanas",
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name="dpfolhaitem",
            name="faltas_datas",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
