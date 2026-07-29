"""Desmembra a permissão de Estrutura em faturamento, cadastro e equipes.

Cargo.modulos é JSON: chave nova ausente = "nada" = negado. Sem esta migração,
todo mundo perderia lançamento e cadastro no dia do deploy. Então derivamos:

  faturamento        <- nível atual de `estrutura` (quem editava, continua lançando)
  estrutura-cadastro <- nível atual de `estrutura`
  equipes            <- nível de `pessoal` (DP), porque a tela mostra salário
                        individual; quem não tem DP deixa de ver custo por pessoa.

Essa última é um APERTO consciente: hoje qualquer "ver" na estrutura enxerga a
folha de todo mundo.
"""
from django.db import migrations


def _nivel(v):
    if v is True or v == "editar":
        return "editar"
    if v == "ver":
        return "ver"
    return "nada"


def desmembrar(apps, schema_editor):
    Cargo = apps.get_model("financeiro", "Cargo")
    for c in Cargo.objects.all():
        mods = dict(c.modulos or {})
        est = _nivel(mods.get("estrutura"))
        pes = _nivel(mods.get("pessoal"))
        mods.setdefault("faturamento", est)
        mods.setdefault("estrutura-cadastro", est)
        mods.setdefault("equipes", pes)
        c.modulos = mods
        c.save(update_fields=["modulos"])


def desfazer(apps, schema_editor):
    Cargo = apps.get_model("financeiro", "Cargo")
    for c in Cargo.objects.all():
        mods = dict(c.modulos or {})
        for k in ("faturamento", "estrutura-cadastro", "equipes"):
            mods.pop(k, None)
        c.modulos = mods
        c.save(update_fields=["modulos"])


class Migration(migrations.Migration):

    dependencies = [("financeiro", "0017_faturamento_documento")]

    operations = [migrations.RunPython(desmembrar, desfazer)]
