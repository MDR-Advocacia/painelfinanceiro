# Arquivo Contábil — estoque permanente de relatórios técnico-contábeis.
#
#   • GET  /estrutura/arquivo-contabil/                lista paginada {total, items}
#   • GET  /estrutura/arquivo-contabil/exercicios/     anos disponíveis + prévia
#   • POST /estrutura/arquivo-contabil/gerar/          {exercicio} → nova versão
#   • GET  /estrutura/arquivo-contabil/<id>/download/  baixa o PDF arquivado
#
# O relatório cobre a MOVIMENTAÇÃO INTEIRA de um exercício: receita bruta,
# glosas, receita líquida, tributos abertos por espécie, custo de pessoal,
# margem, quebras por centro/linha/sede, movimentação de pessoal e a
# rastreabilidade de cada competência (quem fechou, quando, se está congelada).
#
# RBAC: o documento junta receita do cliente COM custo de folha consolidado.
# Por isso ele é gateado no módulo `faturamento` — o mais restritivo dos dois —
# e não no `estrutura`, que dá acesso ao desenho da operação mas não ao dinheiro.
import hashlib
from datetime import date
from io import BytesIO

from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Count, Sum
from django.http import FileResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .dp_relatorios import _brl
from .dp_views import _quem, audit
from .estrutura_views import (
    _custo_por_equipe, _impostos, _receita, _soma_percentual_por_equipe,
)
from .models import (
    Alocacao, CentroFaturamento, DpCompetencia, DpEvento, DpFolhaItem,
    LinhaFaturamento,
)
from .models_estrutura import CompetenciaAlocacao, RelatorioExercicio
from .views import modulo_permission

_PERM_ARQ = [modulo_permission(read_any=["faturamento"], write="faturamento")]

MESES_BR = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
            "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]


def _pct(parte, total) -> str:
    """Percentual com o denominador protegido — mês sem receita não vira erro."""
    try:
        return f"{(float(parte) / float(total) * 100):.1f}%" if total else "—"
    except (TypeError, ValueError, ZeroDivisionError):
        return "—"


# ──────────────────────────── COLETA DOS DADOS ────────────────────────────

def _alocacoes_do_mes(comp):
    """Alocações vigentes no mês: a FOTO se a competência está congelada, senão
    o desenho ao vivo. É a mesma regra do resto do módulo — um mês fechado não
    pode ser reescrito por uma troca de equipe feita hoje."""
    if comp:
        foto = list(CompetenciaAlocacao.objects.filter(competencia=comp)
                    .values("equipe_id", "linha_id", "centro_id", "percentual"))
        if foto:
            return foto
    return list(Alocacao.objects.values("equipe_id", "linha_id", "centro_id", "percentual"))


