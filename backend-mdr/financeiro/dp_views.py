# Módulo Controle de Pessoal (DP) — F1: cadastro + importador + auditoria.
# RBAC: leitura exige nível "ver" no módulo `pessoal`; escrita exige "editar".
# TODA escrita gera DpAuditLog (imutável) e, quando cadastral, DpEvento.
from datetime import date, datetime

from django.db import transaction
from django.db.models import Max, Q
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response

from .models import (
    DP_MATRICULA_BASE, DpAuditLog, DpCargo, DpCentroCusto, DpColaborador, DpEvento,
)
from .serializers import DpCargoSerializer, DpCentroCustoSerializer, DpColaboradorSerializer
from .views import modulo_permission

_PERM = [modulo_permission(read_any=["pessoal"], write="pessoal")]


def _quem(request) -> str:
    u = request.user
    return (u.email or u.username or str(u.pk)) if u and u.is_authenticated else "?"


def audit(request, acao: str, entidade: str, entidade_id, antes=None, depois=None):
    DpAuditLog.objects.create(
        usuario=_quem(request), acao=acao, entidade=entidade,
        entidade_id=str(entidade_id or ""), antes=antes, depois=depois,
    )


def _snap(obj: DpColaborador) -> dict:
    return {
        "matricula": obj.matricula, "nome": obj.nome, "cpf": obj.cpf,
        "unidade": obj.unidade, "area": obj.area,
        "centro_custo": obj.centro_custo.nome if obj.centro_custo_id else None,
        "supervisor": obj.supervisor, "equipe": obj.equipe,
        "cargo": obj.cargo.nome if obj.cargo_id else None,
        "regime": obj.regime, "status": obj.status,
        "data_admissao": str(obj.data_admissao or ""), "data_demissao": str(obj.data_demissao or ""),
        "salario_bruto": obj.salario_bruto, "saldo_livre": obj.saldo_livre,
        "vt": obj.vt, "va": obj.va, "opta_vt": obj.opta_vt,
    }


def proxima_matricula(regime: str) -> int:
    """Matrícula automática pela lógica da casa: 10xx/20xx/30xx/40xx por regime."""
    base = DP_MATRICULA_BASE.get(regime, 9000)
    atual = DpColaborador.objects.filter(
        matricula__gte=base, matricula__lt=base + 1000
    ).aggregate(m=Max("matricula"))["m"]
    return (atual + 1) if atual else base + 1


class DpCentroCustoViewSet(viewsets.ModelViewSet):
    queryset = DpCentroCusto.objects.all()
    serializer_class = DpCentroCustoSerializer
    permission_classes = _PERM

    def perform_create(self, serializer):
        obj = serializer.save()
        audit(self.request, "criar", "dp_centro_custo", obj.id, depois={"codigo": obj.codigo, "nome": obj.nome})

    def perform_update(self, serializer):
        antes = {"codigo": serializer.instance.codigo, "nome": serializer.instance.nome,
                 "ativo": serializer.instance.ativo}
        obj = serializer.save()
        audit(self.request, "editar", "dp_centro_custo", obj.id, antes=antes,
              depois={"codigo": obj.codigo, "nome": obj.nome, "ativo": obj.ativo})


class DpCargoViewSet(viewsets.ModelViewSet):
    queryset = DpCargo.objects.all()
    serializer_class = DpCargoSerializer
    permission_classes = _PERM

    def perform_create(self, serializer):
        obj = serializer.save()
        audit(self.request, "criar", "dp_cargo", obj.id,
              depois={"nome": obj.nome, "salario_base": obj.salario_base})

    def perform_update(self, serializer):
        antes = {"nome": serializer.instance.nome, "salario_base": serializer.instance.salario_base}
        obj = serializer.save()
        audit(self.request, "editar", "dp_cargo", obj.id, antes=antes,
              depois={"nome": obj.nome, "salario_base": obj.salario_base})


