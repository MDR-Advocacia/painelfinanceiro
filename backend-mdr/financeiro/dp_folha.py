# Módulo Controle de Pessoal (DP) — F2: competência mensal + MOTOR DE CÁLCULO.
#
# O motor espelha a planilha do DP com as correções do estudo
# (docs/controle-pessoal-plano.md):
#   • INSS: progressivo OFICIAL com parcela a deduzir (a planilha tinha um bug
#     de lookup que pegava a faixa errada) e teto na última faixa.
#   • Provisões: base configurável na tabela fiscal ("bruto_menos_inss" espelha
#     a planilha; "bruto" é o padrão contábil) — decisão pendente com o DP.
#   • VT com faltas: desconta as faltas DA PRÓPRIA competência (a planilha
#     referenciava o mês defasado — confirmar com o DP; se for regra, muda aqui).
# Cada linha carrega `memoria` (como cada número foi obtido).
from datetime import date

from django.db import transaction
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .dp_escopo import filtrar_folha
from .dp_views import _quem, audit
from .models import (
    DpColaborador, DpCompetencia, DpFolhaItem, DpLancamento, DpTabelaFiscal,
)
from .views import modulo_permission

_PERM = [modulo_permission(read_any=["pessoal"], write="pessoal")]

MES_NOMES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
             "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]


# ─────────────────────────────── MOTOR ───────────────────────────────

def tabela_fiscal_para(ano: int, mes: int) -> DpTabelaFiscal:
    ref = date(ano, mes, 1)
    t = DpTabelaFiscal.objects.filter(vigencia_inicio__lte=ref).order_by("-vigencia_inicio").first()
    if t is None:
        raise ValueError("Nenhuma tabela fiscal cadastrada — cadastre a vigência em Configurações.")
    return t


def calcular_inss(salario: float, faixas: list) -> tuple:
    """INSS progressivo (parcela a deduzir). Acima do teto (última faixa), o
    desconto trava no máximo. Retorna (valor, memoria)."""
    if salario <= 0 or not faixas:
        return 0.0, {"regra": "sem salário ou sem tabela"}
    for fx in faixas:
        if salario <= fx["ate"]:
            v = round(salario * fx["aliquota"] - fx["deducao"], 2)
            return max(v, 0.0), {"faixa_ate": fx["ate"], "aliquota": fx["aliquota"],
                                 "deducao": fx["deducao"], "conta": f"{salario}×{fx['aliquota']}−{fx['deducao']}"}
    ultima = faixas[-1]
    teto = round(ultima["ate"] * ultima["aliquota"] - ultima["deducao"], 2)
    return teto, {"regra": "acima do teto", "teto_desconto": teto}


