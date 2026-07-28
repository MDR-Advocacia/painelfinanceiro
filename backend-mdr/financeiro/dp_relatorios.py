# DP — F4: dashboard consolidado + RELATÓRIOS exportáveis TIMBRADOS (logo MDR).
#   • GET /dp/dashboard/                              KPIs + série mensal + regime
#   • GET /dp/competencias/<id>/relatorio/?tipo=folha|rateio&formato=excel|pdf
#   • GET /dp/relatorio-quadro/                       Excel do quadro de pessoal
# Excel: openpyxl com cabeçalho timbrado. PDF: reportlab (rateio — o relatório
# que vai pro fechamento/diretoria).
import os
from datetime import date, datetime
from io import BytesIO

from django.db.models import Count, Q, Sum
from django.http import HttpResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .models import DpCentroCusto, DpColaborador, DpCompetencia, DpEvento
from .views import modulo_permission

_PERM = [modulo_permission(read_any=["pessoal"], write="pessoal")]
_LOGO = os.path.join(os.path.dirname(__file__), "assets", "logo-mdr.png")

AZUL = "1E7BFF"
NAVY = "0A1940"


# ─────────────────────────────── DASHBOARD ───────────────────────────────

@api_view(["GET"])
@permission_classes(_PERM)
def dp_dashboard(request):
    hoje = date.today()
    ativos = DpColaborador.objects.filter(status="ativo")
    headcount = ativos.count()
    por_regime = dict(ativos.values_list("regime").annotate(n=Count("id")))

    # admissões/desligamentos por mês (últimos 12 meses, via eventos)
    serie_mov = []
    for i in range(11, -1, -1):
        a, m = hoje.year, hoje.month - i
        while m <= 0:
            m += 12
            a -= 1
        ini, fim = date(a, m, 1), date(a + (m == 12), (m % 12) + 1, 1)
        adm = DpEvento.objects.filter(tipo__in=["admissao", "importacao"],
                                      data_efeito__gte=ini, data_efeito__lt=fim).count()
        des = DpEvento.objects.filter(tipo="desligamento",
                                      data_efeito__gte=ini, data_efeito__lt=fim).count()
        serie_mov.append({"mes": f"{a}-{m:02d}", "admissoes": adm, "desligamentos": des})

    # série de custo por competência calculada
    serie_custo = []
    for comp in DpCompetencia.objects.order_by("ano", "mes")[:24]:
        ag = comp.itens.aggregate(pagar=Sum("total_pagar"), prov=Sum("custo_provisoes"),
                                  pat=Sum("inss_patronal"), custo=Sum("custo_total"))
        serie_custo.append({
            "mes": f"{comp.ano}-{comp.mes:02d}", "status": comp.status,
            "headcount": comp.itens.count(),
            "folha": round(ag["pagar"] or 0, 2), "provisoes": round(ag["prov"] or 0, 2),
            "patronal": round(ag["pat"] or 0, 2), "custo_total": round(ag["custo"] or 0, 2),
        })

    ult = serie_custo[-1] if serie_custo else None
    mov_mes = serie_mov[-1] if serie_mov else {"admissoes": 0, "desligamentos": 0}
    turnover = round(mov_mes["desligamentos"] / headcount * 100, 2) if headcount else 0.0
    return Response({
        "headcount": headcount, "por_regime": por_regime,
        "admissoes_mes": mov_mes["admissoes"], "desligamentos_mes": mov_mes["desligamentos"],
        "turnover_mes": turnover,
        "custo_competencia": ult, "serie_mov": serie_mov, "serie_custo": serie_custo,
    })


# ─────────────────────────────── HELPERS EXCEL ───────────────────────────────

