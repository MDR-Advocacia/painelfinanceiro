# Estrutura de Faturamento — API da proposta de reestruturação.
# RBAC: módulo `estrutura` ("ver" navega, "editar" altera). Toda escrita
# audita via DpAuditLog (mesma trilha traduzida do DP).
import re
from django.db import transaction
from django.db.models import Count, Sum
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .dp_views import _quem, audit
from django.conf import settings
from django.http import FileResponse
from rest_framework.decorators import parser_classes
from rest_framework.parsers import FormParser, MultiPartParser

from .models_estrutura import FaturamentoDocumento
from .models import (
    Alocacao, CentroFaturamento, CentroSede, DpCompetencia, DpFolhaItem, Equipe,
    LinhaFaturamento, Sede, Setor,
)
from .sso_views import LEGACY_DATA_USER_ID
from .views import modulo_permission

# Permissões separadas por RISCO, não por tela:
#   estrutura          — desenhar a operação (alocar equipe, %, sede)
#   faturamento        — lançar receita e anexar comprovação (dinheiro entrando)
#   estrutura-cadastro — criar/renomear/excluir centro, linha, equipe
#   equipes            — ver gente e CUSTO INDIVIDUAL (dado de folha, do DP)
_PERM = [modulo_permission(read_any=["estrutura", "faturamento"], write="estrutura")]
_PERM_FAT = [modulo_permission(read_any=["estrutura", "faturamento"], write="faturamento")]
# Anexo é documento do CLIENTE (nota fiscal, medição): ler exige o módulo
# de faturamento, não basta enxergar a estrutura.
_PERM_DOC = [modulo_permission(read_any=["faturamento"], write="faturamento")]
_PERM_CAD = [modulo_permission(read_any=["estrutura", "faturamento"], write="estrutura-cadastro")]
_PERM_EQUIPE = [modulo_permission(read_any=["equipes"], write="estrutura-cadastro")]


def _iss_sociedade(n_profissionais) -> float:
    """ISS fixo da sociedade de advogados: faixa por profissional, bimestral →
    mensal. Mesma tabela do painel antigo (calcISSSociedade)."""
    n = int(n_profissionais or 0)
    if n <= 0:
        return 0.0
    bimestral = 0.0
    for i in range(1, n + 1):
        if i <= 3:
            bimestral += 452
        elif i <= 6:
            bimestral += 537
        elif i <= 9:
            bimestral += 622
        elif i <= 12:
            bimestral += 707
        else:
            bimestral += 792
    return bimestral / 2


def _impostos(fat: dict) -> dict:
    """Carga tributária do mês da linha — porte fiel do calcImpostos do painel
    antigo, pra estrutura e painel legado nunca divergirem.

    BASE DE CÁLCULO = RECEITA LÍQUIDA (bruto menos descontos/glosa).

    Decisão fiscal do escritório: o valor glosado não foi faturado, então não
    pode sofrer tributação. Vale pra TUDO que é proporcional à receita — PIS,
    COFINS, ISS percentual e o lucro presumido que alimenta IRPJ, adicional de
    IRPJ e CSLL. Aplicar só em PIS/COFINS deixaria o restante contradizendo a
    mesma premissa.

    Exceção: ISS no modo sociedade é valor FIXO por profissional (tabela de
    faixas), não olha receita — glosa não muda nada nele.

    Se a glosa superar o bruto, a base vira zero e não negativa: imposto a
    recuperar é evento contábil próprio, não sai de cálculo de margem.
    """
    fat = fat or {}
    bruto = float(fat.get("bruto") or 0)
    descontos = float(fat.get("descontos") or 0)
    base = max(0.0, bruto - descontos)
    # Registros antigos guardavam apenas bruto/descontos. A tela de edição já
    # os abre com estes defaults; o cálculo precisa usar a mesma regra, senão
    # uma linha sem as chaves fiscais paga só PIS/COFINS no dashboard.
    lucro_presumido = base * float(fat.get("aliquotaLucroPresumido") or 0.32)
    irpj = lucro_presumido * 0.15
    trimestral = lucro_presumido * 3
    irpj_adicional = ((trimestral - 60000) * 0.10) / 3 if trimestral > 60000 else 0.0
    csll = lucro_presumido * 0.09
    pis = base * 0.0065
    cofins = base * 0.03
    if (fat.get("modoISS") or "sociedade") == "sociedade":
        iss = _iss_sociedade(fat.get("profissionaisISS"))
    else:
        iss = base * float(fat.get("aliquotaISS") or 0.02)
    total = irpj + irpj_adicional + csll + pis + cofins + iss
    return {"base_calculo": round(base, 2),
            "lucro_presumido": round(lucro_presumido, 2), "irpj": round(irpj, 2),
            "irpj_adicional": round(irpj_adicional, 2), "csll": round(csll, 2),
            "pis": round(pis, 2), "cofins": round(cofins, 2), "iss": round(iss, 2),
            "total": round(total, 2)}


def _receita(fat: dict) -> dict:
    """Bruto, descontos e LÍQUIDO. O líquido é o que a margem usa — glosa do
    cliente não é receita do escritório."""
    fat = fat or {}
    bruto = float(fat.get("bruto") or 0)
    descontos = float(fat.get("descontos") or 0)
    return {"bruto": round(bruto, 2), "descontos": round(descontos, 2),
            "liquida": round(bruto - descontos, 2)}


def _enquadramento_da_competencia(comp) -> dict:
    """{colaborador_id: equipe_id} VIGENTE NAQUELE MÊS.

    A foto prevalece para as pessoas retratadas. O quadro ao vivo completa os
    demais vínculos, pois uma foto de composição contém somente pessoas ativas
    e não pode fazer custos de desligados sumirem do cálculo da competência.
    """
    from .models import DpColaborador
    from .models_estrutura import CompetenciaEnquadramento
    enquadramento = dict(DpColaborador.objects.exclude(equipe_ref=None)
                         .values_list("id", "equipe_ref_id"))
    foto = dict(CompetenciaEnquadramento.objects.filter(competencia=comp)
                .values_list("colaborador_id", "equipe_id"))
    enquadramento.update(foto)
    return enquadramento


def _quadro_ativo_por_equipe(comp) -> dict:
    """Headcount por equipe usado no breakeven, com quebra por unidade.

    Normalmente ele é o quadro vivo. Uma competência com retrato manual é a
    exceção deliberada: ali a composição mensal curada prevalece, sem alterar
    a sidebar ou o cadastro atual.
    """
    from .models import DpColaborador
    from .models_estrutura import CompetenciaEnquadramento, _tem_retrato_manual

    if comp and _tem_retrato_manual(comp):
        fonte = (CompetenciaEnquadramento.objects.filter(competencia=comp)
                 .values("equipe_id", "colaborador__unidade"))
        campo_sede = "colaborador__unidade"
    else:
        fonte = (DpColaborador.objects.filter(status="ativo")
                 .exclude(equipe_ref=None).values("equipe_ref_id", "unidade"))
        campo_sede = "unidade"

    ativos = {}
    for pessoa in fonte:
        equipe_id = pessoa.get("equipe_id") or pessoa.get("equipe_ref_id")
        chave = str(equipe_id)
        item = ativos.setdefault(chave, {"total": 0, "por_sede": {}})
        item["total"] += 1
        sede = (pessoa.get(campo_sede) or "Sem unidade").strip()
        item["por_sede"][sede] = item["por_sede"].get(sede, 0) + 1
    return ativos


def _soma_percentual_por_equipe(comp) -> dict:
    """{equipe_id: soma dos percentuais} vigente no mês — da foto, se houver.

    É o denominador do rateio de CUSTO: equipe que atende N linhas tem a folha
    distribuída na proporção das alocações. Com a foto, um mês fechado mantém
    o rateio que valia na época.
    """
    from .models_estrutura import CompetenciaAlocacao
    fonte = list(CompetenciaAlocacao.objects.filter(competencia=comp)
                 .values("equipe_id", "percentual")) if comp else []
    if not fonte:
        fonte = list(Alocacao.objects.values("equipe_id", "percentual"))
    soma = {}
    for a in fonte:
        soma[a["equipe_id"]] = soma.get(a["equipe_id"], 0) + (a["percentual"] or 0)
    return soma


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


