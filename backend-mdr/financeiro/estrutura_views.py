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


def _custo_por_equipe(ultima_fechada) -> dict:
    """Custo por EQUIPE somando a folha das pessoas ENQUADRADAS nela — a conta
    exata que a normalização funcionário→equipe permite."""
    if not ultima_fechada:
        return {}
    from .models import DpColaborador
    equipe_de = dict(DpColaborador.objects.exclude(equipe_ref=None)
                     .values_list("id", "equipe_ref_id"))
    saida = {}
    for it in (DpFolhaItem.objects.filter(competencia=ultima_fechada)
               .values("colaborador_id", "custo_total", "total_pagar")):
        eq = equipe_de.get(it["colaborador_id"])
        if not eq:
            continue
        d = saida.setdefault(str(eq), {"pessoas": 0, "custo_total": 0.0, "a_pagar": 0.0})
        d["pessoas"] += 1
        d["custo_total"] = round(d["custo_total"] + (it["custo_total"] or 0), 2)
        d["a_pagar"] = round(d["a_pagar"] + (it["total_pagar"] or 0), 2)
    return saida


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
    custo_eq = _custo_por_equipe(fechada)

    # O percentual divide a RECEITA da linha. Pro CUSTO a conta é outra: uma
    # equipe que atende N linhas (Ajuizamento atende 6) tem o custo dela
    # distribuído na PROPORÇÃO das alocações — senão a mesma folha entraria
    # inteira em cada cliente (dupla contagem: foi o que a primeira versão
    # desta tela mostrou com Ativos Réu em Ativos S.A. E em Banese).
    soma_por_equipe = {}
    for a in Alocacao.objects.all():
        soma_por_equipe[a.equipe_id] = soma_por_equipe.get(a.equipe_id, 0) + (a.percentual or 0)

    def json_alocacao(a):
        # 1ª escolha: folha das pessoas ENQUADRADAS na equipe (normalização);
        # fallback: agregado do centro de custo vinculado (equipe ainda sem gente)
        base = custo_eq.get(str(a.equipe_id))
        origem = "pessoas"
        if not base:
            cc = a.equipe.centro_custo
            base = custo_cc.get(cc.nome) if cc else None
            origem = "centro_custo" if base else None
        soma_eq = soma_por_equipe.get(a.equipe_id) or 0
        fator = ((a.percentual or 0) / soma_eq) if soma_eq else 0.0
        return {
            "custo_origem": origem,
            "id": str(a.id),
            "equipe_id": str(a.equipe_id),
            "equipe": a.equipe.nome,
            "slug": a.equipe.slug,
            "grupo": a.equipe.grupo,
            "percentual": a.percentual,
            "centro_custo": (a.equipe.centro_custo.nome
                              if a.equipe.centro_custo_id else None),
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
            "receita_bruta": (f or {}).get("bruto", 0) or 0,
            "soma_percentual": round(sum(a.percentual or 0 for a in alocs), 2),
            "alocacoes": [json_alocacao(a) for a in alocs],
        }

    periodos = sorted({p for l in linhas for p, f in (l.periodos or {}).items()
                       if (f or {}).get("bruto")}, reverse=True)
    saida = {"periodo": per, "periodos": periodos,
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
    from .models import DpColaborador
    alocs = {}
    for a in Alocacao.objects.select_related("linha__centro", "centro"):
        alocs.setdefault(str(a.equipe_id), []).append(
            str(a.linha or a.centro))
    gente = {}
    for r in (DpColaborador.objects.filter(status="ativo").exclude(equipe_ref=None)
              .values("equipe_ref_id")):
        k = str(r["equipe_ref_id"])
        gente[k] = gente.get(k, 0) + 1
    return Response([
        {"id": str(e.id), "nome": e.nome, "slug": e.slug, "grupo": e.grupo,
         "centro_custo": e.centro_custo.nome if e.centro_custo_id else None,
         "centro_custo_id": str(e.centro_custo_id) if e.centro_custo_id else None,
         "alocada_em": alocs.get(str(e.id), []),
         "colaboradores": gente.get(str(e.id), 0)}
        for e in Equipe.objects.filter(ativo=True)
    ])


# ─────────────────────────── CRUD DA ESTRUTURA ───────────────────────────
# Tudo tabelado e editável, como pedido: criar/renomear/excluir centros,
# linhas e equipes. Exclusão é conservadora — nada que carregue histórico
# (receita lançada, alocações) some por acidente.

@api_view(["POST", "PATCH", "DELETE"])
@permission_classes(_PERM)
def centro_crud(request, pk=None):
    if request.method == "POST":
        nome = (request.data.get("nome") or "").strip()
        tipo = request.data.get("tipo") or "faturamento"
        if not nome:
            return Response({"detail": "Informe o nome."}, status=400)
        if tipo not in ("faturamento", "infraestrutura"):
            return Response({"detail": "Tipo inválido."}, status=400)
        if CentroFaturamento.objects.filter(nome__iexact=nome).exists():
            return Response({"detail": "Já existe um centro com esse nome."}, status=409)
        ordem = (CentroFaturamento.objects.filter(tipo=tipo).count()
                 + (100 if tipo == "infraestrutura" else 0))
        c = CentroFaturamento.objects.create(nome=nome, tipo=tipo, ordem=ordem)
        audit(request, "criar", "ef_centro", c.id, depois={"nome": nome, "tipo": tipo})
        return Response({"id": str(c.id)}, status=status.HTTP_201_CREATED)

    c = CentroFaturamento.objects.filter(pk=pk).first()
    if not c:
        return Response(status=404)
    if request.method == "PATCH":
        nome = (request.data.get("nome") or "").strip()
        if not nome:
            return Response({"detail": "Informe o nome."}, status=400)
        antes = c.nome
        c.nome = nome
        c.save(update_fields=["nome", "updated_at"])
        audit(request, "editar", "ef_centro", c.id, antes={"nome": antes}, depois={"nome": nome})
        return Response({"ok": True})
    # DELETE
    if c.linhas.exists() or c.alocacoes.exists():
        return Response({"detail": "Centro tem linhas ou equipes — esvazie antes de excluir."},
                        status=409)
    audit(request, "excluir", "ef_centro", c.id, antes={"nome": c.nome})
    c.delete()
    return Response(status=204)


@api_view(["POST", "PATCH", "DELETE"])
@permission_classes(_PERM)
def linha_crud(request, pk=None):
    if request.method == "POST":
        centro = CentroFaturamento.objects.filter(pk=request.data.get("centro_id")).first()
        nome = (request.data.get("nome") or "").strip()
        area = request.data.get("area") or "passivo"
        if not centro:
            return Response({"detail": "Centro não encontrado."}, status=400)
        if not nome:
            return Response({"detail": "Informe o nome da linha."}, status=400)
        if area not in ("passivo", "credito", "especializada"):
            return Response({"detail": "Área inválida."}, status=400)
        if centro.linhas.filter(nome__iexact=nome).exists():
            return Response({"detail": "Já existe essa linha neste centro."}, status=409)
        l = LinhaFaturamento.objects.create(centro=centro, nome=nome, area=area,
                                            ordem=centro.linhas.count())
        audit(request, "criar", "ef_linha", l.id, depois={"linha": str(l), "area": area})
        return Response({"id": str(l.id)}, status=status.HTTP_201_CREATED)

    l = LinhaFaturamento.objects.select_related("centro").filter(pk=pk).first()
    if not l:
        return Response(status=404)
    if request.method == "PATCH":
        antes = {"nome": l.nome, "area": l.area}
        if request.data.get("nome"):
            l.nome = request.data["nome"].strip()
        if request.data.get("area") in ("passivo", "credito", "especializada"):
            l.area = request.data["area"]
        l.save(update_fields=["nome", "area", "updated_at"])
        audit(request, "editar", "ef_linha", l.id, antes=antes,
              depois={"nome": l.nome, "area": l.area})
        return Response({"ok": True})
    # DELETE — linha com receita lançada não some (histórico é sagrado)
    tem_receita = any((f or {}).get("bruto") for f in (l.periodos or {}).values())
    if tem_receita:
        return Response({"detail": "Linha tem receita lançada — o histórico não pode ser "
                                   "excluído. Se ela foi descontinuada, é só tirar as equipes."},
                        status=409)
    audit(request, "excluir", "ef_linha", l.id, antes={"linha": str(l)})
    l.delete()
    return Response(status=204)


@api_view(["POST", "PATCH", "DELETE"])
@permission_classes(_PERM)
def equipe_crud(request, pk=None):
    from .models import DpCentroCusto

    if request.method == "POST":
        nome = (request.data.get("nome") or "").strip()
        grupo = request.data.get("grupo") or "passivo"
        if not nome:
            return Response({"detail": "Informe o nome da equipe."}, status=400)
        if grupo not in dict(Equipe.GRUPOS):
            return Response({"detail": "Grupo inválido."}, status=400)
        if Equipe.objects.filter(nome__iexact=nome).exists():
            return Response({"detail": "Já existe uma equipe com esse nome."}, status=409)
        import re
        import unicodedata
        base = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode()
        slug = re.sub(r"[^a-z0-9]+", "-", base.lower()).strip("-") or "equipe"
        if Equipe.objects.filter(slug=slug).exists():
            slug = f"{slug}-{Equipe.objects.count() + 1}"
        cc = DpCentroCusto.objects.filter(pk=request.data.get("centro_custo_id") or None).first()
        e = Equipe.objects.create(slug=slug, nome=nome, grupo=grupo, centro_custo=cc)
        audit(request, "criar", "ef_equipe", e.id,
              depois={"nome": nome, "grupo": grupo,
                      "centro_custo": cc.nome if cc else None})
        return Response({"id": str(e.id), "slug": slug}, status=status.HTTP_201_CREATED)

    e = Equipe.objects.filter(pk=pk).first()
    if not e:
        return Response(status=404)
    if request.method == "PATCH":
        antes = {"nome": e.nome, "grupo": e.grupo,
                 "centro_custo": e.centro_custo.nome if e.centro_custo_id else None}
        if request.data.get("nome"):
            e.nome = request.data["nome"].strip()
        if request.data.get("grupo") in dict(Equipe.GRUPOS):
            e.grupo = request.data["grupo"]
        if "centro_custo_id" in request.data:
            e.centro_custo = DpCentroCusto.objects.filter(
                pk=request.data.get("centro_custo_id") or None).first()
        e.save()
        audit(request, "editar", "ef_equipe", e.id, antes=antes,
              depois={"nome": e.nome, "grupo": e.grupo,
                      "centro_custo": e.centro_custo.nome if e.centro_custo_id else None})
        return Response({"ok": True})
    # DELETE — equipe alocada ou com gente enquadrada não some
    if e.alocacoes.exists():
        return Response({"detail": "Equipe está alocada — remova das linhas antes de excluir."},
                        status=409)
    if e.colaboradores.exists():
        return Response({"detail": "Equipe tem colaboradores enquadrados — mova as pessoas "
                                   "antes de excluir."}, status=409)
    audit(request, "excluir", "ef_equipe", e.id, antes={"nome": e.nome})
    e.delete()
    return Response(status=204)


# ─────────────────────────── PÁGINAS DE DETALHE ───────────────────────────

def _competencia_custo():
    """Última fechada; sem nenhuma, a mais recente (sinalizada como parcial)."""
    fechada = (DpCompetencia.objects.filter(status="fechada")
               .order_by("-ano", "-mes").first())
    if fechada:
        return fechada, False
    aberta = DpCompetencia.objects.order_by("-ano", "-mes").first()
    return aberta, aberta is not None


@api_view(["GET"])
@permission_classes(_PERM)
def centro_detalhe(request, pk):
    """A página do centro: série de receita mês a mês POR LINHA, alocações,
    custo real e margem — tudo que existe sobre aquele cliente."""
    from .models import DpColaborador

    c = CentroFaturamento.objects.filter(pk=pk).first()
    if not c:
        return Response(status=404)
    linhas = list(c.linhas.prefetch_related("alocacoes__equipe__centro_custo"))

    comp, custo_parcial = _competencia_custo()
    custo_cc = _custo_por_cc(comp)
    custo_eq = _custo_por_equipe(comp)
    soma_por_equipe = {}
    for a in Alocacao.objects.all():
        soma_por_equipe[a.equipe_id] = soma_por_equipe.get(a.equipe_id, 0) + (a.percentual or 0)

    def custo_alocacao(a):
        base = custo_eq.get(str(a.equipe_id))
        if not base:
            cc = a.equipe.centro_custo
            base = custo_cc.get(cc.nome) if cc else None
        if not base:
            return None, None, None
        soma = soma_por_equipe.get(a.equipe_id) or 0
        fator = ((a.percentual or 0) / soma) if soma else 0.0
        return (round(base["custo_total"] * fator, 2),
                round(base["a_pagar"] * fator, 2), base["pessoas"])

    # série mensal: total do centro + abertura por linha
    meses = sorted({per for l in linhas for per, f in (l.periodos or {}).items()
                    if (f or {}).get("bruto")})
    series = []
    for m in meses:
        por_linha = {l.nome: round((l.periodos or {}).get(m, {}).get("bruto", 0) or 0, 2)
                     for l in linhas}
        series.append({"mes": m, "total": round(sum(por_linha.values()), 2),
                       "por_linha": por_linha})

    ult = meses[-1] if meses else None
    saida_linhas = []
    custo_centro = pagar_centro = 0.0
    equipes_do_centro = {}
    for l in sorted(linhas, key=lambda x: x.ordem):
        alocs = []
        for a in sorted(l.alocacoes.all(), key=lambda x: -x.percentual):
            custo, pagar, pessoas = custo_alocacao(a)
            custo_centro += custo or 0
            pagar_centro += pagar or 0
            eqd = equipes_do_centro.setdefault(str(a.equipe_id), {
                "id": str(a.equipe_id), "nome": a.equipe.nome, "grupo": a.equipe.grupo,
                "custo_total": 0.0, "linhas": []})
            eqd["custo_total"] = round(eqd["custo_total"] + (custo or 0), 2)
            eqd["linhas"].append({"linha": l.nome, "percentual": a.percentual})
            alocs.append({"id": str(a.id), "equipe_id": str(a.equipe_id),
                          "equipe": a.equipe.nome, "percentual": a.percentual,
                          "custo_total": custo, "a_pagar": pagar, "pessoas": pessoas})
        receita_ult = round((l.periodos or {}).get(ult, {}).get("bruto", 0) or 0, 2) if ult else 0
        saida_linhas.append({
            "id": str(l.id), "nome": l.nome, "area": l.area, "ativo": l.ativo,
            "receita_ultimo": receita_ult,
            "receita_acumulada": round(sum((f or {}).get("bruto", 0) or 0
                                           for f in (l.periodos or {}).values()), 2),
            "soma_percentual": round(sum(a["percentual"] or 0 for a in alocs), 2),
            "alocacoes": alocs,
        })

    # pessoas nas equipes deste centro (enquadradas via DP)
    ids_eq = list(equipes_do_centro.keys())
    pessoas_por_eq = {}
    for r in (DpColaborador.objects.filter(status="ativo", equipe_ref_id__in=ids_eq)
              .values("equipe_ref_id")):
        k = str(r["equipe_ref_id"])
        pessoas_por_eq[k] = pessoas_por_eq.get(k, 0) + 1
    for k, d in equipes_do_centro.items():
        d["pessoas"] = pessoas_por_eq.get(k, 0)

    receita_ult_total = round(sum(l["receita_ultimo"] for l in saida_linhas), 2)
    return Response({
        "id": str(c.id), "nome": c.nome, "tipo": c.tipo,
        "periodo": ult, "meses": meses, "series": series,
        "linhas": saida_linhas,
        "equipes": sorted(equipes_do_centro.values(), key=lambda x: -x["custo_total"]),
        "receita_ultimo": receita_ult_total,
        "receita_acumulada": round(sum(l["receita_acumulada"] for l in saida_linhas), 2),
        "custo_total": round(custo_centro, 2),
        "a_pagar": round(pagar_centro, 2),
        "margem": round(receita_ult_total - custo_centro, 2),
        "competencia_custo": f"{comp.mes:02d}/{comp.ano}" if comp else None,
        "custo_parcial": custo_parcial,
    })


@api_view(["GET"])
@permission_classes(_PERM)
def equipe_detalhe(request, pk):
    """A página da equipe: QUEM ESTÁ NELA (pessoas do DP com cargo, salário e
    custo real da folha), onde está alocada e quanto de receita representa."""
    from .models import DpColaborador, DpFolhaItem as FI

    e = Equipe.objects.select_related("centro_custo").filter(pk=pk).first()
    if not e:
        return Response(status=404)

    comp, custo_parcial = _competencia_custo()
    folha = {}
    if comp:
        folha = {i["colaborador_id"]: i for i in
                 FI.objects.filter(competencia=comp)
                 .values("colaborador_id", "custo_total", "total_pagar",
                         "salario_bruto", "ferias_dias", "em_rescisao")}

    pessoas = []
    resumo_cargos = {}
    custo_total = pagar_total = 0.0
    qs = (DpColaborador.objects.filter(equipe_ref=e)
          .select_related("cargo", "centro_custo", "supervisor")
          .order_by("-status", "nome"))
    for cme in qs:
        fi = folha.get(cme.id, {})
        custo = round(fi.get("custo_total") or 0, 2)
        if cme.status == "ativo":
            custo_total += custo
            pagar_total += fi.get("total_pagar") or 0
            cargo = cme.cargo.nome if cme.cargo_id else "(sem cargo)"
            rc = resumo_cargos.setdefault(cargo, {"cargo": cargo, "n": 0, "custo": 0.0})
            rc["n"] += 1
            rc["custo"] = round(rc["custo"] + custo, 2)
        pessoas.append({
            "id": str(cme.id), "matricula": cme.matricula, "nome": cme.nome,
            "cargo": cme.cargo.nome if cme.cargo_id else None,
            "regime": cme.regime, "status": cme.status,
            "supervisor": cme.supervisor.nome if cme.supervisor_id else None,
            "salario_bruto": cme.salario_bruto,
            "custo_total": custo or None,
            "a_pagar": round(fi.get("total_pagar") or 0, 2) or None,
            "ferias_dias": fi.get("ferias_dias") or 0,
            "em_rescisao": bool(fi.get("em_rescisao")),
        })

    # onde a equipe está alocada + a receita que a participação representa
    alocs = []
    for a in (Alocacao.objects.filter(equipe=e)
              .select_related("linha__centro", "centro")):
        if a.linha:
            pers = {p for p, f in (a.linha.periodos or {}).items() if (f or {}).get("bruto")}
            ult = max(pers) if pers else None
            receita = (a.linha.periodos or {}).get(ult, {}).get("bruto", 0) if ult else 0
            alocs.append({"id": str(a.id), "tipo": "linha",
                          "centro": a.linha.centro.nome, "centro_id": str(a.linha.centro_id),
                          "destino": a.linha.nome, "area": a.linha.area,
                          "percentual": a.percentual,
                          "receita_participacao": round((receita or 0) * (a.percentual or 0) / 100, 2)})
        else:
            alocs.append({"id": str(a.id), "tipo": "centro",
                          "centro": a.centro.nome, "centro_id": str(a.centro_id),
                          "destino": a.centro.nome, "area": None,
                          "percentual": a.percentual, "receita_participacao": 0})

    ativos = [p for p in pessoas if p["status"] == "ativo"]
    return Response({
        "id": str(e.id), "nome": e.nome, "slug": e.slug, "grupo": e.grupo,
        "centro_custo": e.centro_custo.nome if e.centro_custo_id else None,
        "pessoas": pessoas,
        "resumo_cargos": sorted(resumo_cargos.values(), key=lambda x: -x["custo"]),
        "alocacoes": sorted(alocs, key=lambda x: -x["receita_participacao"]),
        "totais": {
            "ativos": len(ativos),
            "custo_total": round(custo_total, 2),
            "a_pagar": round(pagar_total, 2),
            "receita_participacao": round(sum(a["receita_participacao"] for a in alocs), 2),
        },
        "competencia_custo": f"{comp.mes:02d}/{comp.ano}" if comp else None,
        "custo_parcial": custo_parcial,
    })
