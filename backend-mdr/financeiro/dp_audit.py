# DP — Tradução da trilha de auditoria pra LINGUAGEM HUMANA.
# O log guarda antes/depois em JSON; aqui isso vira frase legível:
#   "Maria alterou o salário bruto de João Silva: R$ 3.000,00 → R$ 3.300,00"
# Nada de JSON na tela — o operador lê o que aconteceu.
from datetime import date, datetime

# rótulo + tipo de formatação por campo
CAMPOS = {
    # colaborador
    "nome": ("Nome", "texto"),
    "cpf": ("CPF", "texto"),
    "sexo": ("Sexo", "texto"),
    "unidade": ("Unidade", "texto"),
    "area": ("Área", "texto"),
    "centro_custo": ("Centro de custo", "texto"),
    "supervisor": ("Supervisor", "texto"),
    "e_supervisor": ("É supervisor", "sim_nao"),
    "e_coordenador": ("É coordenador", "sim_nao"),
    "coordenador": ("Coordenador", "texto"),
    "tipo_desligamento": ("Tipo de desligamento", "texto"),
    "liquido_rescisao": ("Líquido da rescisão", "moeda"),
    "equipe": ("Equipe", "texto"),
    "cargo": ("Cargo", "texto"),
    "regime": ("Tipo de contrato", "regime"),
    "status": ("Situação", "status"),
    "matricula": ("Matrícula", "texto"),
    "data_admissao": ("Data de admissão", "data"),
    "data_demissao": ("Data de desligamento", "data"),
    "data_entrada": ("Data de entrada", "data"),
    "salario_bruto": ("Salário bruto", "moeda"),
    "saldo_livre": ("Saldo livre", "moeda"),
    "vt": ("Vale-transporte", "moeda"),
    "va": ("Vale-alimentação", "moeda"),
    "opta_vt": ("Opta pelo vale-transporte", "sim_nao"),
    "conta_bb": ("Conta Banco do Brasil", "texto"),
    "conta_caixa": ("Conta Caixa", "texto"),
    "pix": ("Chave PIX", "texto"),
    # cargo / centro de custo
    "salario_base": ("Salário base", "moeda"),
    "codigo": ("Código", "texto"),
    "ativo": ("Ativo", "sim_nao"),
    # parâmetros fiscais
    "vigencia": ("Vigência", "data"),
    "vt_percent": ("Desconto de vale-transporte", "percent"),
    "vt": ("Vale-transporte", "moeda"),
    "fgts": ("FGTS", "percent"),
    "fgts_percent": ("FGTS", "percent"),
    "multa": ("Multa do FGTS", "percent"),
    "multa_fgts_percent": ("Multa do FGTS", "percent"),
    "patronal": ("INSS patronal", "percent"),
    "inss_patronal_percent": ("INSS patronal", "percent"),
    "provisao_base": ("Base das provisões", "base_prov"),
    "inss_faixas": ("Faixas do INSS", "faixas"),
    # lançamentos da folha
    "faltas_dias": ("Faltas (dias)", "num"),
    "faltas_horas": ("Faltas (horas)", "num"),
    "premiacoes": ("Premiações/extras", "moeda"),
    "acerto": ("Acerto contábil", "moeda"),
    "acerto_contabil": ("Acerto contábil", "moeda"),
    "colaborador": ("Colaborador", "texto"),
    "observacao": ("Observação", "texto"),
    "justificativa": ("Justificativa", "texto"),
    "obs": ("Observação", "texto"),
}

REGIMES = {"estagiario": "Estagiário (TCE)", "clt": "CLT",
           "associado": "Associado", "pj": "PJ"}
STATUS = {"ativo": "Ativo", "inativo": "Desligado"}
BASE_PROV = {"bruto_menos_inss": "Bruto menos INSS", "bruto": "Bruto"}

# ação → (verbo humano, ícone/tom pra UI)
ACOES = {
    "criar": ("cadastrou", "criar"),
    "editar": ("alterou", "editar"),
    "desligar": ("desligou", "sair"),
    "importar": ("importou a planilha", "importar"),
    "simular": ("simulou um cenário", "simular"),
    "abrir_competencia": ("abriu a competência", "abrir"),
    "recalcular": ("recalculou a folha", "recalcular"),
    "lancar": ("lançou ocorrências de", "lancar"),
    "enviar_revisao": ("enviou a folha para revisão", "revisao"),
    "fechar_competencia": ("fechou a competência", "fechar"),
    "reabrir_competencia": ("reabriu a competência", "reabrir"),
    "desfazer_revisao": ("desfez o envio para revisão", "reabrir"),
    "ajuste_pontual": ("fez um ajuste pontual em", "ajuste"),
    "excluir": ("excluiu", "sair"),
}

