# DP — MÓDULO DE DESLIGAMENTO: cálculo das verbas rescisórias.
#
# Motor determinístico por tipo de desligamento, com MEMÓRIA DE CÁLCULO em cada
# verba (o operador clica e vê a conta). Regras CLT usadas:
#   • Saldo de salário .......... dias trabalhados no mês / 30 × salário
#   • Aviso prévio .............. 30 dias + 3 por ano completo (teto 90) — Lei 12.506/2011
#   • 13º proporcional .......... meses (fração ≥ 15 dias conta) / 12 × salário
#   • Férias vencidas ........... salário + 1/3 (período aquisitivo completo não gozado)
#   • Férias proporcionais ...... meses / 12 × salário, + 1/3
#   • Multa do FGTS ............. 40% do saldo (20% no acordo do art. 484-A)
#   • Descontos ................. INSS sobre saldo e 13º; aviso não cumprido (pedido)
# Estagiário (TCE) não é CLT: recebe bolsa proporcional + recesso proporcional.
from datetime import date, timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .dp_escopo import filtrar_colaboradores
from .dp_folha import calcular_inss, tabela_fiscal_para
from .dp_views import _quem, audit
from .models import DpColaborador, DpCompetencia, DpEvento, DpFolhaItem, DpRescisao
from .views import modulo_permission

_PERM = [modulo_permission(read_any=["pessoal"], write="pessoal")]

TIPOS = {
    "sem_justa_causa": "Dispensa sem justa causa",
    "pedido_demissao": "Pedido de demissão",
    "acordo": "Acordo (art. 484-A)",
    "justa_causa": "Dispensa por justa causa",
    "termino_contrato": "Término de contrato",
    "fim_estagio": "Encerramento do estágio (TCE)",
}


def _meses_avos(inicio: date, fim: date) -> int:
    """Avos de 13º/férias: cada mês com 15+ dias trabalhados conta 1 avo (máx 12)."""
    if not inicio or fim < inicio:
        return 0
    meses = 0
    ano, mes = inicio.year, inicio.month
    while (ano, mes) <= (fim.year, fim.month):
        ini_mes = date(ano, mes, 1)
        prox = date(ano + (mes == 12), (mes % 12) + 1, 1)
        fim_mes = prox - timedelta(days=1)
        d_ini = max(ini_mes, inicio)
        d_fim = min(fim_mes, fim)
        if (d_fim - d_ini).days + 1 >= 15:
            meses += 1
        mes += 1
        if mes > 12:
            mes, ano = 1, ano + 1
    return min(meses, 12)


def _anos_completos(inicio: date, fim: date) -> int:
    if not inicio:
        return 0
    anos = fim.year - inicio.year
    if (fim.month, fim.day) < (inicio.month, inicio.day):
        anos -= 1
    return max(anos, 0)


