import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, Observable, of, switchMap } from 'rxjs';

import { Turno } from '../../../asistencia/models/asistencia.models';
import { AsistenciaApiService } from '../../../asistencia/services/asistencia-api.service';
import { ImageCropperModalComponent } from '../../../asistencia/shared/image-cropper-modal.component';
import {
  ElementoRelevo,
  EstadoOperativo,
  EvidenciaRelevoResponse,
  RelevoChecklistResponse,
  RelevoRequest,
  RelevoResponse,
  RelevoViaResponse,
  Via
} from '../../models/relevo.models';
import { RelevoApiService } from '../../services/relevo-api.service';

interface FotoNueva { file: File; url: string; }
interface CropTarget { tipo: 'checklist' | 'via'; id: number; }

@Component({
  selector: 'app-relevo-editar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ImageCropperModalComponent],
  templateUrl: './relevo-editar.component.html',
  styleUrl: './relevo-editar.component.css'
})
export class RelevoEditarComponent implements OnInit {
  private readonly api = inject(RelevoApiService);
  private readonly asistenciaApi = inject(AsistenciaApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly cropperVisible = signal(false);
  readonly cropperFile = signal<File | null>(null);
  readonly cropTarget = signal<CropTarget | null>(null);

  relevo: RelevoResponse | null = null;
  turnos: Turno[] = [];
  checklist: RelevoChecklistResponse[] = [];
  vias: RelevoViaResponse[] = [];
  turnoId: number | null = null;
  fecha = '';
  hora = '';
  resumen = '';
  observaciones = '';

  readonly estados: { value: EstadoOperativo; label: string }[] = [
    { value: 'OPERATIVO', label: 'Operativo' },
    { value: 'OBSERVADO', label: 'Observado' },
    { value: 'NO_OPERATIVO', label: 'No operativo' }
  ];

  private readonly fotosNuevasChecklist = new Map<number, FotoNueva[]>();
  private readonly fotosNuevasVia = new Map<number, FotoNueva[]>();

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id || Number.isNaN(id)) {
      this.error.set('El identificador del relevo no es válido.');
      this.loading.set(false);
      return;
    }