ENTIDADES = {
    "dp_colaborador": "colaborador",
    "dp_cargo": "cargo",
    "dp_centro_custo": "centro de custo",
    "dp_tabela_fiscal": "parâmetros fiscais",
    "dp_competencia": "competência",
    "dp_lancamento": "lançamento da folha",
    "dp_importacao": "importação",
    "dp_simulacao": "simulação",
    "dp_folha_item": "linha da folha",
    "dp_lideranca": "liderança",
}


def _brl(v) -> str:
    try:
        return f"R$ {float(v):,.2f}".replace(",", "@").replace(".", ",").replace("@", ".")
    except (TypeError, ValueError):
        return str(v)


def _data_br(v) -> str:
    if not v:
        return "—"
    if isinstance(v, (date, datetime)):
        return v.strftime("%d/%m/%Y")
    s = str(v)[:10]
    try:
        return datetime.strptime(s, "%Y-%m-%d").strftime("%d/%m/%Y")
    except ValueError:
        return s


def fmt_valor(valor, tipo: str) -> str:
    if valor in (None, "", []):
        return "—"
    if tipo == "moeda":
        return _brl(valor)
    if tipo == "percent":
        try:
            return f"{float(valor) * 100:.2f}%".replace(".", ",")
        except (TypeError, ValueError):
            return str(valor)
    if tipo == "data":
        return _data_br(valor)
    if tipo == "regime":
        return REGIMES.get(str(valor), str(valor))
    if tipo == "status":
        return STATUS.get(str(valor), str(valor))
    if tipo == "base_prov":
        return BASE_PROV.get(str(valor), str(valor))
    if tipo == "sim_nao":
        return "Sim" if valor in (True, "true", "True", 1) else "Não"
    if tipo == "faixas":
        try:
            return " · ".join(f"até {_brl(f['ate'])} = {float(f['aliquota']) * 100:.1f}%"
                              for f in valor)
        except (TypeError, KeyError, ValueError):
            return f"{len(valor)} faixa(s)" if isinstance(valor, list) else str(valor)
    if tipo == "num":
        try:
            f = float(valor)
            return str(int(f)) if f == int(f) else f"{f}".replace(".", ",")
        except (TypeError, ValueError):
            return str(valor)
    return str(valor)


def _mudancas(antes: dict, depois: dict) -> list:
    """Lista campo-a-campo o que efetivamente mudou (só o que é diferente)."""
    out = []
    antes = antes or {}
    depois = depois or {}
    for chave in depois.keys() | antes.keys():
        va, vd = antes.get(chave), depois.get(chave)
        if va == vd:
            continue
        rotulo, tipo = CAMPOS.get(chave, (chave.replace("_", " ").capitalize(), "texto"))
        out.append({
            "campo": rotulo,
            "de": fmt_valor(va, tipo) if chave in antes else None,
            "para": fmt_valor(vd, tipo),
        })
    return sorted(out, key=lambda x: x["campo"])


def _alvo(log) -> str:
    """Nome legível do que foi mexido (evita mostrar UUID)."""
    for fonte in (log.depois, log.antes):
        if isinstance(fonte, dict):
            for k in ("nome", "colaborador", "vigencia"):
                if fonte.get(k):
                    return _data_br(fonte[k]) if k == "vigencia" else str(fonte[k])
    return ""