def _competencia_do_periodo(periodo):
    """Folha da mesma competência da receita exibida.

    Misturar receita de julho com a última folha fechada e alocações atuais
    duplica custo sempre que uma linha nasce depois da foto do fechamento.
    Competência aberta pode ser usada, mas a resposta a sinaliza como parcial.
    Sem folha naquele mês, mantém o fallback histórico da última fechada.
    """
    if periodo:
        try:
            ano, mes = (int(v) for v in periodo.split("-", 1))
        except (TypeError, ValueError):
            ano = mes = None
        if ano and mes:
            comp = DpCompetencia.objects.filter(ano=ano, mes=mes).first()
            if comp:
                return comp, comp.status != "fechada"

    fechada = (DpCompetencia.objects.filter(status="fechada")
               .order_by("-ano", "-mes").first())
    if fechada:
        return fechada, False
    aberta = DpCompetencia.objects.order_by("-ano", "-mes").first()
    return aberta, aberta is not None


def _custo_por_equipe(ultima_fechada) -> dict:
    """Custo por EQUIPE somando a folha das pessoas ENQUADRADAS nela — a conta
    exata que a normalização funcionário→equipe permite."""
    if not ultima_fechada:
        return {}
    equipe_de = _enquadramento_da_competencia(ultima_fechada)
    saida = {}
    for it in (DpFolhaItem.objects.filter(competencia=ultima_fechada)
               .values("colaborador_id", "colaborador__unidade",
                       "custo_total", "total_pagar")):
        eq = equipe_de.get(it["colaborador_id"])
        if not eq:
            continue
        d = saida.setdefault(str(eq), {"pessoas": 0, "custo_total": 0.0,
                                      "a_pagar": 0.0, "por_sede": {}})
        d["pessoas"] += 1
        d["custo_total"] = round(d["custo_total"] + (it["custo_total"] or 0), 2)
        d["a_pagar"] = round(d["a_pagar"] + (it["total_pagar"] or 0), 2)
        sede = (it["colaborador__unidade"] or "Sem unidade").strip()
        por_sede = d["por_sede"].setdefault(
            sede, {"pessoas": 0, "custo_total": 0.0, "a_pagar": 0.0})
        por_sede["pessoas"] += 1
        por_sede["custo_total"] = round(
            por_sede["custo_total"] + (it["custo_total"] or 0), 2)
        por_sede["a_pagar"] = round(
            por_sede["a_pagar"] + (it["total_pagar"] or 0), 2)
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
    linhas_qs = (LinhaFaturamento.objects.select_related("centro", "setor_legado", "sede")
                 .prefetch_related("alocacoes__equipe__centro_custo"))
    linhas = list(linhas_qs)
    per = request.query_params.get("periodo") or _ultimo_periodo(linhas)

    # Receita e custo precisam falar da MESMA competência. Usar a última folha
    # fechada com as alocações vivas de julho foi o que inflou 419 mil para
    # 565 mil quando "Faturamentos diversos" recebeu as equipes do BB.
    competencia, custo_parcial = _competencia_do_periodo(per)
    custo_cc = _custo_por_cc(competencia)
    custo_eq = _custo_por_equipe(competencia)

    # Headcount para breakeven/VPD é o QUADRO ATUAL, por decisão gerencial.
    # O custo continua sendo o da folha da competência. Mantemos também a
    # quebra por unidade para o filtro de sede usar os ativos de hoje.
    ativos_eq = _quadro_ativo_por_equipe(competencia)

    # O percentual divide a RECEITA da linha. Pro CUSTO a conta é outra: uma
    # equipe que atende N linhas (Ajuizamento atende 6) tem o custo dela
    # distribuído na PROPORÇÃO das alocações — senão a mesma folha entraria
    # inteira em cada cliente (dupla contagem: foi o que a primeira versão
    # desta tela mostrou com Ativos Réu em Ativos S.A. E em Banese).
    soma_por_equipe = _soma_percentual_por_equipe(competencia)

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
        por_sede = (base or {}).get("por_sede", {})
        ativos = ativos_eq.get(str(a.equipe_id), {"total": 0, "por_sede": {}})
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
            # pessoas da MESMA folha de onde sai o custo acima, nao os ativos de
            # hoje: as duas metades do chip tem que falar da mesma competencia,
            # senao mostra "38 pessoas" ao lado de um custo de 35 e ninguem
            # consegue conferir. Divergencia entre as duas e' justamente o que o
            # painel de Cobertura aponta.
            "pessoas": base["pessoas"] if base else None,
            # O filtro de sede do dashboard representa a UNIDADE da pessoa no
            # DP. Cada fatia continua normalizada pelas alocações da equipe;
            # ao somar todos os destinos, fecha exatamente com a folha da sede.
            "custo_total_por_sede": {
                sede: round(valores["custo_total"] * fator, 2)
                for sede, valores in por_sede.items()
            },
            "pessoas_por_sede": {
                sede: valores["pessoas"] for sede, valores in por_sede.items()
            },
            "pessoas_ativas": ativos["total"],
            "pessoas_ativas_por_sede": ativos["por_sede"],
        }

    def json_linha(l):
        f = (l.periodos or {}).get(per, {}) if per else {}
        r = _receita(f)
        imp = _impostos(f)
        alocs = sorted(l.alocacoes.all(), key=lambda a: -a.percentual)
        return {
            "id": str(l.id), "nome": l.nome, "area": l.area, "ativo": l.ativo,
            "sede": l.sede.nome if l.sede_id else None,
            "sede_id": str(l.sede_id) if l.sede_id else None,
            "receita_bruta": r["bruto"],
            "descontos": r["descontos"],
            "receita_liquida": r["liquida"],
            "impostos": imp["total"],
            "impostos_detalhe": imp,
            "soma_percentual": round(sum(a.percentual or 0 for a in alocs), 2),
            "alocacoes": [json_alocacao(a) for a in alocs],
        }

    periodos = sorted({p for l in linhas for p, f in (l.periodos or {}).items()
                       if (f or {}).get("bruto")}, reverse=True)
    saida = {"periodo": per, "periodos": periodos,
             "competencia_custo": (f"{competencia.mes:02d}/{competencia.ano}"
                                    if competencia else None),
             "custo_parcial": custo_parcial,
             "centros": [], "infraestrutura": []}
    por_centro = {}
    for l in linhas:
        por_centro.setdefault(l.centro_id, []).append(l)

    rateios = {}
    for cs in CentroSede.objects.select_related("sede"):
        rateios.setdefault(cs.centro_id, []).append(
            {"id": str(cs.id), "sede": cs.sede.nome, "sede_id": str(cs.sede_id),
             "percentual": cs.percentual})

    for c in CentroFaturamento.objects.prefetch_related("alocacoes__equipe__centro_custo"):
        ls = [json_linha(l) for l in sorted(por_centro.get(c.id, []), key=lambda x: x.ordem)]
        diretas = [json_alocacao(a) for a in c.alocacoes.all()]
        # sedes do centro: rateio explícito (infra) ou as sedes das linhas
        if c.tipo == "infraestrutura":
            sedes_do_centro = sorted(rateios.get(c.id, []), key=lambda x: x["sede"])
        else:
            vistos, sedes_do_centro = set(), []
            for l in ls:
                if l["sede"] and l["sede"] not in vistos:
                    vistos.add(l["sede"])
                    sedes_do_centro.append({"sede": l["sede"], "sede_id": l["sede_id"]})
        bloco = {
            "id": str(c.id), "nome": c.nome, "tipo": c.tipo,
            "linhas": ls, "alocacoes": diretas, "sedes": sedes_do_centro,
            "receita_total": round(sum(l["receita_liquida"] for l in ls), 2),
            "receita_bruta_total": round(sum(l["receita_bruta"] for l in ls), 2),
            "descontos_total": round(sum(l["descontos"] for l in ls), 2),
            "impostos_total": round(sum(l["impostos"] for l in ls), 2),
            "custo_total": round(sum((a["custo_total"] or 0) for l in ls for a in l["alocacoes"])
                                 + sum((a["custo_total"] or 0) for a in diretas), 2),
        }
        (saida["centros"] if c.tipo == "faturamento" else saida["infraestrutura"]).append(bloco)

    # ── RESUMO POR SEDE ──
    # Receita: some as linhas daquela sede. Custo: o das equipes alocadas nas
    # linhas da sede + a fatia rateada de cada centro de infraestrutura.
    por_sede = {}
    for s_ in Sede.objects.all():
        por_sede[str(s_.id)] = {"id": str(s_.id), "nome": s_.nome, "receita": 0.0,
                                "impostos": 0.0,
                                "custo_operacional": 0.0, "custo_infra": 0.0,
                                "linhas": 0, "equipes": set()}
    for bloco in saida["centros"]:
        for l in bloco["linhas"]:
            if not l["sede_id"] or l["sede_id"] not in por_sede:
                continue
            d = por_sede[l["sede_id"]]
            d["receita"] = round(d["receita"] + (l["receita_liquida"] or 0), 2)
            d["impostos"] = round(d["impostos"] + (l["impostos"] or 0), 2)
            d["linhas"] += 1
            for a in l["alocacoes"]:
                d["custo_operacional"] = round(d["custo_operacional"] + (a["custo_total"] or 0), 2)
                d["equipes"].add(a["equipe"])
    for bloco in saida["infraestrutura"]:
        for r in bloco["sedes"]:
            if r["sede_id"] in por_sede:
                d = por_sede[r["sede_id"]]
                d["custo_infra"] = round(
                    d["custo_infra"] + bloco["custo_total"] * (r["percentual"] or 0) / 100, 2)
    saida["por_sede"] = []
    for d in sorted(por_sede.values(), key=lambda x: -x["receita"]):
        custo = round(d["custo_operacional"] + d["custo_infra"] + d["impostos"], 2)
        saida["por_sede"].append({
            **{k: v for k, v in d.items() if k != "equipes"},
            "equipes": len(d["equipes"]),
            "custo_total": custo,
            "margem": round(d["receita"] - custo, 2),
        })

    # equipes sem nenhuma alocação (ex.: Equipe Mista) — visíveis pra não sumir gente
    alocadas = set(Alocacao.objects.values_list("equipe_id", flat=True))
    saida["sem_alocacao"] = []
    for e in Equipe.objects.exclude(id__in=alocadas).filter(ativo=True):
        base = custo_eq.get(str(e.id), {})
        ativos = ativos_eq.get(str(e.id), {"total": 0, "por_sede": {}})
        por_sede = base.get("por_sede", {})
        saida["sem_alocacao"].append({
            "id": str(e.id), "equipe": e.nome, "slug": e.slug, "grupo": e.grupo,
            "centro_custo": e.centro_custo.nome if e.centro_custo_id else None,
            "custo_total": round(base.get("custo_total", 0), 2),
            "a_pagar": round(base.get("a_pagar", 0), 2),
            "custo_total_por_sede": {
                sede: round(valores["custo_total"], 2)
                for sede, valores in por_sede.items()
            },
            "pessoas_ativas": ativos["total"],
            "pessoas_ativas_por_sede": ativos["por_sede"],
        })
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
    # a matriz mudou: o dashboard tem que refletir agora, nao no
    # proximo recalculo de folha
    reespelhar_competencias_vivas()
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
    # a matriz mudou: o dashboard tem que refletir agora, nao no
    # proximo recalculo de folha
    reespelhar_competencias_vivas()
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
    # a matriz mudou: o dashboard tem que refletir agora, nao no
    # proximo recalculo de folha
    reespelhar_competencias_vivas()
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
@permission_classes(_PERM_CAD)
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
@permission_classes(_PERM_CAD)
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
        # Dashboard/Projeções/Rentabilidade ainda leem Setor. Linha nova sem
        # esse vínculo fica invisível nesses painéis (foi o caso de
        # "Faturamentos diversos" em 07/2026).
        nome_setor = nome
        if Setor.objects.filter(nome=nome_setor).exists():
            nome_setor = f"{nome} - {centro.nome}"
        with transaction.atomic():
            setor = Setor.objects.create(
                user_id=LEGACY_DATA_USER_ID, nome=nome_setor,
                tipo="operacional", periodos={},
            )
            l = LinhaFaturamento.objects.create(
                centro=centro, nome=nome, area=area,
                ordem=centro.linhas.count(), setor_legado=setor,
            )
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
@permission_classes(_PERM_CAD)
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
    soma_por_equipe = _soma_percentual_por_equipe(comp)

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
        f_ult = (l.periodos or {}).get(ult) or {} if ult else {}
        r_ult = _receita(f_ult)
        imp_ult = _impostos(f_ult)
        # receita do card = LÍQUIDA (glosa do cliente não é receita nossa)
        receita_ult = r_ult["liquida"]
        saida_linhas.append({
            "id": str(l.id), "nome": l.nome, "area": l.area, "ativo": l.ativo,
            "receita_ultimo": receita_ult,
            "receita_bruta": r_ult["bruto"],
            "descontos": r_ult["descontos"],
            "impostos": imp_ult["total"],
            "receita_acumulada": round(sum(_receita(f)["liquida"]
                                           for f in (l.periodos or {}).values()), 2),
            "soma_percentual": round(sum(a["percentual"] or 0 for a in alocs), 2),
            "alocacoes": alocs,
        })

    # alocações DIRETAS no centro (equipe sem linha de receita própria)
    diretas = []
    for a in c.alocacoes.select_related("equipe__centro_custo"):
        custo, pagar, pessoas = custo_alocacao(a)
        custo_centro += custo or 0
        pagar_centro += pagar or 0
        eqd = equipes_do_centro.setdefault(str(a.equipe_id), {
            "id": str(a.equipe_id), "nome": a.equipe.nome, "grupo": a.equipe.grupo,
            "custo_total": 0.0, "linhas": []})
        eqd["custo_total"] = round(eqd["custo_total"] + (custo or 0), 2)
        eqd["linhas"].append({"linha": "— centro (sem linha)", "percentual": a.percentual})
        diretas.append({"id": str(a.id), "equipe_id": str(a.equipe_id),
                        "equipe": a.equipe.nome, "percentual": a.percentual,
                        "custo_total": custo, "a_pagar": pagar, "pessoas": pessoas})

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
    impostos_total = round(sum(l["impostos"] for l in saida_linhas), 2)
    descontos_total = round(sum(l["descontos"] for l in saida_linhas), 2)
    bruta_total = round(sum(l["receita_bruta"] for l in saida_linhas), 2)
    return Response({
        "id": str(c.id), "nome": c.nome, "tipo": c.tipo,
        "periodo": ult, "meses": meses, "series": series,
        "linhas": saida_linhas,
        "alocacoes_diretas": diretas,
        "equipes": sorted(equipes_do_centro.values(), key=lambda x: -x["custo_total"]),
        "receita_ultimo": receita_ult_total,
        "receita_bruta": bruta_total,
        "descontos": descontos_total,
        "impostos": impostos_total,
        "receita_acumulada": round(sum(l["receita_acumulada"] for l in saida_linhas), 2),
        "custo_total": round(custo_centro, 2),
        "a_pagar": round(pagar_centro, 2),
        # margem = líquida − impostos − pessoal
        "margem": round(receita_ult_total - impostos_total - custo_centro, 2),
        "competencia_custo": f"{comp.mes:02d}/{comp.ano}" if comp else None,
        "custo_parcial": custo_parcial,
    })


