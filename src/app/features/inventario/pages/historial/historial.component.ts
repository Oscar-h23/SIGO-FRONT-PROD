import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import jsPDF from 'jspdf';

import { AuthService } from '../../../../core/auth/auth.service';
import { CatalogoItem, InventarioDetalle, InventarioResumen } from '../../models/inventario.models';
import { InventarioApiService } from '../../services/inventario-api.service';

type EstadoFiltro = '' | 'EN_PROCESO' | 'FINALIZADO' | 'ANULADO';

@Component({
  selector: 'app-historial',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './historial.component.html',
  styleUrl: './historial.component.css'
})
export class HistorialComponent implements OnInit {
  private readonly api = inject(InventarioApiService);
  private readonly auth = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);

  items: InventarioResumen[] = [];
  detalle: InventarioDetalle | null = null;
  plazas: CatalogoItem[] = [];

  cargando = true;
  cargandoDetalle = false;
  error = '';
  pagina = 0;
  totalPaginas = 0;
  totalElementos = 0;
  tamanoPagina = 12;

  plazaId: number | null = null;
  estado: EstadoFiltro = '';
  rol = '';
  desde = '';
  hasta = '';
  busqueda = '';

  get esSupervisor(): boolean { return this.auth.tieneRol('SUPERVISOR'); }
  get usuario() { return this.auth.usuario(); }

  async ngOnInit(): Promise<void> {
    if (this.esSupervisor) {
      try {
        this.plazas = await firstValueFrom(this.api.catalogo('plazas'));
      } catch {
        this.plazas = [];
      }
    } else {
      this.plazaId = this.usuario?.plazaId ?? null;
    }

    await this.cargar(0);
  }

  async cargar(page = this.pagina): Promise<void> {
    this.cargando = true;
    this.error = '';
    this.cdr.detectChanges();

    try {
      const respuesta = await firstValueFrom(this.api.historial({
        plazaId: this.esSupervisor ? this.plazaId : this.usuario?.plazaId,
        rol: this.rol || null,
        estado: this.estado || null,
        desde: this.desde || null,
        hasta: this.hasta || null,
        page,
        size: this.tamanoPagina
      }));

      this.items = respuesta?.content ?? [];
      this.pagina = respuesta?.number ?? page;
      this.totalPaginas = respuesta?.totalPages ?? 0;
      this.totalElementos = respuesta?.totalElements ?? this.items.length;
    } catch (e: any) {
      this.items = [];
      this.error = this.extraerError(e);
    } finally {
      this.cargando = false;
      this.cdr.detectChanges();
    }
  }

  async aplicarFiltros(): Promise<void> {
    await this.cargar(0);
  }

  async limpiarFiltros(): Promise<void> {
    this.plazaId = this.esSupervisor ? null : (this.usuario?.plazaId ?? null);
    this.estado = '';
    this.rol = '';
    this.desde = '';
    this.hasta = '';
    this.busqueda = '';
    await this.cargar(0);
  }

  itemsVisibles(): InventarioResumen[] {
    const q = this.busqueda.trim().toLowerCase();
    if (!q) return this.items;
    return this.items.filter(i =>
      String(i.id).includes(q) ||
      (i.plaza || '').toLowerCase().includes(q) ||
      (i.responsable || '').toLowerCase().includes(q) ||
      (i.rol || '').toLowerCase().includes(q) ||
      (i.estado || '').toLowerCase().includes(q)
    );
  }

  async ver(id: number): Promise<void> {
    this.cargandoDetalle = true;
    this.error = '';
    this.cdr.detectChanges();

    try {
      this.detalle = await firstValueFrom(this.api.detalle(id));
    } catch (e: any) {
      this.error = this.extraerError(e);
    } finally {
      this.cargandoDetalle = false;
      this.cdr.detectChanges();
    }
  }

  cerrarDetalle(): void {
    if (!this.cargandoDetalle) this.detalle = null;
  }

  async exportarPdf(item?: InventarioResumen): Promise<void> {
    try {
      const data = item
        ? await firstValueFrom(this.api.detalle(item.id))
        : this.detalle;
      if (!data) return;

      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const ancho = doc.internal.pageSize.getWidth();
      const alto = doc.internal.pageSize.getHeight();
      const margen = 16;
      let y = 18;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('LIMA EXPRESA', margen, y);
      doc.setFontSize(13);
      doc.text('Reporte de inventario', margen, y + 8);
      doc.setDrawColor(30, 64, 175);
      doc.setLineWidth(0.8);
      doc.line(margen, y + 12, ancho - margen, y + 12);
      y += 22;

      const dato = (etiqueta: string, valor: string, x: number, yy: number) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(etiqueta.toUpperCase(), x, yy);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(valor || '-', x, yy + 5);
      };

      dato('Inventario', `#${data.id}`, margen, y);
      dato('Plaza', data.plaza, 55, y);
      dato('Estado', this.estadoTexto(data.estado), 105, y);
      dato('Rol', data.rol, 155, y);
      y += 15;
      dato('Responsable', data.responsable, margen, y);
      dato('Fecha inicio', this.formatearFecha(data.fechaInicio), 105, y);
      y += 15;
      dato('Fecha finalización', data.fechaFinalizacion ? this.formatearFecha(data.fechaFinalizacion) : '-', margen, y);
      dato('Productos registrados', String(data.productos?.length ?? 0), 105, y);
      y += 16;

      doc.setFillColor(245, 247, 250);
      doc.rect(margen, y, ancho - margen * 2, 9, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('PRODUCTO', margen + 2, y + 6);
      doc.text('CATEGORÍA', 105, y + 6);
      doc.text('CANTIDAD', ancho - margen - 2, y + 6, { align: 'right' });
      y += 12;

      for (const p of data.productos ?? []) {
        const nombre = doc.splitTextToSize(p.nombre, 80);
        const categoria = doc.splitTextToSize(p.categoria || '-', 42);
        const altoFila = Math.max(nombre.length, categoria.length) * 4.5 + 4;

        if (y + altoFila > alto - 18) {
          this.piePdf(doc);
          doc.addPage();
          y = 18;
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.text(nombre, margen + 2, y);
        doc.text(categoria, 105, y);
        doc.setFont('helvetica', 'bold');
        doc.text(`${this.formatearCantidad(p.cantidad)} ${p.unidad}`, ancho - margen - 2, y, { align: 'right' });
        y += altoFila;
        doc.setDrawColor(230, 233, 238);
        doc.line(margen, y - 2, ancho - margen, y - 2);
      }

      if (data.observacion) {
        y += 5;
        if (y > alto - 35) {
          this.piePdf(doc);
          doc.addPage();
          y = 18;
        }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('Observación', margen, y);
        doc.setFont('helvetica', 'normal');
        doc.text(doc.splitTextToSize(data.observacion, ancho - margen * 2), margen, y + 5);
      }

      this.piePdf(doc);
      doc.save(`inventario-${data.id}-${data.plaza}.pdf`);
    } catch (e: any) {
      this.error = this.extraerError(e);
      this.cdr.detectChanges();
    }
  }

  anterior(): void {
    if (this.pagina > 0 && !this.cargando) void this.cargar(this.pagina - 1);
  }

  siguiente(): void {
    if (this.pagina + 1 < this.totalPaginas && !this.cargando) void this.cargar(this.pagina + 1);
  }

  estadoTexto(estado: string): string {
    const mapa: Record<string, string> = {
      EN_PROCESO: 'En proceso',
      FINALIZADO: 'Finalizado',
      ANULADO: 'Anulado'
    };
    return mapa[estado] ?? estado;
  }

  formatearFecha(fecha: string | null): string {
    if (!fecha) return '-';
    const d = new Date(fecha);
    if (Number.isNaN(d.getTime())) return fecha;
    return new Intl.DateTimeFormat('es-PE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }).format(d);
  }

  formatearCantidad(valor: number): string {
    return new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(valor ?? 0));
  }

  private piePdf(doc: jsPDF): void {
    const ancho = doc.internal.pageSize.getWidth();
    const alto = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100);
    doc.text('SIGO · Lima Expresa · Inventario', 16, alto - 8);
    doc.text(`Página ${doc.getNumberOfPages()}`, ancho - 16, alto - 8, { align: 'right' });
    doc.setTextColor(0);
  }

  private extraerError(e: any): string {
    if (e instanceof Error && e.message) return e.message;
    return e?.error?.message || e?.error?.detail || e?.error?.error || 'No se pudo cargar el historial de inventarios.';
  }
}
