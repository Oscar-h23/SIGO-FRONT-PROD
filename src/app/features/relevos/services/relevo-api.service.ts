import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ElementoRelevo, RelevoResponse, Via } from '../models/relevo.models';

@Injectable({ providedIn: 'root' })
export class RelevoApiService {
  private readonly api = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  getVias(plazaId: number) {
    const params = new HttpParams().set('plazaId', plazaId.toString());
    return this.http.get<Via[]>(`${this.api}/vias`, { params });
  }

  getElementos() {
    return this.http.get<ElementoRelevo[]>(`${this.api}/relevos/elementos`);
  }

  registrar(payload: unknown) {
    return this.http.post<RelevoResponse>(`${this.api}/relevos`, payload);
  }

  listar(inicio?: string, fin?: string) {
    let params = new HttpParams();
    if (inicio) params = params.set('inicio', inicio);
    if (fin) params = params.set('fin', fin);
    return this.http.get<RelevoResponse[]>(`${this.api}/relevos`, { params });
  }

  obtener(id: number) {
    return this.http.get<RelevoResponse>(`${this.api}/relevos/${id}`);
  }
}
