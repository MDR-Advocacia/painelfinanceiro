import uuid
from django.conf import settings
from django.db import models

# ─── Tabela canônica de MÓDULOS do painel (permissão de visualização) ───
# key = view do frontend; label = como aparece no menu do ADM.
MODULOS = [
    ("dashboard", "Dashboard Consolidado"),
    ("projecoes", "Projeções"),
    ("ranking", "Rentabilidade"),
    ("honorarios", "Honorários BB"),
    ("config-estrategica", "Gestão Estratégica (VPD)"),
    ("sedes", "Sedes (estrutura/custos)"),
    # Arquivo morto: ninguém lança em setor (o lançamento é na linha, via
    # módulo `faturamento`). A chave continua porque governa a LEITURA que
    # Dashboard, Projeções, Rentabilidade e Gestão Estratégica ainda fazem.
    ("setores", "Setores (arquivo morto — leitura dos painéis antigos)"),
    ("pessoal", "Controle de Pessoal (DP)"),
    ("estrutura", "Estrutura de Faturamento"),
    # Os três abaixo eram tudo "estrutura". Foram separados porque protegem
    # coisas diferentes: quem lança receita não precisa poder redesenhar a
    # empresa, e quem enxerga a estrutura não deveria ver salário de ninguém.
    ("faturamento", "Lançamento de Faturamento"),
    ("estrutura-cadastro", "Cadastro da Estrutura (centros, linhas, equipes)"),
    ("equipes", "Equipes e Pessoas (custo individual)"),
]
MODULO_KEYS = [k for k, _ in MODULOS]

# Níveis de permissão por módulo (RBAC v2): o valor no JSON `modulos` do cargo
# pode ser False/"nada", "ver" (só visualização) ou "editar" (ver+alterar).
# Legado: True (checkbox antigo) equivale a "editar" — preserva o comportamento
# de quem já tinha o módulo antes dos níveis existirem.
NIVEL_NADA, NIVEL_VER, NIVEL_EDITAR = "nada", "ver", "editar"


def normalizar_nivel(valor) -> str:
    if valor is True or valor == NIVEL_EDITAR:
        return NIVEL_EDITAR
    if valor == NIVEL_VER:
        return NIVEL_VER
    return NIVEL_NADA