@api_view(["GET"])
@permission_classes(_PERM_EQUIPE)
def equipe_detalhe(request, pk):
    """A página da equipe: QUEM ESTÁ NELA (pessoas do DP com cargo, salário e
    custo real da folha), onde está alocada e quanto de receita representa.

    `composicao=atual` mostra o quadro de hoje com custos do mês escolhido.
    `composicao=historica` mostra quem compunha a folha daquele mês.
    """
    from .models import DpColaborador, DpFolhaItem as FI
    from .models_estrutura import CompetenciaEnquadramento

    e = Equipe.objects.select_related("centro_custo").filter(pk=pk).first()
    if not e:
        return Response(status=404)

    periodo_pedido = request.query_params.get("periodo")
    composicao = request.query_params.get("composicao") or "atual"
    if composicao not in ("atual", "historica"):
        return Response({"detail": "composicao deve ser atual ou historica."}, status=400)
    if periodo_pedido and not re.match(r"^\d{4}-\d{2}$", periodo_pedido):
        return Response({"detail": "Período inválido. Use AAAA-MM."}, status=400)

    if periodo_pedido:
        comp, custo_parcial = _competencia_do_periodo(periodo_pedido)
    else:
        comp, custo_parcial = _competencia_custo()
    periodo = f"{comp.ano}-{comp.mes:02d}" if comp else periodo_pedido

    folha = {}
    if comp:
        folha = {i["colaborador_id"]: i for i in
                 FI.objects.filter(competencia=comp)
                 .values("colaborador_id", "custo_total", "total_pagar",
                         "salario_bruto", "ferias_dias", "em_rescisao",
                         "matricula", "nome", "cargo_nome", "regime")}

    ids_foto = (list(CompetenciaEnquadramento.objects.filter(
        competencia=comp, equipe=e).values_list("colaborador_id", flat=True))
        if comp else [])
    historico_origem = None
    if composicao == "historica" and comp:
        if ids_foto:
            ids_pessoas = ids_foto
            from .models_estrutura import _tem_retrato_manual
            historico_origem = ("retrato_competencia" if _tem_retrato_manual(comp)
                                else "foto_fechamento")
        else:
            # Competência aberta ainda não tem foto. O histórico verificável é
            # o quadro atual cruzado com quem efetivamente consta naquela folha.
            ids_atuais = set(DpColaborador.objects.filter(equipe_ref=e)
                             .values_list("id", flat=True))
            ids_pessoas = list(ids_atuais.intersection(folha.keys()))
            historico_origem = "folha_e_quadro_atual"
        qs = (DpColaborador.objects.filter(id__in=ids_pessoas)
              .select_related("cargo", "centro_custo", "supervisor")
              .order_by("nome"))
    else:
        qs = (DpColaborador.objects.filter(equipe_ref=e)
              .select_related("cargo", "centro_custo", "supervisor")
              .order_by("-status", "nome"))

    pessoas = []
    resumo_cargos = {}
    custo_total = pagar_total = 0.0
    for cme in qs:
        fi = folha.get(cme.id, {})
        custo = round(fi.get("custo_total") or 0, 2)
        entra_no_resumo = composicao == "historica" or cme.status == "ativo"
        if entra_no_resumo:
            custo_total += custo
            pagar_total += fi.get("total_pagar") or 0
            cargo = ((fi.get("cargo_nome") if composicao == "historica" else None)
                     or (cme.cargo.nome if cme.cargo_id else "(sem cargo)"))
            rc = resumo_cargos.setdefault(cargo, {"cargo": cargo, "n": 0, "custo": 0.0})
            rc["n"] += 1
            rc["custo"] = round(rc["custo"] + custo, 2)
        pessoas.append({
            "id": str(cme.id),
            "matricula": ((fi.get("matricula") or cme.matricula)
                           if composicao == "historica" else cme.matricula),
            "nome": ((fi.get("nome") or cme.nome)
                     if composicao == "historica" else cme.nome),
            "cargo": ((fi.get("cargo_nome") if composicao == "historica" else None)
                      or (cme.cargo.nome if cme.cargo_id else None)),
            "regime": ((fi.get("regime") or cme.regime)
                       if composicao == "historica" else cme.regime),
            "status": cme.status,
            "supervisor": cme.supervisor.nome if cme.supervisor_id else None,
            "salario_bruto": ((fi.get("salario_bruto") or cme.salario_bruto)
                               if composicao == "historica" else cme.salario_bruto),
            "custo_total": custo or None,
            "a_pagar": round(fi.get("total_pagar") or 0, 2) or None,
            "ferias_dias": fi.get("ferias_dias") or 0,
            "em_rescisao": bool(fi.get("em_rescisao")),
        })

    # Alocações e receita da competência selecionada. Antes a página podia
    # combinar custo de junho com a última receita lançada de outro mês.
    alocs = []
    for a in (Alocacao.objects.filter(equipe=e)
              .select_related("linha__centro", "centro")):
        if a.linha:
            receita = ((a.linha.periodos or {}).get(periodo, {}).get("bruto", 0)
                       if periodo else 0)
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

    ativos = ([p for p in pessoas if p["status"] == "ativo"]
              if composicao == "atual" else pessoas)
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
        "periodo": periodo,
        "periodos_disponiveis": [f"{ano}-{mes:02d}" for ano, mes in
                                  DpCompetencia.objects.filter(itens__isnull=False)
                                  .values_list("ano", "mes").distinct()
                                  .order_by("-ano", "-mes")],
        "composicao": composicao,
        "historico_origem": historico_origem,
        "historico_disponivel": bool(ids_foto),
        "historico_total": len(ids_foto),
        "competencia_custo": f"{comp.mes:02d}/{comp.ano}" if comp else None,
        "custo_parcial": custo_parcial,
    })


