"""Vínculo com SEDE na estrutura de faturamento.

Regra da casa (2026-07-29): tudo que é Recuperação de Crédito é MANHATTAN,
tudo que é Contencioso Passivo é CAPIM MACIO. Como um mesmo cliente atua nas
duas áreas (o BB tem 4 linhas passivas e uma de crédito), o vínculo mora na
LINHA — o centro passa a alcançar as sedes das suas linhas. Isso reproduz o
que a produção já fazia: "BB Autor" era Manhattan, os "- BB Réu" eram Capim
Macio.

Centro de INFRAESTRUTURA não tem área: o custo dele é dividido entre as sedes
por percentual (igual, por padrão) — daí a tabela `ef_centro_sedes`.
"""
import uuid

import django.db.models.deletion
from django.db import migrations, models

# Nomes das sedes da casa. Sedes com outro nome ficam sem vínculo automático —
# o operador aponta na tela (o campo é editável).
SEDE_PASSIVO = "Capim Macio"
SEDE_CREDITO = "Manhattan"


def vincular(apps, schema_editor):
    Sede = apps.get_model("financeiro", "Sede")
    Linha = apps.get_model("financeiro", "LinhaFaturamento")
    Centro = apps.get_model("financeiro", "CentroFaturamento")
    CentroSede = apps.get_model("financeiro", "CentroSede")

    sedes = {s.nome: s for s in Sede.objects.all()}
    passivo, credito = sedes.get(SEDE_PASSIVO), sedes.get(SEDE_CREDITO)
    if passivo:
        Linha.objects.filter(area="passivo").update(sede=passivo)
    if credito:
        Linha.objects.filter(area="credito").update(sede=credito)

    # infraestrutura: rateio igual entre TODAS as sedes cadastradas
    todas = list(sedes.values())
    if todas:
        parte = round(100.0 / len(todas), 2)
        for c in Centro.objects.filter(tipo="infraestrutura"):
            for s in todas:
                CentroSede.objects.get_or_create(
                    centro=c, sede=s, defaults={"id": uuid.uuid4(), "percentual": parte})


def desfazer(apps, schema_editor):
    apps.get_model("financeiro", "LinhaFaturamento").objects.update(sede=None)
    apps.get_model("financeiro", "CentroSede").objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [("financeiro", "0015_colaborador_equipe")]

    operations = [
        migrations.AddField(
            model_name="linhafaturamento", name="sede",
            field=models.ForeignKey(blank=True, null=True,
                                    on_delete=django.db.models.deletion.SET_NULL,
                                    related_name="linhas_faturamento",
                                    to="financeiro.sede"),
        ),
        migrations.CreateModel(
            name="CentroSede",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False,
                                        primary_key=True, serialize=False)),
                ("percentual", models.FloatField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("centro", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                             related_name="sedes",
                                             to="financeiro.centrofaturamento")),
                ("sede", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                           related_name="centros_estrutura",
                                           to="financeiro.sede")),
            ],
            options={"db_table": "ef_centro_sedes", "ordering": ["sede__nome"]},
        ),
        migrations.AddConstraint(
            model_name="centrosede",
            constraint=models.UniqueConstraint(fields=["centro", "sede"],
                                               name="uq_centro_sede"),
        ),
        migrations.RunPython(vincular, desfazer),
    ]
