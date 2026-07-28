from rest_framework import serializers
from .models import Cargo, Sede, Setor, VpdConfig, BaseReferencia


class CargoSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(required=False)

    class Meta:
        model = Cargo
        fields = ['id', 'nome', 'modulos', 'created_at', 'updated_at']

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