@api_view(["PATCH"])
@permission_classes(_PERM)
def linha_sede(request, pk):
    """Troca a sede de uma linha. {sede_id: uuid|null}"""
    l = LinhaFaturamento.objects.select_related(
        "centro", "sede", "setor_legado",
    ).filter(pk=pk).first()
    if not l:
        return Response(status=404)
    antes = l.sede.nome if l.sede_id else None
    sede_id = request.data.get("sede_id") or None
    sede = Sede.objects.filter(pk=sede_id).first() if sede_id else None
    if sede_id and not sede:
        return Response({"detail": "Sede não encontrada."}, status=400)
    with transaction.atomic():
        l.sede = sede
        l.save(update_fields=["sede", "updated_at"])
        if l.setor_legado_id:
            l.setor_legado.sede = sede
            l.setor_legado.save(update_fields=["sede", "updated_at"])
    audit(request, "editar", "ef_linha", l.id,
          antes={"linha": str(l), "sede": antes},
          depois={"linha": str(l), "sede": sede.nome if sede else None})
    return Response({"sede": sede.nome if sede else None})


@api_view(["PATCH"])
@permission_classes(_PERM)
def centro_sede_rateio(request, pk):
    """Ajusta o rateio de um centro de infraestrutura entre as sedes.
    {rateio: [{sede_id, percentual}, …]}"""
    c = CentroFaturamento.objects.filter(pk=pk).first()
    if not c:
        return Response(status=404)
    itens = request.data.get("rateio") or []
    if not isinstance(itens, list) or not itens:
        return Response({"detail": "Informe o rateio."}, status=400)
    total = sum(float(i.get("percentual") or 0) for i in itens)
    if abs(total - 100) > 0.5:
        return Response({"detail": f"A soma precisa fechar 100% (veio {total:g}%)."}, status=400)
    antes = {r.sede.nome: r.percentual for r in c.sedes.select_related("sede")}
    with transaction.atomic():
        for i in itens:
            sede = Sede.objects.filter(pk=i.get("sede_id")).first()
            if not sede:
                continue
            CentroSede.objects.update_or_create(
                centro=c, sede=sede, defaults={"percentual": round(float(i.get("percentual") or 0), 2)})
    depois = {r.sede.nome: r.percentual for r in c.sedes.select_related("sede")}
    audit(request, "editar", "ef_centro", c.id,
          antes={"nome": c.nome, "rateio_sedes": antes},
          depois={"nome": c.nome, "rateio_sedes": depois})
    return Response({"ok": True})


@api_view(["GET"])
@permission_classes(_PERM)
def sedes_lista(request):
    """Sedes cadastradas (pro seletor da linha e do rateio)."""
    return Response([{"id": str(s.id), "nome": s.nome} for s in Sede.objects.all()])


