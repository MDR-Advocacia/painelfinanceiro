# Estrutura de Faturamento — API da proposta de reestruturação.
# RBAC: módulo `estrutura` ("ver" navega, "editar" altera). Toda escrita
# audita via DpAuditLog (mesma trilha traduzida do DP).
from django.db import transaction
from django.db.models import Count, Sum
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .dp_views import _quem, audit
from .models import (
    Alocacao, CentroFaturamento, DpCompetencia, DpFolhaItem, Equipe, LinhaFaturamento,
)
from .views import modulo_permission

_PERM = [modulo_permission(read_any=["estrutura"], write="estrutura")]


def _ultimo_periodo(linhas) -> str | None:
    """Período mais recente COM RECEITA em alguma linha (ex.: '2026-06').

    Não basta o período existir: o Cadastro Técnico tem julho lançado com
    zero e escolhê-lo esconderia a receita real de todo mundo."""
    com_receita = {p for l in linhas for p, f in (l.periodos or {}).items()
                   if (f or {}).get("bruto")}
    if com_receita:
        return max(com_receita)
    pers = {p for l in linhas for p in (l.periodos or {})}
    return max(pers) if pers else None


def _custo_por_cc(ultima_fechada) -> dict:
    """Custo TOTAL (com provisões e patronal) e a-pagar por centro de custo,
    da última competência FECHADA — decisão acordada: margem usa custo total e
    a folha fechada; a aberta não entra."""
    if not ultima_fechada:
        return {}
    agg = (DpFolhaItem.objects.filter(competencia=ultima_fechada)
           .values("centro_custo_nome")
           .annotate(n=Count("id"), custo=Sum("custo_total"), pagar=Sum("total_pagar")))
    return {r["centro_custo_nome"]: {"pessoas": r["n"],
                                     "custo_total": round(r["custo"] or 0, 2),
                                     "a_pagar": round(r["pagar"] or 0, 2)}
            for r in agg}


