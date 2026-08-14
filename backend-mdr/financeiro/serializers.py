from rest_framework import serializers
from .models import (
    Cargo, Sede, Setor, VpdConfig, BaseReferencia,
    DpCargo, DpCentroCusto, DpColaborador, DpLideranca, DpTabelaFiscal, Equipe,
)


class DpTabelaFiscalSerializer(serializers.ModelSerializer):
    class Meta:
        model = DpTabelaFiscal
        fields = ['id', 'vigencia_inicio', 'inss_faixas', 'vt_percent', 'fgts_percent',
                  'multa_fgts_percent', 'inss_patronal_percent', 'provisao_base',
                  'created_at', 'updated_at']

    def validate_inss_faixas(self, v):
        if not isinstance(v, list) or not v:
            raise serializers.ValidationError("Informe ao menos uma faixa de INSS.")
        ultimo = 0
        for f in v:
            if not all(k in f for k in ("ate", "aliquota", "deducao")):
                raise serializers.ValidationError("Cada faixa precisa de 'ate', 'aliquota' e 'deducao'.")
            if float(f["ate"]) <= ultimo:
                raise serializers.ValidationError("As faixas devem estar em ordem crescente de 'ate'.")
            ultimo = float(f["ate"])
        return v


class DpCentroCustoSerializer(serializers.ModelSerializer):
    colaboradores_ativos = serializers.SerializerMethodField()
    pai_id = serializers.PrimaryKeyRelatedField(
        source='pai', queryset=DpCentroCusto.objects.all(), allow_null=True, required=False)
    pai_nome = serializers.CharField(source='pai.nome', read_only=True, default=None)
    nome_curto = serializers.CharField(read_only=True)
    tem_filhos = serializers.SerializerMethodField()

    class Meta:
        model = DpCentroCusto
        fields = ['id', 'codigo', 'nome', 'nome_curto', 'pai_id', 'pai_nome',
                  'tem_filhos', 'ativo', 'colaboradores_ativos']

    def get_colaboradores_ativos(self, obj):
        return obj.colaboradores.filter(status='ativo').count()

    def get_tem_filhos(self, obj):
        return obj.filhos.exists()


class DpCargoSerializer(serializers.ModelSerializer):
    class Meta:
        model = DpCargo
        fields = ['id', 'area', 'nome', 'salario_base', 'dias_mes', 'carga_horaria_mes', 'ativo']


class DpLiderancaSerializer(serializers.ModelSerializer):
    centro_custo_nome = serializers.CharField(source='centro_custo.nome', read_only=True, default=None)
    centro_custo_id = serializers.PrimaryKeyRelatedField(
        source='centro_custo', queryset=DpCentroCusto.objects.all(), allow_null=True, required=False)
    papeis = serializers.CharField(read_only=True)

    class Meta:
        model = DpLideranca
        fields = ['id', 'nome', 'e_supervisor', 'e_coordenador', 'papeis',
                  'centro_custo_id', 'centro_custo_nome', 'email', 'ativo',
                  'created_at', 'updated_at']


