import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../../../core/auth/auth.service';
import { InventarioDetalle, InventarioResumen, ProductoInventario } from '../../models/inventario.models';
import { InventarioApiService } from '../../services/inventario-api.service';

@Component({
  selector: 'app-nuevo-inventario',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './nuevo-inventario.component.html',
  styleUrl: './nuevo-inventario.component.css'
})
export class NuevoInventarioComponent implements OnInit {
  private readonly api = inject(InventarioApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly auth = inject(AuthService);

  inventario: InventarioResumen | null = null;
  productos: ProductoInventario[] = [];
  cantidades: Record<number, number | null> = {};
  stockPrevio: Record<number, number> = {};
  busqueda = '';
  mensaje = '';
  error = '';
  cargando = false;
  guardando = false;
  finalizando = false;
  anulando = false;
  recuperando = true;
  confirmarFinalizacion = false;
  confirmarCancelacion = false;
  motivoCancelacion = '';

  get inventarioId(): number | null { return this.inventario?.id ?? null; }
  get usuario() { return this.auth.usuario(); }
  get plazaNombre(): string { return this.inventario?.plaza || this.usuario?.plaza || 'Sin plaza asignada'; }

  ngOnInit(): void { void this.recuperarInventarioEnProceso(); }

  async iniciar(): Promise<void> {
    if (this.cargando || this.inventarioId) return;
    this.cargando = true;
    this.limpiarMensajes();
    this.refrescarVista();
    try {
      const inv = await firstValueFrom(this.api.iniciarInventario());
      await this.cargarInventario(inv);
      this.mensaje = 'Inventario iniciado. Solo registra los productos cuyo stock haya cambiado.';
    } catch (e: any) {
      const texto = this.extraerError(e);
      if (e?.status === 409 || texto.includes('EN_PROCESO')) {
        await this.recuperarInventarioEnProceso();
        if (this.inventarioId) this.mensaje = 'Se recuperó el inventario que tenías en proceso.';
        else this.error = texto;
      } else this.error = texto;
    } finally {
      this.cargando = false;
      this.refrescarVista();
    }
  }

  async guardar(): Promise<void> {
    if (!this.inventarioId || this.guardando) return;
    this.guardando = true;
    this.limpiarMensajes();
    this.refrescarVista();
    try {
      await this.guardarInterno();
      this.mensaje = `Avance guardado: ${this.contados()} producto(s) modificados.`;
    } catch (e: any) { this.error = this.extraerError(e); }
    finally { this.guardando = false; this.refrescarVista(); }
  }

  solicitarFinalizacion(): void {
    this.limpiarMensajes();
    if (!this.inventarioId) return;
    if (!this.todosContados()) {
      this.error = `Hay ${this.pendientes()} producto(s) sin cantidad ingresada y sin stock previo. Registra únicamente esos productos antes de finalizar.`;
      return;
    }
    this.confirmarFinalizacion = true;
  }

  cancelarFinalizacion(): void { if (!this.finalizando) this.confirmarFinalizacion = false; }

  solicitarCancelacion(): void {
    if (!this.inventarioId || this.finalizando || this.guardando) return;
    this.limpiarMensajes();
    this.motivoCancelacion = '';
    this.confirmarCancelacion = true;
  }

  cerrarCancelacion(): void {
    if (this.anulando) return;
    this.confirmarCancelacion = false;
    this.motivoCancelacion = '';
  }

  async cancelarConteo(): Promise<void> {
    if (!this.inventarioId || this.anulando) return;
    const motivo = this.motivoCancelacion.trim();
    if (!motivo) {
      this.error = 'Indica el motivo por el que deseas cancelar el conteo.';
      this.refrescarVista();
      return;
    }
    const id = this.inventarioId;
    this.anulando = true;
    this.limpiarMensajes();
    this.refrescarVista();
    try {
      await firstValueFrom(this.api.anular(id, motivo));
      this.confirmarCancelacion = false;
      this.reiniciarConteo();
      this.mensaje = `Inventario #${id} cancelado. Puedes iniciar un nuevo conteo.`;
    } catch (e: any) { this.error = this.extraerError(e); }
    finally { this.anulando = false; this.refrescarVista(); }
  }

  async finalizar(): Promise<void> {
    if (!this.inventarioId || this.finalizando || !this.todosContados()) return;
    this.finalizando = true;
    this.limpiarMensajes();
    this.refrescarVista();
    try {
      await this.guardarParaFinalizar();
      const cerrado = await firstValueFrom(this.api.finalizar(this.inventarioId));
      this.confirmarFinalizacion = false;
      this.reiniciarConteo();
      this.mensaje = `Inventario #${cerrado.id} finalizado correctamente.`;
    } catch (e: any) { this.error = this.extraerError(e); }
    finally { this.finalizando = false; this.refrescarVista(); }
  }

  productosVisibles(): ProductoInventario[] {
    const q = this.busqueda.trim().toLowerCase();
    if (!q) return this.productos;
    return this.productos.filter(p => p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q) || (p.categoria || '').toLowerCase().includes(q) || (p.ambito || '').toLowerCase().includes(q));
  }
  ambitosVisibles(): string[] { return [...new Set(this.productosVisibles().map(p => p.ambito || 'General'))]; }
  productosPorAmbito(ambito: string): ProductoInventario[] { return this.productosVisibles().filter(p => (p.ambito || 'General') === ambito); }
  categoriaProducto(producto: ProductoInventario): string { return producto.categoria || 'Sin categoría'; }
  contado(productoId: number): boolean { return this.cantidades[productoId] !== null && this.cantidades[productoId] !== undefined; }
  tieneStockPrevio(productoId: number): boolean { return Object.prototype.hasOwnProperty.call(this.stockPrevio, productoId); }
  stockPrevioProducto(productoId: number): number | null { return this.tieneStockPrevio(productoId) ? this.stockPrevio[productoId] : null; }
  cantidadEfectiva(productoId: number): number | null { return this.contado(productoId) ? Number(this.cantidades[productoId]) : this.stockPrevioProducto(productoId); }
  contados(): number { return this.productos.filter(p => this.contado(p.id)).length; }
  conStockDefinido(): number { return this.productos.filter(p => this.cantidadEfectiva(p.id) !== null).length; }
  pendientes(): number { return Math.max(this.productos.length - this.conStockDefinido(), 0); }
  porcentaje(): number { return this.productos.length ? Math.round((this.conStockDefinido() / this.productos.length) * 100) : 0; }
  todosContados(): boolean { return this.productos.length > 0 && this.pendientes() === 0; }
  limpiarBusqueda(): void { this.busqueda = ''; }

