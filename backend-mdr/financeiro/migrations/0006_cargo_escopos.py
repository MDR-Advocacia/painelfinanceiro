# RBAC v3 — escopo por SUBNÚCLEO: o cargo pode ser limitado a unidades, áreas,
# centros de custo (DP) e setores/sedes (financeiro). Lista vazia = sem restrição.
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("financeiro", "0005_dp_folha"),
    ]

    operations = [
        migrations.AddField(
            model_name="cargo", name="escopo_unidades",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="cargo", name="escopo_areas",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="cargo", name="escopo_ccs",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="cargo", name="escopo_setores",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="cargo", name="escopo_sedes",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