class DpColaboradorSerializer(serializers.ModelSerializer):
    centro_custo_nome = serializers.CharField(source='centro_custo.nome', read_only=True)
    centro_custo_id = serializers.PrimaryKeyRelatedField(
        source='centro_custo', queryset=DpCentroCusto.objects.all())
    cargo_nome = serializers.CharField(source='cargo.nome', read_only=True, default=None)
    cargo_id = serializers.PrimaryKeyRelatedField(
        source='cargo', queryset=DpCargo.objects.all(), allow_null=True, required=False)
    regime_label = serializers.CharField(source='get_regime_display', read_only=True)
    supervisor_nome = serializers.CharField(source='supervisor.nome', read_only=True, default=None)
    supervisor_id = serializers.PrimaryKeyRelatedField(
        source='supervisor', queryset=DpLideranca.objects.all(), allow_null=True, required=False)
    coordenador_nome = serializers.CharField(source='coordenador.nome', read_only=True, default=None)
    coordenador_id = serializers.PrimaryKeyRelatedField(
        source='coordenador', queryset=DpLideranca.objects.all(), allow_null=True, required=False)
    equipe_nome = serializers.CharField(source='equipe_ref.nome', read_only=True, default=None)
    equipe_id = serializers.PrimaryKeyRelatedField(
        source='equipe_ref', queryset=Equipe.objects.all(), allow_null=True, required=False)
    salario_familia = serializers.SerializerMethodField()
    transferencia = serializers.SerializerMethodField()

    def get_transferencia(self, obj):
        """Liga esta ficha à matrícula anterior e/ou seguinte da MESMA pessoa.

        Efetivar alguém obriga a abrir cadastro novo (a matrícula é numerada por
        regime), então sem isto o histórico da pessoa fica partido em duas
        fichas que não se conhecem.
        """
        saida = getattr(obj, "transferencia_saida", None)     # esta virou outra
        entrada = getattr(obj, "transferencia_entrada", None)  # esta veio de outra
        if not saida and not entrada:
            return None
        d = {}
        if entrada:
            d["veio_de"] = {
                "id": str(entrada.origem_id),
                "matricula": entrada.origem.matricula,
                "nome": entrada.origem.nome,
                "regime": entrada.origem.regime,
                "data": entrada.data_efeito.isoformat(),
                "data_br": f"{entrada.data_efeito:%d/%m/%Y}",
                "motivo": entrada.motivo,
            }
        if saida:
            d["continuou_como"] = {
                "id": str(saida.destino_id),
                "matricula": saida.destino.matricula,
                "nome": saida.destino.nome,
                "regime": saida.destino.regime,
                "data": saida.data_efeito.isoformat(),
                "data_br": f"{saida.data_efeito:%d/%m/%Y}",
                "motivo": saida.motivo,
            }
        return d


    def _teto_salario_familia(self) -> float:
        """Teto vigente, buscado UMA vez por requisição.

        O serializer é reaproveitado no many=True da listagem, então cachear na
        instância evita uma query por linha do quadro.
        """
        if not hasattr(self, "_teto_sf"):
            from .models import DpTabelaFiscal
            t = DpTabelaFiscal.objects.order_by("-vigencia_inicio").first()
            self._teto_sf = float(getattr(t, "salario_familia_teto", 0) or 0) if t else 0.0
        return self._teto_sf

    def get_salario_familia(self, obj):
        """Situação do salário-família DESTA pessoa, resumida para o cadastro.

        Existe para o DP conseguir varrer o quadro e achar quem está irregular
        sem abrir ficha por ficha. Os três requisitos são checados juntos, que é
        como eles valem na prática: ter dependente na idade, a remuneração caber
        no teto e a comprovação estar em dia.

        `situacao` é o que a tela pinta:
          sem_dependente · nao_clt · sem_cota (idade passou) ·
          acima_teto (perde no mês) · pendente (comprovação vencida) · regular
        """
        from datetime import date as _date
        deps = [d for d in obj.dependentes.all() if d.ativo]
        base = {"dependentes": len(deps), "cotas": 0, "pendencias": 0,
                "detalhe": [], "situacao": "sem_dependente", "teto": self._teto_salario_familia()}
        if not deps:
            return base
        if obj.regime != "clt":
            base["situacao"] = "nao_clt"
            return base

        hoje = _date.today()
        com_cota = [d for d in deps if d.elegivel_em(hoje.year, hoje.month)]
        base["cotas"] = len(com_cota)
        if not com_cota:
            base["situacao"] = "sem_cota"
            return base

        teto = base["teto"]
        if teto and float(obj.salario_bruto or 0) > teto:
            # não é irregularidade: é a regra de renda. Some no mês em que a
            # pessoa cair abaixo do teto.
            base["situacao"] = "acima_teto"
            return base

        pend = [{"nome": d.nome, "pendencia": p} for d in com_cota
                if (p := d.comprovacao_pendente_em(hoje))]
        base["pendencias"] = len(pend)
        base["detalhe"] = pend
        base["situacao"] = "pendente" if pend else "regular"
        return base

    class Meta:
        model = DpColaborador
        fields = [
            'id', 'matricula', 'nome', 'sexo', 'cpf', 'unidade', 'area',
            'centro_custo_id', 'centro_custo_nome', 'equipe',
            'equipe_id', 'equipe_nome',
            'supervisor_id', 'supervisor_nome', 'coordenador_id', 'coordenador_nome',
            'cargo_id', 'cargo_nome', 'regime', 'regime_label', 'status',
            'data_entrada', 'data_admissao', 'data_demissao',
            'salario_bruto', 'saldo_livre', 'vt', 'opta_vt', 'va', 'aprendiz',
            'conta_bb', 'pix', 'conta_caixa', 'salario_familia', 'transferencia',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['matricula']


class CargoSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(required=False)

    class Meta:
        model = Cargo
        fields = ['id', 'nome', 'modulos', 'escopo_unidades', 'escopo_areas',
                  'escopo_ccs', 'escopo_setores', 'escopo_sedes', 'created_at', 'updated_at']

    def to_representation(self, instance):
        # devolve o dict COMPLETO (toda key da tabela MODULOS presente)
        data = super().to_representation(instance)
        data['modulos'] = instance.modulos_efetivos()
        return data

class SedeSerializer(serializers.ModelSerializer):
    # Permite que o frontend envie o UUID gerado (evita duplicidades no autosave)
    id = serializers.UUIDField(required=False)

    class Meta:
        model = Sede
        fields = '__all__'

class SetorSerializer(serializers.ModelSerializer):
    # Permite que o frontend envie o UUID gerado (evita duplicidades no autosave)
    id = serializers.UUIDField(required=False)

    # db_column='sede_id' no models, mas o React espera apenas 'sedeId'.
    # Fazemos essa "tradução" rápida para não quebrar o frontend.
    sedeId = serializers.UUIDField(source='sede_id', allow_null=True, required=False)

    class Meta:
        model = Setor
        fields = ['id', 'user_id', 'nome', 'tipo', 'sedeId', 'periodos', 'created_at', 'updated_at']

class VpdConfigSerializer(serializers.ModelSerializer):
    # Permite que o frontend envie o UUID gerado (evita duplicidades no autosave)
    id = serializers.UUIDField(required=False)

    class Meta:
        model = VpdConfig
        fields = '__all__'

class BaseReferenciaSerializer(serializers.ModelSerializer):
    class Meta:
        model = BaseReferencia
        fields = '__all__'
