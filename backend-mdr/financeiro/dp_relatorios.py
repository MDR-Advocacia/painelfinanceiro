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

from .models import DpColaborador, DpCompetencia, DpEvento
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


@api_view(["GET"])
@permission_classes(_PERM)
def dp_relatorio_quadro(request):
    """Excel do Quadro de Pessoal (com filtro de status opcional)."""
    status_f = request.query_params.get("status", "")
    qs = DpColaborador.objects.select_related("centro_custo", "cargo").all()
    if status_f:
        qs = qs.filter(status=status_f)
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
