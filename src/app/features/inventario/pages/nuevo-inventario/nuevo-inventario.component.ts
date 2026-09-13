import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
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
  readonly auth = inject(AuthService);

  inventario: InventarioResumen | null = null;
  productos: ProductoInventario[] = [];
  cantidades: Record<number, number | null> = {};
  busqueda = '';
  mensaje = '';
  error = '';
  cargando = false;
  guardando = false;
  finalizando = false;
  recuperando = true;
  confirmarFinalizacion = false;

  get inventarioId(): number | null { return this.inventario?.id ?? null; }
  get usuario() { return this.auth.usuario(); }
  get plazaNombre(): string { return this.inventario?.plaza || this.usuario?.plaza || 'Sin plaza asignada'; }

  ngOnInit(): void {
    void this.recuperarInventarioEnProceso();
  }

  async iniciar(): Promise<void> {
    if (this.cargando || this.inventarioId) return;
    this.cargando = true;
    this.limpiarMensajes();

    try {
      const inv = await firstValueFrom(this.api.iniciarInventario());
      await this.cargarInventario(inv);
      this.mensaje = 'Inventario iniciado. Registra la cantidad física de todos los productos.';
    } catch (e: any) {
      const texto = this.extraerError(e);
      if (e?.status === 409 || texto.includes('EN_PROCESO')) {
        await this.recuperarInventarioEnProceso();
        if (this.inventarioId) this.mensaje = 'Se recuperó el inventario que tenías en proceso.';
        else this.error = texto;
      } else {
        this.error = texto;
      }
    } finally {
      this.cargando = false;
    }
  }

  async guardar(): Promise<void> {
    if (!this.inventarioId || this.guardando) return;
    this.guardando = true;
    this.limpiarMensajes();

    try {
      await this.guardarInterno();
      this.mensaje = `Avance guardado: ${this.contados()} de ${this.productos.length} productos registrados.`;
    } catch (e: any) {
      this.error = this.extraerError(e);
    } finally {
      this.guardando = false;
    }
  }

  solicitarFinalizacion(): void {
    this.limpiarMensajes();
    if (!this.inventarioId) return;

    if (!this.todosContados()) {
      this.error = `Faltan ${this.pendientes()} producto(s) por contar. Completa todas las cantidades antes de finalizar.`;
      return;
    }

    this.confirmarFinalizacion = true;
  }

  cancelarFinalizacion(): void {
    if (!this.finalizando) this.confirmarFinalizacion = false;
  }

  async finalizar(): Promise<void> {
    if (!this.inventarioId || this.finalizando || !this.todosContados()) return;
    this.finalizando = true;
    this.limpiarMensajes();

    try {
      await this.guardarInterno();
      const cerrado = await firstValueFrom(this.api.finalizar(this.inventarioId));
      this.confirmarFinalizacion = false;
      this.mensaje = `Inventario #${cerrado.id} finalizado correctamente.`;
      this.inventario = null;
      this.productos = [];
      this.cantidades = {};
      this.busqueda = '';
    } catch (e: any) {
      this.error = this.extraerError(e);
    } finally {
      this.finalizando = false;
    }
  }

  productosVisibles(): ProductoInventario[] {
    const q = this.busqueda.trim().toLowerCase();
    if (!q) return this.productos;
    return this.productos.filter(p =>
      p.nombre.toLowerCase().includes(q) ||
      p.codigo.toLowerCase().includes(q) ||
      (p.categoria || '').toLowerCase().includes(q) ||
      (p.ambito || '').toLowerCase().includes(q)
    );
  }

  ambitosVisibles(): string[] {
    return [...new Set(this.productosVisibles().map(p => p.ambito || 'General'))];
  }

  productosPorAmbito(ambito: string): ProductoInventario[] {
    return this.productosVisibles().filter(p => (p.ambito || 'General') === ambito);
  }

  categoriaProducto(producto: ProductoInventario): string {
    return producto.categoria || 'Sin categoría';
  }

  contado(productoId: number): boolean {
    return this.cantidades[productoId] !== null && this.cantidades[productoId] !== undefined;
  }

  contados(): number {
    return this.productos.filter(p => this.contado(p.id)).length;
  }

  pendientes(): number {
    return Math.max(this.productos.length - this.contados(), 0);
  }

  porcentaje(): number {
    if (!this.productos.length) return 0;
    return Math.round((this.contados() / this.productos.length) * 100);
  }

  todosContados(): boolean {
    return this.productos.length > 0 && this.pendientes() === 0;
  }

  limpiarBusqueda(): void {
    this.busqueda = '';
  }

  private async recuperarInventarioEnProceso(): Promise<void> {
    this.recuperando = true;
    const usuario = this.auth.usuario();

    try {
      if (!usuario) return;
      const responsableId = usuario.trabajadorId ?? usuario.id;
      const pagina = await firstValueFrom(this.api.historial({
        responsableId,
        estado: 'EN_PROCESO',
        page: 0,
        size: 1
      }));
      const abierto: InventarioResumen | undefined = pagina?.content?.[0];
      if (!abierto) return;
      await this.cargarInventario(abierto, true);
    } catch {
      // La pantalla sigue siendo utilizable aunque no exista un inventario por recuperar.
    } finally {
      this.recuperando = false;
    }
  }

  private async cargarInventario(inv: InventarioResumen, recuperarCantidades = false): Promise<void> {
    this.inventario = inv;
    this.productos = await firstValueFrom(this.api.productosPermitidos(inv.id));
    this.cantidades = {};
    for (const producto of this.productos) this.cantidades[producto.id] = null;

    if (recuperarCantidades) {
      try {
        const detalle = await firstValueFrom(this.api.detalle(inv.id));
        for (const item of detalle.productos ?? []) {
          this.cantidades[item.productoId] = Number(item.cantidad);
        }
      } catch {
        // Si todavía no hay detalle guardado, las cantidades permanecen vacías.
      }
    }
  }

  private async guardarInterno(): Promise<InventarioDetalle> {
    if (!this.inventarioId) throw new Error('No existe un inventario activo.');

    const productos = this.productos
      .filter(p => this.contado(p.id))
      .map(p => ({ productoId: p.id, cantidad: Number(this.cantidades[p.id]) }));

    if (!productos.length) throw new Error('Registra al menos una cantidad antes de guardar.');
    if (productos.some(p => !Number.isFinite(p.cantidad) || p.cantidad < 0)) {
      throw new Error('Las cantidades deben ser números iguales o mayores a cero.');
    }

    return await firstValueFrom(this.api.guardarDetalle(this.inventarioId, productos));
  }

  private limpiarMensajes(): void {
    this.error = '';
    this.mensaje = '';
  }

  private extraerError(e: any): string {
    if (e instanceof Error && e.message) return e.message;
    return e?.error?.message || e?.error?.detail || e?.error?.error || 'Ocurrió un error al procesar el inventario.';
  }
}
