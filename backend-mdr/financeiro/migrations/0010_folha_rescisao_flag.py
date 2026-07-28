# Marca na linha da folha quem está saindo no mês (espelha a "Obs. Rescisão" da planilha).
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("financeiro", "0009_rescisao_coordenador"),
    ]

    operations = [
        migrations.AddField(
            model_name="dpfolhaitem", name="em_rescisao",
            field=models.BooleanField(default=False),
        ),
    ]
