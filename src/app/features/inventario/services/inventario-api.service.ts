import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import {
  CatalogoItem,
  InventarioDetalle,
  InventarioResumen,
  ProductoAdmin,
  ProductoInventario,
  StockActual
} from '../models/inventario.models';

@Injectable({ providedIn: 'root' })
export class InventarioApiService {
  private readonly api = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  iniciarInventario() { return this.http.post<InventarioResumen>(`${this.api}/inventarios`, {}); }
  productosPermitidos(id: number) { return this.http.get<ProductoInventario[]>(`${this.api}/inventarios/${id}/productos`); }
  guardarDetalle(id: number, productos: { productoId: number; cantidad: number }[]) { return this.http.put<InventarioDetalle>(`${this.api}/inventarios/${id}/detalle`, { productos }); }
  finalizar(id: number) { return this.http.post<InventarioDetalle>(`${this.api}/inventarios/${id}/finalizar`, {}); }
  anular(id: number, motivo: string) { return this.http.post<InventarioDetalle>(`${this.api}/inventarios/${id}/anular`, { motivo }); }

  historial(filtros?: { plazaId?: number | null; responsableId?: number | null; rol?: string | null; estado?: string | null; desde?: string | null; hasta?: string | null; page?: number; size?: number; }) {
    let params = new HttpParams().set('page', String(filtros?.page ?? 0)).set('size', String(filtros?.size ?? 50));
    if (filtros?.plazaId) params = params.set('plazaId', String(filtros.plazaId));
    if (filtros?.responsableId) params = params.set('responsableId', String(filtros.responsableId));
    if (filtros?.rol) params = params.set('rol', filtros.rol);
    if (filtros?.estado) params = params.set('estado', filtros.estado);
    if (filtros?.desde) params = params.set('desde', filtros.desde);
    if (filtros?.hasta) params = params.set('hasta', filtros.hasta);
    return this.http.get<any>(`${this.api}/inventarios`, { params });
  }

  detalle(id: number) { return this.http.get<InventarioDetalle>(`${this.api}/inventarios/${id}`); }

  stock(filtros?: { plazaId?: number | null; buscar?: string | null }) {
    let params = new HttpParams();
    if (filtros?.plazaId) params = params.set('plazaId', String(filtros.plazaId));
    if (filtros?.buscar?.trim()) params = params.set('buscar', filtros.buscar.trim());
    return this.http.get<StockActual[]>(`${this.api}/inventario/stock`, { params });
  }

  productosAdmin() { return this.http.get<ProductoAdmin[]>(`${this.api}/inventario/productos`); }
  crearProducto(payload: unknown) { return this.http.post<ProductoAdmin>(`${this.api}/inventario/productos`, payload); }
  actualizarProducto(id: number, payload: unknown) { return this.http.put<ProductoAdmin>(`${this.api}/inventario/productos/${id}`, payload); }
  cambiarEstadoProducto(id: number, activo: boolean) { return this.http.patch<ProductoAdmin>(`${this.api}/inventario/productos/${id}/estado`, null, { params: { activo } }); }
  catalogo(tipo: 'categorias' | 'ambitos' | 'roles' | 'plazas') { return this.http.get<CatalogoItem[]>(`${this.api}/inventario/catalogos/${tipo}`); }
}
