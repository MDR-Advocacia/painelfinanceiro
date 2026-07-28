# DP — Previsão de gastos: projeção, aprovisionamento e SIMULAÇÃO de cenários.
#
#   • GET  /dp/projecao/?meses=12&reajuste=0.05        projeção do custo + provisões acumuladas
#   • POST /dp/simular/                                cenário what-if (stateless, não grava)
#   • CRUD /dp/tabelas-fiscais/                        parâmetros editáveis por vigência
#
# A simulação reusa o MESMO motor da folha (dp_folha.calcular_item) — o número
# projetado é calculado com as mesmas regras do fechamento real, não com uma
# fórmula paralela que envelhece.
from datetime import date

from rest_framework import viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .dp_folha import calcular_item, elegiveis, tabela_fiscal_para
from .dp_views import audit
from .models import DpCargo, DpCentroCusto, DpColaborador, DpCompetencia, DpTabelaFiscal
from .serializers import DpTabelaFiscalSerializer
from .views import modulo_permission

_PERM = [modulo_permission(read_any=["pessoal"], write="pessoal")]


class _FakeComp:
    """Competência efêmera pro motor (simulação não cria registro)."""
    def __init__(self, ano, mes, dias_mes=30, dias_uteis=22):
        self.ano, self.mes = ano, mes
        self.dias_mes, self.dias_uteis = dias_mes, dias_uteis


class _FakeColab:
    """Colaborador hipotético (admissão simulada) — mesma interface que o motor usa."""
    def __init__(self, regime, salario, vt=0.0, va=0.0, saldo_livre=0.0, cc_nome="(simulado)",
                 nome="(vaga simulada)", cargo=None, opta_vt=True):
        self.regime, self.salario_bruto = regime, salario
        self.vt, self.va, self.saldo_livre, self.opta_vt = vt, va, saldo_livre, opta_vt
        self.centro_custo_nome_fake = cc_nome
        self.nome, self.matricula = nome, 0
        self.cargo, self.cargo_id = cargo, (cargo.id if cargo else None)
        self.centro_custo_id = True  # o motor só checa truthiness

    @property
    def centro_custo(self):
        return type("CC", (), {"nome": self.centro_custo_nome_fake})()


def _agrega(itens: list) -> dict:
    s = lambda k: round(sum(i[k] for i in itens), 2)
    return {
        "headcount": len(itens),
        "folha": s("total_pagar"),
        "provisoes": s("custo_provisoes"),
        "patronal": s("inss_patronal"),
        "custo_total": s("custo_total"),
        "decimo": s("decimo_mensal"), "ferias": s("ferias_mensal"),
        "terco": s("terco_ferias_mensal"), "fgts": s("fgts_mensal"),
        "multa_fgts": s("multa_fgts_mensal"), "recesso": s("recesso_mensal"),
    }


def _quadro_base(ano: int, mes: int) -> list:
    """Fotografia calculada do quadro atual pra competência de referência."""
    comp = _FakeComp(ano, mes)
    fiscal = tabela_fiscal_para(ano, mes)
    return [calcular_item(c, None, comp, fiscal) for c in elegiveis(comp)]


@api_view(["GET"])
@permission_classes(_PERM)
def dp_projecao(request):
    """Projeta o custo dos próximos N meses a partir do quadro atual.

    Parâmetros: ?meses=12 &reajuste=0.05 (anual, aplicado no mês do dissídio)
    &mes_reajuste=1 &crescimento=0 (headcount % a.m.).
    Devolve mês a mês: custo, folha, provisões e o APROVISIONAMENTO ACUMULADO
    (13º, férias+1/3, FGTS e multa que o escritório precisa ter reservado).
    """
    def f(k, d):
        try:
            return float(request.query_params.get(k, d))
        except ValueError:
            return d

    meses = int(f("meses", 12))
    reajuste = f("reajuste", 0.0)
    mes_reajuste = int(f("mes_reajuste", 1))
    crescimento = f("crescimento", 0.0)

    hoje = date.today()
    base = _quadro_base(hoje.year, hoje.month)
    ag0 = _agrega(base)

    linhas, acumulado = [], {"decimo": 0.0, "ferias": 0.0, "terco": 0.0,
                             "fgts": 0.0, "multa_fgts": 0.0, "recesso": 0.0}
    fator_sal, fator_hc = 1.0, 1.0
    for i in range(meses):
        a, m = hoje.year, hoje.month + i
        while m > 12:
            m -= 12
            a += 1
        if i > 0 and m == mes_reajuste:
            fator_sal *= (1 + reajuste)
        fator_hc *= (1 + crescimento) if i > 0 else 1.0
        fator = fator_sal * fator_hc
        for k in acumulado:
            acumulado[k] = round(acumulado[k] + ag0[k] * fator, 2)
        linhas.append({
            "mes": f"{a}-{m:02d}",
            "headcount": round(ag0["headcount"] * fator_hc, 1),
            "folha": round(ag0["folha"] * fator, 2),
            "provisoes": round(ag0["provisoes"] * fator, 2),
            "patronal": round(ag0["patronal"] * fator, 2),
            "custo_total": round(ag0["custo_total"] * fator, 2),
            "provisionado_acumulado": round(sum(acumulado.values()), 2),
        })

    return Response({
        "base": ag0,
        "premissas": {"meses": meses, "reajuste": reajuste,
                      "mes_reajuste": mes_reajuste, "crescimento": crescimento},
        "linhas": linhas,
        "aprovisionamento": {**acumulado, "total": round(sum(acumulado.values()), 2)},
        "custo_12m": round(sum(l["custo_total"] for l in linhas), 2),
    })