@api_view(["GET"])
@permission_classes(_PERM)
def estrutura(request):
    """A árvore inteira: centros → linhas → alocações (+ custo real do DP).

    Receita = período mais recente lançado em cada linha. Custo = última
    competência FECHADA da folha, descido pela equipe → centro de custo do DP
    e multiplicado pelo percentual de alocação.
    """
    linhas_qs = (LinhaFaturamento.objects.select_related("centro", "setor_legado")
                 .prefetch_related("alocacoes__equipe__centro_custo"))
    linhas = list(linhas_qs)
    per = request.query_params.get("periodo") or _ultimo_periodo(linhas)

    # regra acordada: custo vem da última competência FECHADA. Enquanto não
    # existir nenhuma (caso do ambiente local), cai na mais recente calculada
    # e avisa que o número é parcial.
    fechada = (DpCompetencia.objects.filter(status="fechada")
               .order_by("-ano", "-mes").first())
    custo_parcial = False
    if not fechada:
        fechada = DpCompetencia.objects.order_by("-ano", "-mes").first()
        custo_parcial = fechada is not None
    custo_cc = _custo_por_cc(fechada)

    # O percentual divide a RECEITA da linha. Pro CUSTO a conta é outra: uma
    # equipe que atende N linhas (Ajuizamento atende 6) tem o custo dela
    # distribuído na PROPORÇÃO das alocações — senão a mesma folha entraria
    # inteira em cada cliente (dupla contagem: foi o que a primeira versão
    # desta tela mostrou com Ativos Réu em Ativos S.A. E em Banese).
    soma_por_equipe = {}
    for a in Alocacao.objects.all():
        soma_por_equipe[a.equipe_id] = soma_por_equipe.get(a.equipe_id, 0) + (a.percentual or 0)

    def json_alocacao(a):
        cc = a.equipe.centro_custo
        base = custo_cc.get(cc.nome) if cc else None
        soma_eq = soma_por_equipe.get(a.equipe_id) or 0
        fator = ((a.percentual or 0) / soma_eq) if soma_eq else 0.0
        return {
            "id": str(a.id),
            "equipe_id": str(a.equipe_id),
            "equipe": a.equipe.nome,
            "slug": a.equipe.slug,
            "grupo": a.equipe.grupo,
            "percentual": a.percentual,
            "centro_custo": cc.nome if cc else None,
            # custo da equipe RATEADO pela participação dela nesta linha
            "custo_total": round(base["custo_total"] * fator, 2) if base else None,
            "a_pagar": round(base["a_pagar"] * fator, 2) if base else None,
            "pessoas": base["pessoas"] if base else None,
        }

    def json_linha(l):
        f = (l.periodos or {}).get(per, {}) if per else {}
        alocs = sorted(l.alocacoes.all(), key=lambda a: -a.percentual)
        return {
            "id": str(l.id), "nome": l.nome, "area": l.area, "ativo": l.ativo,
            "setor_legado": l.setor_legado.nome if l.setor_legado_id else None,
            "receita_bruta": (f or {}).get("bruto", 0) or 0,
            "soma_percentual": round(sum(a.percentual or 0 for a in alocs), 2),
            "alocacoes": [json_alocacao(a) for a in alocs],
        }

    saida = {"periodo": per,
             "competencia_custo": (f"{fechada.mes:02d}/{fechada.ano}" if fechada else None),
             "custo_parcial": custo_parcial,
             "centros": [], "infraestrutura": []}
    por_centro = {}
    for l in linhas:
        por_centro.setdefault(l.centro_id, []).append(l)

    for c in CentroFaturamento.objects.prefetch_related("alocacoes__equipe__centro_custo"):
        ls = [json_linha(l) for l in sorted(por_centro.get(c.id, []), key=lambda x: x.ordem)]
        diretas = [json_alocacao(a) for a in c.alocacoes.all()]
        bloco = {
            "id": str(c.id), "nome": c.nome, "tipo": c.tipo,
            "linhas": ls, "alocacoes": diretas,
            "receita_total": round(sum(l["receita_bruta"] for l in ls), 2),
            "custo_total": round(sum((a["custo_total"] or 0) for l in ls for a in l["alocacoes"])
                                 + sum((a["custo_total"] or 0) for a in diretas), 2),
        }
        (saida["centros"] if c.tipo == "faturamento" else saida["infraestrutura"]).append(bloco)

    # equipes sem nenhuma alocação (ex.: Equipe Mista) — visíveis pra não sumir gente
    alocadas = set(Alocacao.objects.values_list("equipe_id", flat=True))
    saida["sem_alocacao"] = [
        {"id": str(e.id), "equipe": e.nome, "slug": e.slug, "grupo": e.grupo,
         "centro_custo": e.centro_custo.nome if e.centro_custo_id else None}
        for e in Equipe.objects.exclude(id__in=alocadas).filter(ativo=True)
    ]
    return Response(saida)


@api_view(["PATCH"])
@permission_classes(_PERM)
def alocacao_percentual(request, pk):
    """Edita a participação de uma equipe na linha. {percentual: 0..100}"""
    a = Alocacao.objects.select_related("equipe", "linha", "centro").filter(pk=pk).first()
    if not a:
        return Response(status=404)
    try:
        novo = float(request.data.get("percentual"))
    except (TypeError, ValueError):
        return Response({"detail": "Percentual inválido."}, status=400)
    if not (0 <= novo <= 100):
        return Response({"detail": "Percentual deve estar entre 0 e 100."}, status=400)
    antes = a.percentual
    a.percentual = round(novo, 2)
    a.save(update_fields=["percentual", "updated_at"])
    destino = str(a.linha or a.centro)
    audit(request, "editar", "ef_alocacao", a.id,
          antes={"equipe": a.equipe.nome, "destino": destino, "percentual": antes},
          depois={"equipe": a.equipe.nome, "destino": destino, "percentual": a.percentual})
    return Response({"id": str(a.id), "percentual": a.percentual})