  private async recuperarInventarioEnProceso(): Promise<void> {
    this.recuperando = true;
    this.refrescarVista();
    const usuario = this.auth.usuario();
    try {
      if (!usuario) return;
      const responsableId = usuario.trabajadorId ?? usuario.id;
      const pagina = await firstValueFrom(this.api.historial({ responsableId, estado: 'EN_PROCESO', page: 0, size: 1 }));
      const abierto: InventarioResumen | undefined = pagina?.content?.[0];
      if (abierto) await this.cargarInventario(abierto, true);
    } catch (e: any) { this.error = this.extraerError(e); }
    finally { this.recuperando = false; this.refrescarVista(); }
  }

  private async cargarInventario(inv: InventarioResumen, recuperarCantidades = false): Promise<void> {
    this.inventario = inv;
    this.productos = await firstValueFrom(this.api.productosPermitidos(inv.id));
    this.cantidades = {};
    this.stockPrevio = {};
    for (const producto of this.productos) this.cantidades[producto.id] = null;
    try {
      const stock = await firstValueFrom(this.api.stock({ plazaId: inv.plazaId }));
      for (const item of stock ?? []) this.stockPrevio[item.productoId] = Number(item.cantidadActual);
    } catch {}
    if (recuperarCantidades) {
      try {
        const detalle = await firstValueFrom(this.api.detalle(inv.id));
        for (const item of detalle.productos ?? []) this.cantidades[item.productoId] = Number(item.cantidad);
      } catch {}
    }
    this.refrescarVista();
  }

  private productosIngresados(): { productoId: number; cantidad: number }[] {
    return this.productos.filter(p => this.contado(p.id)).map(p => ({ productoId: p.id, cantidad: Number(this.cantidades[p.id]) }));
  }
  private validarCantidades(productos: { productoId: number; cantidad: number }[]): void {
    if (productos.some(p => !Number.isFinite(p.cantidad) || p.cantidad < 0)) throw new Error('Las cantidades deben ser números iguales o mayores a cero.');
  }
  private async guardarInterno(): Promise<InventarioDetalle> {
    if (!this.inventarioId) throw new Error('No existe un inventario activo.');
    const productos = this.productosIngresados();
    if (!productos.length) throw new Error('Registra al menos una cantidad antes de guardar el avance.');
    this.validarCantidades(productos);
    return await firstValueFrom(this.api.guardarDetalle(this.inventarioId, productos));
  }
  private async guardarParaFinalizar(): Promise<InventarioDetalle> {
    if (!this.inventarioId) throw new Error('No existe un inventario activo.');
    const productos = this.productos.map(p => {
      const cantidad = this.cantidadEfectiva(p.id);
      if (cantidad === null) throw new Error(`El producto ${p.nombre} no tiene stock previo. Registra una cantidad antes de finalizar.`);
      return { productoId: p.id, cantidad: Number(cantidad) };
    });
    this.validarCantidades(productos);
    return await firstValueFrom(this.api.guardarDetalle(this.inventarioId, productos));
  }
  private reiniciarConteo(): void {
    this.inventario = null;
    this.productos = [];
    this.cantidades = {};
    this.stockPrevio = {};
    this.busqueda = '';
    this.motivoCancelacion = '';
  }
  private limpiarMensajes(): void { this.error = ''; this.mensaje = ''; }
  private refrescarVista(): void { this.cdr.detectChanges(); }
  private extraerError(e: any): string {
    if (e instanceof Error && e.message) return e.message;
    return e?.error?.message || e?.error?.detail || e?.error?.error || 'Ocurrió un error al procesar el inventario.';
  }
}