@api_view(["GET"])
@permission_classes(_PERM)
def sede_detalhe(request, pk):
    """A página da sede: receita das linhas operadas ali, custo das equipes,
    infraestrutura rateada, custos de estrutura (patrimônio) e as pessoas."""
    from .models import DpColaborador

    sede = Sede.objects.filter(pk=pk).first()
    if not sede:
        return Response(status=404)

    linhas = list(LinhaFaturamento.objects.filter(sede=sede)
                  .select_related("centro")
                  .prefetch_related("alocacoes__equipe__centro_custo"))

    comp, custo_parcial = _competencia_custo()
    custo_cc = _custo_por_cc(comp)
    custo_eq = _custo_por_equipe(comp)
    soma_por_equipe = _soma_percentual_por_equipe(comp)

    def custo_alocacao(a):
        base = custo_eq.get(str(a.equipe_id))
        if not base:
            cc = a.equipe.centro_custo
            base = custo_cc.get(cc.nome) if cc else None
        if not base:
            return 0.0, 0.0, 0
        soma = soma_por_equipe.get(a.equipe_id) or 0
        fator = ((a.percentual or 0) / soma) if soma else 0.0
        return (round(base["custo_total"] * fator, 2),
                round(base["a_pagar"] * fator, 2), base["pessoas"])

    # série mensal da sede + linhas por centro
    meses = sorted({per for l in linhas for per, f in (l.periodos or {}).items()
                    if (f or {}).get("bruto")})
    ult = meses[-1] if meses else None
    series = [{"mes": m,
               "total": round(sum(_receita((l.periodos or {}).get(m) or {})["liquida"]
                                  for l in linhas), 2)}
              for m in meses]

    por_centro, equipes_sede = {}, {}
    custo_oper = pagar_oper = impostos_sede = 0.0
    for l in linhas:
        alocs = []
        for a in sorted(l.alocacoes.all(), key=lambda x: -x.percentual):
            custo, pagar, pessoas = custo_alocacao(a)
            custo_oper += custo
            pagar_oper += pagar
            eqd = equipes_sede.setdefault(str(a.equipe_id), {
                "id": str(a.equipe_id), "nome": a.equipe.nome, "grupo": a.equipe.grupo,
                "custo_total": 0.0, "linhas": []})
            eqd["custo_total"] = round(eqd["custo_total"] + custo, 2)
            eqd["linhas"].append(l.nome)
            alocs.append({"id": str(a.id), "equipe_id": str(a.equipe_id),
                          "equipe": a.equipe.nome, "percentual": a.percentual,
                          "custo_total": custo})
        f_ult = (l.periodos or {}).get(ult) or {} if ult else {}
        receita = _receita(f_ult)["liquida"]
        imposto_linha = _impostos(f_ult)["total"]
        impostos_sede += imposto_linha
        bloco = por_centro.setdefault(str(l.centro_id), {
            "id": str(l.centro_id), "nome": l.centro.nome, "receita": 0.0, "linhas": []})
        bloco["receita"] = round(bloco["receita"] + receita, 2)
        bloco["linhas"].append({"id": str(l.id), "nome": l.nome, "area": l.area,
                                "receita": receita,
                                "impostos": imposto_linha,
                                "receita_acumulada": round(
                                    sum(_receita(f)["liquida"]
                                        for f in (l.periodos or {}).values()), 2),
                                "alocacoes": alocs})

    # infraestrutura rateada pra esta sede
    infra = []
    custo_infra = 0.0
    for cs in CentroSede.objects.filter(sede=sede).select_related("centro"):
        c = cs.centro
        total = 0.0
        for a in c.alocacoes.select_related("equipe__centro_custo"):
            total += custo_alocacao(a)[0]
        for l in c.linhas.prefetch_related("alocacoes__equipe__centro_custo"):
            for a in l.alocacoes.all():
                total += custo_alocacao(a)[0]
        fatia = round(total * (cs.percentual or 0) / 100, 2)
        custo_infra += fatia
        infra.append({"id": str(c.id), "nome": c.nome, "percentual": cs.percentual,
                      "custo_centro": round(total, 2), "fatia": fatia})

    # pessoas das equipes que operam na sede (pelo enquadramento do DP)
    ids_eq = list(equipes_sede.keys())
    pessoas_total = 0
    por_regime = {}
    if ids_eq:
        for r in (DpColaborador.objects.filter(status="ativo", equipe_ref_id__in=ids_eq)
                  .values("equipe_ref_id", "regime")):
            pessoas_total += 1
            por_regime[r["regime"]] = por_regime.get(r["regime"], 0) + 1
        contagem = {}
        for r in (DpColaborador.objects.filter(status="ativo", equipe_ref_id__in=ids_eq)
                  .values("equipe_ref_id")):
            k = str(r["equipe_ref_id"])
            contagem[k] = contagem.get(k, 0) + 1
        for k, d in equipes_sede.items():
            d["pessoas"] = contagem.get(k, 0)

    # custos de ESTRUTURA (patrimônio) do módulo Sedes — período mais recente
    per_sede = sorted((sede.periodos or {}).keys())
    ult_sede = per_sede[-1] if per_sede else None
    itens_estrutura = (sede.periodos or {}).get(ult_sede) or [] if ult_sede else []
    custo_estrutura = round(sum(float(i.get("valor") or 0) for i in itens_estrutura), 2)

    receita = round(sum(b["receita"] for b in por_centro.values()), 2)
    impostos_sede = round(impostos_sede, 2)
    custo_total = round(custo_oper + custo_infra + custo_estrutura + impostos_sede, 2)
    return Response({
        "id": str(sede.id), "nome": sede.nome,
        "periodo": ult, "meses": meses, "series": series,
        "centros": sorted(por_centro.values(), key=lambda x: -x["receita"]),
        "equipes": sorted(equipes_sede.values(), key=lambda x: -x["custo_total"]),
        "infraestrutura": infra,
        "estrutura": {"periodo": ult_sede, "itens": itens_estrutura, "total": custo_estrutura},
        "totais": {
            "receita": receita,
            "custo_operacional": round(custo_oper, 2),
            "impostos": impostos_sede,
            "a_pagar": round(pagar_oper, 2),
            "custo_infra": round(custo_infra, 2),
            "custo_estrutura": custo_estrutura,
            "custo_total": custo_total,
            "margem": round(receita - custo_total, 2),
            "pessoas": pessoas_total,
            "por_regime": por_regime,
            "linhas": sum(len(b["linhas"]) for b in por_centro.values()),
        },
        "competencia_custo": f"{comp.mes:02d}/{comp.ano}" if comp else None,
        "custo_parcial": custo_parcial,
    })


# Campos do faturamento mensal — MESMO formato do Setor legado, pra que o
# histórico copiado na migração continue válido e nada se perca.
_CAMPOS_FAT_NUM = ("bruto", "descontos", "aliquotaLucroPresumido", "aliquotaISS",
                   "profissionaisISS", "premiacaoTotal", "diversosTotal")
_FATURAMENTO_DEFAULT = {
    "bruto": 0, "descontos": 0, "aliquotaLucroPresumido": 0.32,
    "aliquotaISS": 0.02, "modoISS": "sociedade", "profissionaisISS": 0,
    "premiacaoTotal": 0, "diversosTotal": 0,
}
_PERIODO_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


@api_view(["GET", "PATCH"])
@permission_classes(_PERM_FAT)
def linha_faturamento(request, pk):
    """Lê e lança o faturamento de UM mês da linha.

    GET  ?periodo=2026-06 → os valores daquele mês (vazio vira o default)
    PATCH {periodo, bruto, descontos, …} → grava só o mês informado
    """
    l = LinhaFaturamento.objects.select_related("centro").filter(pk=pk).first()
    if not l:
        return Response(status=404)

    periodo = (request.data.get("periodo") if request.method == "PATCH"
               else request.query_params.get("periodo")) or ""
    if not _PERIODO_RE.match(periodo):
        return Response({"detail": "Informe o período no formato AAAA-MM."}, status=400)

    salvo = dict((l.periodos or {}).get(periodo) or {})
    atual = {**_FATURAMENTO_DEFAULT, **salvo}
    if request.method == "GET":
        return Response({
            "linha": l.nome, "centro": l.centro.nome, "periodo": periodo,
            "faturamento": atual,
            "meses_lancados": sorted(k for k, v in (l.periodos or {}).items()
                                     if (v or {}).get("bruto")),
        })

    novo = dict(atual)
    for campo in _CAMPOS_FAT_NUM:
        if campo in request.data:
            try:
                novo[campo] = float(request.data[campo] or 0)
            except (TypeError, ValueError):
                return Response({"detail": f"Valor inválido em {campo}."}, status=400)
    if "modoISS" in request.data:
        modo = request.data["modoISS"]
        if modo not in ("sociedade", "percentual"):
            return Response({"detail": "modoISS inválido."}, status=400)
        novo["modoISS"] = modo
    if novo.get("bruto", 0) < 0:
        return Response({"detail": "O faturamento bruto não pode ser negativo."}, status=400)

    with transaction.atomic():
        periodos = dict(l.periodos or {})
        periodos[periodo] = novo
        l.periodos = periodos
        l.save(update_fields=["periodos", "updated_at"])
        espelhado_em = _espelhar_no_setor_legado(l, periodo)
    audit(request, "editar", "ef_linha", l.id,
          antes={"linha": l.nome, "periodo": periodo, "faturamento": atual},
          depois={"linha": l.nome, "periodo": periodo, "faturamento": novo})
    return Response({"periodo": periodo, "faturamento": novo,
                     "espelhado_em": [espelhado_em] if espelhado_em else []})


