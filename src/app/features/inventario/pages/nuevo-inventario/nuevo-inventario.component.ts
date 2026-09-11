import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { InventarioApiService } from '../../services/inventario-api.service';
import { ProductoInventario } from '../../models/inventario.models';

@Component({
  selector: 'app-nuevo-inventario',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './nuevo-inventario.component.html',
  styleUrl: './nuevo-inventario.component.css'
})
export class NuevoInventarioComponent {
  inventarioId: number | null = null;
  productos: ProductoInventario[] = [];
  cantidades: Record<number, number | null> = {};
  mensaje = '';
  error = '';
  cargando = false;

  constructor(private api: InventarioApiService) {}

  async iniciar(): Promise<void> {
    this.cargando = true; this.error = ''; this.mensaje = '';
    try {
      const inv = await firstValueFrom(this.api.iniciarInventario());
      this.inventarioId = inv.id;
      this.productos = await firstValueFrom(this.api.productosPermitidos(inv.id));
      for (const p of this.productos) this.cantidades[p.id] = null;
    } catch (e: any) {
      this.error = this.extraerError(e);
    } finally { this.cargando = false; }
  }

  async guardar(): Promise<void> {
    if (!this.inventarioId) return;
    const productos = this.productos
      .filter(p => this.cantidades[p.id] !== null && this.cantidades[p.id] !== undefined)
      .map(p => ({ productoId: p.id, cantidad: Number(this.cantidades[p.id]) }));

    try {
      await firstValueFrom(this.api.guardarDetalle(this.inventarioId, productos));
      this.mensaje = 'Conteo guardado correctamente.';
      this.error = '';
    } catch (e: any) { this.error = this.extraerError(e); }
  }

  async finalizar(): Promise<void> {
    if (!this.inventarioId) return;
    try {
      await this.guardar();
      await firstValueFrom(this.api.finalizar(this.inventarioId));
      this.mensaje = 'Inventario finalizado correctamente.';
      this.productos = [];
      this.inventarioId = null;
    } catch (e: any) { this.error = this.extraerError(e); }
  }

  privadosAmbito(ambito: string | null) {
    return this.productos.filter(p => p.ambito === ambito);
  }

  ambitos(): string[] {
    return [...new Set(this.productos.map(p => p.ambito || 'General'))];
  }

  private extraerError(e: any): string {
    return e?.error?.message || e?.error?.detail || e?.error?.error || 'Ocurrió un error.';
  }
}
