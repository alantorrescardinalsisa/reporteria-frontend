"""Rutas analiticas aditivas para Reporteria Prestadores."""
from datetime import date
from math import ceil
from typing import Any, Callable, Optional
from uuid import UUID

from fastapi import FastAPI, Query


def register_analytics_routes(
    app: FastAPI,
    execute_rpc: Callable[[str, dict[str, Any]], Any],
    metric_params: Callable[[date, date, Optional[list[str]], Optional[list[UUID]]], dict[str, Any]],
) -> None:
    @app.get('/api/metricas-trackeo/tendencia')
    def tendencia(
        fecha_desde: date = Query(...), fecha_hasta: date = Query(...),
        campana: Optional[list[str]] = Query(default=None),
        prestador_id: Optional[list[UUID]] = Query(default=None),
    ):
        data = execute_rpc('fn_metricas_trackeo_tendencia', metric_params(fecha_desde, fecha_hasta, campana, prestador_id))
        return {'tendencia': data}

    @app.get('/api/metricas-trackeo/calidad-datos')
    def calidad_datos(
        fecha_desde: date = Query(...), fecha_hasta: date = Query(...),
        campana: Optional[list[str]] = Query(default=None),
        prestador_id: Optional[list[UUID]] = Query(default=None),
    ):
        data = execute_rpc('fn_metricas_trackeo_calidad_datos', metric_params(fecha_desde, fecha_hasta, campana, prestador_id))
        return {'calidad': data[0] if data else {}}

    @app.get('/api/metricas-trackeo/campana-prestador')
    def campana_prestador(
        fecha_desde: date = Query(...), fecha_hasta: date = Query(...),
        campana: Optional[list[str]] = Query(default=None),
        prestador_id: Optional[list[UUID]] = Query(default=None),
    ):
        data = execute_rpc('fn_metricas_trackeo_campana_prestador', metric_params(fecha_desde, fecha_hasta, campana, prestador_id))
        return {'cantidad': len(data), 'resultados': data}

    @app.get('/api/metricas-trackeo/servicios-paginados')
    def servicios_paginados(
        fecha_desde: date = Query(...), fecha_hasta: date = Query(...),
        campana: Optional[list[str]] = Query(default=None),
        prestador_id: Optional[list[UUID]] = Query(default=None),
        metrica: Optional[str] = Query(default=None),
        pagina: int = Query(default=1, ge=1),
        tamano_pagina: int = Query(default=100, ge=1, le=500),
    ):
        base = metric_params(fecha_desde, fecha_hasta, campana, prestador_id)
        count_params = {**base, 'p_metrica': metrica}
        total_data = execute_rpc('fn_metricas_trackeo_servicios_total', count_params)
        if isinstance(total_data, list):
            first = total_data[0] if total_data else 0
            total = int(first.get('fn_metricas_trackeo_servicios_total', 0) if isinstance(first, dict) else first)
        else:
            total = int(total_data or 0)

        page_params = {
            **count_params,
            'p_limit': tamano_pagina,
            'p_offset': (pagina - 1) * tamano_pagina,
        }
        rows = execute_rpc('fn_metricas_trackeo_servicios_paginados', page_params)
        return {
            'cantidad_total': total,
            'pagina': pagina,
            'tamano_pagina': tamano_pagina,
            'total_paginas': ceil(total / tamano_pagina) if total else 0,
            'servicios': rows,
        }
