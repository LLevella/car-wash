"""Session authentication API routes for the SPA frontend."""

from django.urls import path

from back.auth_views import CsrfTokenView, CurrentUserView, LoginView, LogoutView


app_name = "auth"

urlpatterns = [
    path("csrf/", CsrfTokenView.as_view(), name="csrf"),
    path("login/", LoginView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", CurrentUserView.as_view(), name="me"),
]
