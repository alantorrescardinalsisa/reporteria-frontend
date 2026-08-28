"""Rutas aditivas para el universo operativo separado.

Agregar estas rutas dentro de register_analytics_routes o registrar esta funcion
adicional desde app.py. No reemplaza endpoints historicos.
"""
from datetime import date
from typing import Any, Callable, Optional
from uuid import UUID

from fastapi import FastAPI, Query


def register_operational_universe_routes(
    app: FastAPI,
    execute_rpc: Callable[[str, dict[str, Any]], Any],
    metric_params: Callable[[date, date, Optional[list[str]], Optional[list[UUID]]], dict[str, Any]],
) -> None:
    @app.get('/api/metricas-trackeo/universos-comparados')
    def universos_comparados(
        fecha_desde: date = Query(...),
        fecha_hasta: date = Query(...),
        campana: Optional[list[str]] = Query(default=None),
        prestador_id: Optional[list[UUID]] = Query(default=None),
    ):
        data = execute_rpc(
            'fn_metricas_trackeo_universos_comparados',
            metric_params(fecha_desde, fecha_hasta, campana, prestador_id),
        )
        return {'universos': data[0] if data else {}}

    @app.get('/api/metricas-trackeo/resumen-operativo')
    def resumen_operativo(
        fecha_desde: date = Query(...),
        fecha_hasta: date = Query(...),
        campana: Optional[list[str]] = Query(default=None),
        prestador_id: Optional[list[UUID]] = Query(default=None),
    ):
        data = execute_rpc(
            'fn_metricas_trackeo_resumen_operativo',
            metric_params(fecha_desde, fecha_hasta, campana, prestador_id),
        )
        return {'resumen': data[0] if data else {}}

    @app.get('/api/metricas-trackeo/diferencias-universos')
    def diferencias_universos(
        fecha_desde: date = Query(...),
        fecha_hasta: date = Query(...),
        campana: Optional[list[str]] = Query(default=None),
        prestador_id: Optional[list[UUID]] = Query(default=None),
    ):
        data = execute_rpc(
            'fn_metricas_trackeo_diferencias_universos',
            metric_params(fecha_desde, fecha_hasta, campana, prestador_id),
        )
        return {'cantidad': len(data), 'diferencias': data}
