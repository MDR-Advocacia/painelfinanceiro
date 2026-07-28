# Escopo por SUBNÚCLEO: além de "quais módulos", o cargo pode ser limitado a
# recortes (unidade, área, centro de custo — e setores/sedes no financeiro).
# Lista vazia = sem restrição. Admin (is_staff) nunca é filtrado.
from .models import PerfilUsuario


def cargo_do(user):
    if not (user and user.is_authenticated) or user.is_staff:
        return None
    p = PerfilUsuario.objects.filter(user=user).select_related("cargo").first()
    return p.cargo if p else None


def escopo_do(user) -> dict:
    """Recortes efetivos do usuário — {} = sem restrição."""
    c = cargo_do(user)
    if c is None:
        return {}
    return {
        "unidades": list(c.escopo_unidades or []),
        "areas": list(c.escopo_areas or []),
        "ccs": [str(x) for x in (c.escopo_ccs or [])],
        "setores": [str(x) for x in (c.escopo_setores or [])],
        "sedes": [str(x) for x in (c.escopo_sedes or [])],
    }


def filtrar_colaboradores(qs, user):
    """Aplica o escopo do cargo no quadro de pessoal (e no que deriva dele)."""
    e = escopo_do(user)
    if not e:
        return qs
    if e["unidades"]:
        qs = qs.filter(unidade__in=e["unidades"])
    if e["areas"]:
        qs = qs.filter(area__in=e["areas"])
    if e["ccs"]:
        qs = qs.filter(centro_custo_id__in=e["ccs"])
    return qs


def filtrar_folha(qs, user):
    """Itens de folha respeitam o escopo pelo colaborador de origem."""
    e = escopo_do(user)
    if not e:
        return qs
    if e["unidades"]:
        qs = qs.filter(colaborador__unidade__in=e["unidades"])
    if e["areas"]:
        qs = qs.filter(colaborador__area__in=e["areas"])
    if e["ccs"]:
        qs = qs.filter(colaborador__centro_custo_id__in=e["ccs"])
    return qs


def filtrar_setores(qs, user):
    e = escopo_do(user)
    if e.get("setores"):
        qs = qs.filter(id__in=e["setores"])
    elif e.get("sedes"):
        qs = qs.filter(sede_id__in=e["sedes"])
    return qs


def filtrar_sedes(qs, user):
    e = escopo_do(user)
    if e.get("sedes"):
        qs = qs.filter(id__in=e["sedes"])
    return qs
