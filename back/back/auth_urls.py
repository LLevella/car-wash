"""Session authentication API routes for the SPA frontend."""

from django.urls import path

from back.auth_views import (
    CsrfTokenView,
    CurrentUserView,
    LoginView,
    LogoutView,
    RegisterView,
)


app_name = "auth"

urlpatterns = [
    path("csrf/", CsrfTokenView.as_view(), name="csrf"),
    path("login/", LoginView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("register/", RegisterView.as_view(), name="register"),
    path("me/", CurrentUserView.as_view(), name="me"),
]