@api_view(["GET"])
@permission_classes(_PERM)
def estrutura_cobertura(request):
    """Auditoria de COBERTURA do rateio, para a tela de Estrutura.

    Responde tres perguntas que so' se descobria abrindo o banco:
      1. tem gente ativa fora de equipe?
      2. tem equipe com gente e sem alocacao?
      3. tem linha ou centro de infra sem setor no painel legado?

    Qualquer uma das tres faz a pessoa SUMIR do custo por linha, e a margem do
    cliente sai errada pra menos sem nenhum aviso. Por isso vira painel, e nao
    consulta de bastidor.
    """
    from .models import DpColaborador
    ativos = DpColaborador.objects.filter(status="ativo").select_related("equipe_ref")
    soma = {}
    for a in Alocacao.objects.all():
        soma[a.equipe_id] = soma.get(a.equipe_id, 0) + (a.percentual or 0)

    hc = {}
    for c in ativos.exclude(equipe_ref=None):
        hc[c.equipe_ref_id] = hc.get(c.equipe_ref_id, 0) + 1

    sem_equipe = [{"id": str(c.id), "matricula": c.matricula, "nome": c.nome,
                   "regime": c.regime}
                  for c in ativos.filter(equipe_ref=None).order_by("nome")]

    equipes, sem_alocacao = [], []
    for e in Equipe.objects.all().order_by("nome"):
        n = hc.get(e.id, 0)
        pct = soma.get(e.id, 0)
        destinos = []
        for a in Alocacao.objects.filter(equipe=e).select_related("linha__centro", "centro"):
            destinos.append({
                "alvo": (f"{a.linha.centro.nome} · {a.linha.nome}" if a.linha_id
                         else f"{a.centro.nome}"),
                "infra": not a.linha_id,
                "fatia": round((a.percentual or 0) / pct * 100, 1) if pct else 0,
            })
        item = {"id": str(e.id), "nome": e.nome, "pessoas": n,
                "alocada": bool(pct), "destinos": destinos}
        equipes.append(item)
        if n and not pct:
            sem_alocacao.append(item)

    linhas_orfas = [{"id": str(l.id), "nome": l.nome, "centro": l.centro.nome}
                    for l in LinhaFaturamento.objects.filter(setor_legado=None)
                    .select_related("centro")]
    infra_orfa = [{"id": str(c.id), "nome": c.nome}
                  for c in CentroFaturamento.objects.filter(tipo="infraestrutura",
                                                            setor_legado=None)]

    chegam = sum(n for eid, n in hc.items() if soma.get(eid))
    total = ativos.count()
    return Response({
        "ativos": total,
        "distribuidos": chegam,
        "fora_do_rateio": total - chegam,
        "sem_equipe": sem_equipe,
        "equipes_sem_alocacao": sem_alocacao,
        "linhas_sem_setor": linhas_orfas,
        "infra_sem_setor": infra_orfa,
        "equipes": equipes,
        "ok": not (sem_equipe or sem_alocacao or linhas_orfas or infra_orfa
                   or total != chegam),
    })


def ratear_infra_por_pessoas() -> dict:
    """Redivide o custo de infraestrutura entre as SEDES por CABECA.

    Era 50/50 fixo, herdado do desenho antigo — e o comentario do modelo
    ("igual entre as sedes, por padrao") deixava claro que era default, nao
    decisao. So' que o quadro nao e' metade a metade: Capim Macio tem 109 das
    150 pessoas produtivas (72,7%) e Manhattan 41 (27,3%). Com 50/50, Manhattan
    absorvia R$ 47.354 de backoffice tendo pouco mais de um quarto da gente —
    R$ 21.467 por mes na sede errada, R$ 257 mil no ano, direto na margem.

    A BASE e' a mesma do rateio por linha: quem CONSOME o apoio, ou seja o
    quadro produtivo, sem as proprias equipes de apoio. Usar as duas bases
    diferentes faria a visao por sede e a visao por linha nao fecharem entre si.

    Sede sem ninguem fica com 0 em vez de sumir: zero e' informacao (a sede
    existe e nao consome apoio), enquanto sumir esconderia o caso.
    """
    from .models import DpColaborador, Sede
    eq_apoio = set()
    for c in CentroFaturamento.objects.filter(tipo="infraestrutura"):
        eq_apoio |= set(Alocacao.objects.filter(centro=c).values_list("equipe_id", flat=True))

    produtivos = (DpColaborador.objects.filter(status="ativo")
                  .exclude(equipe_ref_id__in=eq_apoio))
    por_unidade = {}
    for u in produtivos.values_list("unidade", flat=True):
        if u:
            por_unidade[u] = por_unidade.get(u, 0) + 1
    total = sum(por_unidade.values())
    if not total:
        return {"aplicado": False, "motivo": "nenhum colaborador produtivo com unidade"}

    # unidade do DP casa com a sede pelo NOME; sede sem gente entra com 0
    sedes = list(Sede.objects.all())
    pesos = {sd.id: por_unidade.get(sd.nome, 0) for sd in sedes}
    if not sum(pesos.values()):
        return {"aplicado": False, "motivo": "nenhuma sede casa com as unidades do DP"}

    detalhe, tocados = [], 0
    for c in CentroFaturamento.objects.filter(tipo="infraestrutura"):
        for sd in sedes:
            pct = round(pesos[sd.id] / total * 100, 2)
            cs, _ = CentroSede.objects.update_or_create(
                centro=c, sede=sd, defaults={"percentual": pct})
            tocados += 1
            detalhe.append({"centro": c.nome, "sede": sd.nome,
                            "pessoas": pesos[sd.id], "percentual": pct})
    return {"aplicado": True, "base_produtiva": total, "rateios": tocados,
            "detalhe": detalhe}


def reespelhar_competencias_vivas() -> int:
    """Reespelha as competencias que ainda podem mudar (nao fechadas).

    Existe porque mexer na ESTRUTURA — mover equipe de linha, alterar
    percentual, criar ou remover alocacao — nao muda a folha, muda so' a
    DISTRIBUICAO dela. Sem isto, o operador alterava a matriz de alocacao e o
    dashboard continuava mostrando o rateio velho ate' alguem lembrar de
    recalcular a folha, que e' uma acao sem relacao nenhuma com o que ele fez.

    Competencia FECHADA fica de fora de proposito: foto congelada nao se mexe.
    E' barato — agrega ~170 linhas ja' calculadas, sem recalcular folha.
    """
    from .models import DpCompetencia
    # o rateio por SEDE segue a mesma regra por cabeca do rateio por linha;
    # se ficasse so' na linha, as duas visoes de margem divergiriam
    try:
        ratear_infra_por_pessoas()
    except Exception:
        pass
    n = 0
    for comp in DpCompetencia.objects.exclude(status="fechada"):
        try:
            espelhar_custo_pessoal(comp)
            n += 1
        except Exception:
            # espelho e' conveniencia: se falhar, a alteracao do operador
            # continua salva e a folha continua correta
            pass
    return n