def humanizar(log) -> dict:
    """Transforma um DpAuditLog em algo que o operador lê sem esforço."""
    verbo, tom = ACOES.get(log.acao, (log.acao.replace("_", " "), "editar"))
    entidade = ENTIDADES.get(log.entidade, log.entidade)
    alvo = _alvo(log)
    antes, depois = log.antes if isinstance(log.antes, dict) else {}, \
        log.depois if isinstance(log.depois, dict) else {}

    # frase-título por tipo de ação
    if log.acao == "importar":
        d = depois
        titulo = (f"Importou a planilha do DP: {d.get('colaboradores_novos', 0)} novo(s), "
                  f"{d.get('colaboradores_atualizados', 0)} atualizado(s), "
                  f"{d.get('ccs', 0)} centro(s) de custo e {d.get('cargos', 0)} cargo(s)")
        mudancas = []
    elif log.acao == "desligar":
        titulo = f"Desligou {alvo or 'colaborador'}"
        if depois.get("data_demissao"):
            titulo += f" em {_data_br(depois['data_demissao'])}"
        if depois.get("tipo_desligamento"):
            titulo += f" — {depois['tipo_desligamento']}"
        if depois.get("liquido_rescisao") is not None:
            titulo += f" · rescisão líquida de {_brl(depois['liquido_rescisao'])}"
        mudancas = _mudancas(
            {"status": antes.get("status")},
            {k: v for k, v in depois.items() if k in ("status", "motivo")})
    elif log.acao == "criar":
        titulo = f"Cadastrou {entidade}: {alvo}" if alvo else f"Cadastrou {entidade}"
        mudancas = [m for m in _mudancas({}, depois) if m["para"] != "—"]
    elif log.acao == "simular":
        d = depois
        titulo = (f"Simulou o cenário “{d.get('nome', '')}” — impacto mensal "
                  f"{_brl(d.get('impacto_mensal', 0))} ({d.get('admissoes', 0)} contratação(ões))")
        mudancas = []
    elif log.acao == "abrir_competencia":
        titulo = (f"Abriu a competência {depois.get('mes', ''):02d}/{depois.get('ano', '')} "
                  f"com {depois.get('itens', 0)} colaboradores"
                  if isinstance(depois.get("mes"), int) else "Abriu a competência")
        mudancas = []
    elif log.acao == "recalcular":
        titulo = f"Recalculou a folha ({depois.get('itens', 0)} linhas)"
        mudancas = []
    elif log.acao == "lancar":
        titulo = f"Lançou ocorrências de {depois.get('colaborador', '')}"
        mudancas = [m for m in _mudancas({}, {k: v for k, v in depois.items()
                                              if k != "colaborador"}) if m["para"] not in ("—", "0")]
    elif log.acao == "fechar_competencia":
        titulo = f"Fechou a competência (aprovada por {depois.get('fechada_por', '')})"
        mudancas = []
    elif log.acao == "reabrir_competencia":
        titulo = "Reabriu uma competência fechada"
        mudancas = [{"campo": "Justificativa", "de": None,
                     "para": depois.get("justificativa", "—")}]
    elif log.acao == "ajuste_pontual":
        comp_txt = depois.get("competencia", "")
        titulo = (f"AJUSTE PONTUAL em {depois.get('colaborador', 'colaborador')}"
                  + (f" — competência {comp_txt}" if comp_txt else ""))
        mudancas = _mudancas(
            {k: v for k, v in antes.items() if k != "colaborador"},
            {k: v for k, v in depois.items() if k not in ("colaborador", "competencia")})
    elif log.acao == "excluir":
        titulo = f"Excluiu {entidade}" + (f": {alvo}" if alvo else "") + " do catálogo"
        mudancas = []
    elif log.acao == "desfazer_revisao":
        titulo = "Desfez o envio para revisão (folha voltou para Aberta)"
        mudancas = []
    elif log.acao == "enviar_revisao":
        titulo = "Enviou a folha para revisão"
        mudancas = []
    else:  # editar e afins
        titulo = f"Alterou {entidade}" + (f": {alvo}" if alvo else "")
        mudancas = _mudancas(antes, depois)

    return {
        "id": log.id,
        "usuario": log.usuario,
        "quando": log.created_at.isoformat(),
        "quando_br": log.created_at.strftime("%d/%m/%Y às %H:%M"),
        "acao": log.acao,
        "verbo": verbo,
        "tom": tom,
        "entidade": entidade,
        "alvo": alvo,
        "titulo": titulo,
        "colaborador_id": str(log.colaborador_id) if log.colaborador_id else None,
        "colaborador_nome": log.colaborador_nome or "",
        "mudancas": mudancas,
        "resumo": (f"{len(mudancas)} campo(s) alterado(s)" if mudancas else ""),
    }
