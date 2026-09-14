import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AsistenciaProgramacionService {
  private readonly http = inject(HttpClient);

  obtener(plazaId: number, turnoId: number): Observable<{ programados: number }> {
    const params = new HttpParams()
      .set('plazaId', plazaId.toString())
      .set('turnoId', turnoId.toString());

    return this.http.get<{ programados: number }>(
      `${environment.apiUrl}/asistencias/programados`,
      { params }
    );
  }
}