def espelhar_custo_pessoal(comp) -> dict:
    """Leva o custo REAL da folha para o Setor legado, por período.

    O Dashboard, Projeções e Rentabilidade ainda leem do Setor, e lá o custo de
    pessoal é uma ESTIMATIVA do painel antigo: por cargo, quantidade × salário ×
    multiplicador de encargos. Isso nunca conversou com a folha do DP — em
    06/2026 a estimativa dava R$ 358.455 contra R$ 478.122 de folha real, 25%
    a menos, e o operador via dois números diferentes pra mesma coisa.

    Aqui o custo da competência desce pelo mesmo caminho da tela da Estrutura
    (folha da pessoa → equipe → alocação → linha) e é gravado como
    `custoPessoalReal` no período do setor de origem. O detalhe por cargo
    continua onde está: quem manda no total passa a ser a folha, e a estimativa
    vira só o desenho de quadro que ela sempre foi.
    """
    from .models import Setor
    periodo = f"{comp.ano}-{comp.mes:02d}"
    custo_eq = _custo_por_equipe(comp)
    soma_eq = _soma_percentual_por_equipe(comp)

    # HEADCOUNT REAL por equipe, do cadastro do DP. Vai junto com o custo pelo
    # mesmo caminho porque sofria o MESMO problema: o painel legado guarda uma
    # quantidade DIGITADA por cargo, que ninguém atualiza — em 05/2026 ela dizia
    # 178 pessoas contra 173 ativos de verdade, e variava 163/166/178/171 de mês
    # a mês sem relação com admissão ou desligamento.
    #
    # O número errado não fica só na tela: o VPD é rateado POR CABEÇA
    # (custoVPD = headcount × valor), então cada pessoa fantasma vira despesa
    # indireta fantasma na margem do cliente.
    from .models import DpColaborador
    hc_eq = {}
    for c in DpColaborador.objects.filter(status="ativo").exclude(equipe_ref=None):
        hc_eq[c.equipe_ref_id] = hc_eq.get(c.equipe_ref_id, 0) + 1

    # custo e headcount rateados por LINHA, mesma conta da Estrutura.
    # `direto_centro` recolhe a alocacao que nao passa por linha — e' o caso da
    # INFRAESTRUTURA (Administrativo e TI), que nao fatura e por isso nao tem
    # linha nenhuma. Sem este ramo, o custo dessa gente ficava orfao.
    por_linha, hc_linha = {}, {}
    direto_centro, hc_centro = {}, {}
    for a in Alocacao.objects.select_related("linha", "centro").all():
        base = custo_eq.get(str(a.equipe_id))
        soma = soma_eq.get(a.equipe_id) or 0
        if not soma:
            continue
        if not a.linha_id:
            if a.centro_id:
                f = (a.percentual or 0) / soma
                if hc_eq.get(a.equipe_id):
                    hc_centro[a.centro_id] = round(
                        hc_centro.get(a.centro_id, 0.0) + hc_eq[a.equipe_id] * f, 2)
                if base:
                    direto_centro[a.centro_id] = round(
                        direto_centro.get(a.centro_id, 0.0) + base["custo_total"] * f, 2)
            continue
        fracao = (a.percentual or 0) / soma
        # a pessoa dividida entre duas linhas entra fracionada nas duas: e' o
        # que faz a soma dos setores fechar com o total do quadro
        if hc_eq.get(a.equipe_id):
            hc_linha[a.linha_id] = round(
                hc_linha.get(a.linha_id, 0.0) + hc_eq[a.equipe_id] * fracao, 2)
        if not base:
            continue
        parcela = round(base["custo_total"] * fracao, 2)
        por_linha[a.linha_id] = round(por_linha.get(a.linha_id, 0.0) + parcela, 2)

    # linha → setor legado (1:1 hoje; a soma cobre 1:N sem quebrar)
    por_setor, hc_setor = {}, {}
    for l in LinhaFaturamento.objects.select_related("setor_legado"):
        if not l.setor_legado_id:
            continue
        v = por_linha.get(l.id)
        if v:
            por_setor[l.setor_legado_id] = round(por_setor.get(l.setor_legado_id, 0.0) + v, 2)
        h = hc_linha.get(l.id)
        if h:
            hc_setor[l.setor_legado_id] = round(hc_setor.get(l.setor_legado_id, 0.0) + h, 2)

    # centro de infraestrutura → setor administrativo, quando vinculado
    for c in CentroFaturamento.objects.exclude(setor_legado=None):
        v = direto_centro.get(c.id)
        if v:
            por_setor[c.setor_legado_id] = round(por_setor.get(c.setor_legado_id, 0.0) + v, 2)
        h = hc_centro.get(c.id)
        if h:
            hc_setor[c.setor_legado_id] = round(hc_setor.get(c.setor_legado_id, 0.0) + h, 2)

    # ── RATEIO DO PESSOAL DE APOIO ────────────────────────────────────────
    # Administrativo e TI servem TODAS as linhas; deixar o custo deles parado
    # num setor proprio faz cada linha parecer mais rentavel do que e' — em
    # 06/2026 sao R$ 94.709 (23 pessoas, 13,3% do quadro) fora da conta de
    # margem de qualquer cliente.
    #
    # CRITERIO: POR CABECA, e nao por receita. O trabalho de RH, DP e TI escala
    # com numero de pessoas, nao com faturamento — e o dado prova: Banese Reu
    # tem 9,5 pessoas e receita ainda nao cadastrada, entao ratear por receita
    # jogaria ZERO de apoio numa linha que consome apoio de verdade. Por cabeca
    # ela recebe R$ 5.998, que e' o custo que ela realmente da'.
    apoio_custo = sum(direto_centro.get(c.id, 0.0)
                      for c in CentroFaturamento.objects.filter(tipo="infraestrutura"))
    apoio_hc = sum(hc_centro.get(c.id, 0.0)
                   for c in CentroFaturamento.objects.filter(tipo="infraestrutura"))
    # setores que RECEBEM o rateio: os que tem gente em linha de faturamento
    base_hc = {sid: h for sid, h in hc_setor.items() if h > 0}
    setores_infra = set(CentroFaturamento.objects.filter(tipo="infraestrutura")
                        .exclude(setor_legado=None)
                        .values_list("setor_legado_id", flat=True))
    base_hc = {sid: h for sid, h in base_hc.items() if sid not in setores_infra}
    tot_hc_base = sum(base_hc.values())

    apoio_setor, apoio_hc_setor = {}, {}
    if tot_hc_base and (apoio_custo or apoio_hc):
        for sid, h in base_hc.items():
            fatia = h / tot_hc_base
            apoio_setor[sid] = round(apoio_custo * fatia, 2)
            apoio_hc_setor[sid] = round(apoio_hc * fatia, 2)

    gravados = 0
    # entrada NOVA nasce com a estrutura completa que o painel legado espera:
    # gravar só custoPessoalReal criava período sem `pessoal`/`faturamento` e o
    # front quebrava em data.pessoal indefinido (tela branca de 12/08/2026)
    FATURAMENTO_VAZIO = {"bruto": 0, "descontos": 0, "aliquotaLucroPresumido": 0.32,
                         "aliquotaISS": 0.02, "modoISS": "sociedade",
                         "profissionaisISS": 0, "premiacaoTotal": 0, "diversosTotal": 0}
    alvos = set(por_setor) | set(hc_setor)
    for setor in Setor.objects.filter(id__in=alvos):
        periodos = setor.periodos or {}
        p = dict(periodos.get(periodo) or {})
        p.setdefault("pessoal", {})
        p.setdefault("faturamento", dict(FATURAMENTO_VAZIO))
        p.setdefault("despesasEventuais", [])
        direto = por_setor.get(setor.id, 0.0)
        hc_direto = hc_setor.get(setor.id, 0.0)
        p["custoPessoalReal"] = direto
        p["headcountReal"] = hc_direto
        p["custoApoioRateado"] = apoio_setor.get(setor.id, 0.0)
        p["headcountApoioRateado"] = apoio_hc_setor.get(setor.id, 0.0)
        # numero PRONTO pra tela: o setor de apoio zera (o custo dele saiu no
        # rateio) e cada linha carrega o proprio + a fatia. A soma no dashboard
        # continua sendo a folha inteira, so' que distribuida onde ela e' gerada.
        if setor.id in setores_infra:
            p["custoPessoalComApoio"] = 0.0
            p["headcountComApoio"] = 0.0
        else:
            p["custoPessoalComApoio"] = round(direto + apoio_setor.get(setor.id, 0.0), 2)
            p["headcountComApoio"] = round(hc_direto + apoio_hc_setor.get(setor.id, 0.0), 2)
        periodos[periodo] = p
        setor.periodos = periodos
        setor.save(update_fields=["periodos", "updated_at"])
        gravados += 1
    return {"periodo": periodo, "setores": gravados,
            "total": round(sum(por_setor.values()), 2),
            "headcount": round(sum(hc_setor.values()), 2),
            "apoio_rateado": round(apoio_custo, 2),
            "apoio_headcount": round(apoio_hc, 2)}


def _espelhar_no_setor_legado(linha, periodo):
    """Mantém o Setor legado alimentado a partir das LINHAS.

    O Setor virou arquivo morto: ninguém lança nele. Mas Dashboard, Projeções,
    Rentabilidade e Gestão Estratégica ainda leem de lá — então toda gravação
    na linha reflete no setor de origem, somando as linhas que apontam pra ele
    (o mapeamento é 1:1 hoje, a soma é só pra não quebrar se virar 1:N).
    """
    setor = linha.setor_legado
    if not setor:
        return None
    irmas = LinhaFaturamento.objects.filter(setor_legado_id=setor.id)
    base = None
    total_bruto = total_desc = 0.0
    for l in irmas:
        f = (l.periodos or {}).get(periodo) or {}
        total_bruto += float(f.get("bruto") or 0)
        total_desc += float(f.get("descontos") or 0)
        if l.id == linha.id:
            base = f
    pers = dict(setor.periodos or {})
    bloco = dict(pers.get(periodo) or {})
    # Metadados fiscais já existentes no Setor (ex.: profissionais do ISS)
    # não podem sumir quando o informe em lote manda apenas bruto/descontos.
    fat = {
        **_FATURAMENTO_DEFAULT,
        **(bloco.get("faturamento") or {}),
        **(base or {}),
    }
    fat["bruto"] = round(total_bruto, 2)
    fat["descontos"] = round(total_desc, 2)
    bloco["faturamento"] = fat
    bloco.setdefault("pessoal", (pers.get(periodo) or {}).get("pessoal") or {})
    bloco.setdefault("despesasEventuais", (pers.get(periodo) or {}).get("despesasEventuais") or [])
    pers[periodo] = bloco
    setor.periodos = pers
    setor.save(update_fields=["periodos"])
    return setor.nome