def calcular_item(colab: DpColaborador, lanc, comp: DpCompetencia, fiscal: DpTabelaFiscal) -> dict:
    """Pipeline por colaborador — as colunas da planilha, com memória de cálculo."""
    # ajuste pontual do mês tem precedência sobre a ficha (não altera o cadastro)
    def _ov(campo, padrao):
        v = getattr(lanc, campo, None) if lanc else None
        return padrao if v is None else v

    bruto = _ov("salario_override", colab.salario_bruto or 0.0)
    vt = _ov("vt_override", colab.vt or 0.0)
    va = _ov("va_override", colab.va or 0.0)
    saldo = _ov("saldo_livre_override", colab.saldo_livre or 0.0)
    ajustada = bool(lanc and (lanc.salario_override is not None or lanc.vt_override is not None
                              or lanc.va_override is not None or lanc.saldo_livre_override is not None))
    f_dias = (lanc.faltas_dias if lanc else 0.0) or 0.0
    f_horas = (lanc.faltas_horas if lanc else 0.0) or 0.0
    premio = (lanc.premiacoes if lanc else 0.0) or 0.0
    acerto = (lanc.acerto_contabil if lanc else 0.0) or 0.0
    clt = colab.regime == "clt"
    estagiario = colab.regime == "estagiario"
    mem = {}

    # Faltas: (salário/30)·dias + (salário/220)·horas — regra da planilha
    dias_ref = colab.cargo.dias_mes if colab.cargo_id else 30
    horas_ref = colab.cargo.carga_horaria_mes if colab.cargo_id else 220
    desc_faltas = round((bruto / dias_ref) * f_dias + (bruto / horas_ref) * f_horas, 2)
    if desc_faltas:
        mem["desc_faltas"] = f"({bruto}/{dias_ref})×{f_dias} + ({bruto}/{horas_ref})×{f_horas}"
    sal_faltas = round(bruto - desc_faltas, 2)

    # VT proporcional às faltas DA competência (ver nota no topo do arquivo)
    vt_faltas = round(vt - (vt / max(comp.dias_uteis, 1)) * f_dias, 2) if vt else 0.0
    va_faltas = va

    # INSS (só CLT) — tabela da vigência
    if clt:
        desc_inss, mem_inss = calcular_inss(sal_faltas, fiscal.inss_faixas)
        mem["inss"] = mem_inss
    else:
        desc_inss = 0.0

    # VT 6% (só CLT que opta)
    desc_vt = round(sal_faltas * fiscal.vt_percent, 2) if (clt and colab.opta_vt and vt > 0) else 0.0
    if desc_vt:
        mem["desc_vt"] = f"{sal_faltas}×{fiscal.vt_percent:.0%}"

    sal_desc = round(sal_faltas - desc_inss - desc_vt, 2)
    # TOTAL a pagar = salário c/ descontos + VT + VA + saldo livre + acerto + prêmios
    total_pagar = round(sal_desc + vt_faltas + va_faltas + saldo + acerto + premio, 2)

    # Provisões
    if clt:
        base_prov = (bruto - desc_inss) if fiscal.provisao_base == "bruto_menos_inss" else bruto
        decimo = round(base_prov / 12, 2)
        ferias = round(base_prov / 12, 2)
        terco = round(ferias / 3, 2)
        fgts = round(bruto * fiscal.fgts_percent, 2)
        multa = round(fgts * fiscal.multa_fgts_percent, 2)
        recesso = 0.0
        patronal = round(bruto * fiscal.inss_patronal_percent, 2)
        mem["provisoes"] = {"base": fiscal.provisao_base, "valor_base": round(base_prov, 2),
                            "fgts": f"{bruto}×{fiscal.fgts_percent:.0%}",
                            "patronal": f"{bruto}×{fiscal.inss_patronal_percent:.0%}"}
    elif estagiario:
        decimo = ferias = terco = fgts = multa = patronal = 0.0
        recesso = round(bruto / 12, 2)
        mem["provisoes"] = {"recesso": f"{bruto}/12 (recesso de estagiário)"}
    else:  # associado / pj — sem encargos
        decimo = ferias = terco = fgts = multa = recesso = patronal = 0.0

    provisoes = round(decimo + ferias + terco + fgts + multa + recesso, 2)
    return {
        "matricula": colab.matricula, "nome": colab.nome, "regime": colab.regime,
        "cargo_nome": (colab.cargo.nome if getattr(colab, "cargo_id", None) else "") or "",
        "centro_custo_nome": colab.centro_custo.nome if colab.centro_custo_id else "",
        "salario_bruto": bruto, "vt": vt, "va": va, "saldo_livre": saldo,
        "faltas_dias": f_dias, "faltas_horas": f_horas,
        "premiacoes": premio, "acerto_contabil": acerto,
        "desc_faltas": desc_faltas, "salario_com_faltas": sal_faltas,
        "vt_com_faltas": vt_faltas, "va_com_faltas": va_faltas,
        "desc_inss": desc_inss, "desc_vt": desc_vt,
        "salario_com_descontos": sal_desc, "total_pagar": total_pagar,
        "decimo_mensal": decimo, "ferias_mensal": ferias, "terco_ferias_mensal": terco,
        "fgts_mensal": fgts, "multa_fgts_mensal": multa, "recesso_mensal": recesso,
        "inss_patronal": patronal, "custo_provisoes": provisoes,
        "custo_total": round(total_pagar + provisoes + patronal, 2),
        "memoria": mem,
        "ajuste_manual": ajustada,
        "ajuste_motivo": (lanc.ajuste_motivo if lanc else "") or "",
    }


def elegiveis(comp: DpCompetencia):
    """Ativos + desligados DENTRO ou DEPOIS da competência (o mês do desligamento
    ainda entra na folha, como na planilha)."""
    inicio = date(comp.ano, comp.mes, 1)
    from django.db.models import Q
    return DpColaborador.objects.select_related("centro_custo", "cargo").filter(
        Q(status="ativo") | Q(data_demissao__gte=inicio)
    ).exclude(data_admissao__gt=date(comp.ano, comp.mes, 28))


@transaction.atomic
def recalcular(comp: DpCompetencia) -> int:
    fiscal = tabela_fiscal_para(comp.ano, comp.mes)
    lancs = {l.colaborador_id: l for l in comp.lancamentos.all()}
    comp.itens.all().delete()
    itens = []
    for colab in elegiveis(comp):
        d = calcular_item(colab, lancs.get(colab.id), comp, fiscal)
        itens.append(DpFolhaItem(competencia=comp, colaborador=colab, **d))
    DpFolhaItem.objects.bulk_create(itens, batch_size=500)
    return len(itens)


