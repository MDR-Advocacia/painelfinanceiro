# Centros de custo em ÁRVORE (pai/filho) + AJUSTE PONTUAL na folha.
# A data migration liga automaticamente a hierarquia existente pelo padrão
# "Grupo - Subnúcleo" (ex.: "ADM - Financeiro" vira filho de "ADM").
import django.db.models.deletion
from django.db import migrations, models


def montar_arvore(apps, schema_editor):
    CC = apps.get_model("financeiro", "DpCentroCusto")
    por_nome = {c.nome.strip(): c for c in CC.objects.all()}
    for c in CC.objects.all():
        if " - " not in c.nome:
            continue
        prefixo = c.nome.split(" - ", 1)[0].strip()
        pai = por_nome.get(prefixo)
        # fallback: raiz de mesmo código, sem hífen no nome
        if pai is None:
            pai = next((x for x in CC.objects.filter(codigo=c.codigo)
                        if " - " not in x.nome and x.id != c.id), None)
        if pai is not None and pai.id != c.id:
            c.pai = pai
            c.save(update_fields=["pai"])


class Migration(migrations.Migration):

    dependencies = [
        ("financeiro", "0006_cargo_escopos"),
    ]

    operations = [
        migrations.AddField(
            model_name="dpcentrocusto", name="pai",
            field=models.ForeignKey(blank=True, null=True,
                                    on_delete=django.db.models.deletion.SET_NULL,
                                    related_name="filhos", to="financeiro.dpcentrocusto"),
        ),
        # ajuste pontual do mês (override que NÃO altera a ficha do colaborador)
        migrations.AddField(model_name="dplancamento", name="salario_override",
                            field=models.FloatField(blank=True, null=True)),
        migrations.AddField(model_name="dplancamento", name="vt_override",
                            field=models.FloatField(blank=True, null=True)),
        migrations.AddField(model_name="dplancamento", name="va_override",
                            field=models.FloatField(blank=True, null=True)),
        migrations.AddField(model_name="dplancamento", name="saldo_livre_override",
                            field=models.FloatField(blank=True, null=True)),
        migrations.AddField(model_name="dplancamento", name="ajuste_motivo",
                            field=models.TextField(blank=True, default="")),
        migrations.AddField(model_name="dplancamento", name="ajuste_autor",
                            field=models.CharField(blank=True, default="", max_length=150)),
        migrations.AddField(model_name="dplancamento", name="ajuste_em",
                            field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="dpfolhaitem", name="cargo_nome",
                            field=models.CharField(blank=True, default="", max_length=120)),
        migrations.AddField(model_name="dpfolhaitem", name="ajuste_manual",
                            field=models.BooleanField(default=False)),
        migrations.AddField(model_name="dpfolhaitem", name="ajuste_motivo",
                            field=models.TextField(blank=True, default="")),
        migrations.RunPython(montar_arvore, migrations.RunPython.noop),
    ]