class Sede(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id = models.UUIDField(help_text="ID do usuário (Herdado do Supabase auth.users)")
    nome = models.CharField(max_length=255)
    periodos = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'sedes'

    def __str__(self):
        return self.nome

class Setor(models.Model):
    """Setor do painel antigo.

    ⚠️ ARQUIVO MORTO (decidido em 2026-07-29). O faturamento passou a ser
    lançado na LinhaFaturamento, dentro do centro de faturamento. Ninguém
    escreve aqui pela interface: quem grava é `_espelhar_no_setor_legado`,
    a partir da linha, só pra manter vivos os painéis antigos (Dashboard,
    Projeções, Rentabilidade, Gestão Estratégica) que ainda leem daqui.
    Quando esses quatro migrarem pra estrutura nova, o espelho sai e este
    modelo vira histórico puro. NÃO adicionar tela de edição de volta.
    """
    TIPO_CHOICES = [
        ('operacional', 'Operacional'),
        ('administrativo', 'Administrativo'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id = models.UUIDField()
    nome = models.CharField(max_length=255)
    tipo = models.CharField(max_length=50, choices=TIPO_CHOICES)
    sede = models.ForeignKey(Sede, on_delete=models.SET_NULL, null=True, blank=True, db_column='sede_id')
    periodos = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'setores'

    def __str__(self):
        return f"{self.nome} ({self.get_tipo_display()})"

class VpdConfig(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id = models.UUIDField()
    periodo = models.CharField(max_length=7, unique=True)
    valor = models.FloatField()
    
    # NOVOS CAMPOS PARA MEMÓRIA DE CÁLCULO
    headcount = models.IntegerField(null=True, blank=True)
    despesasBase = models.JSONField(null=True, blank=True)
    pessoalApoio = models.JSONField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'vpd_configs'

    def __str__(self):
        return f"VPD {self.periodo}: R$ {self.valor}"

class Cargo(models.Model):
    """Cargo/papel do RBAC — a política de acesso é POR CARGO, tabelada.

    `modulos` é um dict {modulo_key: bool} sobre a tabela MODULOS: True = o
    cargo enxerga o módulo. Admin (is_staff do Django) bypassa tudo. Cargos
    padrão são seedados na migration 0003 (Admin, Sócio, Supervisor,
    Departamento Pessoal, Financeiro) e o menu do ADM permite criar outros.

    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nome = models.CharField(max_length=100, unique=True)
    modulos = models.JSONField(default=dict, blank=True)
    # ── ESCOPO (subnúcleos): restringe o cargo a certos recortes.
    # LISTA VAZIA = sem restrição (enxerga tudo do módulo liberado).
    escopo_unidades = models.JSONField(default=list, blank=True)  # nomes de unidades (DP)
    escopo_areas = models.JSONField(default=list, blank=True)     # ADM/TI/JUR/DIR (DP)
    escopo_ccs = models.JSONField(default=list, blank=True)       # ids de DpCentroCusto
    escopo_setores = models.JSONField(default=list, blank=True)   # ids de Setor (financeiro)
    escopo_sedes = models.JSONField(default=list, blank=True)     # ids de Sede (financeiro)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'cargos'
        ordering = ['nome']

    def tem_escopo(self) -> bool:
        return any([self.escopo_unidades, self.escopo_areas, self.escopo_ccs,
                    self.escopo_setores, self.escopo_sedes])

    def __str__(self):
        return self.nome

    def modulos_efetivos(self) -> dict:
        """Dict completo por NÍVEL: {modulo: "nada"|"ver"|"editar"} (toda key presente).
        Valores legados True/False são normalizados (True→editar)."""
        base = {k: NIVEL_NADA for k in MODULO_KEYS}
        for k, v in (self.modulos or {}).items():
            if k in base:
                base[k] = normalizar_nivel(v)
        return base


class PerfilUsuario(models.Model):
    """Vínculo usuário→cargo (1:1). Usuário sem cargo = sem módulos (exceto staff)."""
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                related_name='perfil')
    cargo = models.ForeignKey(Cargo, on_delete=models.SET_NULL, null=True, blank=True,
                              related_name='usuarios')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'perfis_usuario'

    def __str__(self):
        return f"{self.user} → {self.cargo or 'sem cargo'}"


class BaseReferencia(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    npj_original = models.TextField(null=True, blank=True)
    npj_limpo = models.TextField(unique=True)
    polo = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'base_referencia'

    def __str__(self):
        return self.npj_limpo


# ═══════════════ MÓDULO CONTROLE DE PESSOAL (DP) — F1: cadastro ═══════════════
# Sistematização da planilha "Controle de Pessoal DP - CC.xlsx".
# Ver docs/controle-pessoal-plano.md (blueprint completo, fases F1..F5).

# Regimes com a lógica de matrícula da casa: Estagiário 10xx · CLT 20xx ·
# Associado 30xx · PJ 40xx (faixa base usada pra gerar a próxima matrícula).
DP_REGIMES = [
    ("estagiario", "Estagiário (TCE)"),
    ("clt", "CLT"),
    ("associado", "Associado"),
    ("pj", "PJ"),
]
DP_MATRICULA_BASE = {"estagiario": 1000, "clt": 2000, "associado": 3000, "pj": 4000}


class DpCentroCusto(models.Model):
    """Centros de Custo em ÁRVORE (CONFIG da planilha).

    O código agrupa o núcleo (1=ADM, 2=TI, 3=Autor BB…) e o nome no padrão
    "Grupo - Subnúcleo" indica o filho (ex.: "ADM - Financeiro" é filho de "ADM").
    `pai` materializa essa hierarquia: pai nulo = núcleo raiz.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    codigo = models.IntegerField()
    nome = models.CharField(max_length=120, unique=True)
    pai = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True,
                            related_name='filhos')
    ativo = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'dp_centros_custo'
        ordering = ['codigo', 'nome']

    def __str__(self):
        return f"[{self.codigo}] {self.nome}"

    @property
    def nome_curto(self) -> str:
        """Só a parte do subnúcleo (o que vem depois do 'Grupo - ')."""
        return self.nome.split(" - ", 1)[1] if " - " in self.nome else self.nome

    def descendentes_ids(self) -> list:
        """Ele mesmo + toda a subárvore (usado nos filtros: escolher o núcleo
        traz os subnúcleos junto)."""
        ids, fila = [self.id], [self]
        while fila:
            atual = fila.pop()
            for f in atual.filhos.all():
                ids.append(f.id)
                fila.append(f)
        return ids


class DpCargo(models.Model):
    """Plano de cargos e salários (TB_Cargos da planilha)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    area = models.CharField(max_length=20, blank=True, default="")  # ADM/TI/JUR/DIR
    nome = models.CharField(max_length=120, unique=True)
    salario_base = models.FloatField(default=0)
    dias_mes = models.IntegerField(default=30)
    carga_horaria_mes = models.IntegerField(default=220)
    ativo = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'dp_cargos'
        ordering = ['area', 'nome']

    def __str__(self):
        return self.nome


class DpLideranca(models.Model):
    """Catálogo de LIDERANÇAS: supervisores e coordenadores.

    Antes eram texto livre na ficha do colaborador (cada import escrevia um
    jeito). Virou tabela pra padronizar o nome, permitir renomear em um lugar
    só (a mudança propaga pra todo mundo) e ligar a liderança ao seu centro de
    custo. A MESMA pessoa pode ser supervisora e coordenadora — por isso são
    dois papéis marcáveis, não dois cadastros.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nome = models.CharField(max_length=120, unique=True)
    e_supervisor = models.BooleanField(default=True)
    e_coordenador = models.BooleanField(default=False)
    centro_custo = models.ForeignKey(DpCentroCusto, on_delete=models.SET_NULL,
                                     null=True, blank=True, related_name="liderancas")
    # vínculo opcional com a ficha da pessoa no quadro (nem toda liderança é
    # colaboradora cadastrada — sócios, por exemplo)
    colaborador = models.ForeignKey('DpColaborador', on_delete=models.SET_NULL,
                                    null=True, blank=True, related_name="lideranca")
    email = models.CharField(max_length=150, blank=True, default="")
    ativo = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'dp_liderancas'
        ordering = ['nome']

    def __str__(self):
        return self.nome

    @property
    def papeis(self) -> str:
        p = []
        if self.e_supervisor:
            p.append("Supervisor")
        if self.e_coordenador:
            p.append("Coordenador")
        return " · ".join(p) or "—"


class DpColaborador(models.Model):
    """Ficha do colaborador (TB_Colaboradores). Uma linha por MATRÍCULA — a mesma
    pessoa pode ter 2 matrículas na história (ex.: estagiário 10xx que virou CLT
    20xx), igual na planilha."""
    STATUS = [("ativo", "Ativo"), ("inativo", "Inativo")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    matricula = models.IntegerField(unique=True)
    nome = models.CharField(max_length=200)
    sexo = models.CharField(max_length=10, blank=True, default="")
    cpf = models.CharField(max_length=14, blank=True, default="")
    unidade = models.CharField(max_length=80, blank=True, default="")
    area = models.CharField(max_length=20, blank=True, default="")
    centro_custo = models.ForeignKey(DpCentroCusto, on_delete=models.PROTECT,
                                     related_name="colaboradores")
    supervisor = models.ForeignKey(DpLideranca, on_delete=models.SET_NULL, null=True,
                                   blank=True, related_name="supervisionados")
    # enquadramento na EQUIPE da Estrutura de Faturamento (funcionário→equipe→
    # centro): é por aqui que o custo real da pessoa desce pras linhas
    equipe_ref = models.ForeignKey("financeiro.Equipe", on_delete=models.SET_NULL,
                                   null=True, blank=True, related_name="colaboradores")
    coordenador = models.ForeignKey(DpLideranca, on_delete=models.SET_NULL, null=True,
                                    blank=True, related_name="coordenados")
    equipe = models.CharField(max_length=120, blank=True, default="")
    cargo = models.ForeignKey(DpCargo, on_delete=models.SET_NULL, null=True, blank=True,
                              related_name="colaboradores")
    regime = models.CharField(max_length=20, choices=DP_REGIMES)
    status = models.CharField(max_length=10, choices=STATUS, default="ativo")
    data_entrada = models.DateField(null=True, blank=True)
    data_admissao = models.DateField(null=True, blank=True)
    data_demissao = models.DateField(null=True, blank=True)
    salario_bruto = models.FloatField(default=0)
    saldo_livre = models.FloatField(default=0)      # parcela extra (Associados)
    vt = models.FloatField(default=0)
    opta_vt = models.BooleanField(default=True)
    va = models.FloatField(default=0)
    conta_bb = models.CharField(max_length=60, blank=True, default="")
    pix = models.CharField(max_length=120, blank=True, default="")
    conta_caixa = models.CharField(max_length=60, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def _equipe_do_centro_custo(self):
        """Equipe da estrutura que atende este centro de custo (ou None)."""
        if not self.centro_custo_id:
            return None
        from .models_estrutura import Equipe
        return Equipe.objects.filter(centro_custo_id=self.centro_custo_id).first()

    def save(self, *args, **kwargs):
        """Mantém o enquadramento na equipe seguindo o centro de custo.

        A Estrutura de Faturamento lê as pessoas por `equipe_ref`. Se isso só
        fosse preenchido pela migration inicial, todo admitido novo nasceria
        SEM equipe — invisível em toda página de equipe e com custo contado em
        lugar nenhum — e quem trocasse de centro de custo continuaria somando
        pra equipe antiga. Então derivamos aqui:

        - sem equipe → deriva do centro de custo;
        - trocou de CC e a equipe atual era justamente a do CC ANTIGO (ou seja,
          tinha vindo da derivação) → re-deriva;
        - equipe escolhida à mão, que não corresponde ao CC → respeita, porque
          é override deliberado do operador.
        """
        anterior = None
        if self.pk:
            anterior = (DpColaborador.objects.filter(pk=self.pk)
                        .values("centro_custo_id", "equipe_ref_id").first())

        antes_equipe = self.equipe_ref_id
        if not self.equipe_ref_id:
            self.equipe_ref = self._equipe_do_centro_custo()
        elif anterior and anterior["centro_custo_id"] != self.centro_custo_id                 and anterior["equipe_ref_id"] == self.equipe_ref_id:
            from .models_estrutura import Equipe
            era_derivada = Equipe.objects.filter(
                id=self.equipe_ref_id,
                centro_custo_id=anterior["centro_custo_id"]).exists()
            if era_derivada:
                nova = self._equipe_do_centro_custo()
                if nova:
                    self.equipe_ref = nova

        # um update_fields que não cite equipe_ref engoliria a derivação
        uf = kwargs.get("update_fields")
        if uf is not None and self.equipe_ref_id != antes_equipe:
            kwargs["update_fields"] = list(set(uf) | {"equipe_ref"})
        return super().save(*args, **kwargs)

    class Meta:
        db_table = 'dp_colaboradores'
        ordering = ['nome']

    def __str__(self):
        return f"{self.matricula} · {self.nome}"


class DpDependente(models.Model):
    """Dependente do colaborador — existe para o SALÁRIO-FAMÍLIA.

    Guardamos a DATA DE NASCIMENTO, não uma contagem de dependentes, porque a
    cota morre no mês em que o filho faz 14 anos. Com um número solto alguém
    teria que lembrar de decrementar na mão todo mês — e vai esquecer. Com a
    data, a folha para sozinha na competência certa.

    A COMPROVAÇÃO tem validade e é o que mais gera passivo: caderneta de
    vacinação até os 6 anos (anual) e frequência escolar dos 7 aos 14
    (semestral). Sem comprovação em dia o benefício deve ser suspenso, e o que
    foi pago indevidamente NÃO é compensável na GPS — vira custo de verdade.
    Por isso as datas de validade ficam aqui, e a folha avisa quem está vencido.

    Decisão de produto: vencimento AVISA, não bloqueia sozinho. Suspender
    pagamento de benefício é decisão do DP, não efeito colateral de um campo
    em branco — ainda mais na virada, quando ninguém preencheu nada ainda.
    """
    TIPOS = [
        ("filho", "Filho(a)"),
        ("enteado", "Enteado(a)"),
        ("tutelado", "Menor sob tutela"),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    colaborador = models.ForeignKey("financeiro.DpColaborador", on_delete=models.CASCADE,
                                    related_name="dependentes")
    nome = models.CharField(max_length=150)
    data_nascimento = models.DateField()
    tipo = models.CharField(max_length=20, choices=TIPOS, default="filho")
    cpf = models.CharField(max_length=14, blank=True, default="")
    # inválido de QUALQUER idade tem direito: o corte dos 14 anos não se aplica
    invalido = models.BooleanField(
        default=False, help_text="Dependente inválido — sem limite de idade")
    # validade das comprovações periódicas (nulo = nunca apresentada)
    vacinacao_valida_ate = models.DateField(null=True, blank=True)
    frequencia_escolar_valida_ate = models.DateField(null=True, blank=True)
    # desligar sem apagar: histórico de quem já recebeu não pode sumir
    ativo = models.BooleanField(default=True)
    observacao = models.CharField(max_length=250, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'dp_dependentes'
        ordering = ['colaborador__nome', 'data_nascimento']

    def __str__(self):
        return f"{self.nome} ({self.get_tipo_display()})"

    def faz_14_em(self):
        """(ano, mês) em que completa 14 anos — a cota é devida ATÉ esse mês."""
        d = self.data_nascimento
        return (d.year + 14, d.month)

    def elegivel_em(self, ano: int, mes: int) -> bool:
        """Tem direito à cota nesta competência? (só idade/tipo — a renda do
        colaborador é testada na folha, porque muda mês a mês)."""
        if not self.ativo:
            return False
        if self.invalido:
            return True
        limite = self.faz_14_em()
        return (ano, mes) <= limite

    def comprovacao_pendente_em(self, referencia) -> str:
        """Descreve a pendência de comprovação nesta data, ou "" se está em dia.

        Qual documento é exigido depende da IDADE na data de referência: até 6
        anos é vacinação; dos 7 aos 14, frequência escolar.
        """
        if self.invalido:
            return ""
        idade = (referencia.year - self.data_nascimento.year
                 - ((referencia.month, referencia.day)
                    < (self.data_nascimento.month, self.data_nascimento.day)))
        if idade <= 6:
            if not self.vacinacao_valida_ate:
                return "vacinação nunca apresentada"
            if self.vacinacao_valida_ate < referencia:
                return f"vacinação vencida em {self.vacinacao_valida_ate:%d/%m/%Y}"
        elif idade <= 14:
            if not self.frequencia_escolar_valida_ate:
                return "frequência escolar nunca apresentada"
            if self.frequencia_escolar_valida_ate < referencia:
                return (f"frequência escolar vencida em "
                        f"{self.frequencia_escolar_valida_ate:%d/%m/%Y}")
        return ""


class DpTransferenciaContrato(models.Model):
    """A MESMA pessoa mudando de vínculo: sai numa matrícula e entra em outra.

    A casa numera matrícula por regime (10xx estagiário, 20xx CLT, 30xx
    associado, 40xx PJ), então efetivar alguém obriga a abrir um cadastro novo
    e encerrar o antigo. Sem registrar esse vínculo, o painel lê os dois
    movimentos como um desligamento e uma admissão de pessoas diferentes — e
    como efetivação não é evento raro, o turnover vai inchando mês a mês com
    gente que nunca saiu do escritório.

    Registrar a transferência faz três coisas:
      • liga as duas fichas, para o histórico da pessoa não ficar partido;
      • tira o par do cálculo de admissões e desligamentos (movimento INTERNO);
      • leva os dependentes junto — senão o salário-família some no dia da
        efetivação, sem ninguém perceber, porque a matrícula nova nasce sem
        dependente nenhum.

    `OneToOne` nos dois lados: uma matrícula não entra em duas transferências,
    mas CADEIAS funcionam (estágio → CLT → associado), porque nelas cada ficha
    é destino de uma e origem de outra.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    origem = models.OneToOneField(
        "financeiro.DpColaborador", on_delete=models.CASCADE,
        related_name="transferencia_saida",
        help_text="Matrícula encerrada (o contrato anterior)")
    destino = models.OneToOneField(
        "financeiro.DpColaborador", on_delete=models.CASCADE,
        related_name="transferencia_entrada",
        help_text="Matrícula nova (o contrato atual)")
    data_efeito = models.DateField()
    motivo = models.CharField(max_length=200, blank=True, default="")
    # quantos dependentes vieram junto — fica registrado porque mexe em benefício
    dependentes_movidos = models.IntegerField(default=0)
    # QUAIS vieram: sem isso, desfazer a transferência deixaria os dependentes
    # presos na matrícula nova, e o salário-família passaria a ser pago pela
    # ficha errada
    dependentes_ids = models.JSONField(default=list, blank=True)
    registrado_por = models.CharField(max_length=150, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'dp_transferencias_contrato'
        ordering = ['-data_efeito']
        constraints = [
            models.CheckConstraint(check=~models.Q(origem=models.F("destino")),
                                   name="ck_transf_origem_diferente_destino"),
        ]

    def __str__(self):
        return f"{self.origem_id} → {self.destino_id} em {self.data_efeito}"


def ids_em_transferencia():
    """(ids de saída, ids de entrada) — o que NÃO conta como movimentação.

    Usado pelo turnover: o desligamento da origem e a admissão do destino são
    as duas pontas do mesmo evento interno e não podem ser contados.
    """
    pares = DpTransferenciaContrato.objects.values_list("origem_id", "destino_id")
    saidas, entradas = set(), set()
    for o, d in pares:
        saidas.add(o)
        entradas.add(d)
    return saidas, entradas


class DpEvento(models.Model):
    """Event log de RH: admissão, desligamento, transferência de CC, reajuste,
    edição cadastral. Headcount/turnover/histórico da ficha saem daqui."""
    TIPOS = [
        ("admissao", "Admissão"),
        ("desligamento", "Desligamento"),
        ("transferencia_cc", "Transferência de CC"),
        ("reajuste", "Reajuste salarial"),
        ("edicao", "Edição cadastral"),
        ("importacao", "Importação de planilha"),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    colaborador = models.ForeignKey(DpColaborador, on_delete=models.CASCADE,
                                    related_name="eventos")
    tipo = models.CharField(max_length=30, choices=TIPOS)
    data_efeito = models.DateField()
    payload = models.JSONField(default=dict, blank=True)
    autor = models.CharField(max_length=150, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'dp_eventos'
        ordering = ['-data_efeito', '-created_at']


class DpTabelaFiscal(models.Model):
    """Parâmetros fiscais VERSIONADOS por vigência (nunca sobrescrever o passado
    — cada competência usa a tabela vigente no seu mês).

    `inss_faixas`: [{"ate": 1621.0, "aliquota": 0.075, "deducao": 0.0}, ...]
    (progressiva por parcela a deduzir; a última faixa é o teto — acima dele o
    desconto trava no máximo da última faixa).
    `provisao_base`: "bruto_menos_inss" espelha a planilha do DP;
    "bruto" é o padrão contábil (decisão pendente com o DP — configurável).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    vigencia_inicio = models.DateField(unique=True)  # ex.: 2026-01-01
    inss_faixas = models.JSONField(default=list)
    vt_percent = models.FloatField(default=0.06)
    fgts_percent = models.FloatField(default=0.08)
    multa_fgts_percent = models.FloatField(default=0.40)   # provisão sobre o FGTS
    inss_patronal_percent = models.FloatField(default=0.21)
    provisao_base = models.CharField(max_length=20, default="bruto_menos_inss",
                                     choices=[("bruto_menos_inss", "Bruto − INSS (planilha)"),
                                              ("bruto", "Bruto (padrão contábil)")])
    # Salário-família: valores oficiais, versionados junto com o resto — mudam
    # todo ano e um mês fechado precisa continuar usando o valor da época.
    # Padrões abaixo = vigência de 01/2026.
    salario_familia_cota = models.FloatField(
        default=67.54, help_text="Valor da cota por dependente elegível")
    salario_familia_teto = models.FloatField(
        default=1980.38, help_text="Remuneração mensal máxima para ter direito")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'dp_tabelas_fiscais'
        ordering = ['-vigencia_inicio']

    def __str__(self):
        return f"Tabela fiscal desde {self.vigencia_inicio}"


class DpCompetencia(models.Model):
    """O mês de folha. Esteira: aberta → em_revisao → fechada.
    Fechar exige aprovador DIFERENTE de quem enviou pra revisão (4-olhos) e
    congela os itens (snapshot). Reabrir exige justificativa (auditada)."""
    STATUS = [("aberta", "Aberta"), ("em_revisao", "Em revisão"), ("fechada", "Fechada")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ano = models.IntegerField()
    mes = models.IntegerField()  # 1..12
    dias_mes = models.IntegerField(default=30)
    dias_uteis = models.IntegerField(default=22)
    status = models.CharField(max_length=15, choices=STATUS, default="aberta")
    aberta_por = models.CharField(max_length=150, blank=True, default="")
    enviada_revisao_por = models.CharField(max_length=150, blank=True, default="")
    fechada_por = models.CharField(max_length=150, blank=True, default="")
    fechada_em = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'dp_competencias'
        unique_together = [('ano', 'mes')]
        ordering = ['-ano', '-mes']

    def __str__(self):
        return f"{self.mes:02d}/{self.ano} ({self.status})"


class DpLancamento(models.Model):
    """Ocorrências do colaborador na competência: faltas, premiações, acertos.

    Também guarda o AJUSTE PONTUAL (override) daquele mês: quando o operador
    corrige salário/VT/VA só naquela competência, o valor fica aqui — a ficha do
    colaborador NÃO muda e o recálculo respeita o ajuste. Todo ajuste exige
    motivo e vai pra auditoria com destaque.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    competencia = models.ForeignKey(DpCompetencia, on_delete=models.CASCADE,
                                    related_name="lancamentos")
    colaborador = models.ForeignKey(DpColaborador, on_delete=models.CASCADE,
                                    related_name="lancamentos")
    faltas_dias = models.FloatField(default=0)
    faltas_horas = models.FloatField(default=0)
    premiacoes = models.FloatField(default=0)
    acerto_contabil = models.FloatField(default=0)
    obs = models.TextField(blank=True, default="")
    # FÉRIAS do mês (versão simples: é uma ocorrência da competência, não um
    # controle de período aquisitivo). Estagiário = recesso; associado/PJ só
    # marca a ausência, sem verba.
    ferias_inicio = models.DateField(null=True, blank=True)
    ferias_dias = models.IntegerField(default=0)
    ferias_abono_dias = models.IntegerField(default=0)   # abono pecuniário (até 1/3)
    # ajuste pontual do mês (null = usa o valor da ficha)
    salario_override = models.FloatField(null=True, blank=True)
    vt_override = models.FloatField(null=True, blank=True)
    va_override = models.FloatField(null=True, blank=True)
    saldo_livre_override = models.FloatField(null=True, blank=True)
    ajuste_motivo = models.TextField(blank=True, default="")
    ajuste_autor = models.CharField(max_length=150, blank=True, default="")
    ajuste_em = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'dp_lancamentos'
        unique_together = [('competencia', 'colaborador')]


class DpFolhaItem(models.Model):
    """Linha calculada da folha (as 35 colunas da planilha). Recalculável com a
    competência aberta; CONGELADA no fechamento. `memoria` = como cada número
    foi obtido (transparência de cálculo, clicável na UI)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    competencia = models.ForeignKey(DpCompetencia, on_delete=models.CASCADE,
                                    related_name="itens")
    colaborador = models.ForeignKey(DpColaborador, on_delete=models.PROTECT,
                                    related_name="folha_itens")
    # snapshot cadastral do momento do cálculo (não muda se a ficha mudar depois)
    matricula = models.IntegerField()
    nome = models.CharField(max_length=200)
    regime = models.CharField(max_length=20)
    cargo_nome = models.CharField(max_length=120, blank=True, default="")
    centro_custo_nome = models.CharField(max_length=120)
    # entradas
    salario_bruto = models.FloatField(default=0)
    vt = models.FloatField(default=0)
    va = models.FloatField(default=0)
    saldo_livre = models.FloatField(default=0)
    faltas_dias = models.FloatField(default=0)
    faltas_horas = models.FloatField(default=0)
    premiacoes = models.FloatField(default=0)
    acerto_contabil = models.FloatField(default=0)
    # calculados
    desc_faltas = models.FloatField(default=0)
    salario_com_faltas = models.FloatField(default=0)
    vt_com_faltas = models.FloatField(default=0)
    va_com_faltas = models.FloatField(default=0)
    desc_inss = models.FloatField(default=0)
    desc_vt = models.FloatField(default=0)
    salario_com_descontos = models.FloatField(default=0)
    total_pagar = models.FloatField(default=0)
    # provisões
    decimo_mensal = models.FloatField(default=0)
    ferias_mensal = models.FloatField(default=0)
    terco_ferias_mensal = models.FloatField(default=0)
    fgts_mensal = models.FloatField(default=0)
    multa_fgts_mensal = models.FloatField(default=0)
    recesso_mensal = models.FloatField(default=0)
    inss_patronal = models.FloatField(default=0)
    custo_provisoes = models.FloatField(default=0)
    # ATENÇÃO: custo_total NÃO inclui o salário-família. Ele entra no
    # total_pagar (o colaborador recebe) mas é adiantamento compensável na GPS
    # — quem paga é o INSS. Somá-lo aqui inflaria a folha e derrubaria a margem
    # por cliente sem que nenhum centavo tenha saído do escritório.
    custo_total = models.FloatField(default=0)  # total_pagar − sal.família + provisões + patronal
    # salário-família da competência (benefício previdenciário, não remuneração)
    salario_familia = models.FloatField(default=0)
    salario_familia_cotas = models.IntegerField(default=0)
    # férias gozadas NESTE mês (o que efetivamente entra no pagamento)
    ferias_dias = models.IntegerField(default=0)
    ferias_valor = models.FloatField(default=0)          # remuneração dos dias de férias
    ferias_terco = models.FloatField(default=0)          # 1/3 constitucional
    ferias_abono = models.FloatField(default=0)          # abono pecuniário + 1/3
    ferias_inicio = models.DateField(null=True, blank=True)
    ferias_fim = models.DateField(null=True, blank=True)
    memoria = models.JSONField(default=dict, blank=True)
    ajuste_manual = models.BooleanField(default=False)   # linha com ajuste pontual
    em_rescisao = models.BooleanField(default=False)     # sai neste mês (rescisão)
    ajuste_motivo = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'dp_folha_itens'
        unique_together = [('competencia', 'colaborador')]
        ordering = ['nome']


class DpRescisao(models.Model):
    """Desligamento com as verbas rescisórias calculadas e congeladas.

    `verbas`/`descontos` guardam a lista detalhada com a memória de cálculo de
    cada linha — o termo em PDF e a conferência saem daqui.
    """
    TIPOS = [
        ("sem_justa_causa", "Dispensa sem justa causa"),
        ("pedido_demissao", "Pedido de demissão"),
        ("acordo", "Acordo (art. 484-A)"),
        ("justa_causa", "Dispensa por justa causa"),
        ("termino_contrato", "Término de contrato"),
        ("fim_estagio", "Encerramento do estágio (TCE)"),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    colaborador = models.ForeignKey(DpColaborador, on_delete=models.PROTECT,
                                    related_name="rescisoes")
    data_desligamento = models.DateField()
    tipo = models.CharField(max_length=30, choices=TIPOS)
    motivo = models.TextField(blank=True, default="")
    aviso_dias = models.IntegerField(default=0)
    verbas = models.JSONField(default=list, blank=True)
    descontos = models.JSONField(default=list, blank=True)
    proventos = models.FloatField(default=0)
    total_descontos = models.FloatField(default=0)
    liquido = models.FloatField(default=0)
    opcoes = models.JSONField(default=dict, blank=True)
    criado_por = models.CharField(max_length=150, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'dp_rescisoes'
        ordering = ['-data_desligamento', '-created_at']

    def __str__(self):
        return f"Rescisão {self.colaborador} em {self.data_desligamento}"


def _caminho_documento(instance, filename):
    """Guarda por colaborador: media/colaboradores/<uuid>/<arquivo>."""
    return f"colaboradores/{instance.colaborador_id}/{filename}"


class DpDocumento(models.Model):
    """Documentos do colaborador (contrato, aditivo, TCE do estagiário…).

    O arquivo vive no volume de dados; o download NUNCA é servido direto pelo
    nginx — passa por endpoint autenticado com a mesma permissão do módulo,
    porque contrato é documento sensível.
    """
    TIPOS = [
        ("contrato", "Contrato de trabalho"),
        ("tce", "Termo de Compromisso de Estágio"),
        ("aditivo", "Aditivo contratual"),
        ("rescisao", "Termo de rescisão"),
        ("outro", "Outro documento"),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    colaborador = models.ForeignKey(DpColaborador, on_delete=models.CASCADE,
                                    related_name="documentos")
    tipo = models.CharField(max_length=20, choices=TIPOS, default="contrato")
    arquivo = models.FileField(upload_to=_caminho_documento)
    nome_original = models.CharField(max_length=255)
    tamanho = models.IntegerField(default=0)
    descricao = models.CharField(max_length=200, blank=True, default="")
    enviado_por = models.CharField(max_length=150, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'dp_documentos'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.get_tipo_display()} de {self.colaborador.nome}"


class DpAuditLog(models.Model):
    """Trilha de auditoria IMUTÁVEL do módulo DP: toda escrita loga quem, quando,
    o quê e o antes→depois. Nunca é editada nem apagada pela aplicação."""
    id = models.BigAutoField(primary_key=True)
    usuario = models.CharField(max_length=150)
    acao = models.CharField(max_length=40)          # criar/editar/desligar/importar/excluir
    entidade = models.CharField(max_length=60)      # dp_colaborador, dp_cargo, ...
    entidade_id = models.CharField(max_length=60, blank=True, default="")
    # pessoa afetada pelo registro (quando faz sentido): permite pesquisar o
    # histórico completo de um colaborador — cadastro, folha, ajuste, rescisão
    colaborador = models.ForeignKey(DpColaborador, on_delete=models.SET_NULL, null=True,
                                    blank=True, related_name="auditoria")
    colaborador_nome = models.CharField(max_length=200, blank=True, default="")
    antes = models.JSONField(null=True, blank=True)
    depois = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'dp_audit_log'
        ordering = ['-created_at']

# Estrutura de faturamento (centros/linhas/alocações) — ver models_estrutura.py
from .models_estrutura import (  # noqa: E402,F401
    Alocacao, CentroFaturamento, CentroSede, Equipe, LinhaFaturamento,
)