class DpColaboradorViewSet(viewsets.ModelViewSet):
    """Quadro de pessoal. list aceita: ?busca= (nome/matrícula/cpf), ?regime=,
    ?status=, ?cc= (uuid), ?unidade=, ?limit/?offset — devolve {total, items}."""
    queryset = DpColaborador.objects.select_related("centro_custo", "cargo").all()
    serializer_class = DpColaboradorSerializer
    permission_classes = _PERM

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        busca = (request.query_params.get("busca") or "").strip()
        if busca:
            f = Q(nome__icontains=busca) | Q(cpf__icontains=busca)
            if busca.isdigit():
                f |= Q(matricula=int(busca))
            qs = qs.filter(f)
        if request.query_params.get("regime"):
            qs = qs.filter(regime=request.query_params["regime"])
        if request.query_params.get("status"):
            qs = qs.filter(status=request.query_params["status"])
        if request.query_params.get("cc"):
            qs = qs.filter(centro_custo_id=request.query_params["cc"])
        if request.query_params.get("unidade"):
            qs = qs.filter(unidade=request.query_params["unidade"])
        total = qs.count()
        try:
            limit = min(int(request.query_params.get("limit", 50)), 500)
            offset = max(int(request.query_params.get("offset", 0)), 0)
        except ValueError:
            limit, offset = 50, 0
        items = self.get_serializer(qs[offset:offset + limit], many=True).data
        return Response({"total": total, "items": items})

    def perform_create(self, serializer):
        regime = serializer.validated_data.get("regime")
        matricula = serializer.validated_data.get("matricula") or proxima_matricula(regime)
        obj = serializer.save(matricula=matricula)
        DpEvento.objects.create(
            colaborador=obj, tipo="admissao",
            data_efeito=obj.data_admissao or obj.data_entrada or date.today(),
            payload={"regime": obj.regime, "cc": obj.centro_custo.nome if obj.centro_custo_id else None},
            autor=_quem(self.request),
        )
        audit(self.request, "criar", "dp_colaborador", obj.id, depois=_snap(obj))

    def perform_update(self, serializer):
        inst = serializer.instance
        antes = _snap(inst)
        cc_antes, sal_antes = inst.centro_custo_id, inst.salario_bruto
        obj = serializer.save()
        depois = _snap(obj)
        if antes != depois:
            audit(self.request, "editar", "dp_colaborador", obj.id, antes=antes, depois=depois)
            hoje = date.today()
            if obj.centro_custo_id != cc_antes:
                DpEvento.objects.create(colaborador=obj, tipo="transferencia_cc", data_efeito=hoje,
                                        payload={"de": antes["centro_custo"], "para": depois["centro_custo"]},
                                        autor=_quem(self.request))
            if obj.salario_bruto != sal_antes:
                DpEvento.objects.create(colaborador=obj, tipo="reajuste", data_efeito=hoje,
                                        payload={"de": sal_antes, "para": obj.salario_bruto},
                                        autor=_quem(self.request))

    def destroy(self, request, *args, **kwargs):
        # Sem hard-delete no quadro: histórico é sagrado. Use /desligar.
        return Response({"detail": "Colaborador não é excluído — use o desligamento."},
                        status=status.HTTP_405_METHOD_NOT_ALLOWED)

    @action(detail=True, methods=["post"])
    def desligar(self, request, pk=None):
        """Desligamento: {data_demissao: 'YYYY-MM-DD', observacao?}. Marca inativo
        + evento de desligamento (verbas rescisórias detalhadas ficam pra F2)."""
        obj = self.get_object()
        data_str = request.data.get("data_demissao")
        try:
            data_dem = datetime.strptime(data_str, "%Y-%m-%d").date() if data_str else date.today()
        except ValueError:
            return Response({"detail": "data_demissao inválida (use YYYY-MM-DD)."},
                            status=status.HTTP_400_BAD_REQUEST)
        antes = _snap(obj)
        obj.status = "inativo"
        obj.data_demissao = data_dem
        obj.save()
        DpEvento.objects.create(colaborador=obj, tipo="desligamento", data_efeito=data_dem,
                                payload={"observacao": request.data.get("observacao", "")},
                                autor=_quem(request))
        audit(request, "desligar", "dp_colaborador", obj.id, antes=antes, depois=_snap(obj))
        return Response(self.get_serializer(obj).data)

    @action(detail=True, methods=["get"])
    def eventos(self, request, pk=None):
        obj = self.get_object()
        return Response([
            {"tipo": e.tipo, "data_efeito": str(e.data_efeito), "payload": e.payload,
             "autor": e.autor, "created_at": e.created_at.isoformat()}
            for e in obj.eventos.all()[:100]
        ])

    @action(detail=False, methods=["get"])
    def proxima_matricula(self, request):
        regime = request.query_params.get("regime", "clt")
        return Response({"matricula": proxima_matricula(regime)})

    @action(detail=False, methods=["get"])
    def resumo(self, request):
        """KPIs do quadro pro topo da tela."""
        qs = DpColaborador.objects.all()
        ativos = qs.filter(status="ativo")
        por_regime = {r: ativos.filter(regime=r).count() for r, _ in
                      [("estagiario", ""), ("clt", ""), ("associado", ""), ("pj", "")]}
        return Response({
            "ativos": ativos.count(),
            "inativos": qs.filter(status="inativo").count(),
            "por_regime": por_regime,
        })


