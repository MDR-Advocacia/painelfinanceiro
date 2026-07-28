"""Normalização funcionário → equipe → centro.

O colaborador do DP ganha vínculo DIRETO com a Equipe (a mesma tabela que a
Estrutura de Faturamento aloca nas linhas). Com isso o custo de uma equipe
passa a ser a soma da folha das SUAS pessoas — não mais uma aproximação via
centro de custo — e o enquadramento vira um campo da ficha.

O data-migration faz o enquadramento inicial pelo centro de custo: quem está
no CC "Réu - BB Acordo" entra na equipe cujo `centro_custo` é esse CC, e assim
por diante. Quem estiver num CC sem equipe correspondente fica sem vínculo
(aparece no relatório de pendências pra distribuição manual).
"""
import django.db.models.deletion
from django.db import migrations, models


def enquadrar(apps, schema_editor):
    Equipe = apps.get_model("financeiro", "Equipe")
    DpColaborador = apps.get_model("financeiro", "DpColaborador")
    for eq in Equipe.objects.exclude(centro_custo=None):
        DpColaborador.objects.filter(centro_custo=eq.centro_custo).update(equipe_ref=eq)


def desfazer(apps, schema_editor):
    apps.get_model("financeiro", "DpColaborador").objects.update(equipe_ref=None)


class Migration(migrations.Migration):

    dependencies = [("financeiro", "0014_estrutura_faturamento")]

    operations = [
        migrations.AddField(
            model_name="dpcolaborador", name="equipe_ref",
            field=models.ForeignKey(blank=True, null=True,
                                    on_delete=django.db.models.deletion.SET_NULL,
                                    related_name="colaboradores",
                                    to="financeiro.equipe"),
        ),
        migrations.RunPython(enquadrar, desfazer),
    ]
