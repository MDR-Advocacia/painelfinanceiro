from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    SedeViewSet, SetorViewSet, VpdConfigViewSet, BaseReferenciaViewSet,
    CargoViewSet, CustomAuthToken, UserAdminViewSet, me_permissions,
)
from .dp_views import (
    DpCargoViewSet, DpCentroCustoViewSet, DpColaboradorViewSet, DpLiderancaViewSet,
    dp_audit_filtros, dp_audit_list, dp_importar,
)
from .dp_folha import DpCompetenciaViewSet
from .dp_rescisao import DpRescisaoViewSet
from .dp_relatorios import (
    dp_dashboard, dp_ficha_financeira, dp_relatorio_auditoria, dp_relatorio_catalogos,
    dp_relatorio_competencia, dp_relatorio_dashboard, dp_relatorio_projecao,
    dp_relatorio_quadro, dp_relatorio_simulacao,
)
from .dp_simulacao import (
    DpTabelaFiscalViewSet, dp_opcoes_escopo, dp_projecao, dp_simular,
)
from . import sso_views
from .estrutura_views import (
    alocacao_percentual, alocar_equipe, centro_crud, centro_detalhe,
    centro_sede_rateio, equipe_crud, equipe_detalhe, equipes as ef_equipes,
    estrutura, linha_crud, linha_igualar, linha_sede, remover_alocacao,
    linha_faturamento, sede_detalhe, sedes_lista,
)

router = DefaultRouter()
router.register(r'sedes', SedeViewSet)
router.register(r'setores', SetorViewSet)
router.register(r'vpd_configs', VpdConfigViewSet)
router.register(r'base_referencia', BaseReferenciaViewSet)
router.register(r'cargos', CargoViewSet)  # RBAC: cargos + permissões por módulo
router.register(r'users', UserAdminViewSet, basename='users')  # gestão de acesso (admin)
# Módulo Controle de Pessoal (DP)
router.register(r'dp/colaboradores', DpColaboradorViewSet, basename='dp-colaboradores')
router.register(r'dp/cargos', DpCargoViewSet, basename='dp-cargos')
router.register(r'dp/centros-custo', DpCentroCustoViewSet, basename='dp-ccs')
router.register(r'dp/liderancas', DpLiderancaViewSet, basename='dp-liderancas')
router.register(r'dp/competencias', DpCompetenciaViewSet, basename='dp-competencias')
router.register(r'dp/tabelas-fiscais', DpTabelaFiscalViewSet, basename='dp-fiscais')
router.register(r'dp/rescisoes', DpRescisaoViewSet, basename='dp-rescisoes')

urlpatterns = [
    # Estrutura de Faturamento (proposta de reestruturação)
    path('estrutura/', estrutura),
    path('estrutura/equipes/', ef_equipes),
    path('estrutura/alocacoes/', alocar_equipe),
    path('estrutura/alocacoes/<uuid:pk>/', alocacao_percentual),
    path('estrutura/alocacoes/<uuid:pk>/remover/', remover_alocacao),
    path('estrutura/linhas/<uuid:pk>/igualar/', linha_igualar),
    path('estrutura/centros/<uuid:pk>/detalhe/', centro_detalhe),
    path('estrutura/equipes/<uuid:pk>/detalhe/', equipe_detalhe),
    path('estrutura/sedes/', sedes_lista),
    path('estrutura/sedes/<uuid:pk>/detalhe/', sede_detalhe),
    path('estrutura/linhas/<uuid:pk>/sede/', linha_sede),
    path('estrutura/linhas/<uuid:pk>/faturamento/', linha_faturamento),
    path('estrutura/centros/<uuid:pk>/rateio-sedes/', centro_sede_rateio),
    path('estrutura/centros/', centro_crud),
    path('estrutura/centros/<uuid:pk>/', centro_crud),
    path('estrutura/linhas/', linha_crud),
    path('estrutura/linhas/<uuid:pk>/', linha_crud),
    path('estrutura/equipes/crud/', equipe_crud),
    path('estrutura/equipes/crud/<uuid:pk>/', equipe_crud),
    path('', include(router.urls)),
    path('login/', CustomAuthToken.as_view()), # <-- Rota de Login Nova
    path('sso/', sso_views.sso_session),  # login via Microsoft Entra ID
    path('me/permissions/', me_permissions),  # permissões efetivas do logado
    path('dp/importar/', dp_importar),    # importador da planilha do DP
    path('dp/auditoria/', dp_audit_list), # trilha de auditoria do DP
    path('dp/auditoria-filtros/', dp_audit_filtros),  # usuários/pessoas pra pesquisar
    path('dp/dashboard/', dp_dashboard),  # KPIs + séries do DP
    path('dp/competencias/<uuid:pk>/relatorio/', dp_relatorio_competencia),  # folha/rateio (excel/pdf)
    path('dp/relatorio-quadro/', dp_relatorio_quadro),  # quadro de pessoal (excel/pdf)
    path('dp/colaboradores/<uuid:pk>/ficha-financeira/', dp_ficha_financeira),  # PDF por pessoa
    # Previsão de gastos: projeção, aprovisionamento e simulação de cenários
    path('dp/projecao/', dp_projecao),
    path('dp/simular/', dp_simular),
    path('dp/opcoes-escopo/', dp_opcoes_escopo),  # subnúcleos pro menu do ADM
    # Relatórios das demais abas (excel/pdf timbrados)
    path('dp/relatorio-dashboard/', dp_relatorio_dashboard),
    path('dp/relatorio-catalogos/', dp_relatorio_catalogos),
    path('dp/relatorio-auditoria/', dp_relatorio_auditoria),
    path('dp/relatorio-projecao/', dp_relatorio_projecao),
    path('dp/relatorio-simulacao/', dp_relatorio_simulacao),
]