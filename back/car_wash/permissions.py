from rest_framework.permissions import BasePermission

from car_wash.models import ManagerStationAccess
from customer.models import Customer


CUSTOMER_GROUP = "customer"
MANAGER_GROUP = "manager"
ADMIN_GROUP = "admin"


def user_has_group(user, group_name):
    return (
        user
        and user.is_authenticated
        and user.groups.filter(name=group_name).exists()
    )


def is_admin_user(user):
    return bool(
        user
        and user.is_authenticated
        and (
            user.is_superuser
            or user.is_staff
            or user_has_group(user, ADMIN_GROUP)
        )
    )


def is_manager_user(user):
    return bool(is_admin_user(user) or user_has_group(user, MANAGER_GROUP))


def is_customer_user(user):
    return bool(user_has_group(user, CUSTOMER_GROUP))


def get_request_customer(user):
    if not user or not user.is_authenticated:
        return None

    return Customer.objects.filter(user=user).first()


def can_access_customer(user, customer):
    if is_manager_user(user):
        return True

    return bool(customer and customer.user_id == user.id)


def user_accessible_station_ids(user):
    if is_admin_user(user):
        return None

    if not is_manager_user(user):
        return []

    return list(
        ManagerStationAccess.objects.filter(
            user=user,
            is_active=True,
        ).values_list("wash_station_id", flat=True)
    )


def can_access_station(user, wash_station):
    if is_admin_user(user):
        return True

    if not is_manager_user(user) or wash_station is None:
        return False

    return ManagerStationAccess.objects.filter(
        user=user,
        wash_station=wash_station,
        is_active=True,
    ).exists()


def can_access_booking(user, booking):
    return can_access_customer(user, booking.customer)


class IsCustomerOrManager(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (is_customer_user(user) or is_manager_user(user))
        )


class IsManager(BasePermission):
    def has_permission(self, request, view):
        return is_manager_user(request.user)
