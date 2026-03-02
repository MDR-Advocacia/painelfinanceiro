from rest_framework import viewsets
from .models import Sede, Setor, VpdConfig, BaseReferencia
from .serializers import SedeSerializer, SetorSerializer, VpdConfigSerializer, BaseReferenciaSerializer
from rest_framework.authtoken.views import ObtainAuthToken
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

class SedeViewSet(viewsets.ModelViewSet):
    queryset = Sede.objects.all()
    serializer_class = SedeSerializer

class SetorViewSet(viewsets.ModelViewSet):
    queryset = Setor.objects.all()
    serializer_class = SetorSerializer

class VpdConfigViewSet(viewsets.ModelViewSet):
    queryset = VpdConfig.objects.all()
    serializer_class = VpdConfigSerializer

class BaseReferenciaViewSet(viewsets.ModelViewSet):
    queryset = BaseReferencia.objects.all()
    serializer_class = BaseReferenciaSerializer

    @action(detail=False, methods=['post'])
    def bulk_upsert(self, request):
        dados = request.data
        if not isinstance(dados, list):
            return Response({"erro": "Os dados devem ser uma lista."}, status=status.HTTP_400_BAD_REQUEST)

        # 1. Remove duplicidades dentro da própria planilha que o usuário enviou
        dados_unicos = {item.get('npj_limpo'): item for item in dados if item.get('npj_limpo')}
        objetos = []

        for npj_limpo, item in dados_unicos.items():
            objetos.append(BaseReferencia(
                npj_original=item.get('npj_original'),
                npj_limpo=npj_limpo,
                polo=item.get('polo', '').upper()
            ))

        if objetos:
            # 2. O Comando Mágico: Insere os novos e ATUALIZA o polo dos que já existem!
            BaseReferencia.objects.bulk_create(
                objetos,
                batch_size=999,
                update_conflicts=True,
                unique_fields=['npj_limpo'], # A chave de busca
                update_fields=['polo', 'npj_original'] # O que deve ser atualizado
            )

        return Response({"sucesso": f"{len(objetos)} processos processados e atualizados!"}, status=status.HTTP_201_CREATED)

class CustomAuthToken(ObtainAuthToken):
    def post(self, request, *args, **kwargs):
        serializer = self.serializer_class(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        token, created = Token.objects.get_or_create(user=user)
        return Response({
            'token': token.key,
            'user': {
                # Retornamos o UUID antigo para manter os seus Setores vinculados!
                'id': '5d8feb1f-24f5-4341-a05b-9f7b80712096',
                'email': user.email or user.username
            }
        })