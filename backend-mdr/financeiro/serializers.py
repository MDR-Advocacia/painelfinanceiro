from rest_framework import serializers
from .models import Sede, Setor, VpdConfig, BaseReferencia

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
