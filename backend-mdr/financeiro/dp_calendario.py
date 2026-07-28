# Calendário útil: dias úteis do mês calculados automaticamente (seg–sex,
# descontando feriados nacionais). O operador ainda pode sobrescrever na
# competência — o cálculo aqui é a sugestão inicial.
from datetime import date, timedelta


def pascoa(ano: int) -> date:
    """Domingo de Páscoa (algoritmo de Meeus/Butcher) — base dos feriados móveis."""
    a = ano % 19
    b, c = divmod(ano, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    mes, dia = divmod(h + l - 7 * m + 114, 31)
    return date(ano, mes, dia + 1)


def feriados_nacionais(ano: int) -> dict:
    """Feriados nacionais (fixos + móveis). Carnaval e Corpus Christi entram
    porque na prática o escritório não opera nesses dias."""
    p = pascoa(ano)
    return {
        date(ano, 1, 1): "Confraternização Universal",
        p - timedelta(days=48): "Carnaval (segunda)",
        p - timedelta(days=47): "Carnaval (terça)",
        p - timedelta(days=2): "Sexta-feira Santa",
        date(ano, 4, 21): "Tiradentes",
        date(ano, 5, 1): "Dia do Trabalho",
        p + timedelta(days=60): "Corpus Christi",
        date(ano, 9, 7): "Independência",
        date(ano, 10, 12): "Nossa Senhora Aparecida",
        date(ano, 11, 2): "Finados",
        date(ano, 11, 15): "Proclamação da República",
        date(ano, 11, 20): "Consciência Negra",
        date(ano, 12, 25): "Natal",
    }


def dias_do_mes(ano: int, mes: int) -> int:
    prox = date(ano + (mes == 12), (mes % 12) + 1, 1)
    return (prox - date(ano, mes, 1)).days


def calcular_dias_uteis(ano: int, mes: int) -> dict:
    """Devolve {dias_mes, dias_uteis, fins_de_semana, feriados: [{data, nome}]}."""
    feriados = feriados_nacionais(ano)
    total = dias_do_mes(ano, mes)
    uteis, fds, lista = 0, 0, []
    for d in range(1, total + 1):
        dia = date(ano, mes, d)
        if dia.weekday() >= 5:          # sábado/domingo
            fds += 1
            continue
        if dia in feriados:
            lista.append({"data": dia.strftime("%d/%m/%Y"), "nome": feriados[dia]})
            continue
        uteis += 1
    return {"dias_mes": total, "dias_uteis": uteis,
            "fins_de_semana": fds, "feriados": lista}
