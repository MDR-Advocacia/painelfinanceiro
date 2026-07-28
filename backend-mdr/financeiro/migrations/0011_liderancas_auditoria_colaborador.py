"""Catálogo de lideranças (supervisores/coordenadores) + auditoria por colaborador.

Supervisor e coordenador eram texto livre na ficha — cada import escrevia de um
jeito e não dava pra renomear em um lugar só. Viram FK pro catálogo `dp_liderancas`,
semeado a partir dos nomes que já estavam nas fichas (nada se perde).

A auditoria ganha o vínculo com a pessoa afetada, pra pesquisar o histórico
completo de um colaborador. Os registros antigos de `dp_colaborador` são
religados pelo `entidade_id`.
"""
import uuid

import django.db.models.deletion
from django.db import migrations, models


def semear_liderancas(apps, schema_editor):
    DpLideranca = apps.get_model("financeiro", "DpLideranca")
    DpColaborador = apps.get_model("financeiro", "DpColaborador")
    DpAuditLog = apps.get_model("financeiro", "DpAuditLog")

    cache = {}

    def pegar(nome, papel):
        nome = (nome or "").strip()
        if not nome:
            return None
        chave = nome.lower()
        lid = cache.get(chave)
        if lid is None:
            lid, _ = DpLideranca.objects.get_or_create(
                nome=nome, defaults={"id": uuid.uuid4(), "e_supervisor": False,
                                     "e_coordenador": False},
            )
            cache[chave] = lid
        marcou = False
        if papel == "sup" and not lid.e_supervisor:
            lid.e_supervisor, marcou = True, True
        if papel == "coord" and not lid.e_coordenador:
            lid.e_coordenador, marcou = True, True
        if marcou:
            lid.save()
        return lid

    for c in DpColaborador.objects.all():
        # a planilha usa sufixo no nome: "Fulano - SUP" x "Fulano - COOR".
        # Quem vem marcado como COOR entra como COORDENADOR, não supervisor.
        bruto_sup = (c.supervisor or "").strip()
        if "COOR" in bruto_sup.upper():
            sup, coord = None, pegar(bruto_sup, "coord")
        else:
            sup, coord = pegar(bruto_sup, "sup"), pegar(c.coordenador, "coord")
        if sup or coord:
            c.supervisor_ref = sup
            c.coordenador_ref = coord
            c.save(update_fields=["supervisor_ref", "coordenador_ref"])

    # centro de custo da liderança = o CC onde ela tem mais gente (melhor palpite)
    for lid in DpLideranca.objects.all():
        contagem = {}
        equipe = DpColaborador.objects.filter(
            models.Q(supervisor_ref=lid) | models.Q(coordenador_ref=lid)
        ).exclude(centro_custo=None)
        for c in equipe:
            contagem[c.centro_custo_id] = contagem.get(c.centro_custo_id, 0) + 1
        if contagem:
            lid.centro_custo_id = max(contagem, key=contagem.get)
            lid.save(update_fields=["centro_custo"])

    # religa a auditoria antiga à pessoa: pelo id (registros da ficha) e pelo
    # nome gravado no payload (lançamentos e ajustes pontuais da folha)
    nomes = {str(c.id): c.nome for c in DpColaborador.objects.all()}
    por_nome = {c.nome.strip().upper(): c.id for c in DpColaborador.objects.all()}
    for log in DpAuditLog.objects.filter(colaborador__isnull=True):
        alvo_id = log.entidade_id if nomes.get(log.entidade_id) else None
        if alvo_id is None:
            for fonte in (log.depois, log.antes):
                if isinstance(fonte, dict) and fonte.get("colaborador"):
                    alvo_id = por_nome.get(str(fonte["colaborador"]).strip().upper())
                    if alvo_id:
                        break
        if alvo_id:
            log.colaborador_id = alvo_id
            log.colaborador_nome = nomes[str(alvo_id)]
            log.save(update_fields=["colaborador", "colaborador_nome"])


def desfazer(apps, schema_editor):
    """Volta o texto pra ficha antes de dropar as FKs."""
    DpColaborador = apps.get_model("financeiro", "DpColaborador")
    for c in DpColaborador.objects.select_related("supervisor_ref", "coordenador_ref"):
        c.supervisor = c.supervisor_ref.nome if c.supervisor_ref_id else ""
        c.coordenador = c.coordenador_ref.nome if c.coordenador_ref_id else ""
        c.save(update_fields=["supervisor", "coordenador"])


class Migration(migrations.Migration):

    dependencies = [("financeiro", "0010_folha_rescisao_flag")]

    operations = [
        migrations.CreateModel(
            name="DpLideranca",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("nome", models.CharField(max_length=120, unique=True)),
                ("e_supervisor", models.BooleanField(default=True)),
                ("e_coordenador", models.BooleanField(default=False)),
                ("email", models.CharField(blank=True, default="", max_length=150)),
                ("ativo", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("centro_custo", models.ForeignKey(blank=True, null=True,
                                                   on_delete=django.db.models.deletion.SET_NULL,
                                                   related_name="liderancas",
                                                   to="financeiro.dpcentrocusto")),
                ("colaborador", models.ForeignKey(blank=True, null=True,
                                                  on_delete=django.db.models.deletion.SET_NULL,
                                                  related_name="lideranca",
                                                  to="financeiro.dpcolaborador")),
            ],
            options={"db_table": "dp_liderancas", "ordering": ["nome"]},
        ),
        migrations.AddField(
            model_name="dpcolaborador", name="supervisor_ref",
            field=models.ForeignKey(blank=True, null=True,
                                    on_delete=django.db.models.deletion.SET_NULL,
                                    related_name="supervisionados", to="financeiro.dplideranca"),
        ),
        migrations.AddField(
            model_name="dpcolaborador", name="coordenador_ref",
            field=models.ForeignKey(blank=True, null=True,
                                    on_delete=django.db.models.deletion.SET_NULL,
                                    related_name="coordenados", to="financeiro.dplideranca"),
        ),
        migrations.AddField(
            model_name="dpauditlog", name="colaborador",
            field=models.ForeignKey(blank=True, null=True,
                                    on_delete=django.db.models.deletion.SET_NULL,
                                    related_name="auditoria", to="financeiro.dpcolaborador"),
        ),
        migrations.AddField(
            model_name="dpauditlog", name="colaborador_nome",
            field=models.CharField(blank=True, default="", max_length=200),
        ),
        migrations.RunPython(semear_liderancas, desfazer),
        migrations.RemoveField(model_name="dpcolaborador", name="supervisor"),
        migrations.RemoveField(model_name="dpcolaborador", name="coordenador"),
        migrations.RenameField(model_name="dpcolaborador", old_name="supervisor_ref", new_name="supervisor"),
        migrations.RenameField(model_name="dpcolaborador", old_name="coordenador_ref", new_name="coordenador"),
    ]