def calcular_rescisao(colab: DpColaborador, data_desligamento: date, tipo: str,
                      opcoes: dict = None) -> dict:
    """Devolve {verbas: [...], proventos, descontos, liquido, resumo} — sem gravar."""
    o = opcoes or {}
    fiscal = tabela_fiscal_para(data_desligamento.year, data_desligamento.month)
    salario = float(colab.salario_bruto or 0)
    admissao = colab.data_admissao or colab.data_entrada
    estagiario = colab.regime == "estagiario"
    clt = colab.regime == "clt"

    verbas, descontos = [], []

    def add(lista, descricao, valor, memoria):
        if round(valor, 2) != 0:
            lista.append({"descricao": descricao, "valor": round(valor, 2), "memoria": memoria})

    # ── 1) Saldo de salário (todos os regimes) ──
    dias_trab = data_desligamento.day
    saldo = salario / 30 * dias_trab
    add(verbas, "Saldo de salário" + (" (bolsa)" if estagiario else ""), saldo,
        f"{dias_trab} dia(s) trabalhados × (R$ {salario:.2f} ÷ 30)")

    # ── 2) Aviso prévio (só CLT, conforme o tipo) ──
    dias_aviso = 0
    aviso_valor = 0.0
    if clt and tipo in ("sem_justa_causa", "acordo"):
        anos = _anos_completos(admissao, data_desligamento) if admissao else 0
        dias_aviso = min(30 + 3 * anos, 90)
        aviso_valor = salario / 30 * dias_aviso
        if tipo == "acordo":
            aviso_valor /= 2  # art. 484-A: metade do aviso indenizado
        if o.get("aviso_trabalhado"):
            aviso_valor = 0.0
            add(verbas, f"Aviso prévio trabalhado ({dias_aviso} dias)", 0,
                "Cumprido em atividade — pago dentro do salário do período")
        else:
            add(verbas, f"Aviso prévio indenizado ({dias_aviso} dias)", aviso_valor,
                f"{dias_aviso} dias × (R$ {salario:.2f} ÷ 30)"
                + (" ÷ 2 (acordo)" if tipo == "acordo" else "")
                + (f" — 30 + 3×{anos} ano(s)" if anos else ""))
    elif clt and tipo == "pedido_demissao" and not o.get("aviso_trabalhado"):
        dias_aviso = 30
        valor = salario / 30 * dias_aviso
        add(descontos, "Aviso prévio não cumprido", valor,
            f"{dias_aviso} dias × (R$ {salario:.2f} ÷ 30) — desconto por não cumprir o aviso")

    # projeção do aviso indenizado nos avos (regra CLT)
    fim_projetado = data_desligamento
    if dias_aviso and aviso_valor > 0:
        fim_projetado = data_desligamento + timedelta(days=dias_aviso)

    # ── 3) 13º proporcional ──
    if tipo != "justa_causa" and not estagiario:
        ini_ano = date(fim_projetado.year, 1, 1)
        base_13 = max(ini_ano, admissao) if admissao else ini_ano
        avos13 = _meses_avos(base_13, fim_projetado)
        add(verbas, f"13º salário proporcional ({avos13}/12)", salario / 12 * avos13,
            f"{avos13}/12 × R$ {salario:.2f}"
            + (" (com projeção do aviso)" if fim_projetado != data_desligamento else ""))

    # ── 4) Férias vencidas + proporcionais ──
    if admissao and not estagiario:
        anos_comp = _anos_completos(admissao, data_desligamento)
        periodos_vencidos = int(o.get("ferias_vencidas", 0) or 0)
        if periodos_vencidos:
            v = salario * periodos_vencidos
            add(verbas, f"Férias vencidas ({periodos_vencidos} período/s)", v,
                f"{periodos_vencidos} × R$ {salario:.2f}")
            add(verbas, "1/3 sobre férias vencidas", v / 3, f"R$ {v:.2f} ÷ 3")
        if tipo != "justa_causa":
            inicio_periodo = admissao
            if anos_comp:
                try:
                    inicio_periodo = admissao.replace(year=admissao.year + anos_comp)
                except ValueError:
                    inicio_periodo = admissao + timedelta(days=365 * anos_comp)
            avosf = _meses_avos(inicio_periodo, fim_projetado)
            vf = salario / 12 * avosf
            add(verbas, f"Férias proporcionais ({avosf}/12)", vf,
                f"{avosf}/12 × R$ {salario:.2f}")
            add(verbas, "1/3 sobre férias proporcionais", vf / 3, f"R$ {vf:.2f} ÷ 3")

    # ── 5) Recesso do estagiário (equivalente às férias) ──
    if estagiario and admissao:
        avos_r = _meses_avos(admissao, data_desligamento) if not o.get("recesso_gozado") else 0
        add(verbas, f"Recesso proporcional ({avos_r}/12)", salario / 12 * avos_r,
            f"{avos_r}/12 × R$ {salario:.2f} (recesso remunerado da Lei do Estágio)")

    # ── 6) Multa do FGTS ──
    if clt and tipo in ("sem_justa_causa", "acordo"):
        saldo_fgts = float(o.get("saldo_fgts") or 0)
        if not saldo_fgts and admissao:
            meses_casa = max((data_desligamento.year - admissao.year) * 12
                             + data_desligamento.month - admissao.month, 0)
            saldo_fgts = salario * fiscal.fgts_percent * meses_casa
            origem = f"estimado: {meses_casa} mês(es) × 8% de R$ {salario:.2f}"
        else:
            origem = "saldo informado pelo operador"
        pct = 0.40 if tipo == "sem_justa_causa" else 0.20
        add(verbas, f"Multa do FGTS ({pct:.0%})", saldo_fgts * pct,
            f"{pct:.0%} × R$ {saldo_fgts:.2f} ({origem})")

    # ── 7) Outras verbas informadas ──
    for extra in (o.get("outras_verbas") or []):
        add(verbas, extra.get("descricao") or "Outras verbas", float(extra.get("valor") or 0),
            "Lançado manualmente pelo operador")
    for extra in (o.get("outros_descontos") or []):
        add(descontos, extra.get("descricao") or "Outros descontos", float(extra.get("valor") or 0),
            "Lançado manualmente pelo operador")

    # ── 8) INSS sobre saldo de salário e 13º (não incide em férias/aviso indenizados) ──
    if clt:
        base_inss = round(saldo, 2) + sum(v["valor"] for v in verbas if v["descricao"].startswith("13º"))
        inss, mem_inss = calcular_inss(base_inss, fiscal.inss_faixas)
        add(descontos, "INSS sobre a rescisão", inss,
            f"Base R$ {base_inss:.2f} (saldo + 13º) — {mem_inss.get('conta', 'tabela progressiva')}")

    proventos = round(sum(v["valor"] for v in verbas), 2)
    total_desc = round(sum(d["valor"] for d in descontos), 2)
    return {
        "colaborador": {"id": str(colab.id), "matricula": colab.matricula, "nome": colab.nome,
                        "regime": colab.regime, "cargo": colab.cargo.nome if colab.cargo_id else "",
                        "centro_custo": colab.centro_custo.nome if colab.centro_custo_id else "",
                        "data_admissao": str(admissao or ""), "salario": salario},
        "tipo": tipo, "tipo_label": TIPOS.get(tipo, tipo),
        "data_desligamento": str(data_desligamento),
        "dias_aviso": dias_aviso,
        "verbas": verbas, "descontos": descontos,
        "proventos": proventos, "total_descontos": total_desc,
        "liquido": round(proventos - total_desc, 2),
    }


