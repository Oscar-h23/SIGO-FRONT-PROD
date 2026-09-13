import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { jsPDF } from 'jspdf';

import { AuthService } from '../../../../core/auth/auth.service';
import { Plaza } from '../../../asistencia/models/asistencia.models';
import { AsistenciaApiService } from '../../../asistencia/services/asistencia-api.service';
import { RelevoChecklistResponse, RelevoResponse, RelevoViaResponse } from '../../models/relevo.models';
import { RelevoApiService } from '../../services/relevo-api.service';

@Component({
  selector: 'app-relevo-historial',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './relevo-historial.component.html',
  styleUrl: '../../../../shared/page.css'
})
export class RelevoHistorialComponent implements OnInit {
  private readonly api = inject(RelevoApiService);
  private readonly catalogos = inject(AsistenciaApiService);
  readonly auth = inject(AuthService);

  readonly cargando = signal(false);
  readonly error = signal('');
  readonly detalleSeleccionado = signal<RelevoResponse | null>(null);
  readonly generandoPdfId = signal<number | null>(null);

  relevos: RelevoResponse[] = [];
  plazas: Plaza[] = [];
  inicio = '';
  fin = '';
  plazaId: number | null = null;

  get esOperador(): boolean {
    return this.auth.usuario()?.rol === 'OPERADOR';
  }

  ngOnInit(): void {
    const hoy = this.fechaHoy();
    this.inicio = hoy;
    this.fin = hoy;
    const usuario = this.auth.usuario();

    if (this.esOperador) {
      this.plazaId = usuario?.plazaId ?? null;
      this.buscar();
      return;
    }

    this.catalogos.getPlazas().subscribe({
      next: data => {
        this.plazas = (data ?? []).filter(item => item.activo !== false);
        this.buscar();
      },
      error: () => {
        this.error.set('No se pudieron cargar las plazas.');
        this.buscar();
      }
    });
  }

  buscar(): void {
    if (this.cargando()) return;
    this.error.set('');

    if (!this.inicio || !this.fin) return this.error.set('Selecciona las fechas de búsqueda.');
    if (this.inicio > this.fin) return this.error.set('La fecha inicial no puede ser posterior a la fecha final.');

    this.cargando.set(true);
    this.api.listar(this.inicio, this.fin).subscribe({
      next: data => {
        let items = (data ?? []).map(item => ({ ...item, checklist: item.checklist ?? [], vias: item.vias ?? [] }));
        if (this.esOperador) {
          const usuario = this.auth.usuario();
          items = items.filter(item => item.fecha === this.fechaHoy() && item.plazaId === usuario?.plazaId);
        } else if (this.plazaId) {
          items = items.filter(item => item.plazaId === this.plazaId);
        }
        this.relevos = items.sort((a, b) => this.fechaHoraNumero(b) - this.fechaHoraNumero(a));
        this.cargando.set(false);
      },
      error: err => {
        this.cargando.set(false);
        this.error.set(err?.error?.message ?? 'No se pudo cargar el historial de relevos.');
      }
    });
  }

  limpiarFiltros(): void {
    const hoy = this.fechaHoy();
    this.inicio = hoy;
    this.fin = hoy;
    this.plazaId = null;
    this.buscar();
  }

  abrirDetalle(relevo: RelevoResponse): void {
    this.detalleSeleccionado.set(relevo);
    document.body.style.overflow = 'hidden';
  }

  cerrarDetalle(): void {
    this.detalleSeleccionado.set(null);
    document.body.style.overflow = '';
  }

  baseOperativa(relevo: RelevoResponse): RelevoChecklistResponse[] {
    return relevo.checklist.filter(item => item.categoria === 'BASE_OPERATIVA');
  }

  plazaPeaje(relevo: RelevoResponse): RelevoChecklistResponse[] {
    return relevo.checklist.filter(item => item.categoria === 'PLAZA_PEAJE');
  }

  totalVias(relevo: RelevoResponse): number { return relevo.vias?.length ?? 0; }
  viasConObservacion(relevo: RelevoResponse): number {
    return relevo.vias?.filter(via => via.estado === 'OBSERVADO' || via.estado === 'NO_OPERATIVO').length ?? 0;
  }
  checklistConObservacion(relevo: RelevoResponse): number {
    return relevo.checklist?.filter(item => item.estado === 'OBSERVADO' || item.estado === 'NO_OPERATIVO').length ?? 0;
  }
  horaCorta(hora: string): string { return hora?.slice(0, 5) || '--:--'; }
  estadoLabel(estado: string): string {
    if (estado === 'NO_OPERATIVO') return 'No operativo';
    if (estado === 'OBSERVADO') return 'Observado';
    return 'Operativo';
  }