def _wb_timbrado(titulo: str, subtitulo: str, usuario: str):
    from openpyxl import Workbook
    from openpyxl.drawing.image import Image as XLImage
    from openpyxl.styles import Alignment, Font

    wb = Workbook()
    ws = wb.active
    ws.title = "Relatório"
    if os.path.exists(_LOGO):
        img = XLImage(_LOGO)
        # proporção da logo (~450×160) reduzida pro cabeçalho
        img.width, img.height = 132, 47
        ws.add_image(img, "A1")
    ws.merge_cells("C1:H1")
    ws["C1"] = titulo
    ws["C1"].font = Font(name="Calibri", size=16, bold=True, color=NAVY)
    ws.merge_cells("C2:H2")
    ws["C2"] = subtitulo
    ws["C2"].font = Font(name="Calibri", size=10, color="666666")
    ws.merge_cells("C3:H3")
    ws["C3"] = f"Gerado por {usuario} em {datetime.now().strftime('%d/%m/%Y %H:%M')} — MDR Advocacia · Painel Financeiro"
    ws["C3"].font = Font(name="Calibri", size=8, italic=True, color="999999")
    ws.row_dimensions[1].height = 26
    ws.row_dimensions[2].height = 14
    return wb, ws


def _tabela(ws, linha0: int, headers: list, rows: list, larguras: list = None, money_cols: set = None):
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    fill = PatternFill("solid", fgColor=NAVY)
    fina = Side(style="thin", color="DDDDDD")
    borda = Border(left=fina, right=fina, top=fina, bottom=fina)
    money = money_cols or set()

    for j, h in enumerate(headers, start=1):
        c = ws.cell(row=linha0, column=j, value=h)
        c.font = Font(bold=True, color="FFFFFF", size=9)
        c.fill = fill
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = borda
    for i, row in enumerate(rows, start=linha0 + 1):
        for j, v in enumerate(row, start=1):
            c = ws.cell(row=i, column=j, value=v)
            c.font = Font(size=9)
            c.border = borda
            if j in money:
                c.number_format = 'R$ #,##0.00'
    if larguras:
        for j, w in enumerate(larguras, start=1):
            ws.column_dimensions[get_column_letter(j)].width = w
    ws.auto_filter.ref = f"A{linha0}:{get_column_letter(len(headers))}{linha0 + len(rows)}"
    ws.freeze_panes = ws.cell(row=linha0 + 1, column=1)


