# Completa a ÁRVORE de centros de custo: cria os núcleos-pai que existiam só
# como prefixo no nome ("Autor - BB" → cria o núcleo "Autor" e pendura o filho).
# Núcleos criados não recebem colaborador direto — são agrupadores de rateio.
from django.db import migrations


def criar_grupos(apps, schema_editor):
    CC = apps.get_model("financeiro", "DpCentroCusto")
    por_nome = {c.nome.strip(): c for c in CC.objects.all()}

    # prefixos usados por quem ainda não tem pai
    prefixos = {}
    for c in CC.objects.filter(pai__isnull=True):
        if " - " not in c.nome:
            continue
        pref = c.nome.split(" - ", 1)[0].strip()
        prefixos.setdefault(pref, []).append(c)

    for pref, filhos in prefixos.items():
        pai = por_nome.get(pref)
        if pai is None:
            pai = CC.objects.create(nome=pref, codigo=min(f.codigo for f in filhos))
            por_nome[pref] = pai
        for f in filhos:
            if f.id != pai.id:
                f.pai = pai
                f.save(update_fields=["pai"])


def desfazer(apps, schema_editor):
    CC = apps.get_model("financeiro", "DpCentroCusto")
    for nome in ("Autor", "Réu"):
        c = CC.objects.filter(nome=nome).first()
        if c and not c.colaboradores.exists():
            c.filhos.update(pai=None)
            c.delete()


class Migration(migrations.Migration):

    dependencies = [
        ("financeiro", "0007_cc_arvore_ajuste_pontual"),
    ]

    operations = [
        migrations.RunPython(criar_grupos, desfazer),
    ]