  async generarPdf(relevo: RelevoResponse): Promise<void> {
    if (this.generandoPdfId() !== null) return;
    this.generandoPdfId.set(relevo.id);
    this.error.set('');

    try {
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
      let y = 16;
      const pageWidth = 210;
      const margin = 14;

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(18);
      pdf.text('REPORTE DE RELEVO DE TURNO', margin, y);
      y += 10;
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Plaza: ${relevo.plazaCodigo}${relevo.plazaDescripcion ? ' - ' + relevo.plazaDescripcion : ''}`, margin, y);
      y += 6;
      pdf.text(`Fecha: ${relevo.fecha}   Hora: ${this.horaCorta(relevo.hora)}   Turno: ${relevo.turnoCodigo}`, margin, y);
      y += 6;
      pdf.text(`Registrado por: ${relevo.operadorNombre}`, margin, y);
      y += 10;

      y = this.dibujarSeccion(pdf, 'BASE OPERATIVA', this.baseOperativa(relevo), y);
      y = this.dibujarSeccion(pdf, 'PLAZA DE PEAJE', this.plazaPeaje(relevo), y);
      y = this.dibujarVias(pdf, relevo.vias, y);

      if (relevo.resumen || relevo.observaciones) {
        if (y > 250) { pdf.addPage(); y = 16; }
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.text('RESUMEN Y OBSERVACIONES', margin, y); y += 6;
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
        const texto = [relevo.resumen ? `Resumen: ${relevo.resumen}` : '', relevo.observaciones ? `Observaciones: ${relevo.observaciones}` : ''].filter(Boolean).join('\n');
        const lines = pdf.splitTextToSize(texto, pageWidth - margin * 2);
        pdf.text(lines, margin, y);
      }

      await this.agregarEvidenciasPdf(pdf, relevo);
      pdf.save(`relevo_${relevo.fecha}_${relevo.plazaCodigo}_turno_${relevo.turnoCodigo}.pdf`);
    } catch (err) {
      console.error(err);
      this.error.set('No se pudo generar el PDF del relevo.');
    } finally {
      this.generandoPdfId.set(null);
    }
  }

  private dibujarSeccion(pdf: jsPDF, titulo: string, items: RelevoChecklistResponse[], y: number): number {
    if (y > 245) { pdf.addPage(); y = 16; }
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.text(titulo, 14, y); y += 6;
    pdf.setFontSize(8.5);
    for (const item of items) {
      if (y > 275) { pdf.addPage(); y = 16; }
      const cantidad = item.cantidad !== null ? ` | Cant.: ${item.cantidad}` : '';
      const detalle = item.detalle ? ` | ${item.detalle}` : '';
      const lineas = pdf.splitTextToSize(`${item.nombre} — ${this.estadoLabel(item.estado)}${cantidad}${detalle}`, 182);
      pdf.setFont('helvetica', 'normal'); pdf.text(lineas, 14, y); y += lineas.length * 4.3 + 2;
    }
    return y + 3;
  }

  private dibujarVias(pdf: jsPDF, vias: RelevoViaResponse[], y: number): number {
    if (y > 245) { pdf.addPage(); y = 16; }
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.text('REPORTE DE VÍAS', 14, y); y += 6;
    pdf.setFontSize(8.5);
    for (const via of vias) {
      if (y > 275) { pdf.addPage(); y = 16; }
      const detalle = via.detalle ? ` | ${via.detalle}` : '';
      const lineas = pdf.splitTextToSize(`Vía ${via.numero}${via.nombre ? ' - ' + via.nombre : ''} — ${this.estadoLabel(via.estado)}${detalle}`, 182);
      pdf.setFont('helvetica', 'normal'); pdf.text(lineas, 14, y); y += lineas.length * 4.3 + 2;
    }
    return y + 3;
  }

  private async agregarEvidenciasPdf(pdf: jsPDF, relevo: RelevoResponse): Promise<void> {
    const evidencias: { titulo: string; url: string }[] = [];
    for (const item of relevo.checklist) for (const e of item.evidencias ?? []) evidencias.push({ titulo: item.nombre, url: e.urlArchivo });
    for (const via of relevo.vias) for (const e of via.evidencias ?? []) evidencias.push({ titulo: `Vía ${via.numero}`, url: e.urlArchivo });
    if (!evidencias.length) return;

    const boxW = 84, boxH = 58.8, gap = 10;
    for (let i = 0; i < evidencias.length; i += 4) {
      pdf.addPage();
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13); pdf.text('EVIDENCIAS FOTOGRÁFICAS', 14, 14);
      const lote = evidencias.slice(i, i + 4);
      for (let j = 0; j < lote.length; j++) {
        const col = j % 2, row = Math.floor(j / 2);
        const x = 14 + col * (boxW + gap), y = 24 + row * 82;
        pdf.setFontSize(8.5); pdf.text(lote[j].titulo, x, y);
        const data = await this.imagenDataUrl(lote[j].url);
        if (data) pdf.addImage(data, 'JPEG', x, y + 4, boxW, boxH, undefined, 'FAST');
        pdf.setDrawColor(220); pdf.rect(x, y + 4, boxW, boxH);
      }
    }
  }

  private async imagenDataUrl(url: string): Promise<string | null> {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch { return null; }
  }

  private fechaHoraNumero(relevo: RelevoResponse): number {
    const valor = new Date(`${relevo.fecha}T${relevo.hora || '00:00:00'}`).getTime();
    return Number.isNaN(valor) ? 0 : valor;
  }

  private fechaHoy(): string {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
  }
}