@api_view(["POST"])
@permission_classes(_PERM)
def dp_simular(request):
    """Cenário what-if. NÃO grava nada — devolve o impacto financeiro estimado.

    Body:
      {"nome": "Novo setor Trabalhista",
       "admissoes": [{"regime":"clt","salario":3500,"vt":300,"va":300,"quantidade":3,
                      "cargo_id": "<uuid|null>", "cc_nome":"Trabalhista"}],
       "desligamentos": ["<colaborador_id>", ...],
       "reajuste_percent": 0.05,          # aplicado no quadro ATUAL
       "meses": 12}
    """
    body = request.data or {}
    hoje = date.today()
    comp = _FakeComp(hoje.year, hoje.month)
    fiscal = tabela_fiscal_para(hoje.year, hoje.month)

    atual = _quadro_base(hoje.year, hoje.month)
    ag_atual = _agrega(atual)

    # cenário: quadro atual (com reajuste) − desligados + admissões simuladas
    reaj = float(body.get("reajuste_percent") or 0)
    fora = set(str(x) for x in (body.get("desligamentos") or []))
    cenario = []
    for c in elegiveis(comp):
        if str(c.id) in fora:
            continue
        if reaj:
            c.salario_bruto = round((c.salario_bruto or 0) * (1 + reaj), 2)
        cenario.append(calcular_item(c, None, comp, fiscal))

    novos = []
    for adm in (body.get("admissoes") or []):
        try:
            qtd = max(int(adm.get("quantidade") or 1), 1)
            salario = float(adm.get("salario") or 0)
        except (TypeError, ValueError):
            continue
        cargo = DpCargo.objects.filter(pk=adm.get("cargo_id")).first() if adm.get("cargo_id") else None
        if cargo and not salario:
            salario = cargo.salario_base
        cc_nome = adm.get("cc_nome") or "(novo setor)"
        for n in range(qtd):
            fake = _FakeColab(
                regime=adm.get("regime") or "clt", salario=salario,
                vt=float(adm.get("vt") or 0), va=float(adm.get("va") or 0),
                saldo_livre=float(adm.get("saldo_livre") or 0),
                cc_nome=cc_nome, cargo=cargo,
                nome=f"{cargo.nome if cargo else 'Vaga'} #{n + 1}",
            )
            item = calcular_item(fake, None, comp, fiscal)
            novos.append(item)
            cenario.append(item)

    ag_cen = _agrega(cenario)
    ag_novos = _agrega(novos)
    delta = {k: round(ag_cen[k] - ag_atual[k], 2) for k in ag_atual}
    meses = int(body.get("meses") or 12)

    # impacto por CC (só o que muda)
    por_cc = {}
    for it in novos:
        cc = it["centro_custo_nome"]
        por_cc.setdefault(cc, {"headcount": 0, "custo_total": 0.0})
        por_cc[cc]["headcount"] += 1
        por_cc[cc]["custo_total"] = round(por_cc[cc]["custo_total"] + it["custo_total"], 2)

    resultado = {
        "nome": body.get("nome") or "Cenário",
        "atual": ag_atual, "cenario": ag_cen, "delta": delta,
        "novas_contratacoes": ag_novos,
        "impacto_mensal": delta["custo_total"],
        "impacto_anual": round(delta["custo_total"] * meses, 2),
        "custo_medio_por_novo": round(ag_novos["custo_total"] / ag_novos["headcount"], 2) if ag_novos["headcount"] else 0,
        "por_centro_custo": [{"centro_custo": k, **v} for k, v in sorted(
            por_cc.items(), key=lambda x: -x[1]["custo_total"])],
        "detalhe_novos": [{"nome": i["nome"], "regime": i["regime"], "cc": i["centro_custo_nome"],
                           "salario_bruto": i["salario_bruto"], "total_pagar": i["total_pagar"],
                           "provisoes": i["custo_provisoes"], "patronal": i["inss_patronal"],
                           "custo_total": i["custo_total"]} for i in novos],
        "meses": meses,
    }
    audit(request, "simular", "dp_simulacao", "",
          depois={"nome": resultado["nome"], "impacto_mensal": resultado["impacto_mensal"],
                  "admissoes": len(novos), "desligamentos": len(fora)})
    return Response(resultado)


class DpTabelaFiscalViewSet(viewsets.ModelViewSet):
    """Parâmetros editáveis por vigência: faixas de INSS, %VT, %FGTS, multa,
    patronal e a base de provisão. Cada competência usa a vigente no seu mês."""
    queryset = DpTabelaFiscal.objects.all()
    serializer_class = DpTabelaFiscalSerializer
    permission_classes = _PERM

    def perform_create(self, serializer):
        obj = serializer.save()
        audit(self.request, "criar", "dp_tabela_fiscal", obj.id,
              depois={"vigencia": str(obj.vigencia_inicio)})

    def perform_update(self, serializer):
        i = serializer.instance
        antes = {"vigencia": str(i.vigencia_inicio), "vt": i.vt_percent, "fgts": i.fgts_percent,
                 "multa": i.multa_fgts_percent, "patronal": i.inss_patronal_percent,
                 "provisao_base": i.provisao_base, "inss_faixas": i.inss_faixas}
        obj = serializer.save()
        audit(self.request, "editar", "dp_tabela_fiscal", obj.id, antes=antes,
              depois={"vigencia": str(obj.vigencia_inicio), "vt": obj.vt_percent,
                      "fgts": obj.fgts_percent, "multa": obj.multa_fgts_percent,
                      "patronal": obj.inss_patronal_percent,
                      "provisao_base": obj.provisao_base, "inss_faixas": obj.inss_faixas})