@api_view(["POST"])
@permission_classes(_PERM)
def linha_igualar(request, pk):
    """Redivide a linha em percentuais IGUAIS (regra da casa)."""
    linha = LinhaFaturamento.objects.filter(pk=pk).first()
    if not linha:
        return Response(status=404)
    alocs = list(linha.alocacoes.all())
    if not alocs:
        return Response({"detail": "Linha sem equipes."}, status=400)
    igual = round(100.0 / len(alocs), 2)
    with transaction.atomic():
        for a in alocs:
            a.percentual = igual
            a.save(update_fields=["percentual", "updated_at"])
    audit(request, "editar", "ef_linha", linha.id,
          depois={"linha": str(linha), "acao": f"percentuais igualados em {igual}%"})
    return Response({"percentual": igual, "equipes": len(alocs)})


@api_view(["POST"])
@permission_classes(_PERM)
def alocar_equipe(request):
    """Aloca uma equipe numa linha (ou centro): {linha_id | centro_id, equipe_id}.
    A linha inteira é redividida em partes iguais (regra da casa)."""
    equipe = Equipe.objects.filter(pk=request.data.get("equipe_id")).first()
    if not equipe:
        return Response({"detail": "Equipe não encontrada."}, status=400)
    linha = LinhaFaturamento.objects.filter(pk=request.data.get("linha_id") or None).first()
    centro = CentroFaturamento.objects.filter(pk=request.data.get("centro_id") or None).first()
    if not linha and not centro:
        return Response({"detail": "Informe a linha ou o centro."}, status=400)

    with transaction.atomic():
        if linha:
            if linha.alocacoes.filter(equipe=equipe).exists():
                return Response({"detail": "Equipe já está nesta linha."}, status=409)
            Alocacao.objects.create(linha=linha, equipe=equipe, percentual=0)
            alocs = list(linha.alocacoes.all())
            igual = round(100.0 / len(alocs), 2)
            for a in alocs:
                a.percentual = igual
                a.save(update_fields=["percentual", "updated_at"])
            destino = str(linha)
        else:
            if centro.alocacoes.filter(equipe=equipe).exists():
                return Response({"detail": "Equipe já está neste centro."}, status=409)
            Alocacao.objects.create(centro=centro, equipe=equipe, percentual=100.0)
            destino = str(centro)
    audit(request, "criar", "ef_alocacao", "",
          depois={"equipe": equipe.nome, "destino": destino})
    return Response({"ok": True}, status=status.HTTP_201_CREATED)


@api_view(["DELETE"])
@permission_classes(_PERM)
def remover_alocacao(request, pk):
    a = Alocacao.objects.select_related("equipe", "linha", "centro").filter(pk=pk).first()
    if not a:
        return Response(status=404)
    destino = str(a.linha or a.centro)
    linha = a.linha
    with transaction.atomic():
        a.delete()
        # quem fica na linha volta à divisão igual
        if linha:
            resto = list(linha.alocacoes.all())
            if resto:
                igual = round(100.0 / len(resto), 2)
                for r in resto:
                    r.percentual = igual
                    r.save(update_fields=["percentual", "updated_at"])
    audit(request, "excluir", "ef_alocacao", pk,
          antes={"equipe": a.equipe.nome, "destino": destino})
    return Response(status=204)


@api_view(["GET"])
@permission_classes(_PERM)
def equipes(request):
    """Catálogo de equipes (pro combobox de alocação)."""
    return Response([
        {"id": str(e.id), "nome": e.nome, "slug": e.slug, "grupo": e.grupo,
         "centro_custo": e.centro_custo.nome if e.centro_custo_id else None}
        for e in Equipe.objects.filter(ativo=True)
    ])