def _aplicar_faturamento(linha, periodo, dados):
    """Grava o faturamento de um mês na linha. Devolve (antes, depois)."""
    salvo = dict((linha.periodos or {}).get(periodo) or {})
    atual = {**_FATURAMENTO_DEFAULT, **salvo}
    novo = dict(atual)
    for campo in _CAMPOS_FAT_NUM:
        if campo in dados:
            novo[campo] = float(dados[campo] or 0)
    if "modoISS" in dados and dados["modoISS"] in ("sociedade", "percentual"):
        novo["modoISS"] = dados["modoISS"]
    periodos = dict(linha.periodos or {})
    periodos[periodo] = novo
    linha.periodos = periodos
    linha.save(update_fields=["periodos", "updated_at"])
    return atual, novo


@api_view(["GET", "PATCH"])
@permission_classes(_PERM_FAT)
def centro_faturamento(request, pk):
    """Informe de faturamento do MÊS para todas as linhas de um centro.

    GET  ?periodo=2026-06 → uma linha por linha de faturamento
    PATCH {periodo, lancamentos: [{linha_id, bruto, descontos, …}, …]}
    """
    centro = CentroFaturamento.objects.filter(pk=pk).first()
    if not centro:
        return Response(status=404)

    periodo = (request.data.get("periodo") if request.method == "PATCH"
               else request.query_params.get("periodo")) or ""
    if not _PERIODO_RE.match(periodo):
        return Response({"detail": "Informe o período no formato AAAA-MM."}, status=400)

    linhas = list(centro.linhas.select_related("sede", "setor_legado").order_by("ordem", "nome"))
    por_id = {str(l.id): l for l in linhas}

    if request.method == "PATCH":
        itens = request.data.get("lancamentos") or []
        if not isinstance(itens, list) or not itens:
            return Response({"detail": "Nenhum lançamento informado."}, status=400)
        for it in itens:
            l = por_id.get(str(it.get("linha_id")))
            if not l:
                return Response({"detail": "Linha fora deste centro."}, status=400)
            for campo in ("bruto", "descontos"):
                if campo in it:
                    try:
                        v = float(it[campo] or 0)
                    except (TypeError, ValueError):
                        return Response({"detail": f"Valor inválido em {l.nome}."}, status=400)
                    if v < 0:
                        return Response({"detail": f"{l.nome}: valor não pode ser negativo."}, status=400)

        espelhados, mudancas = set(), []
        with transaction.atomic():
            for it in itens:
                l = por_id[str(it.get("linha_id"))]
                antes, depois = _aplicar_faturamento(l, periodo, it)
                if antes != depois:
                    mudancas.append((l, antes, depois))
                nome = _espelhar_no_setor_legado(l, periodo)
                if nome:
                    espelhados.add(nome)
        for l, antes, depois in mudancas:
            audit(request, "editar", "ef_linha", l.id,
                  antes={"linha": l.nome, "centro": centro.nome, "periodo": periodo, "faturamento": antes},
                  depois={"linha": l.nome, "centro": centro.nome, "periodo": periodo, "faturamento": depois})
        return Response({"periodo": periodo, "alteradas": len(mudancas),
                         "espelhado_em": sorted(espelhados)})

    saida = []
    for l in linhas:
        f = (l.periodos or {}).get(periodo) or {}
        saida.append({
            "linha_id": str(l.id), "linha": l.nome, "area": l.area, "ativo": l.ativo,
            "sede": l.sede.nome if l.sede_id else None,
            "bruto": float(f.get("bruto") or 0),
            "descontos": float(f.get("descontos") or 0),
            "aliquotaLucroPresumido": float(f.get("aliquotaLucroPresumido") or 0.32),
            "aliquotaISS": float(f.get("aliquotaISS") or 0.02),
            "modoISS": f.get("modoISS") or "sociedade",
            "profissionaisISS": float(f.get("profissionaisISS") or 0),
            "lancado": bool(f.get("bruto")),
        })
    meses = sorted({per for l in linhas for per, f in (l.periodos or {}).items()
                    if (f or {}).get("bruto")})
    return Response({"centro": centro.nome, "periodo": periodo,
                     "meses_lancados": meses, "linhas": saida})


def _doc_fat_json(d):
    return {"id": str(d.id), "linha_id": str(d.linha_id), "periodo": d.periodo,
            "tipo": d.tipo, "tipo_label": d.get_tipo_display(),
            "nome": d.nome_original, "tamanho": d.tamanho,
            "descricao": d.descricao, "enviado_por": d.enviado_por,
            "enviado_em": d.created_at.isoformat()}


@api_view(["GET", "POST"])
@permission_classes(_PERM_DOC)
@parser_classes([MultiPartParser, FormParser])
def linha_documentos(request, pk):
    """Anexos do faturamento de um mês da linha (nota fiscal, medição…).

    GET  ?periodo=2026-06 → lista
    POST multipart {periodo, arquivo, tipo?, descricao?}
    """
    l = LinhaFaturamento.objects.select_related("centro").filter(pk=pk).first()
    if not l:
        return Response(status=404)

    if request.method == "GET":
        periodo = request.query_params.get("periodo") or ""
        qs = l.documentos.all()
        if periodo:
            if not _PERIODO_RE.match(periodo):
                return Response({"detail": "Informe o período no formato AAAA-MM."}, status=400)
            qs = qs.filter(periodo=periodo)
        return Response([_doc_fat_json(d) for d in qs])

    periodo = request.data.get("periodo") or ""
    if not _PERIODO_RE.match(periodo):
        return Response({"detail": "Informe o período no formato AAAA-MM."}, status=400)
    arq = request.FILES.get("arquivo")
    if not arq:
        return Response({"detail": "Anexe o arquivo."}, status=400)
    limite = getattr(settings, "DP_UPLOAD_MAX_BYTES", 25 * 1024 * 1024)
    if arq.size > limite:
        return Response({"detail": f"Arquivo grande demais (máximo {limite // (1024*1024)} MB)."},
                        status=400)
    nome = arq.name.lower()
    permitidos = (".pdf", ".xml", ".png", ".jpg", ".jpeg", ".xlsx", ".xls", ".csv")
    if not nome.endswith(permitidos):
        return Response({"detail": "Formato não aceito. Use PDF, XML, imagem ou planilha."},
                        status=400)
    if nome.endswith(".pdf"):
        cabecalho = arq.read(5)
        arq.seek(0)
        if cabecalho[:4] != b"%PDF":
            return Response({"detail": "O arquivo não parece um PDF válido."}, status=400)

    tipo = request.data.get("tipo") or "nota"
    if tipo not in dict(FaturamentoDocumento.TIPOS):
        tipo = "outro"
    doc = FaturamentoDocumento.objects.create(
        linha=l, periodo=periodo, tipo=tipo, arquivo=arq,
        nome_original=arq.name[:255], tamanho=arq.size,
        descricao=(request.data.get("descricao") or "")[:200],
        enviado_por=_quem(request),
    )
    audit(request, "anexar", "ef_linha", l.id,
          depois={"linha": l.nome, "centro": l.centro.nome, "periodo": periodo,
                  "documento": doc.nome_original, "tipo": doc.get_tipo_display(),
                  "tamanho_kb": round(doc.tamanho / 1024)})
    return Response(_doc_fat_json(doc), status=201)


@api_view(["GET", "DELETE"])
@permission_classes(_PERM_DOC)
def faturamento_documento(request, pk):
    """GET baixa (autenticado) · DELETE remove."""
    doc = FaturamentoDocumento.objects.select_related("linha__centro").filter(pk=pk).first()
    if not doc:
        return Response({"detail": "Documento não encontrado."}, status=404)

    if request.method == "DELETE":
        audit(request, "excluir", "ef_linha", doc.linha_id,
              antes={"linha": doc.linha.nome, "periodo": doc.periodo,
                     "documento": doc.nome_original})
        doc.arquivo.delete(save=False)
        doc.delete()
        return Response(status=204)

    try:
        f = doc.arquivo.open("rb")
    except (FileNotFoundError, ValueError):
        return Response({"detail": "Arquivo sumiu do disco — reenvie o documento."}, status=410)
    resp = FileResponse(f)
    resp["Content-Disposition"] = f'attachment; filename="{doc.nome_original}"'
    resp["Access-Control-Expose-Headers"] = "Content-Disposition"
    return resp