def _resposta_excel(wb, nome: str) -> HttpResponse:
    buf = BytesIO()
    wb.save(buf)
    resp = HttpResponse(
        buf.getvalue(),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    resp["Content-Disposition"] = f'attachment; filename="{nome}"'
    resp["Access-Control-Expose-Headers"] = "Content-Disposition"
    return resp


def _quem(request):
    u = request.user
    return (u.email or u.username) if u and u.is_authenticated else "?"


# ─────────────────────────────── RELATÓRIOS ───────────────────────────────

@api_view(["GET"])
@permission_classes(_PERM)
def dp_relatorio_competencia(request, pk):
    comp = DpCompetencia.objects.filter(pk=pk).first()
    if not comp:
        return Response({"detail": "Competência não encontrada."}, status=404)
    tipo = request.query_params.get("tipo", "folha")
    formato = request.query_params.get("formato", "excel")
    rotulo = f"{comp.mes:02d}/{comp.ano}"

    if tipo == "rateio":
        linhas = (comp.itens.values("centro_custo_nome")
                  .annotate(hc=Count("id"), folha=Sum("total_pagar"), prov=Sum("custo_provisoes"),
                            pat=Sum("inss_patronal"), custo=Sum("custo_total"))
                  .order_by("-custo"))
        rows = [[l["centro_custo_nome"], l["hc"], round(l["folha"] or 0, 2),
                 round(l["prov"] or 0, 2), round(l["pat"] or 0, 2), round(l["custo"] or 0, 2)]
                for l in linhas]
        tot = ["TOTAL", sum(r[1] for r in rows)] + [round(sum(r[i] for r in rows), 2) for i in (2, 3, 4, 5)]

        if formato == "pdf":
            return _pdf_rateio(comp, rows, tot, _quem(request), rotulo)

        wb, ws = _wb_timbrado("Rateio por Centro de Custo",
                              f"Competência {rotulo} · status: {comp.status}", _quem(request))
        _tabela(ws, 5, ["Centro de Custo", "Headcount", "Folha (R$)", "Provisões (R$)",
                        "INSS Patronal (R$)", "Custo Total (R$)"],
                rows + [tot], larguras=[34, 11, 15, 15, 16, 16], money_cols={3, 4, 5, 6})
        return _resposta_excel(wb, f"rateio_cc_{comp.ano}_{comp.mes:02d}.xlsx")

    # folha analítica
    if formato == "pdf":
        rows = [[it.matricula, it.nome[:32], REG_LABEL.get(it.regime, it.regime),
                 it.centro_custo_nome[:24], _brl(it.salario_bruto), _brl(it.desc_inss),
                 _brl(it.desc_vt), _brl(it.total_pagar), _brl(it.custo_total)]
                for it in comp.itens.all()]
        tot = ["TOTAL", "", "", "", "", "", "",
               _brl(sum(i.total_pagar for i in comp.itens.all())),
               _brl(sum(i.custo_total for i in comp.itens.all()))]
        return _pdf_generico(f"Folha Analítica — {rotulo}",
                             f"{len(rows)} colaboradores · status: {comp.status}",
                             ["Mat.", "Nome", "Regime", "Centro de Custo", "Bruto",
                              "INSS", "VT 6%", "A pagar", "Custo total"],
                             rows + [tot], [16, 62, 24, 46, 24, 22, 22, 26, 28],
                             _quem(request), f"folha_{comp.ano}_{comp.mes:02d}.pdf",
                             aligns_dir={4, 5, 6, 7, 8}, linha_total=True, paisagem=True)

    headers = ["Mat.", "Nome", "Regime", "Centro de Custo", "Sal. Bruto", "Faltas (d)",
               "Faltas (h)", "Desc. Faltas", "Desc. INSS", "Desc. VT", "VT", "VA",
               "Saldo Livre", "Prêmios", "Acerto", "Total a Pagar", "13º", "Férias",
               "1/3", "FGTS", "Multa FGTS", "Recesso", "Patronal", "Custo Total"]
    rows = []
    for it in comp.itens.all():
        rows.append([it.matricula, it.nome, it.regime, it.centro_custo_nome,
                     it.salario_bruto, it.faltas_dias, it.faltas_horas, it.desc_faltas,
                     it.desc_inss, it.desc_vt, it.vt_com_faltas, it.va_com_faltas,
                     it.saldo_livre, it.premiacoes, it.acerto_contabil, it.total_pagar,
                     it.decimo_mensal, it.ferias_mensal, it.terco_ferias_mensal,
                     it.fgts_mensal, it.multa_fgts_mensal, it.recesso_mensal,
                     it.inss_patronal, it.custo_total])
    wb, ws = _wb_timbrado("Folha Analítica",
                          f"Competência {rotulo} · {len(rows)} colaboradores · status: {comp.status}",
                          _quem(request))
    _tabela(ws, 5, headers, rows,
            larguras=[8, 32, 11, 24] + [12] * 20,
            money_cols=set(range(5, 25)) - {6, 7})
    return _resposta_excel(wb, f"folha_{comp.ano}_{comp.mes:02d}.xlsx")


def _pdf_rateio(comp, rows, tot, usuario: str, rotulo: str) -> HttpResponse:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.platypus import (Image, Paragraph, SimpleDocTemplate, Spacer, Table,
                                    TableStyle)
    from reportlab.lib.styles import ParagraphStyle

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=14 * mm, bottomMargin=14 * mm,
                            leftMargin=16 * mm, rightMargin=16 * mm,
                            title=f"Rateio por Centro de Custo — {rotulo}")
    azul = colors.HexColor("#1E7BFF")
    navy = colors.HexColor("#0A1940")
    story = []
    if os.path.exists(_LOGO):
        story.append(Image(_LOGO, width=44 * mm, height=15.6 * mm, hAlign="LEFT"))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph("Rateio de Pessoal por Centro de Custo",
                           ParagraphStyle("t", fontSize=16, textColor=navy, fontName="Helvetica-Bold")))
    story.append(Spacer(1, 1.5 * mm))
    story.append(Paragraph(
        f"Competência {rotulo} · status: {comp.status} · gerado por {usuario} em "
        f"{datetime.now().strftime('%d/%m/%Y %H:%M')}",
        ParagraphStyle("s", fontSize=8, textColor=colors.HexColor("#666666"))))
    story.append(Spacer(1, 6 * mm))

    brl = lambda v: f"R$ {v:,.2f}".replace(",", "@").replace(".", ",").replace("@", ".")
    data = [["Centro de Custo", "HC", "Folha", "Provisões", "Patronal", "Custo Total"]]
    for r in rows:
        data.append([r[0], str(r[1]), brl(r[2]), brl(r[3]), brl(r[4]), brl(r[5])])
    data.append([tot[0], str(tot[1]), brl(tot[2]), brl(tot[3]), brl(tot[4]), brl(tot[5])])

    t = Table(data, colWidths=[62 * mm, 12 * mm, 26 * mm, 26 * mm, 26 * mm, 27 * mm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), navy),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#F2F6FF")]),
        ("BACKGROUND", (0, -1), (-1, -1), azul),
        ("TEXTCOLOR", (0, -1), (-1, -1), colors.white),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CCD6EE")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(t)
    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph("MDR Advocacia · Painel Financeiro — powered by Duna.Tech",
                           ParagraphStyle("f", fontSize=7, textColor=colors.HexColor("#999999"))))
    doc.build(story)
    resp = HttpResponse(buf.getvalue(), content_type="application/pdf")
    resp["Content-Disposition"] = f'attachment; filename="rateio_cc_{comp.ano}_{comp.mes:02d}.pdf"'
    resp["Access-Control-Expose-Headers"] = "Content-Disposition"
    return resp


