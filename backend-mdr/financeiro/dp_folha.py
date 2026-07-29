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
from datetime import date, datetime, timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .dp_calendario import calcular_dias_uteis
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
    fer_dias = int((lanc.ferias_dias if lanc else 0) or 0)
    fer_abono = int((lanc.ferias_abono_dias if lanc else 0) or 0)
    fer_inicio = (lanc.ferias_inicio if lanc else None)
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

    # VT e VA proporcionais às faltas DA competência: o benefício é diário, então
    # cada dia de falta desconta 1/dias_úteis do valor cheio (horas viram fração
    # de dia pela carga do cargo).
    dias_equiv = f_dias + (f_horas / (horas_ref / dias_ref) if horas_ref else 0)
    # dia de férias não gera vale: entra no mesmo rateio das faltas
    dias_equiv += fer_dias * (comp.dias_uteis / 30)
    fator_falta = min(dias_equiv / max(comp.dias_uteis, 1), 1.0) if dias_equiv else 0.0
    vt_faltas = round(vt * (1 - fator_falta), 2) if vt else 0.0
    va_faltas = round(va * (1 - fator_falta), 2) if va else 0.0
    if fator_falta:
        mem["beneficios_proporcionais"] = (
            f"{dias_equiv:.2f} dia(s) de falta ÷ {comp.dias_uteis} dias úteis = "
            f"{fator_falta:.1%} de desconto no VT e no VA")

    # ── FÉRIAS DO MÊS ──────────────────────────────────────────────────────
    # Os dias de férias saem do salário (não se trabalha) e voltam como
    # remuneração de férias + 1/3 constitucional. O abono pecuniário (venda de
    # até 1/3 do período) é indenizatório: entra no pagamento e NÃO sofre INSS.
    # Estagiário tira RECESSO: recebe a bolsa cheia, sem 1/3 e sem INSS.
    # Associado/PJ não têm direito legal — a marcação fica só como ausência.
    fer_valor = fer_terco = fer_abono_valor = 0.0
    fer_fim = None
    if fer_dias > 0:
        fer_dias = min(fer_dias, 30)
        diaria = bruto / 30
        if fer_inicio:
            fer_fim = fer_inicio + timedelta(days=fer_dias - 1)
        if clt:
            fer_valor = round(diaria * fer_dias, 2)
            fer_terco = round(fer_valor / 3, 2)
            # os dias de férias saem do salário do mês
            desc_faltas = round(desc_faltas + diaria * fer_dias, 2)
            sal_faltas = round(bruto - desc_faltas, 2)
            mem["ferias"] = (f"{fer_dias} dia(s) × ({bruto}/30) = {fer_valor} "
                             f"+ 1/3 constitucional = {fer_terco}")
            if fer_abono > 0:
                fer_abono = min(fer_abono, 10)   # teto legal: 1/3 do período
                base_abono = round(diaria * fer_abono, 2)
                fer_abono_valor = round(base_abono + base_abono / 3, 2)
                mem["ferias_abono"] = (f"abono pecuniário: {fer_abono} dia(s) vendido(s) × "
                                       f"({bruto}/30) + 1/3 = {fer_abono_valor} (sem INSS)")
        elif estagiario:
            # recesso remunerado: a bolsa é paga cheia, nada é descontado
            fer_valor = 0.0
            mem["ferias"] = f"recesso de {fer_dias} dia(s) — bolsa paga integralmente"
        else:
            mem["ferias"] = (f"{fer_dias} dia(s) de ausência programada — "
                             f"contrato sem direito legal a férias")

    # INSS (só CLT) — tabela da vigência.
    # Férias têm tributação PRÓPRIA, separada do salário: por isso duas contas.
    if clt:
        desc_inss, mem_inss = calcular_inss(sal_faltas, fiscal.inss_faixas)
        mem["inss"] = mem_inss
        if fer_valor:
            inss_fer, mem_inss_fer = calcular_inss(fer_valor + fer_terco, fiscal.inss_faixas)
            desc_inss = round(desc_inss + inss_fer, 2)
            mem["inss_ferias"] = mem_inss_fer
    else:
        desc_inss = 0.0

    # VT 6% (só CLT que opta)
    desc_vt = round(sal_faltas * fiscal.vt_percent, 2) if (clt and colab.opta_vt and vt > 0) else 0.0
    if desc_vt:
        mem["desc_vt"] = f"{sal_faltas}×{fiscal.vt_percent:.0%}"

    sal_desc = round(sal_faltas - desc_inss - desc_vt, 2)
    # TOTAL a pagar = salário c/ descontos + VT + VA + saldo livre + acerto + prêmios
    total_pagar = round(sal_desc + vt_faltas + va_faltas + saldo + acerto + premio
                        + fer_valor + fer_terco + fer_abono_valor, 2)

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
        "ferias_dias": fer_dias, "ferias_valor": fer_valor, "ferias_terco": fer_terco,
        "ferias_abono": fer_abono_valor, "ferias_inicio": fer_inicio, "ferias_fim": fer_fim,
        "inss_patronal": patronal, "custo_provisoes": provisoes,
        "custo_total": round(total_pagar + provisoes + patronal, 2),
        "memoria": mem,
        "ajuste_manual": ajustada,
        "ajuste_motivo": (lanc.ajuste_motivo if lanc else "") or "",
        # marca a linha de quem sai neste mês (espelha a "Obs. Rescisão" da planilha)
        "em_rescisao": bool(colab.data_demissao and colab.data_demissao.year == comp.ano
                            and colab.data_demissao.month == comp.mes),
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
        "calendario": calcular_dias_uteis(c.ano, c.mes),
        "em_rescisao": c.itens.filter(em_rescisao=True).count(),
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
        cal = calcular_dias_uteis(ano, mes)
        comp = DpCompetencia.objects.create(
            ano=ano, mes=mes,
            dias_mes=int(request.data.get("dias_mes") or 30),
            # sugestão automática pelo calendário (o operador pode sobrescrever)
            dias_uteis=int(request.data.get("dias_uteis") or cal["dias_uteis"]),
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

    @action(detail=False, methods=["get"])
    def calendario(self, request):
        """Dias úteis sugeridos para ano/mês (com a lista de feriados)."""
        try:
            ano = int(request.query_params.get("ano"))
            mes = int(request.query_params.get("mes"))
        except (TypeError, ValueError):
            return Response({"detail": "Informe ano e mês."}, status=400)
        return Response(calcular_dias_uteis(ano, mes))

    @action(detail=True, methods=["post"])
    def ajustar_dias(self, request, pk=None):
        """Corrige os dias do mês / dias úteis da competência e recalcula."""
        comp = DpCompetencia.objects.get(pk=pk)
        if comp.status == "fechada":
            return Response({"detail": "Competência fechada."}, status=409)
        antes = {"dias_mes": comp.dias_mes, "dias_uteis": comp.dias_uteis}
        try:
            comp.dias_mes = int(request.data.get("dias_mes") or comp.dias_mes)
            comp.dias_uteis = int(request.data.get("dias_uteis") or comp.dias_uteis)
        except (TypeError, ValueError):
            return Response({"detail": "Valores inválidos."}, status=400)
        comp.save()
        recalcular(comp)
        audit(request, "editar", "dp_competencia", comp.id, antes=antes,
              depois={"dias_mes": comp.dias_mes, "dias_uteis": comp.dias_uteis})
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
        premiacoes, acerto_contabil, obs, ferias_inicio, ferias_dias,
        ferias_abono_dias} e recálculo da linha."""
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

        def inteiro(k):
            try:
                return int(float(request.data.get(k) or 0))
            except (TypeError, ValueError):
                return 0

        def data(k):
            v = (request.data.get(k) or "").strip()
            if not v:
                return None
            try:
                return datetime.strptime(v, "%Y-%m-%d").date()
            except ValueError:
                return None

        # o lançamento é UM por pessoa/mês: só mexe no que veio no corpo, pra
        # lançar férias não apagar as faltas já registradas (e vice-versa)
        lanc, _ = DpLancamento.objects.get_or_create(competencia=comp, colaborador=colab)
        campos = {"faltas_dias": num, "faltas_horas": num, "premiacoes": num,
                  "acerto_contabil": num, "ferias_dias": inteiro,
                  "ferias_abono_dias": inteiro, "ferias_inicio": data}
        for campo, conv in campos.items():
            if campo in request.data:
                setattr(lanc, campo, conv(campo))
        if "obs" in request.data:
            lanc.obs = request.data.get("obs") or ""
        lanc.save()
        fiscal = tabela_fiscal_para(comp.ano, comp.mes)
        d = calcular_item(colab, lanc, comp, fiscal)
        DpFolhaItem.objects.update_or_create(competencia=comp, colaborador=colab, defaults=d)
        audit(request, "lancar", "dp_lancamento", lanc.id, colaborador=colab,
              depois={"colaborador": colab.nome, "faltas_dias": lanc.faltas_dias,
                      "faltas_horas": lanc.faltas_horas, "premiacoes": lanc.premiacoes,
                      "acerto": lanc.acerto_contabil, "ferias_dias": lanc.ferias_dias,
                      "ferias_inicio": str(lanc.ferias_inicio or ""),
                      "ferias_abono_dias": lanc.ferias_abono_dias})
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
                  "custo_total", "ajuste_manual", "ajuste_motivo", "vt", "va", "cargo_nome",
                  "em_rescisao", "salario_com_faltas", "salario_com_descontos",
                  "ferias_dias", "ferias_valor", "ferias_terco", "ferias_abono",
                  "ferias_inicio", "ferias_fim"]
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
        """Resumo do Centro de Custo por setor — espelha a aba CC da planilha e é
        a base da integração com o faturamento (custo de pessoal por carteira).

        Devolve por centro de custo: headcount, salários, VT, VA, saldo livre,
        prêmios, acertos, INSS patronal, custo mensal, % do custo total, provisões
        detalhadas (13º, férias, 1/3, FGTS, multa, recesso) e o total.
        """
        from django.db.models import Count, Sum

        comp = DpCompetencia.objects.get(pk=pk)
        itens = filtrar_folha(comp.itens.all(), request.user)
        agrega = dict(
            headcount=Count("id"), salarios=Sum("salario_bruto"),
            vt=Sum("vt_com_faltas"), va=Sum("va_com_faltas"), saldo_livre=Sum("saldo_livre"),
            premios=Sum("premiacoes"), acertos=Sum("acerto_contabil"),
            folha=Sum("total_pagar"), patronal=Sum("inss_patronal"),
            decimo=Sum("decimo_mensal"), ferias=Sum("ferias_mensal"),
            terco=Sum("terco_ferias_mensal"), fgts=Sum("fgts_mensal"),
            multa=Sum("multa_fgts_mensal"), recesso=Sum("recesso_mensal"),
            provisoes=Sum("custo_provisoes"), custo=Sum("custo_total"),
        )
        linhas = list(itens.values("centro_custo_nome").annotate(**agrega).order_by("-custo"))
        total_geral = sum(l["custo"] or 0 for l in linhas) or 1

        # hierarquia: cada CC sabe seu núcleo (para somar por grupo no financeiro)
        from .models import DpCentroCusto
        pais = {c.nome: (c.pai.nome if c.pai_id else c.nome)
                for c in DpCentroCusto.objects.select_related("pai").all()}

        def limpa(l):
            nome = l["centro_custo_nome"]
            return {
                "centro_custo_nome": nome,
                "nucleo": pais.get(nome, nome),
                "headcount": l["headcount"],
                "salarios": round(l["salarios"] or 0, 2),
                "vt": round(l["vt"] or 0, 2), "va": round(l["va"] or 0, 2),
                "saldo_livre": round(l["saldo_livre"] or 0, 2),
                "premios": round(l["premios"] or 0, 2),
                "acertos": round(l["acertos"] or 0, 2),
                "folha": round(l["folha"] or 0, 2),
                "patronal": round(l["patronal"] or 0, 2),
                "decimo": round(l["decimo"] or 0, 2), "ferias": round(l["ferias"] or 0, 2),
                "terco": round(l["terco"] or 0, 2), "fgts": round(l["fgts"] or 0, 2),
                "multa_fgts": round(l["multa"] or 0, 2), "recesso": round(l["recesso"] or 0, 2),
                "provisoes": round(l["provisoes"] or 0, 2),
                "custo": round(l["custo"] or 0, 2),
                "percentual": round((l["custo"] or 0) / total_geral * 100, 1),
            }

        detalhado = [limpa(l) for l in linhas]

        # consolidado por núcleo (ADM, Autor, Réu…) — o corte que o faturamento usa
        por_nucleo = {}
        for l in detalhado:
            n = por_nucleo.setdefault(l["nucleo"], {
                "nucleo": l["nucleo"], "headcount": 0, "folha": 0.0,
                "provisoes": 0.0, "patronal": 0.0, "custo": 0.0, "centros": 0})
            n["headcount"] += l["headcount"]
            n["centros"] += 1
            for k in ("folha", "provisoes", "patronal", "custo"):
                n[k] = round(n[k] + l[k], 2)
        for n in por_nucleo.values():
            n["percentual"] = round(n["custo"] / total_geral * 100, 1)

        totais = {k: round(sum(l[k] for l in detalhado), 2) for k in
                  ("salarios", "vt", "va", "saldo_livre", "premios", "acertos", "folha",
                   "patronal", "decimo", "ferias", "terco", "fgts", "multa_fgts",
                   "recesso", "provisoes", "custo")}
        totais["headcount"] = sum(l["headcount"] for l in detalhado)
        return Response({"linhas": detalhado,
                         "nucleos": sorted(por_nucleo.values(), key=lambda x: -x["custo"]),
                         "totais": totais})

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
        audit(request, "ajuste_pontual", "dp_folha_item", lanc.id, colaborador=colab,
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
        # CONGELA o retrato da operação: quem estava em qual equipe e como as
        # equipes estavam alocadas. Sem isso, mexer no enquadramento hoje
        # reescreveria a margem de um mês já fechado.
        from .models_estrutura import congelar_competencia
        n_pessoas, n_alocacoes = congelar_competencia(comp)
        audit(request, "fechar_competencia", "dp_competencia", comp.id,
              depois={"fechada_por": comp.fechada_por,
                      "foto_enquadramentos": n_pessoas,
                      "foto_alocacoes": n_alocacoes})
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
        # Reabriu: a foto sai e volta a valer o estado ao vivo — ela é tirada
        # de novo no próximo fechamento.
        from .models_estrutura import descongelar_competencia
        descongelar_competencia(comp)
        audit(request, "reabrir_competencia", "dp_competencia", comp.id,
              depois={"justificativa": just, "foto": "descongelada"})
        return Response(_comp_row(comp))