@api_view(["GET"])
@permission_classes(_PERM)
def dp_audit_list(request):
    """Trilha de auditoria do DP (paginada): ?limit/?offset/?entidade=."""
    qs = DpAuditLog.objects.all()
    if request.query_params.get("entidade"):
        qs = qs.filter(entidade=request.query_params["entidade"])
    total = qs.count()
    try:
        limit = min(int(request.query_params.get("limit", 50)), 500)
        offset = max(int(request.query_params.get("offset", 0)), 0)
    except ValueError:
        limit, offset = 50, 0
    return Response({"total": total, "items": [
        {"usuario": a.usuario, "acao": a.acao, "entidade": a.entidade,
         "entidade_id": a.entidade_id, "antes": a.antes, "depois": a.depois,
         "created_at": a.created_at.isoformat()}
        for a in qs[offset:offset + limit]
    ]})


# ─────────────────────────── IMPORTADOR DA PLANILHA ───────────────────────────

_REGIME_MAP = {
    "estagiário (tce)": "estagiario", "estagiario (tce)": "estagiario",
    "estagiário": "estagiario", "clt": "clt", "associado": "associado", "pj": "pj",
}


def _norm(v):
    if v is None:
        return ""
    s = str(v).strip()
    return s[:-2] if s.endswith(".0") and s[:-2].isdigit() else s


def _data(v):
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    return None


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


