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

    class Meta:
        model = DpColaborador
        fields = [
            'id', 'matricula', 'nome', 'sexo', 'cpf', 'unidade', 'area',
            'centro_custo_id', 'centro_custo_nome', 'equipe',
            'equipe_id', 'equipe_nome',
            'supervisor_id', 'supervisor_nome', 'coordenador_id', 'coordenador_nome',
            'cargo_id', 'cargo_nome', 'regime', 'regime_label', 'status',
            'data_entrada', 'data_admissao', 'data_demissao',
            'salario_bruto', 'saldo_livre', 'vt', 'opta_vt', 'va',
            'conta_bb', 'pix', 'conta_caixa', 'created_at', 'updated_at',
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
