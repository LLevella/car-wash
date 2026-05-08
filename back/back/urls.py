"""back URL Configuration

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/4.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path

from back.health import health_check, readiness_check
from back.spa import serve_spa

urlpatterns = [
    path('health/', health_check, name='health-check'),
    path('health/ready/', readiness_check, name='readiness-check'),
    path('admin/', admin.site.urls),
    path('api/', include('back.api_urls')),
]

if settings.SERVE_SPA:
    # Catch-all that serves the SPA index for any non-API/admin/static
    # URL. The earlier path() entries above shadow /api/, /admin/, and
    # the health endpoints; everything else (including /, /login, /book,
    # client-side router paths) renders the React shell.
    urlpatterns += [re_path(r'^.*$', serve_spa, name='spa-fallback')]