def _pdf_generico(titulo: str, subtitulo: str, headers: list, rows: list, larguras: list,
                  usuario: str, nome_arquivo: str, aligns_dir: set = None,
                  linha_total: bool = False, paisagem: bool = False) -> HttpResponse:
    """PDF timbrado genérico (usado por quadro, folha, catálogos, simulação…)."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import (Image, Paragraph, SimpleDocTemplate, Spacer, Table,
                                    TableStyle)

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4) if paisagem else A4,
                            topMargin=12 * mm, bottomMargin=12 * mm,
                            leftMargin=12 * mm, rightMargin=12 * mm, title=titulo)
    navy = colors.HexColor("#0A1940")
    azul = colors.HexColor("#1E7BFF")
    story = []
    if os.path.exists(_LOGO):
        story.append(Image(_LOGO, width=40 * mm, height=14.2 * mm, hAlign="LEFT"))
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph(titulo, ParagraphStyle("t", fontSize=15, textColor=navy,
                                                  fontName="Helvetica-Bold")))
    story.append(Paragraph(
        f"{subtitulo} · gerado por {usuario} em {datetime.now().strftime('%d/%m/%Y %H:%M')}",
        ParagraphStyle("s", fontSize=7.5, textColor=colors.HexColor("#666666"))))
    story.append(Spacer(1, 5 * mm))

    data = [headers] + [[str(c) for c in r] for r in rows]
    t = Table(data, colWidths=[w * mm for w in larguras], repeatRows=1)
    estilo = [
        ("BACKGROUND", (0, 0), (-1, 0), navy),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 6.8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1 if not linha_total else -2),
         [colors.white, colors.HexColor("#F2F6FF")]),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#CCD6EE")),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]
    for c in (aligns_dir or set()):
        estilo.append(("ALIGN", (c, 0), (c, -1), "RIGHT"))
    if linha_total:
        estilo += [("BACKGROUND", (0, -1), (-1, -1), azul),
                   ("TEXTCOLOR", (0, -1), (-1, -1), colors.white),
                   ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold")]
    t.setStyle(TableStyle(estilo))
    story.append(t)
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph("MDR Advocacia · Painel Financeiro — powered by Duna.Tech",
                           ParagraphStyle("f", fontSize=7, textColor=colors.HexColor("#999999"))))
    doc.build(story)
    resp = HttpResponse(buf.getvalue(), content_type="application/pdf")
    resp["Content-Disposition"] = f'attachment; filename="{nome_arquivo}"'
    resp["Access-Control-Expose-Headers"] = "Content-Disposition"
    return resp


def _brl(v) -> str:
    try:
        return f"R$ {float(v):,.2f}".replace(",", "@").replace(".", ",").replace("@", ".")
    except (TypeError, ValueError):
        return str(v)


@api_view(["GET"])
@permission_classes(_PERM)
def dp_relatorio_catalogos(request):
    """Cargos + Centros de Custo (Excel com 2 abas, ou PDF)."""
    from .models import DpCargo
    cargos = list(DpCargo.objects.all())
    ccs = list(DpCentroCusto.objects.all())
    usuario = _quem(request)

    if request.query_params.get("formato") == "pdf":
        rows = [[c.area, c.nome, _brl(c.salario_base), c.dias_mes, c.carga_horaria_mes] for c in cargos]
        return _pdf_generico("Plano de Cargos", f"{len(rows)} cargos",
                             ["Área", "Cargo", "Salário base", "Dias/mês", "Carga/mês"],
                             rows, [20, 80, 30, 20, 25], usuario, "plano_cargos.pdf",
                             aligns_dir={2, 3, 4})

    wb, ws = _wb_timbrado("Plano de Cargos", f"{len(cargos)} cargos cadastrados", usuario)
    _tabela(ws, 5, ["Área", "Cargo", "Salário base (R$)", "Dias/mês", "Carga horária/mês", "Ativo"],
            [[c.area, c.nome, c.salario_base, c.dias_mes, c.carga_horaria_mes,
              "Sim" if c.ativo else "Não"] for c in cargos],
            larguras=[10, 40, 18, 11, 18, 8], money_cols={3})
    ws2 = wb.create_sheet("Centros de Custo")
    _tabela(ws2, 1, ["Código", "Centro de Custo", "Colaboradores ativos"],
            [[c.codigo, c.nome, c.colaboradores.filter(status="ativo").count()] for c in ccs],
            larguras=[10, 40, 20])
    return _resposta_excel(wb, "cargos_e_centros_custo.xlsx")


@api_view(["GET"])
@permission_classes(_PERM)
def dp_relatorio_auditoria(request):
    """Trilha de auditoria em Excel (últimos N registros)."""
    from .models import DpAuditLog
    try:
        limit = min(int(request.query_params.get("limit", 2000)), 20000)
    except ValueError:
        limit = 2000
    logs = DpAuditLog.objects.all()[:limit]
    rows = [[a.created_at.strftime("%d/%m/%Y %H:%M:%S"), a.usuario, a.acao, a.entidade,
             a.entidade_id, str(a.antes or "")[:500], str(a.depois or "")[:500]] for a in logs]
    wb, ws = _wb_timbrado("Trilha de Auditoria — Controle de Pessoal",
                          f"{len(rows)} registro(s) mais recentes", _quem(request))
    _tabela(ws, 5, ["Data/hora", "Usuário", "Ação", "Entidade", "ID", "Antes", "Depois"],
            rows, larguras=[18, 26, 16, 20, 22, 60, 60])
    return _resposta_excel(wb, "auditoria_dp.xlsx")


@api_view(["GET"])
@permission_classes(_PERM)
def dp_relatorio_dashboard(request):
    """Dashboard do DP em Excel: KPIs + série de custo + movimentação."""
    from .dp_relatorios import dp_dashboard as _dash  # reusa o cálculo
    dados = _dash(request._request if hasattr(request, "_request") else request).data
    usuario = _quem(request)
    wb, ws = _wb_timbrado("Dashboard — Controle de Pessoal",
                          f"Headcount ativo: {dados['headcount']}", usuario)
    _tabela(ws, 5, ["Indicador", "Valor"], [
        ["Headcount ativo", dados["headcount"]],
        ["Admissões no mês", dados["admissoes_mes"]],
        ["Desligamentos no mês", dados["desligamentos_mes"]],
        ["Turnover do mês (%)", dados["turnover_mes"]],
    ] + [[f"Headcount — {REG_LABEL.get(k, k)}", v] for k, v in dados["por_regime"].items()],
        larguras=[34, 16])
    ws2 = wb.create_sheet("Custo por competência")
    _tabela(ws2, 1, ["Competência", "Status", "Headcount", "Folha (R$)", "Provisões (R$)",
                     "Patronal (R$)", "Custo total (R$)"],
            [[l["mes"], l["status"], l["headcount"], l["folha"], l["provisoes"],
              l["patronal"], l["custo_total"]] for l in dados["serie_custo"]],
            larguras=[14, 12, 12, 16, 16, 16, 18], money_cols={4, 5, 6, 7})
    ws3 = wb.create_sheet("Movimentação")
    _tabela(ws3, 1, ["Mês", "Admissões", "Desligamentos"],
            [[l["mes"], l["admissoes"], l["desligamentos"]] for l in dados["serie_mov"]],
            larguras=[14, 14, 16])
    return _resposta_excel(wb, "dashboard_dp.xlsx")


REG_LABEL = {"estagiario": "Estagiário (TCE)", "clt": "CLT",
             "associado": "Associado", "pj": "PJ"}


@api_view(["POST"])
@permission_classes(_PERM)
def dp_relatorio_simulacao(request):
    """Recebe o RESULTADO da simulação (do front) e devolve Excel ou PDF timbrado."""
    d = request.data or {}
    formato = request.query_params.get("formato", "excel")
    nome = d.get("nome") or "Cenário"
    usuario = _quem(request)
    atual, cen, delta = d.get("atual", {}), d.get("cenario", {}), d.get("delta", {})
    resumo = [
        ["Headcount", atual.get("headcount", 0), cen.get("headcount", 0), delta.get("headcount", 0)],
        ["Folha (a pagar)", atual.get("folha", 0), cen.get("folha", 0), delta.get("folha", 0)],
        ["Provisões", atual.get("provisoes", 0), cen.get("provisoes", 0), delta.get("provisoes", 0)],
        ["INSS patronal", atual.get("patronal", 0), cen.get("patronal", 0), delta.get("patronal", 0)],
        ["CUSTO TOTAL", atual.get("custo_total", 0), cen.get("custo_total", 0), delta.get("custo_total", 0)],
    ]
    sub = (f"Impacto mensal: {_brl(d.get('impacto_mensal', 0))} · "
           f"anual ({d.get('meses', 12)} meses): {_brl(d.get('impacto_anual', 0))}")

    if formato == "pdf":
        rows = [[r[0], _brl(r[1]) if r[0] != "Headcount" else r[1],
                 _brl(r[2]) if r[0] != "Headcount" else r[2],
                 _brl(r[3]) if r[0] != "Headcount" else r[3]] for r in resumo]
        return _pdf_generico(f"Simulação — {nome}", sub,
                             ["Indicador", "Cenário atual", "Cenário simulado", "Variação"],
                             rows, [55, 40, 40, 40], usuario, "simulacao.pdf",
                             aligns_dir={1, 2, 3}, linha_total=True)

    wb, ws = _wb_timbrado(f"Simulação — {nome}", sub, usuario)
    _tabela(ws, 5, ["Indicador", "Cenário atual", "Cenário simulado", "Variação"],
            resumo, larguras=[28, 20, 20, 18], money_cols={2, 3, 4})
    novos = d.get("detalhe_novos") or []
    if novos:
        ws2 = wb.create_sheet("Contratações simuladas")
        _tabela(ws2, 1, ["Vaga", "Regime", "Centro de Custo", "Salário bruto",
                         "A pagar", "Provisões", "Patronal", "Custo total"],
                [[n["nome"], REG_LABEL.get(n["regime"], n["regime"]), n["cc"], n["salario_bruto"],
                  n["total_pagar"], n["provisoes"], n["patronal"], n["custo_total"]] for n in novos],
                larguras=[26, 14, 24, 15, 14, 14, 14, 16], money_cols={4, 5, 6, 7, 8})
    porcc = d.get("por_centro_custo") or []
    if porcc:
        ws3 = wb.create_sheet("Impacto por CC")
        _tabela(ws3, 1, ["Centro de Custo", "Novas vagas", "Custo mensal"],
                [[c["centro_custo"], c["headcount"], c["custo_total"]] for c in porcc],
                larguras=[32, 14, 18], money_cols={3})
    return _resposta_excel(wb, "simulacao.xlsx")


@api_view(["GET"])
@permission_classes(_PERM)
def dp_relatorio_projecao(request):
    """Projeção de gastos + aprovisionamento em Excel ou PDF."""
    from .dp_simulacao import dp_projecao as _proj
    dados = _proj(request._request if hasattr(request, "_request") else request).data
    usuario = _quem(request)
    p = dados["premissas"]
    sub = (f"{p['meses']} meses · reajuste {p['reajuste']:.1%} no mês {p['mes_reajuste']} · "
           f"crescimento {p['crescimento']:.1%} a.m.")
    linhas = dados["linhas"]

    if request.query_params.get("formato") == "pdf":
        rows = [[l["mes"], l["headcount"], _brl(l["folha"]), _brl(l["provisoes"]),
                 _brl(l["patronal"]), _brl(l["custo_total"]), _brl(l["provisionado_acumulado"])]
                for l in linhas]
        return _pdf_generico("Projeção de Gastos com Pessoal", sub,
                             ["Mês", "HC", "Folha", "Provisões", "Patronal", "Custo total",
                              "Provisionado acum."],
                             rows, [20, 14, 30, 30, 28, 32, 36], usuario, "projecao.pdf",
                             aligns_dir={1, 2, 3, 4, 5, 6}, paisagem=True)

    wb, ws = _wb_timbrado("Projeção de Gastos com Pessoal", sub, usuario)
    _tabela(ws, 5, ["Mês", "Headcount", "Folha (R$)", "Provisões (R$)", "Patronal (R$)",
                    "Custo total (R$)", "Provisionado acumulado (R$)"],
            [[l["mes"], l["headcount"], l["folha"], l["provisoes"], l["patronal"],
              l["custo_total"], l["provisionado_acumulado"]] for l in linhas],
            larguras=[12, 12, 16, 16, 16, 18, 24], money_cols={3, 4, 5, 6, 7})
    ap = dados["aprovisionamento"]
    ws2 = wb.create_sheet("Aprovisionamento")
    _tabela(ws2, 1, ["Verba provisionada", "Valor acumulado (R$)"],
            [["13º salário", ap["decimo"]], ["Férias", ap["ferias"]], ["1/3 de férias", ap["terco"]],
             ["FGTS", ap["fgts"]], ["Multa FGTS (40%)", ap["multa_fgts"]],
             ["Recesso (estagiários)", ap["recesso"]], ["TOTAL", ap["total"]]],
            larguras=[30, 24], money_cols={2})
    return _resposta_excel(wb, "projecao_gastos.xlsx")


@api_view(["GET"])
@permission_classes(_PERM)
def dp_relatorio_quadro(request):
    """Excel do Quadro de Pessoal (com filtro de status opcional)."""
    status_f = request.query_params.get("status", "")
    qs = DpColaborador.objects.select_related("centro_custo", "cargo").all()
    if status_f:
        qs = qs.filter(status=status_f)
    if request.query_params.get("formato") == "pdf":
        rows = [[c.matricula, c.nome[:34], REG_LABEL.get(c.regime, c.regime), c.status,
                 c.centro_custo.nome[:26] if c.centro_custo_id else "",
                 (c.cargo.nome[:26] if c.cargo_id else ""), _brl(c.salario_bruto)] for c in qs]
        return _pdf_generico("Quadro de Pessoal",
                             f"{len(rows)} colaborador(es)" + (f" · {status_f}" if status_f else " · todos"),
                             ["Mat.", "Nome", "Regime", "Status", "Centro de Custo", "Cargo", "Sal. bruto"],
                             rows, [16, 68, 26, 18, 55, 55, 28], _quem(request),
                             "quadro_pessoal.pdf", aligns_dir={6}, paisagem=True)

    headers = ["Mat.", "Nome", "CPF", "Regime", "Status", "Unidade", "Área",
               "Centro de Custo", "Supervisor", "Equipe", "Cargo", "Admissão",
               "Demissão", "Sal. Bruto", "Saldo Livre", "VT", "VA"]
    rows = []
    for c in qs:
        rows.append([c.matricula, c.nome, c.cpf, c.get_regime_display(), c.status,
                     c.unidade, c.area, c.centro_custo.nome if c.centro_custo_id else "",
                     c.supervisor, c.equipe, c.cargo.nome if c.cargo_id else "",
                     str(c.data_admissao or ""), str(c.data_demissao or ""),
                     c.salario_bruto, c.saldo_livre, c.vt, c.va])
    wb, ws = _wb_timbrado("Quadro de Pessoal",
                          f"{len(rows)} colaborador(es)" + (f" · filtro: {status_f}" if status_f else " · todos"),
                          _quem(request))
    _tabela(ws, 5, headers, rows,
            larguras=[8, 32, 13, 13, 9, 13, 7, 24, 16, 18, 24, 11, 11, 12, 11, 9, 9],
            money_cols={14, 15, 16, 17})
    return _resposta_excel(wb, "quadro_pessoal.xlsx")