    forkJoin({
      relevo: this.api.obtener(id),
      turnos: this.asistenciaApi.getTurnos(),
      elementos: this.api.getElementos()
    }).subscribe({
      next: ({ relevo, turnos, elementos }) => {
        this.relevo = relevo;
        this.turnos = turnos ?? [];
        this.turnoId = relevo.turnoId;
        this.fecha = relevo.fecha;
        this.hora = relevo.hora?.slice(0, 5) ?? '';
        this.resumen = relevo.resumen ?? '';
        this.observaciones = relevo.observaciones ?? '';
        this.checklist = this.completarChecklist(relevo, elementos ?? []);
        this.vias = [...(relevo.vias ?? [])];
        this.loading.set(false);
      },
      error: err => {
        this.error.set(err?.error?.message ?? 'No se pudo cargar el relevo para editar.');
        this.loading.set(false);
      }
    });
  }

  baseOperativa(): RelevoChecklistResponse[] { return this.checklist.filter(x => x.categoria === 'BASE_OPERATIVA'); }
  plazaPeaje(): RelevoChecklistResponse[] { return this.checklist.filter(x => x.categoria === 'PLAZA_PEAJE'); }
  fotosChecklist(elementoId: number): FotoNueva[] { return this.fotosNuevasChecklist.get(elementoId) ?? []; }
  fotosVia(viaId: number): FotoNueva[] { return this.fotosNuevasVia.get(viaId) ?? []; }

  seleccionarFotoChecklist(elementoId: number, event: Event): void { this.abrirCropper('checklist', elementoId, event); }
  seleccionarFotoVia(viaId: number, event: Event): void { this.abrirCropper('via', viaId, event); }

  onCropperConfirm(file: File): void {
    const target = this.cropTarget();
    if (!target) return;
    const store = target.tipo === 'checklist' ? this.fotosNuevasChecklist : this.fotosNuevasVia;
    const actuales = store.get(target.id) ?? [];
    if (actuales.length >= 5) {
      this.error.set('Puedes agregar como máximo 5 fotografías nuevas por ítem.');
      return this.cerrarCropper();
    }
    store.set(target.id, [...actuales, { file, url: URL.createObjectURL(file) }]);
    this.cerrarCropper();
  }

  onCropperCancel(): void { this.cerrarCropper(); }

  quitarFotoNueva(tipo: 'checklist' | 'via', id: number, index: number): void {
    const store = tipo === 'checklist' ? this.fotosNuevasChecklist : this.fotosNuevasVia;
    const items = [...(store.get(id) ?? [])];
    const eliminado = items.splice(index, 1)[0];
    if (eliminado) URL.revokeObjectURL(eliminado.url);
    store.set(id, items);
  }

  eliminarEvidenciaChecklist(item: RelevoChecklistResponse, evidencia: EvidenciaRelevoResponse): void {
    if (!confirm('¿Eliminar esta evidencia?')) return;
    this.api.eliminarEvidenciaChecklist(item.id, evidencia.id).subscribe({
      next: () => item.evidencias = item.evidencias.filter(e => e.id !== evidencia.id),
      error: err => this.error.set(err?.error?.message ?? 'No se pudo eliminar la evidencia.')
    });
  }

  eliminarEvidenciaVia(item: RelevoViaResponse, evidencia: EvidenciaRelevoResponse): void {
    if (!confirm('¿Eliminar esta evidencia?')) return;
    this.api.eliminarEvidenciaVia(item.id, evidencia.id).subscribe({
      next: () => item.evidencias = item.evidencias.filter(e => e.id !== evidencia.id),
      error: err => this.error.set(err?.error?.message ?? 'No se pudo eliminar la evidencia.')
    });
  }

  guardar(): void {
    if (!this.relevo || !this.turnoId) return this.error.set('Selecciona un turno.');
    if (!this.fecha || !this.hora) return this.error.set('Fecha y hora son obligatorias.');

    for (const item of [...this.checklist, ...this.vias] as Array<RelevoChecklistResponse | RelevoViaResponse>) {
      if (item.estado !== 'OPERATIVO' && !item.detalle?.trim()) {
        return this.error.set('Los ítems observados o no operativos deben tener un detalle.');
      }
    }

    const request: RelevoRequest = {
      plazaId: this.relevo.plazaId,
      turnoId: this.turnoId,
      operadorId: this.relevo.operadorId,
      fecha: this.fecha,
      hora: this.hora,
      checklist: this.checklist.map(item => ({
        elementoId: item.elementoId,
        estado: item.estado,
        detalle: item.detalle?.trim() || null,
        cantidad: item.cantidad
      })),
      vias: this.vias.map(item => ({
        viaId: item.viaId,
        estado: item.estado,
        detalle: item.detalle?.trim() || null
      })),
      observaciones: this.observaciones.trim() || null,
      resumen: this.resumen.trim() || null
    };

    this.saving.set(true);
    this.error.set('');
    this.api.actualizar(this.relevo.id, request)
      .pipe(switchMap(actualizado => this.subirFotos(actualizado)))
      .subscribe({
        next: actualizado => {
          this.saving.set(false);
          this.success.set('Relevo actualizado correctamente.');
          this.relevo = actualizado;
          setTimeout(() => this.router.navigate(['/relevos/historial']), 700);
        },
        error: err => {
          this.saving.set(false);
          this.error.set(err?.error?.message ?? 'No se pudo actualizar el relevo.');
        }
      });
  }

  private subirFotos(relevo: RelevoResponse): Observable<RelevoResponse> {
    const uploads: Observable<unknown>[] = [];
    for (const item of relevo.checklist) {
      for (const foto of this.fotosNuevasChecklist.get(item.elementoId) ?? []) uploads.push(this.api.subirEvidenciaChecklist(item.id, foto.file));
    }
    for (const via of relevo.vias) {
      for (const foto of this.fotosNuevasVia.get(via.viaId) ?? []) uploads.push(this.api.subirEvidenciaVia(via.id, foto.file));
    }
    if (!uploads.length) return of(relevo);
    return forkJoin(uploads).pipe(switchMap(() => this.api.obtener(relevo.id)));
  }

  private abrirCropper(tipo: 'checklist' | 'via', id: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return this.error.set('Solo se permiten imágenes JPG, PNG o WEBP.');
    if (file.size > 10 * 1024 * 1024) return this.error.set('La fotografía no puede superar 10 MB.');
    this.cropTarget.set({ tipo, id });
    this.cropperFile.set(file);
    this.cropperVisible.set(true);
  }

  private cerrarCropper(): void {
    this.cropperVisible.set(false);
    this.cropperFile.set(null);
    this.cropTarget.set(null);
  }

  private completarChecklist(relevo: RelevoResponse, elementos: ElementoRelevo[]): RelevoChecklistResponse[] {
    return elementos.filter(e => e.activo !== false).map(elemento => {
      const existente = relevo.checklist.find(x => x.elementoId === elemento.id);
      return existente ?? {
        id: 0,
        elementoId: elemento.id,
        codigo: elemento.codigo,
        nombre: elemento.nombre,
        categoria: elemento.categoria,
        estado: 'OPERATIVO' as EstadoOperativo,
        detalle: null,
        cantidad: elemento.requiereCantidad ? 0 : null,
        evidencias: []
      };
    });
  }
}