class DpRescisaoViewSet(viewsets.ViewSet):
    """Desligamento: simula as verbas, efetiva (desliga + grava) e lista."""
    permission_classes = _PERM

    def list(self, request):
        qs = DpRescisao.objects.select_related("colaborador").order_by("-data_desligamento")[:200]
        return Response([_rescisao_row(r) for r in qs])

    @action(detail=False, methods=["post"])
    def simular(self, request):
        """Prévia das verbas — NÃO desliga ninguém."""
        colab = DpColaborador.objects.filter(pk=request.data.get("colaborador_id")).first()
        if not colab:
            return Response({"detail": "Colaborador não encontrado."}, status=400)
        try:
            from datetime import datetime as _dt
            data = _dt.strptime(request.data.get("data_desligamento"), "%Y-%m-%d").date()
        except (TypeError, ValueError):
            return Response({"detail": "Informe a data do desligamento (dd/mm/aaaa)."}, status=400)
        tipo = request.data.get("tipo") or "sem_justa_causa"
        if tipo not in TIPOS:
            return Response({"detail": "Tipo de desligamento inválido."}, status=400)
        return Response(calcular_rescisao(colab, data, tipo, request.data.get("opcoes") or {}))

    @action(detail=False, methods=["post"])
    @transaction.atomic
    def efetivar(self, request):
        """Desliga o colaborador e grava o cálculo das verbas (auditado)."""
        colab = DpColaborador.objects.filter(pk=request.data.get("colaborador_id")).first()
        if not colab:
            return Response({"detail": "Colaborador não encontrado."}, status=400)
        if colab.status == "inativo":
            return Response({"detail": f"{colab.nome} já está desligado(a)."}, status=409)
        try:
            from datetime import datetime as _dt
            data = _dt.strptime(request.data.get("data_desligamento"), "%Y-%m-%d").date()
        except (TypeError, ValueError):
            return Response({"detail": "Informe a data do desligamento (dd/mm/aaaa)."}, status=400)
        tipo = request.data.get("tipo") or "sem_justa_causa"
        motivo = (request.data.get("motivo") or "").strip()
        opcoes = request.data.get("opcoes") or {}
        calc = calcular_rescisao(colab, data, tipo, opcoes)

        resc = DpRescisao.objects.create(
            colaborador=colab, data_desligamento=data, tipo=tipo, motivo=motivo,
            aviso_dias=calc["dias_aviso"], verbas=calc["verbas"], descontos=calc["descontos"],
            proventos=calc["proventos"], total_descontos=calc["total_descontos"],
            liquido=calc["liquido"], opcoes=opcoes, criado_por=_quem(request),
        )
        colab.status = "inativo"
        colab.data_demissao = data
        colab.save()
        DpEvento.objects.create(colaborador=colab, tipo="desligamento", data_efeito=data,
                                payload={"tipo": TIPOS.get(tipo, tipo), "motivo": motivo,
                                         "liquido": calc["liquido"]},
                                autor=_quem(request))

        # a folha do mês do desligamento é atualizada na hora: a linha da pessoa
        # é recalculada (entra o saldo proporcional) e marcada como rescisão.
        comp = DpCompetencia.objects.filter(ano=data.year, mes=data.month).first()
        recalculada = False
        if comp and comp.status != "fechada":
            from .dp_folha import calcular_item, tabela_fiscal_para as _tab
            lanc = comp.lancamentos.filter(colaborador=colab).first()
            d = calcular_item(colab, lanc, comp, _tab(comp.ano, comp.mes))
            DpFolhaItem.objects.update_or_create(competencia=comp, colaborador=colab, defaults=d)
            recalculada = True
        audit(request, "desligar", "dp_colaborador", colab.id,
              antes={"status": "ativo", "nome": colab.nome},
              depois={"status": "inativo", "nome": colab.nome,
                      "data_demissao": str(data), "tipo_desligamento": TIPOS.get(tipo, tipo),
                      "motivo": motivo, "liquido_rescisao": calc["liquido"]})
        row = _rescisao_row(resc)
        row["folha_atualizada"] = recalculada
        row["competencia"] = f"{data.month:02d}/{data.year}" if comp else None
        return Response(row, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def termo(self, request, pk=None):
        """Termo de rescisão em PDF timbrado."""
        from .dp_relatorios import _pdf_termo_rescisao
        r = DpRescisao.objects.select_related("colaborador").filter(pk=pk).first()
        if not r:
            return Response({"detail": "Rescisão não encontrada."}, status=404)
        return _pdf_termo_rescisao(r, _quem(request))


def _rescisao_row(r: DpRescisao) -> dict:
    return {
        "id": str(r.id),
        "colaborador_id": str(r.colaborador_id),
        "matricula": r.colaborador.matricula, "nome": r.colaborador.nome,
        "regime": r.colaborador.regime,
        "data_desligamento": str(r.data_desligamento),
        "tipo": r.tipo, "tipo_label": TIPOS.get(r.tipo, r.tipo),
        "motivo": r.motivo, "aviso_dias": r.aviso_dias,
        "verbas": r.verbas, "descontos": r.descontos,
        "proventos": r.proventos, "total_descontos": r.total_descontos, "liquido": r.liquido,
        "criado_por": r.criado_por, "created_at": r.created_at.isoformat(),
    }