@api_view(["POST"])
@permission_classes(_PERM)
def dp_importar(request):
    """Importa a planilha REAL "Controle de Pessoal DP - CC.xlsx":
    CONFIG (CCs+códigos) → TB_Cargos → TB_Colaboradores (upsert por matrícula)
    → Desligados (data de demissão). Idempotente: rodar de novo atualiza.
    """
    from io import BytesIO

    from openpyxl import load_workbook

    f = request.FILES.get("arquivo")
    if not f:
        return Response({"detail": "Envie o arquivo em 'arquivo'."}, status=400)
    try:
        wb = load_workbook(BytesIO(f.read()), read_only=True, data_only=True)
    except Exception:
        return Response({"detail": "Arquivo inválido — envie o .xlsx do Controle de Pessoal."}, status=400)

    resumo = {"ccs": 0, "cargos": 0, "colaboradores_novos": 0,
              "colaboradores_atualizados": 0, "desligados_marcados": 0, "avisos": []}

    with transaction.atomic():
        # 1) CONFIG → Centros de Custo (colunas B=CCs, C=Cód)
        if "CONFIG" in wb.sheetnames:
            ws = wb["CONFIG"]
            for row in ws.iter_rows(min_row=3, values_only=True):
                nome, cod = _norm(row[1] if len(row) > 1 else None), _norm(row[2] if len(row) > 2 else None)
                if not nome:
                    continue
                DpCentroCusto.objects.update_or_create(
                    nome=nome, defaults={"codigo": int(cod) if cod.isdigit() else 0})
                resumo["ccs"] += 1

        # 2) TB_Cargos → plano de cargos (r3=header: Área, Cargo, Salário, Dias, Carga)
        if "TB_Cargos" in wb.sheetnames:
            ws = wb["TB_Cargos"]
            for row in ws.iter_rows(min_row=4, values_only=True):
                area, nome = _norm(row[0]), _norm(row[1] if len(row) > 1 else None)
                if not nome:
                    continue
                DpCargo.objects.update_or_create(nome=nome, defaults={
                    "area": area, "salario_base": _num(row[2] if len(row) > 2 else 0),
                    "dias_mes": int(_num(row[3] if len(row) > 3 else 30) or 30),
                    "carga_horaria_mes": int(_num(row[4] if len(row) > 4 else 220) or 220),
                })
                resumo["cargos"] += 1

        # 3) TB_Colaboradores (r3=header; colunas conforme a planilha)
        cc_por_nome = {c.nome: c for c in DpCentroCusto.objects.all()}
        cargo_por_nome = {c.nome: c for c in DpCargo.objects.all()}
        if "TB_Colaboradores" in wb.sheetnames:
            ws = wb["TB_Colaboradores"]
            for row in ws.iter_rows(min_row=4, values_only=True):
                mat = _norm(row[1] if len(row) > 1 else None)
                nome = _norm(row[2] if len(row) > 2 else None)
                if not mat.isdigit() or not nome:
                    continue
                cc_nome = _norm(row[8] if len(row) > 8 else None)
                cc = cc_por_nome.get(cc_nome)
                if cc is None and cc_nome:
                    cc = DpCentroCusto.objects.create(nome=cc_nome, codigo=0)
                    cc_por_nome[cc_nome] = cc
                    resumo["avisos"].append(f"CC criado fora do CONFIG: {cc_nome}")
                if cc is None:
                    resumo["avisos"].append(f"Colaborador {mat} sem CC — pulado")
                    continue
                cargo_nome = _norm(row[11] if len(row) > 11 else None)
                cargo = cargo_por_nome.get(cargo_nome)
                regime = _REGIME_MAP.get(_norm(row[13] if len(row) > 13 else "").lower(), "clt")
                campos = {
                    "nome": nome, "sexo": _norm(row[3]), "cpf": _norm(row[4]),
                    "unidade": _norm(row[5]), "area": _norm(row[6]),
                    "centro_custo": cc, "supervisor": _norm(row[9]), "equipe": _norm(row[10]),
                    "cargo": cargo, "regime": regime,
                    "status": "ativo" if _norm(row[12]).lower() == "ativo" else "inativo",
                    "data_entrada": _data(row[14] if len(row) > 14 else None),
                    "data_admissao": _data(row[15] if len(row) > 15 else None),
                    "data_demissao": _data(row[16] if len(row) > 16 else None),
                    "salario_bruto": _num(row[17] if len(row) > 17 else 0),
                    "saldo_livre": _num(row[18] if len(row) > 18 else 0),
                    "vt": _num(row[19] if len(row) > 19 else 0),
                    "opta_vt": _norm(row[20] if len(row) > 20 else "").lower() not in ("não", "nao", "n"),
                    "va": _num(row[21] if len(row) > 21 else 0),
                    "conta_bb": _norm(row[22] if len(row) > 22 else ""),
                    "pix": _norm(row[23] if len(row) > 23 else ""),
                    "conta_caixa": _norm(row[24] if len(row) > 24 else ""),
                }
                obj, criado = DpColaborador.objects.update_or_create(
                    matricula=int(mat), defaults=campos)
                resumo["colaboradores_novos" if criado else "colaboradores_atualizados"] += 1
                if criado:
                    DpEvento.objects.create(
                        colaborador=obj, tipo="importacao",
                        data_efeito=obj.data_admissao or date.today(),
                        payload={"origem": "planilha"}, autor=_quem(request))

        # 4) Desligados → garante data de demissão/evento (r2=header)
        if "Desligados" in wb.sheetnames:
            ws = wb["Desligados"]
            for row in ws.iter_rows(min_row=3, values_only=True):
                data_dem = _data(row[0] if row else None)
                mat = _norm(row[1] if len(row) > 1 else None)
                if not mat.isdigit() or not data_dem:
                    continue
                obj = DpColaborador.objects.filter(matricula=int(mat)).first()
                if obj and (obj.status != "inativo" or obj.data_demissao != data_dem):
                    obj.status = "inativo"
                    obj.data_demissao = data_dem
                    obj.save()
                    if not obj.eventos.filter(tipo="desligamento").exists():
                        DpEvento.objects.create(colaborador=obj, tipo="desligamento",
                                                data_efeito=data_dem,
                                                payload={"origem": "planilha"}, autor=_quem(request))
                    resumo["desligados_marcados"] += 1

    wb.close()
    audit(request, "importar", "dp_importacao", "", depois=resumo)
    return Response(resumo)