def _dados_exercicio(ano: int) -> dict:
    """Monta a movimentação inteira do exercício, mês a mês.

    Regime de competência de verdade: a receita do mês M é confrontada com a
    FOLHA do mês M. Isso difere da tela da Estrutura, que mostra a receita do
    último período contra a última competência FECHADA — ali o objetivo é
    fotografar o agora; aqui é fechar um ano.
    """
    linhas = list(LinhaFaturamento.objects.select_related("centro", "sede"))
    comps = {c.mes: c for c in DpCompetencia.objects.filter(ano=ano)}

    # mapas montados uma vez: o rateio precisa saber o destino de TODA alocação,
    # inclusive de linha que não faturou no mês (custo existe mesmo sem receita)
    info_linha = {l.id: {"nome": l.nome,
                         "centro": l.centro.nome if l.centro_id else "(sem centro)",
                         "sede": l.sede.nome if l.sede_id else "(sem sede)"}
                  for l in linhas}
    nome_do_centro = dict(CentroFaturamento.objects.values_list("id", "nome"))

    meses = []
    por_linha, por_centro, por_sede = {}, {}, {}

    for m in range(1, 13):
        chave = f"{ano}-{m:02d}"
        comp = comps.get(m)

        # ── receita e tributos do mês, linha a linha ──
        bruto = descontos = liquida = impostos = 0.0
        det_imp = {"irpj": 0.0, "irpj_adicional": 0.0, "csll": 0.0,
                   "pis": 0.0, "cofins": 0.0, "iss": 0.0}
        for l in linhas:
            f = (l.periodos or {}).get(chave) or {}
            if not f:
                continue
            r, imp = _receita(f), _impostos(f)
            bruto += r["bruto"]
            descontos += r["descontos"]
            liquida += r["liquida"]
            impostos += imp["total"]
            for k in det_imp:
                det_imp[k] += imp.get(k, 0.0)

            d = por_linha.setdefault(l.id, {**info_linha[l.id], "bruto": 0.0,
                                             "descontos": 0.0, "liquida": 0.0,
                                             "impostos": 0.0, "custo": 0.0})
            d["bruto"] += r["bruto"]
            d["descontos"] += r["descontos"]
            d["liquida"] += r["liquida"]
            d["impostos"] += imp["total"]

        # ── custo de pessoal do mês ──
        custo_mes = 0.0
        pessoas_mes = 0
        if comp:
            ag = DpFolhaItem.objects.filter(competencia=comp).aggregate(
                custo=Sum("custo_total"), n=Count("id"))
            custo_mes = round(ag["custo"] or 0, 2)
            pessoas_mes = ag["n"] or 0

            # rateio do custo pelas alocações vigentes NAQUELE mês
            custo_eq = _custo_por_equipe(comp)
            soma_eq = _soma_percentual_por_equipe(comp)
            for a in _alocacoes_do_mes(comp):
                base = custo_eq.get(str(a["equipe_id"]))
                if not base:
                    continue
                soma = soma_eq.get(a["equipe_id"]) or 0
                if not soma:
                    continue
                parcela = round(base["custo_total"] * ((a["percentual"] or 0) / soma), 2)
                if a["linha_id"] and a["linha_id"] in info_linha:
                    inf = info_linha[a["linha_id"]]
                    # linha que teve custo mas não faturou no mês entra mesmo assim,
                    # zerada na receita — some-la esconderia custo do exercício
                    d = por_linha.setdefault(a["linha_id"], {
                        **inf, "bruto": 0.0, "descontos": 0.0, "liquida": 0.0,
                        "impostos": 0.0, "custo": 0.0})
                    d["custo"] += parcela
                    por_centro.setdefault(inf["centro"], _zero())["custo"] += parcela
                    por_sede.setdefault(inf["sede"], _zero())["custo"] += parcela
                elif a["centro_id"]:
                    # alocação DIRETA no centro (equipe de infraestrutura, sem
                    # linha de receita própria): custo sem receita, e é assim mesmo
                    nome = nome_do_centro.get(a["centro_id"], "(centro removido)")
                    por_centro.setdefault(nome, _zero())["custo"] += parcela

        margem = round(liquida - impostos - custo_mes, 2)
        meses.append({
            "mes": m, "nome": MESES_BR[m], "chave": chave,
            "bruto": round(bruto, 2), "descontos": round(descontos, 2),
            "liquida": round(liquida, 2), "impostos": round(impostos, 2),
            "impostos_detalhe": {k: round(v, 2) for k, v in det_imp.items()},
            "custo_pessoal": custo_mes, "pessoas": pessoas_mes, "margem": margem,
            "competencia_status": comp.status if comp else None,
            "fechada_por": (comp.fechada_por if comp else "") or "",
            "fechada_em": (comp.fechada_em.strftime("%d/%m/%Y %H:%M")
                           if comp and comp.fechada_em else ""),
            "congelada": bool(comp and comp.foto_enquadramentos.exists()),
        })

    # receita das quebras (o custo já foi somado no laço acima)
    for d in por_linha.values():
        alvo_c = por_centro.setdefault(d["centro"], _zero())
        alvo_s = por_sede.setdefault(d["sede"], _zero())
        for alvo in (alvo_c, alvo_s):
            alvo["bruto"] += d["bruto"]
            alvo["descontos"] += d["descontos"]
            alvo["liquida"] += d["liquida"]
            alvo["impostos"] += d["impostos"]

    tot = {
        "bruto": round(sum(m["bruto"] for m in meses), 2),
        "descontos": round(sum(m["descontos"] for m in meses), 2),
        "liquida": round(sum(m["liquida"] for m in meses), 2),
        "impostos": round(sum(m["impostos"] for m in meses), 2),
        "custo_pessoal": round(sum(m["custo_pessoal"] for m in meses), 2),
    }
    tot["margem"] = round(tot["liquida"] - tot["impostos"] - tot["custo_pessoal"], 2)
    tot["impostos_detalhe"] = {
        k: round(sum(m["impostos_detalhe"][k] for m in meses), 2)
        for k in ("irpj", "irpj_adicional", "csll", "pis", "cofins", "iss")
    }

    # movimentação de pessoal do exercício
    ini, fim = date(ano, 1, 1), date(ano + 1, 1, 1)
    # transferência de contrato (efetivação) não é entrada nem saída: é a mesma
    # pessoa trocando de matrícula, e contá-la distorceria a movimentação do ano
    from .models import ids_em_transferencia
    saidas_transf, entradas_transf = ids_em_transferencia()
    admissoes = (DpEvento.objects.filter(tipo__in=["admissao", "importacao"],
                                         data_efeito__gte=ini, data_efeito__lt=fim)
                 .exclude(colaborador_id__in=entradas_transf).count())
    desligamentos = (DpEvento.objects.filter(tipo="desligamento",
                                             data_efeito__gte=ini, data_efeito__lt=fim)
                     .exclude(colaborador_id__in=saidas_transf).count())
    com_folha = [m for m in meses if m["pessoas"]]
    pessoal = {
        "admissoes": admissoes, "desligamentos": desligamentos,
        "headcount_inicial": com_folha[0]["pessoas"] if com_folha else 0,
        "headcount_final": com_folha[-1]["pessoas"] if com_folha else 0,
        "custo_medio_mensal": (round(tot["custo_pessoal"] / len(com_folha), 2)
                               if com_folha else 0.0),
    }

    fechadas = sum(1 for m in meses if m["competencia_status"] == "fechada")
    return {
        "exercicio": ano, "meses": meses, "totais": tot, "pessoal": pessoal,
        "por_linha": sorted(por_linha.values(), key=lambda d: -d["liquida"]),
        "por_centro": sorted([{"nome": k, **v} for k, v in por_centro.items()],
                             key=lambda d: -d["liquida"]),
        "por_sede": sorted([{"nome": k, **v} for k, v in por_sede.items()],
                           key=lambda d: -d["liquida"]),
        "competencias_no_ano": len(comps),
        "competencias_fechadas": fechadas,
        "definitivo": len(comps) == 12 and fechadas == 12,
    }


