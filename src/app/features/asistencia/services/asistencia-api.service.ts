import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { forkJoin, Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';

import {
  AsistenciaRequest,
  AsistenciaResponse,
  AsistenciaUpdateRequest,
  AusenciaMotivo,
  DashboardPunto,
  EvidenciaResponse,
  MotivoAusencia,
  Plaza,
  ResumenAsistencia,
  Trabajador,
  Turno
} from '../models/asistencia.models';

@Injectable({
  providedIn: 'root'
})
export class AsistenciaApiService {

  private readonly http = inject(HttpClient);

  private readonly api =
    environment.apiUrl;

  /*
   * =========================================================
   * CATÁLOGOS GENERALES
   * =========================================================
   *
   * Agentes y controladores no se cargan aquí.
   *
   * Se cargan dinámicamente según
   * la plaza seleccionada.
   */
  getCatalogos(): Observable<{
    plazas: Plaza[];
    turnos: Turno[];
    motivos: MotivoAusencia[];
  }> {

    return forkJoin({
      plazas: this.getPlazas(),
      turnos: this.getTurnos(),
      motivos: this.getMotivos()
    });
  }

  /*
   * =========================================================
   * PLAZAS
   * =========================================================
   */
  getPlazas(): Observable<Plaza[]> {

    return this.http.get<Plaza[]>(
      `${this.api}/plazas`
    );
  }

  /*
   * =========================================================
   * TURNOS
   * =========================================================
   */
  getTurnos(): Observable<Turno[]> {

    return this.http.get<Turno[]>(
      `${this.api}/turnos`
    );
  }

  /*
   * =========================================================
   * MOTIVOS DE AUSENCIA
   * =========================================================
   */
  getMotivos(): Observable<MotivoAusencia[]> {

    return this.http.get<MotivoAusencia[]>(
      `${this.api}/motivos-ausencia`
    );
  }

  /*
   * =========================================================
   * TRABAJADORES
   * =========================================================
   *
   * Método general.
   *
   * Se mantiene porque puede ser utilizado
   * por otros módulos.
   */
  getTrabajadores(
    puesto?: string
  ): Observable<Trabajador[]> {

    let params =
      new HttpParams();

    if (puesto) {

      params =
        params.set(
          'puesto',
          puesto
        );
    }

    return this.http.get<Trabajador[]>(
      `${this.api}/trabajadores`,
      {
        params
      }
    );
  }

  /*
   * =========================================================
   * AGENTES POR PLAZA
   * =========================================================
   *
   * GET
   * /api/trabajadores/agentes?plazaId=3
   */
  getAgentesPorPlaza(
    plazaId: number
  ): Observable<Trabajador[]> {

    const params =
      new HttpParams()
        .set(
          'plazaId',
          plazaId.toString()
        );

    return this.http.get<Trabajador[]>(
      `${this.api}/trabajadores/agentes`,
      {
        params
      }
    );
  }

  /*
   * =========================================================
   * CONTROLADORES POR PLAZA
   * =========================================================
   *
   * GET
   * /api/trabajadores/controladores?plazaId=3
   */
  getControladoresPorPlaza(
    plazaId: number
  ): Observable<Trabajador[]> {

    const params =
      new HttpParams()
        .set(
          'plazaId',
          plazaId.toString()
        );

    return this.http.get<Trabajador[]>(
      `${this.api}/trabajadores/controladores`,
      {
        params
      }
    );
  }

  /*
   * =========================================================
   * REGISTRAR ASISTENCIA
   * =========================================================
   *
   * POST
   * /api/asistencias
   */
  registrarAsistencia(
    request: AsistenciaRequest
  ): Observable<AsistenciaResponse> {

    return this.http.post<AsistenciaResponse>(
      `${this.api}/asistencias`,
      request
    );
  }

  /*
   * =========================================================
   * ACTUALIZAR ASISTENCIA
   * =========================================================
   *
   * PUT
   * /api/asistencias/{id}
   */
  actualizarAsistencia(
    id: number,
    request: AsistenciaUpdateRequest
  ): Observable<AsistenciaResponse> {

    return this.http.put<AsistenciaResponse>(
      `${this.api}/asistencias/${id}`,
      request
    );
  }

  /*
   * =========================================================
   * SUBIR EVIDENCIA
   * =========================================================
   *
   * POST
   * /api/asistencias/{id}/evidencias
   */
  subirEvidencia(
  asistenciaId: number,
  file: File,
  tipo?:
    | 'CALENTAMIENTO'
    | 'INICIO_TURNO'
    | 'TAPONES_AUDITIVOS'
): Observable<EvidenciaResponse> {

  const formData =
    new FormData();

  formData.append(
    'file',
    file
  );

  /*
   * El tipo se envía cuando conocemos
   * específicamente qué evidencia es.
   */
  if (tipo) {

    formData.append(
      'tipo',
      tipo
    );
  }

  return this.http.post<EvidenciaResponse>(
    `${this.api}/asistencias/${asistenciaId}/evidencias`,
    formData
  );
}

  /*
   * =========================================================
   * ELIMINAR EVIDENCIA
   * =========================================================
   *
   * DELETE
   * /api/asistencias/{asistenciaId}/evidencias/{evidenciaId}
   */
  eliminarEvidencia(
    asistenciaId: number,
    evidenciaId: number
  ): Observable<void> {

    return this.http.delete<void>(
      `${this.api}/asistencias/${asistenciaId}/evidencias/${evidenciaId}`
    );
  }

  /*
   * =========================================================
   * LISTAR ASISTENCIAS
   * =========================================================
   *
   * GET /api/asistencias
   *
   * GET /api/asistencias
   * ?inicio=2026-09-01
   * &fin=2026-09-02
   * &plazaId=3
   */
  listarAsistencias(
    inicio?: string,
    fin?: string,
    plazaId?: number | null
  ): Observable<AsistenciaResponse[]> {

    let params =
      new HttpParams();

    if (inicio) {

      params =
        params.set(
          'inicio',
          inicio
        );
    }

    if (fin) {

      params =
        params.set(
          'fin',
          fin
        );
    }

    if (
      plazaId !== null &&
      plazaId !== undefined
    ) {

      params =
        params.set(
          'plazaId',
          plazaId.toString()
        );
    }

    return this.http.get<AsistenciaResponse[]>(
      `${this.api}/asistencias`,
      {
        params
      }
    );
  }

  /*
   * =========================================================
   * OBTENER ASISTENCIA POR ID
   * =========================================================
   *
   * GET
   * /api/asistencias/{id}
   */
  obtenerAsistencia(
    id: number
  ): Observable<AsistenciaResponse> {

    return this.http.get<AsistenciaResponse>(
      `${this.api}/asistencias/${id}`
    );
  }

  /*
   * =========================================================
   * DASHBOARD - RESUMEN
   * =========================================================
   */
  getResumen(
    inicio?: string,
    fin?: string
  ): Observable<ResumenAsistencia> {

    let params =
      new HttpParams();

    if (inicio) {

      params =
        params.set(
          'inicio',
          inicio
        );
    }

    if (fin) {

      params =
        params.set(
          'fin',
          fin
        );
    }

    return this.http.get<ResumenAsistencia>(
      `${this.api}/dashboard/asistencia/resumen`,
      {
        params
      }
    );
  }

  /*
   * =========================================================
   * DASHBOARD - ASISTENCIA DIARIA
   * =========================================================
   */
  getDiario(
    anio: number,
    mes: number
  ): Observable<DashboardPunto[]> {

    const params =
      new HttpParams()
        .set(
          'anio',
          anio.toString()
        )
        .set(
          'mes',
          mes.toString()
        );

    return this.http.get<DashboardPunto[]>(
      `${this.api}/dashboard/asistencia/diario`,
      {
        params
      }
    );
  }
  getAnual(
  anio: number
): Observable<DashboardPunto[]> {

  const params =
    new HttpParams()
      .set(
        'anio',
        anio.toString()
      );

  return this.http.get<DashboardPunto[]>(
    `${this.api}/dashboard/asistencia/anual`,
    {
      params
    }
  );
}

  /*
   * =========================================================
   * DASHBOARD - AUSENCIAS POR MOTIVO
   * =========================================================
   */
  getAusenciasMotivo(
    anio: number,
    mes?: number
  ): Observable<AusenciaMotivo[]> {

    let params =
      new HttpParams()
        .set(
          'anio',
          anio.toString()
        );

    if (mes !== undefined) {

      params =
        params.set(
          'mes',
          mes.toString()
        );
    }

    return this.http.get<AusenciaMotivo[]>(
      `${this.api}/dashboard/asistencia/ausencias-motivo`,
      {
        params
      }
    );
  }
}