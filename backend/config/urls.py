from django.conf import settings
from django.conf.urls.static import static
from django.urls import path, re_path

from app import views

urlpatterns = [
    path("api/health", views.health),
    path("api/auth/login", views.login),
    path("api/auth/logout", views.logout),
    path("api/auth/me", views.me),
    path("api/auth/me/update", views.me_update),
    path("api/auth/change-password", views.change_password),
    path("api/users", views.users),
    path("api/users/<int:user_id>", views.user_detail),
    path("api/customers", views.customers),
    path("api/customers/import-excel", views.customers_import_excel),
    path("api/customers/<int:item_id>", views.customer_detail),
    path("api/material-groups", views.material_groups),
    path("api/material-groups/<int:item_id>", views.material_group_detail),
    path("api/material-groups/import-excel", views.material_groups_import_excel),
    path("api/unit-weight-options", views.unit_weight_options),
    path("api/unit-weight-options/<int:item_id>", views.unit_weight_option_detail),
    path("api/items", views.items),
    path("api/items/<int:item_id>", views.item_detail),
    path("api/raw-material-prices", views.raw_material_prices),
    path("api/raw-material-prices/<int:item_id>", views.raw_material_price_detail),
    path("api/processing-prices", views.processing_prices),
    path("api/processing-prices/<int:item_id>", views.processing_price_detail),
    path("api/products", views.products),
    path("api/products/import-excel", views.products_import_excel),
    path("api/products/<int:item_id>", views.product_detail),
    path("api/products/<int:product_id>/export-excel", views.product_export_excel),
    path("api/products/<int:product_id>/specs", views.product_specs),
    path("api/products/<int:product_id>/specs/import-excel", views.product_specs_import_excel),
    path("api/product-specs/<int:spec_id>", views.product_spec_detail),
    path("api/products/<int:product_id>/print-versions", views.product_print_versions),
    path("api/products/<int:product_id>/print-images", views.product_print_images),
    path("api/products/<int:product_id>/print-versions/upload", views.product_print_upload),
    path("api/print-versions/<int:version_id>", views.print_version_detail),
    path("api/print-images/<int:image_id>", views.print_image_detail),
    path("api/production-plans", views.production_plans),
    path("api/production-plans/<int:item_id>", views.production_plan_detail),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

urlpatterns += [
    path("", views.frontend_app),
    re_path(r"^(?P<path>(?!api/|media/).*)$", views.frontend_app),
]