def _zero() -> dict:
    return {"bruto": 0.0, "descontos": 0.0, "liquida": 0.0, "impostos": 0.0, "custo": 0.0}


# ──────────────────────────────── O PDF ────────────────────────────────

def _pdf_exercicio(d: dict, usuario: str, versao: int) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import (Image, PageBreak, Paragraph, SimpleDocTemplate,
                                    Spacer, Table, TableStyle)
    import os

    from .dp_relatorios import _LOGO

    ano = d["exercicio"]
    navy = colors.HexColor("#0A1940")
    azul = colors.HexColor("#1E7BFF")
    cinza = colors.HexColor("#666666")

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=landscape(A4), topMargin=12 * mm, bottomMargin=14 * mm,
        leftMargin=12 * mm, rightMargin=12 * mm,
        title=f"Relatorio Tecnico-Contabil {ano}")

    est_titulo = ParagraphStyle("t", fontSize=17, textColor=navy, fontName="Helvetica-Bold")
    est_sub = ParagraphStyle("s", fontSize=8, textColor=cinza)
    est_sec = ParagraphStyle("sec", fontSize=11, textColor=navy,
                             fontName="Helvetica-Bold", spaceBefore=4, spaceAfter=2)
    est_nota = ParagraphStyle("n", fontSize=7.6, textColor=colors.HexColor("#444444"),
                              leading=10.5)

    def tabela(headers, rows, larguras, dir_cols=(), total=False):
        data = [headers] + [[str(c) for c in r] for r in rows]
        t = Table(data, colWidths=[w * mm for w in larguras], repeatRows=1)
        estilo = [
            ("BACKGROUND", (0, 0), (-1, 0), navy),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 6.9),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1 if not total else -2),
             [colors.white, colors.HexColor("#F2F6FF")]),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#CCD6EE")),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]
        for c in dir_cols:
            estilo.append(("ALIGN", (c, 0), (c, -1), "RIGHT"))
        if total:
            estilo += [("BACKGROUND", (0, -1), (-1, -1), azul),
                       ("TEXTCOLOR", (0, -1), (-1, -1), colors.white),
                       ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold")]
        t.setStyle(TableStyle(estilo))
        return t

    story = []
    if os.path.exists(_LOGO):
        story.append(Image(_LOGO, width=40 * mm, height=14.2 * mm, hAlign="LEFT"))
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph(f"Relatório Técnico-Contábil — Exercício {ano}", est_titulo))
    selo = ("DEFINITIVO — 12 competências fechadas"
            if d["definitivo"] else
            f"PARCIAL — {d['competencias_fechadas']} de {d['competencias_no_ano']} "
            f"competências do ano estão fechadas")
    story.append(Paragraph(
        f"Versão {versao} · {selo} · gerado por {usuario} em "
        f"{date.today().strftime('%d/%m/%Y')}", est_sub))
    story.append(Spacer(1, 4 * mm))

    # ── Nota metodológica: sem isso o número não é auditável ──
    story.append(Paragraph("1. Nota metodológica", est_sec))
    story.append(Paragraph(
        "<b>Base de cálculo dos tributos:</b> receita LÍQUIDA (faturamento bruto menos "
        "descontos e glosas). Valor glosado não foi faturado e portanto não sofre "
        "tributação — a regra vale para PIS, COFINS, ISS percentual e para o lucro "
        "presumido que serve de base a IRPJ, adicional de IRPJ e CSLL. O ISS no regime "
        "de sociedade de advogados é valor fixo por profissional e independe da receita."
        "<br/><b>Regime:</b> competência. A receita do mês é confrontada com a folha do "
        "MESMO mês. Difere da tela da Estrutura, que compara o último período lançado "
        "com a última competência fechada — lá o objetivo é retratar o presente, aqui é "
        "encerrar um exercício."
        "<br/><b>Custo de pessoal:</b> custo total (remuneração, provisões e encargos "
        "patronais) dos colaboradores enquadrados em cada equipe, rateado entre as "
        "linhas que a equipe atende na proporção das alocações — uma equipe que atende "
        "seis linhas não lança a folha inteira em cada uma."
        "<br/><b>Congelamento:</b> competência fechada tem foto do enquadramento e das "
        "alocações; os meses assim marcados na seção 6 não se alteram mais por mudanças "
        "feitas hoje. Meses sem foto são calculados sobre o desenho vigente."
        "<br/><b>Arredondamento:</b> o custo é rateado alocação a alocação e cada parcela "
        "é arredondada ao centavo. Por isso a soma das quebras das seções 5.1 a 5.3 pode "
        "diferir do total da seção 2 por alguns centavos. É resíduo de arredondamento, "
        "não divergência de apuração."
        "<br/><b>Integridade:</b> a impressão digital SHA-256 deste PDF fica registrada "
        "no Arquivo Contábil do sistema e permite conferir que o arquivo não foi "
        "alterado depois de emitido.", est_nota))
    story.append(Spacer(1, 4 * mm))

    # ── 2. Demonstrativo consolidado ──
    t = d["totais"]
    story.append(Paragraph("2. Demonstrativo consolidado do exercício", est_sec))
    linhas_dem = [
        ["Receita bruta faturada", _brl(t["bruto"]), "100,0%"],
        ["(–) Descontos e glosas", _brl(-t["descontos"]), _pct(t["descontos"], t["bruto"])],
        ["(=) Receita líquida — base tributária", _brl(t["liquida"]),
         _pct(t["liquida"], t["bruto"])],
        ["(–) Tributos sobre a receita", _brl(-t["impostos"]), _pct(t["impostos"], t["bruto"])],
        ["(–) Custo de pessoal", _brl(-t["custo_pessoal"]),
         _pct(t["custo_pessoal"], t["bruto"])],
    ]
    linhas_dem.append(["(=) MARGEM DO EXERCÍCIO", _brl(t["margem"]),
                       _pct(t["margem"], t["bruto"])])
    story.append(tabela(["Demonstrativo", "Valor", "% da receita bruta"],
                        linhas_dem, [150, 60, 45], dir_cols=(1, 2), total=True))
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph(
        f"Carga tributária efetiva sobre a base: <b>{_pct(t['impostos'], t['liquida'])}</b> · "
        f"Margem sobre a receita líquida: <b>{_pct(t['margem'], t['liquida'])}</b>", est_nota))

    story.append(PageBreak())

    # ── 3. Movimentação mês a mês ──
    story.append(Paragraph("3. Movimentação mês a mês", est_sec))
    rows = [[m["nome"], _brl(m["bruto"]), _brl(m["descontos"]), _brl(m["liquida"]),
             _brl(m["impostos"]), _brl(m["custo_pessoal"]), _brl(m["margem"]),
             _pct(m["margem"], m["liquida"])] for m in d["meses"]]
    rows.append(["TOTAL", _brl(t["bruto"]), _brl(t["descontos"]), _brl(t["liquida"]),
                 _brl(t["impostos"]), _brl(t["custo_pessoal"]), _brl(t["margem"]),
                 _pct(t["margem"], t["liquida"])])
    story.append(tabela(
        ["Mês", "Receita bruta", "Glosas", "Receita líquida", "Tributos",
         "Custo de pessoal", "Margem", "Margem %"],
        rows, [26, 38, 30, 38, 34, 38, 38, 24],
        dir_cols=(1, 2, 3, 4, 5, 6, 7), total=True))
    story.append(Spacer(1, 5 * mm))

    # ── 4. Tributos por espécie ──
    story.append(Paragraph("4. Tributos por espécie", est_sec))
    di = t["impostos_detalhe"]
    esp = [("IRPJ (15% do lucro presumido)", di["irpj"]),
           ("IRPJ — adicional de 10%", di["irpj_adicional"]),
           ("CSLL (9% do lucro presumido)", di["csll"]),
           ("PIS (0,65% da base)", di["pis"]),
           ("COFINS (3% da base)", di["cofins"]),
           ("ISS", di["iss"])]
    rows = [[nome, _brl(v), _pct(v, t["impostos"]), _pct(v, t["liquida"])]
            for nome, v in esp]
    rows.append(["TOTAL DE TRIBUTOS", _brl(t["impostos"]), "100,0%",
                 _pct(t["impostos"], t["liquida"])])
    story.append(tabela(["Espécie", "Valor no exercício", "% dos tributos",
                         "% da receita líquida"],
                        rows, [110, 50, 40, 45], dir_cols=(1, 2, 3), total=True))

    story.append(PageBreak())

    # ── 5. Quebras ──
    def bloco_quebra(titulo, itens, rotulo):
        story.append(Paragraph(titulo, est_sec))
        if not itens:
            story.append(Paragraph("Sem movimentação no exercício.", est_nota))
            story.append(Spacer(1, 4 * mm))
            return
        rows = []
        for it in itens:
            margem = round(it["liquida"] - it["impostos"] - it["custo"], 2)
            rows.append([it["nome"], _brl(it["bruto"]), _brl(it["descontos"]),
                         _brl(it["liquida"]), _brl(it["impostos"]), _brl(it["custo"]),
                         _brl(margem), _pct(margem, it["liquida"])])
        story.append(tabela(
            [rotulo, "Receita bruta", "Glosas", "Receita líquida", "Tributos",
             "Custo de pessoal", "Margem", "Margem %"],
            rows, [58, 36, 28, 36, 32, 36, 36, 22],
            dir_cols=(1, 2, 3, 4, 5, 6, 7)))
        story.append(Spacer(1, 5 * mm))

    bloco_quebra("5.1 Por centro de faturamento", d["por_centro"], "Centro")
    bloco_quebra("5.2 Por sede", d["por_sede"], "Sede")
    story.append(PageBreak())
    bloco_quebra("5.3 Por linha de faturamento", d["por_linha"], "Linha")

    # ── 6. Rastreabilidade das competências ──
    story.append(Paragraph("6. Rastreabilidade das competências", est_sec))
    rotulo_status = {"fechada": "Fechada", "em_revisao": "Em revisão",
                     "aberta": "Aberta", None: "Não existe"}
    rows = [[m["nome"],
             rotulo_status.get(m["competencia_status"], m["competencia_status"] or "—"),
             m["fechada_por"] or "—", m["fechada_em"] or "—",
             "Sim" if m["congelada"] else "Não",
             m["pessoas"] or "—"] for m in d["meses"]]
    story.append(tabela(
        ["Mês", "Situação", "Fechada por", "Fechada em", "Congelada", "Pessoas na folha"],
        rows, [30, 32, 62, 40, 26, 32], dir_cols=(5,)))
    story.append(Spacer(1, 4 * mm))

    # ── 7. Movimentação de pessoal ──
    p = d["pessoal"]
    story.append(Paragraph("7. Movimentação de pessoal", est_sec))
    saldo = p["admissoes"] - p["desligamentos"]
    story.append(tabela(
        ["Indicador", "Exercício"],
        [["Headcount no primeiro mês com folha", p["headcount_inicial"]],
         ["Headcount no último mês com folha", p["headcount_final"]],
         ["Admissões no exercício", p["admissoes"]],
         ["Desligamentos no exercício", p["desligamentos"]],
         ["Saldo líquido do quadro", f"{saldo:+d}"],
         ["Custo médio mensal de pessoal", _brl(p["custo_medio_mensal"])]],
        [110, 50], dir_cols=(1,)))

    def rodape(canvas, documento):
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(colors.HexColor("#999999"))
        canvas.drawString(12 * mm, 8 * mm,
                          f"MDR Advocacia · Relatório Técnico-Contábil {ano} "
                          f"(v{versao}) · powered by Duna.Tech")
        canvas.drawRightString(documento.pagesize[0] - 12 * mm, 8 * mm,
                               f"Página {documento.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=rodape, onLaterPages=rodape)
    return buf.getvalue()


# ──────────────────────────────── ENDPOINTS ────────────────────────────────

def _json_relatorio(r: RelatorioExercicio) -> dict:
    return {
        "id": str(r.id), "exercicio": r.exercicio, "versao": r.versao,
        "nome_arquivo": r.nome_arquivo, "tamanho": r.tamanho, "sha256": r.sha256,
        "gerado_por": r.gerado_por,
        "gerado_em": r.gerado_em.isoformat(),
        "quando_br": r.gerado_em.strftime("%d/%m/%Y às %H:%M"),
        "definitivo": r.definitivo,
        "competencias_no_ano": r.competencias_no_ano,
        "competencias_fechadas": r.competencias_fechadas,
        "resumo": r.resumo or {},
    }


@api_view(["GET"])
@permission_classes(_PERM_ARQ)
def arquivo_contabil_lista(request):
    """Estoque paginado. Padrão da casa: limit (default 50, max 500) + offset,
    resposta {total, items}."""
    qs = RelatorioExercicio.objects.all()
    ano = request.query_params.get("exercicio")
    if ano:
        qs = qs.filter(exercicio=ano)
    total = qs.count()
    try:
        limit = min(max(int(request.query_params.get("limit", 50)), 1), 500)
        offset = max(int(request.query_params.get("offset", 0)), 0)
    except ValueError:
        limit, offset = 50, 0
    return Response({"total": total,
                     "items": [_json_relatorio(r) for r in qs[offset:offset + limit]]})


@api_view(["GET"])
@permission_classes(_PERM_ARQ)
def arquivo_contabil_exercicios(request):
    """Anos que têm movimentação (receita lançada ou competência), com a
    situação de cada um — é o que a tela usa pra oferecer o que gerar."""
    anos = set()
    for l in LinhaFaturamento.objects.values_list("periodos", flat=True):
        for p in (l or {}):
            try:
                anos.add(int(str(p)[:4]))
            except (TypeError, ValueError):
                continue
    anos |= set(DpCompetencia.objects.values_list("ano", flat=True))

    emitidos = {}
    for r in RelatorioExercicio.objects.all():
        emitidos.setdefault(r.exercicio, []).append(r)

    saida = []
    for ano in sorted(anos, reverse=True):
        comps = DpCompetencia.objects.filter(ano=ano)
        n_total, n_fech = comps.count(), comps.filter(status="fechada").count()
        vs = emitidos.get(ano, [])
        saida.append({
            "exercicio": ano,
            "competencias_no_ano": n_total,
            "competencias_fechadas": n_fech,
            "definitivo": n_total == 12 and n_fech == 12,
            "versoes_emitidas": len(vs),
            "ultima_versao": max((r.versao for r in vs), default=0),
        })
    return Response({"total": len(saida), "items": saida})


@api_view(["POST"])
@permission_classes(_PERM_ARQ)
def arquivo_contabil_gerar(request):
    """Gera uma NOVA VERSÃO do relatório do exercício. Nunca sobrescreve."""
    try:
        ano = int(request.data.get("exercicio"))
    except (TypeError, ValueError):
        return Response({"detail": "Informe o exercício (ano)."}, status=400)
    if not (2000 <= ano <= 2100):
        return Response({"detail": "Exercício fora de faixa razoável."}, status=400)

    dados = _dados_exercicio(ano)
    if not dados["totais"]["bruto"] and not dados["competencias_no_ano"]:
        return Response({"detail": f"O exercício {ano} não tem movimentação "
                                   "nenhuma — nada a arquivar."}, status=409)

    usuario = _quem(request)
    proxima = (RelatorioExercicio.objects.filter(exercicio=ano)
               .order_by("-versao").values_list("versao", flat=True).first() or 0) + 1
    pdf = _pdf_exercicio(dados, usuario, proxima)
    # mesma convenção dos demais documentos: {documento}_{escopo}_{periodo}
    nome = f"relatorio-tecnico-contabil_exercicio-{ano}_v{proxima}.pdf"

    with transaction.atomic():
        r = RelatorioExercicio(
            exercicio=ano, versao=proxima, nome_arquivo=nome, tamanho=len(pdf),
            sha256=hashlib.sha256(pdf).hexdigest(), gerado_por=usuario,
            definitivo=dados["definitivo"],
            competencias_no_ano=dados["competencias_no_ano"],
            competencias_fechadas=dados["competencias_fechadas"],
            resumo={k: dados["totais"][k] for k in
                    ("bruto", "descontos", "liquida", "impostos",
                     "custo_pessoal", "margem")},
        )
        r.arquivo.save(nome, ContentFile(pdf), save=False)
        r.save()
        audit(request, "gerar_relatorio_exercicio", "ef_relatorio_exercicio", r.id,
              depois={"exercicio": ano, "versao": proxima,
                      "definitivo": "sim" if dados["definitivo"] else "não (parcial)",
                      "sha256": r.sha256})
    return Response(_json_relatorio(r), status=201)


@api_view(["GET"])
@permission_classes(_PERM_ARQ)
def arquivo_contabil_download(request, pk):
    """Baixa o PDF arquivado. Como no resto do módulo, o arquivo NUNCA é servido
    direto pelo nginx — passa por endpoint autenticado."""
    r = RelatorioExercicio.objects.filter(pk=pk).first()
    if not r:
        return Response({"detail": "Relatório não encontrado."}, status=404)
    if not r.arquivo:
        return Response({"detail": "O arquivo deste relatório não está mais "
                                   "disponível no storage."}, status=410)
    return FileResponse(r.arquivo.open("rb"), as_attachment=True,
                        filename=r.nome_arquivo, content_type="application/pdf")
