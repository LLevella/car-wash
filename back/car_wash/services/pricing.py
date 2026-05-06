from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP

from cars.models import CarType
from personal.models import WashStation

from car_wash.models import DownPayment, WashCoast, WashDuration, WashType


MONEY_QUANT = Decimal("0.01")


class PricingConfigurationError(ValueError):
    """Raised when wash pricing dictionaries are incomplete."""


@dataclass(frozen=True)
class PricingQuote:
    duration_minutes: int
    cost: Decimal
    down_payment: Decimal
    residual: Decimal


def get_wash_duration(
    *,
    car_type: CarType,
    wash_type: WashType,
    wash_station: WashStation,
) -> int:
    duration = (
        WashDuration.objects.filter(
            carType=car_type,
            washType=wash_type,
            washStation=wash_station,
        )
        .values_list("duration", flat=True)
        .first()
    )

    if duration is None:
        raise PricingConfigurationError(
            "Не настроена длительность мойки для выбранной станции, типа авто и типа мойки."
        )

    return int(duration)


def get_wash_cost(
    *,
    car_type: CarType,
    wash_type: WashType,
    wash_station: WashStation,
) -> Decimal:
    cost = (
        WashCoast.objects.filter(
            carType=car_type,
            washType=wash_type,
            washStation=wash_station,
        )
        .values_list("cost", flat=True)
        .first()
    )

    if cost is None:
        raise PricingConfigurationError(
            "Не настроена стоимость мойки для выбранной станции, типа авто и типа мойки."
        )

    return cost.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def get_down_payment_rate(*, wash_station: WashStation) -> Decimal:
    rate = (
        DownPayment.objects.filter(washStation=wash_station)
        .order_by("-id")
        .values_list("rate", flat=True)
        .first()
    )

    if rate is None:
        raise PricingConfigurationError(
            "Не настроен процент предоплаты для выбранной станции."
        )

    return rate


def calculate_down_payment(*, cost: Decimal, rate: Decimal) -> Decimal:
    return (cost * rate / Decimal("100")).quantize(
        MONEY_QUANT,
        rounding=ROUND_HALF_UP,
    )


def build_pricing_quote(
    *,
    car_type: CarType,
    wash_type: WashType,
    wash_station: WashStation,
) -> PricingQuote:
    duration_minutes = get_wash_duration(
        car_type=car_type,
        wash_type=wash_type,
        wash_station=wash_station,
    )
    cost = get_wash_cost(
        car_type=car_type,
        wash_type=wash_type,
        wash_station=wash_station,
    )
    down_payment_rate = get_down_payment_rate(wash_station=wash_station)
    down_payment = calculate_down_payment(cost=cost, rate=down_payment_rate)
    residual = (cost - down_payment).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)

    return PricingQuote(
        duration_minutes=duration_minutes,
        cost=cost,
        down_payment=down_payment,
        residual=residual,
    )