# ─────────────────────────────── VIEWS ───────────────────────────────

def _comp_row(c: DpCompetencia) -> dict:
    return {
        "id": str(c.id), "ano": c.ano, "mes": c.mes, "mes_nome": MES_NOMES[c.mes],
        "dias_mes": c.dias_mes, "dias_uteis": c.dias_uteis, "status": c.status,
        "aberta_por": c.aberta_por, "enviada_revisao_por": c.enviada_revisao_por,
        "fechada_por": c.fechada_por,
        "fechada_em": c.fechada_em.isoformat() if c.fechada_em else None,
        "total_itens": c.itens.count(),
    }


class DpCompetenciaViewSet(viewsets.ViewSet):
    """Esteira da folha mensal. Fechada = intocável (reabrir exige justificativa)."""
    permission_classes = _PERM

    def list(self, request):
        return Response([_comp_row(c) for c in DpCompetencia.objects.all()[:36]])

    def create(self, request):
        """Abre a competência {ano, mes, dias_mes?, dias_uteis?} e calcula a 1ª prévia."""
        try:
            ano, mes = int(request.data.get("ano")), int(request.data.get("mes"))
            assert 1 <= mes <= 12 and 2020 <= ano <= 2100
        except (TypeError, ValueError, AssertionError):
            return Response({"detail": "Informe ano e mês válidos."}, status=400)
        if DpCompetencia.objects.filter(ano=ano, mes=mes).exists():
            return Response({"detail": f"{mes:02d}/{ano} já existe."}, status=400)
        comp = DpCompetencia.objects.create(
            ano=ano, mes=mes,
            dias_mes=int(request.data.get("dias_mes") or 30),
            dias_uteis=int(request.data.get("dias_uteis") or 22),
            aberta_por=_quem(request),
        )
        try:
            n = recalcular(comp)
        except ValueError as e:
            comp.delete()
            return Response({"detail": str(e)}, status=400)
        audit(request, "abrir_competencia", "dp_competencia", comp.id,
              depois={"ano": ano, "mes": mes, "itens": n})
        return Response(_comp_row(comp), status=status.HTTP_201_CREATED)

    def retrieve(self, request, pk=None):
        comp = DpCompetencia.objects.filter(pk=pk).first()
        if not comp:
            return Response(status=404)
        return Response(_comp_row(comp))

    @action(detail=True, methods=["post"])
    def recalcular(self, request, pk=None):
        comp = DpCompetencia.objects.get(pk=pk)
        if comp.status == "fechada":
            return Response({"detail": "Competência fechada — reabra pra recalcular."}, status=409)
        n = recalcular(comp)
        audit(request, "recalcular", "dp_competencia", comp.id, depois={"itens": n})
        return Response({"itens": n})

    @action(detail=True, methods=["post"])
    def lancar(self, request, pk=None):
        """Upsert de lançamento {colaborador_id, faltas_dias, faltas_horas,
        premiacoes, acerto_contabil, obs} e recálculo da linha."""
        comp = DpCompetencia.objects.get(pk=pk)
        if comp.status == "fechada":
            return Response({"detail": "Competência fechada."}, status=409)
        colab = DpColaborador.objects.filter(pk=request.data.get("colaborador_id")).first()
        if not colab:
            return Response({"detail": "Colaborador não encontrado."}, status=400)

        def num(k):
            try:
                return float(request.data.get(k) or 0)
            except (TypeError, ValueError):
                return 0.0

        lanc, _ = DpLancamento.objects.update_or_create(
            competencia=comp, colaborador=colab,
            defaults={"faltas_dias": num("faltas_dias"), "faltas_horas": num("faltas_horas"),
                      "premiacoes": num("premiacoes"), "acerto_contabil": num("acerto_contabil"),
                      "obs": request.data.get("obs") or ""})
        fiscal = tabela_fiscal_para(comp.ano, comp.mes)
        d = calcular_item(colab, lanc, comp, fiscal)
        DpFolhaItem.objects.update_or_create(competencia=comp, colaborador=colab, defaults=d)
        audit(request, "lancar", "dp_lancamento", lanc.id,
              depois={"colaborador": colab.nome, "faltas_dias": lanc.faltas_dias,
                      "faltas_horas": lanc.faltas_horas, "premiacoes": lanc.premiacoes,
                      "acerto": lanc.acerto_contabil})
        return Response(d)

    @action(detail=True, methods=["get"])
    def itens(self, request, pk=None):
        """Grid da folha: ?busca ?regime ?cc(nome) ?limit ?offset → {total, totais, items}."""
        comp = DpCompetencia.objects.get(pk=pk)
        qs = filtrar_folha(comp.itens.all(), request.user)
        if request.query_params.get("busca"):
            qs = qs.filter(nome__icontains=request.query_params["busca"])
        if request.query_params.get("regime"):
            qs = qs.filter(regime=request.query_params["regime"])
        if request.query_params.get("cc"):
            # aceita id do centro de custo e traz junto os subnúcleos (subárvore)
            from .models import DpCentroCusto
            cc = DpCentroCusto.objects.filter(pk=request.query_params["cc"]).first()
            if cc:
                nomes = list(DpCentroCusto.objects.filter(id__in=cc.descendentes_ids())
                             .values_list("nome", flat=True))
                qs = qs.filter(centro_custo_nome__in=nomes)
            else:
                qs = qs.filter(centro_custo_nome=request.query_params["cc"])
        total = qs.count()
        from django.db.models import Sum
        ag = qs.aggregate(pagar=Sum("total_pagar"), prov=Sum("custo_provisoes"),
                          patronal=Sum("inss_patronal"), custo=Sum("custo_total"))
        try:
            limit = min(int(request.query_params.get("limit", 50)), 500)
            offset = max(int(request.query_params.get("offset", 0)), 0)
        except ValueError:
            limit, offset = 50, 0
        campos = ["matricula", "nome", "regime", "centro_custo_nome", "salario_bruto",
                  "faltas_dias", "faltas_horas", "desc_faltas", "desc_inss", "desc_vt",
                  "vt_com_faltas", "va_com_faltas", "saldo_livre", "premiacoes",
                  "acerto_contabil", "total_pagar", "custo_provisoes", "inss_patronal",
                  "custo_total", "ajuste_manual", "ajuste_motivo", "vt", "va", "cargo_nome"]
        items = []
        for it in qs[offset:offset + limit]:
            row = {k: getattr(it, k) for k in campos}
            row["id"] = str(it.id)
            row["colaborador_id"] = str(it.colaborador_id)
            row["memoria"] = it.memoria
            items.append(row)
        return Response({"total": total, "items": items, "totais": {
            "total_pagar": round(ag["pagar"] or 0, 2), "provisoes": round(ag["prov"] or 0, 2),
            "inss_patronal": round(ag["patronal"] or 0, 2), "custo_total": round(ag["custo"] or 0, 2),
        }})

    @action(detail=True, methods=["get"])
    def rateio(self, request, pk=None):
        """Rateio por Centro de Custo (o fechamento do financeiro)."""
        comp = DpCompetencia.objects.get(pk=pk)
        from django.db.models import Count, Sum
        linhas = (filtrar_folha(comp.itens.all(), request.user).values("centro_custo_nome")
                  .annotate(headcount=Count("id"), folha=Sum("total_pagar"),
                            provisoes=Sum("custo_provisoes"), patronal=Sum("inss_patronal"),
                            custo=Sum("custo_total"))
                  .order_by("-custo"))
        return Response([{**l, "folha": round(l["folha"] or 0, 2),
                          "provisoes": round(l["provisoes"] or 0, 2),
                          "patronal": round(l["patronal"] or 0, 2),
                          "custo": round(l["custo"] or 0, 2)} for l in linhas])

    @action(detail=True, methods=["post"])
    def enviar_revisao(self, request, pk=None):
        comp = DpCompetencia.objects.get(pk=pk)
        if comp.status != "aberta":
            return Response({"detail": f"Status atual: {comp.status}."}, status=409)
        comp.status = "em_revisao"
        comp.enviada_revisao_por = _quem(request)
        comp.save()
        audit(request, "enviar_revisao", "dp_competencia", comp.id)
        return Response(_comp_row(comp))

    @action(detail=True, methods=["post"])
    def desfazer_revisao(self, request, pk=None):
        """Volta de \"Em revisão\" para \"Aberta\" (o operador percebeu que faltava
        algo antes de alguém aprovar). Fica registrado na auditoria."""
        comp = DpCompetencia.objects.get(pk=pk)
        if comp.status != "em_revisao":
            return Response({"detail": f"A competência está {comp.status}."}, status=409)
        quem_enviou = comp.enviada_revisao_por
        comp.status = "aberta"
        comp.enviada_revisao_por = ""
        comp.save()
        audit(request, "desfazer_revisao", "dp_competencia", comp.id,
              antes={"status": "em_revisao"},
              depois={"status": "aberta", "enviada_revisao_por": quem_enviou})
        return Response(_comp_row(comp))

    @action(detail=True, methods=["post"])
    def ajustar(self, request, pk=None):
        """AJUSTE PONTUAL de um colaborador NESTA competência (só com a folha
        aberta). Não altera a ficha: o valor vale só neste mês, exige MOTIVO e
        fica destacado na auditoria.

        Body: {colaborador_id, salario?, vt?, va?, saldo_livre?, motivo}
        Campo ausente/null = volta a usar o valor da ficha.
        """
        comp = DpCompetencia.objects.get(pk=pk)
        if comp.status != "aberta":
            return Response(
                {"detail": "Ajuste pontual só com a competência ABERTA. "
                           "Desfaça o envio à revisão (ou reabra) antes."}, status=409)
        colab = DpColaborador.objects.filter(pk=request.data.get("colaborador_id")).first()
        if not colab:
            return Response({"detail": "Colaborador não encontrado."}, status=400)
        motivo = (request.data.get("motivo") or "").strip()
        if len(motivo) < 5:
            return Response({"detail": "Explique o motivo do ajuste (mínimo 5 caracteres)."},
                            status=400)

        def num_ou_none(k):
            v = request.data.get(k, "__ausente__")
            if v in ("__ausente__", None, ""):
                return None
            try:
                return float(v)
            except (TypeError, ValueError):
                return None

        lanc, _ = DpLancamento.objects.get_or_create(competencia=comp, colaborador=colab)
        antes = {"salario_bruto": lanc.salario_override if lanc.salario_override is not None else colab.salario_bruto,
                 "vt": lanc.vt_override if lanc.vt_override is not None else colab.vt,
                 "va": lanc.va_override if lanc.va_override is not None else colab.va,
                 "saldo_livre": lanc.saldo_livre_override if lanc.saldo_livre_override is not None else colab.saldo_livre}
        lanc.salario_override = num_ou_none("salario")
        lanc.vt_override = num_ou_none("vt")
        lanc.va_override = num_ou_none("va")
        lanc.saldo_livre_override = num_ou_none("saldo_livre")
        lanc.ajuste_motivo = motivo
        lanc.ajuste_autor = _quem(request)
        lanc.ajuste_em = timezone.now()
        lanc.save()

        fiscal = tabela_fiscal_para(comp.ano, comp.mes)
        d = calcular_item(colab, lanc, comp, fiscal)
        DpFolhaItem.objects.update_or_create(competencia=comp, colaborador=colab, defaults=d)

        depois = {"salario_bruto": d["salario_bruto"], "vt": d["vt"], "va": d["va"],
                  "saldo_livre": d["saldo_livre"]}
        audit(request, "ajuste_pontual", "dp_folha_item", lanc.id,
              antes={**antes, "colaborador": colab.nome},
              depois={**depois, "colaborador": colab.nome, "competencia": f"{comp.mes:02d}/{comp.ano}",
                      "motivo": motivo})
        return Response(d)

    @action(detail=True, methods=["post"])
    def aprovar(self, request, pk=None):
        """Fecha a competência. 4-OLHOS: o aprovador precisa ser DIFERENTE de quem
        enviou pra revisão."""
        comp = DpCompetencia.objects.get(pk=pk)
        if comp.status != "em_revisao":
            return Response({"detail": "Envie pra revisão antes de fechar."}, status=409)
        if _quem(request) == comp.enviada_revisao_por:
            return Response(
                {"detail": "Aprovação 4-olhos: quem enviou pra revisão não pode fechar. "
                           "Peça a outro usuário com edição no módulo."}, status=403)
        comp.status = "fechada"
        comp.fechada_por = _quem(request)
        comp.fechada_em = timezone.now()
        comp.save()
        audit(request, "fechar_competencia", "dp_competencia", comp.id,
              depois={"fechada_por": comp.fechada_por})
        return Response(_comp_row(comp))

    @action(detail=True, methods=["post"])
    def reabrir(self, request, pk=None):
        comp = DpCompetencia.objects.get(pk=pk)
        just = (request.data.get("justificativa") or "").strip()
        if comp.status != "fechada":
            return Response({"detail": "Só competência fechada se reabre."}, status=409)
        if len(just) < 10:
            return Response({"detail": "Justificativa obrigatória (mín. 10 caracteres)."}, status=400)
        comp.status = "aberta"
        comp.enviada_revisao_por = ""
        comp.fechada_por = ""
        comp.fechada_em = None
        comp.save()
        audit(request, "reabrir_competencia", "dp_competencia", comp.id,
              depois={"justificativa": just})
        return Response(_comp_row(comp))
