import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin, Observable, of, switchMap } from 'rxjs';

import { AuthService } from '../../../../core/auth/auth.service';
import { Turno } from '../../../asistencia/models/asistencia.models';
import { AsistenciaApiService } from '../../../asistencia/services/asistencia-api.service';
import { ImageCropperModalComponent } from '../../../asistencia/shared/image-cropper-modal.component';
import {
  ElementoRelevo,
  EstadoOperativo,
  RelevoRequest,
  RelevoResponse,
  Via
} from '../../models/relevo.models';
import { RelevoApiService } from '../../services/relevo-api.service';

interface ArchivoPreview { file: File; url: string; }
interface CropTarget { tipo: 'checklist' | 'via'; index: number; }

@Component({
  selector: 'app-relevo-nuevo',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ImageCropperModalComponent],
  templateUrl: './relevo-nuevo.component.html',
  styleUrl: './relevo-nuevo.component.css'
})
export class RelevoNuevoComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  readonly auth = inject(AuthService);
  private readonly relevoApi = inject(RelevoApiService);
  private readonly asistenciaApi = inject(AsistenciaApiService);

  readonly cargando = signal(false);
  readonly guardando = signal(false);
  readonly mensaje = signal('');
  readonly error = signal('');
  readonly cropperVisible = signal(false);
  readonly cropperFile = signal<File | null>(null);
  readonly cropTarget = signal<CropTarget | null>(null);

  turnos: Turno[] = [];
  elementos: ElementoRelevo[] = [];
  viasDisponibles: Via[] = [];
  readonly archivosChecklist = new Map<number, ArchivoPreview[]>();
  readonly archivosVias = new Map<number, ArchivoPreview[]>();

  readonly estados: { value: EstadoOperativo; label: string }[] = [
    { value: 'OPERATIVO', label: 'Operativo' },
    { value: 'OBSERVADO', label: 'Observado' },
    { value: 'NO_OPERATIVO', label: 'No operativo' }
  ];

  readonly form = this.fb.group({
    turnoId: this.fb.control<number | null>(null, Validators.required),
    fecha: this.fb.control(this.fechaHoy(), Validators.required),
    hora: this.fb.control(this.horaActual(), Validators.required),
    checklist: this.fb.array<FormGroup>([]),
    vias: this.fb.array<FormGroup>([]),
    observaciones: this.fb.control(''),
    resumen: this.fb.control('')
  });

  get checklist(): FormArray<FormGroup> { return this.form.controls.checklist; }
  get vias(): FormArray<FormGroup> { return this.form.controls.vias; }

  ngOnInit(): void { this.cargarDatos(); }
  ngOnDestroy(): void {
    this.archivosChecklist.forEach(items => this.liberarPreviews(items));
    this.archivosVias.forEach(items => this.liberarPreviews(items));
  }

  elementosCategoria(categoria: 'BASE_OPERATIVA' | 'PLAZA_PEAJE'): { elemento: ElementoRelevo; index: number }[] {
    return this.elementos.map((elemento, index) => ({ elemento, index })).filter(item => item.elemento.categoria === categoria);
  }
  fotosChecklist(index: number): ArchivoPreview[] { return this.archivosChecklist.get(index) ?? []; }
  fotosVia(index: number): ArchivoPreview[] { return this.archivosVias.get(index) ?? []; }

  seleccionarFotosChecklist(index: number, event: Event): void { this.abrirCropper('checklist', index, event); }
  seleccionarFotosVia(index: number, event: Event): void { this.abrirCropper('via', index, event); }

  onCropperConfirm(file: File): void {
    const target = this.cropTarget();
    if (!target) return;
    const store = target.tipo === 'checklist' ? this.archivosChecklist : this.archivosVias;
    const actuales = store.get(target.index) ?? [];
    if (actuales.length >= 5) {
      this.error.set('Puedes adjuntar como máximo 5 fotografías por elemento.');
      return this.cerrarCropper();
    }
    store.set(target.index, [...actuales, { file, url: URL.createObjectURL(file) }]);
    this.cerrarCropper();
  }

  onCropperCancel(): void { this.cerrarCropper(); }

  quitarFotoChecklist(index: number, fotoIndex: number): void { this.quitarArchivo(this.archivosChecklist, index, fotoIndex); }
  quitarFotoVia(index: number, fotoIndex: number): void { this.quitarArchivo(this.archivosVias, index, fotoIndex); }

  registrar(): void {
    this.mensaje.set('');
    this.error.set('');
    this.form.markAllAsTouched();
    const usuario = this.auth.usuario();
    if (!usuario?.plazaId || !usuario.trabajadorId) return this.error.set('Tu usuario no tiene plaza o trabajador asociado.');
    if (this.form.invalid) return this.error.set('Revisa los campos obligatorios y los detalles de los ítems observados/no operativos.');

    const raw = this.form.getRawValue();
    const request: RelevoRequest = {
      plazaId: usuario.plazaId,
      turnoId: Number(raw.turnoId),
      operadorId: usuario.trabajadorId,
      fecha: String(raw.fecha),
      hora: String(raw.hora),
      checklist: this.checklist.controls.map(control => ({
        elementoId: Number(control.get('elementoId')?.value),
        estado: control.get('estado')?.value as EstadoOperativo,
        detalle: this.textoONull(control.get('detalle')?.value),
        cantidad: control.get('cantidad')?.value === null ? null : Number(control.get('cantidad')?.value)
      })),
      vias: this.vias.controls.map(control => ({
        viaId: Number(control.get('viaId')?.value),
        estado: control.get('estado')?.value as EstadoOperativo,
        detalle: this.textoONull(control.get('detalle')?.value)
      })),
      observaciones: this.textoONull(raw.observaciones),
      resumen: this.textoONull(raw.resumen)
    };

    this.guardando.set(true);
    this.relevoApi.registrar(request).pipe(switchMap(relevo => this.subirEvidencias(relevo))).subscribe({
      next: relevo => {
        this.guardando.set(false);
        this.mensaje.set(`Relevo #${relevo.id} registrado correctamente.`);
        this.limpiarFormulario();
      },
      error: err => {
        this.guardando.set(false);
        this.error.set(err?.error?.message ?? 'No se pudo completar el registro del relevo.');
      }
    });
  }

  private cargarDatos(): void {
    const usuario = this.auth.usuario();
    if (!usuario?.plazaId) return this.error.set('Tu usuario no tiene una plaza asignada.');
    this.cargando.set(true);
    forkJoin({
      turnos: this.asistenciaApi.getTurnos(),
      elementos: this.relevoApi.getElementos(),
      vias: this.relevoApi.getVias(usuario.plazaId)
    }).subscribe({
      next: ({ turnos, elementos, vias }) => {
        this.turnos = turnos ?? [];
        this.elementos = [...(elementos ?? [])].filter(item => item.activo !== false).sort((a, b) => a.categoria === b.categoria ? (a.orden ?? 0) - (b.orden ?? 0) : a.categoria.localeCompare(b.categoria));
        this.viasDisponibles = [...(vias ?? [])].filter(item => item.activa !== false).sort((a, b) => (a.orden ?? a.numero ?? 0) - (b.orden ?? b.numero ?? 0));
        this.construirChecklist();
        this.construirVias();
        this.cargando.set(false);
      },
      error: () => {
        this.cargando.set(false);
        this.error.set('No se pudieron cargar turnos, elementos o vías para el relevo.');
      }
    });
  }

  private construirChecklist(): void {
    this.checklist.clear();
    this.elementos.forEach(elemento => {
      const group = this.fb.group({
        elementoId: this.fb.control(elemento.id, Validators.required),
        estado: this.fb.control<EstadoOperativo>('OPERATIVO', Validators.required),
        detalle: this.fb.control(''),
        cantidad: this.fb.control<number | null>(elemento.requiereCantidad ? 0 : null, elemento.requiereCantidad ? [Validators.required, Validators.min(0)] : [])
      });
      group.get('estado')?.valueChanges.subscribe(() => this.actualizarDetalle(group));
      this.checklist.push(group);
    });
  }

  private construirVias(): void {
    this.vias.clear();
    this.viasDisponibles.forEach(via => {
      const group = this.fb.group({ viaId: this.fb.control(via.id, Validators.required), estado: this.fb.control<EstadoOperativo>('OPERATIVO', Validators.required), detalle: this.fb.control('') });
      group.get('estado')?.valueChanges.subscribe(() => this.actualizarDetalle(group));
      this.vias.push(group);
    });
  }

  private actualizarDetalle(group: FormGroup): void {
    const estado = group.get('estado')?.value as EstadoOperativo;
    const detalle = group.get('detalle');
    if (estado === 'OPERATIVO') detalle?.clearValidators();
    else detalle?.setValidators([Validators.required, Validators.minLength(3)]);
    detalle?.updateValueAndValidity({ emitEvent: false });
  }

  private abrirCropper(tipo: 'checklist' | 'via', index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return this.error.set('Solo se permiten imágenes JPG, PNG o WEBP.');
    if (file.size > 10 * 1024 * 1024) return this.error.set('Cada fotografía debe pesar como máximo 10 MB.');
    const store = tipo === 'checklist' ? this.archivosChecklist : this.archivosVias;
    if ((store.get(index) ?? []).length >= 5) return this.error.set('Puedes adjuntar como máximo 5 fotografías por elemento.');
    this.cropTarget.set({ tipo, index });
    this.cropperFile.set(file);
    this.cropperVisible.set(true);
  }

  private cerrarCropper(): void {
    this.cropperVisible.set(false);
    this.cropperFile.set(null);
    this.cropTarget.set(null);
  }

  private quitarArchivo(store: Map<number, ArchivoPreview[]>, index: number, fotoIndex: number): void {
    const items = [...(store.get(index) ?? [])];
    const eliminado = items.splice(fotoIndex, 1)[0];
    if (eliminado) URL.revokeObjectURL(eliminado.url);
    store.set(index, items);
  }

  private subirEvidencias(relevo: RelevoResponse): Observable<RelevoResponse> {
    const uploads: Observable<unknown>[] = [];
    relevo.checklist.forEach((item, index) => {
      for (const preview of this.archivosChecklist.get(index) ?? []) uploads.push(this.relevoApi.subirEvidenciaChecklist(item.id, preview.file));
    });
    relevo.vias.forEach((item, index) => {
      for (const preview of this.archivosVias.get(index) ?? []) uploads.push(this.relevoApi.subirEvidenciaVia(item.id, preview.file));
    });
    if (!uploads.length) return of(relevo);
    return forkJoin(uploads).pipe(switchMap(() => of(relevo)));
  }

  private limpiarFormulario(): void {
    this.archivosChecklist.forEach(items => this.liberarPreviews(items));
    this.archivosVias.forEach(items => this.liberarPreviews(items));
    this.archivosChecklist.clear();
    this.archivosVias.clear();
    this.form.patchValue({ turnoId: null, fecha: this.fechaHoy(), hora: this.horaActual(), observaciones: '', resumen: '' });
    this.construirChecklist();
    this.construirVias();
  }

  private liberarPreviews(items: ArchivoPreview[]): void { items.forEach(item => URL.revokeObjectURL(item.url)); }
  private textoONull(value: unknown): string | null { const text = String(value ?? '').trim(); return text || null; }
  private fechaHoy(): string { const now = new Date(); const offset = now.getTimezoneOffset(); return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10); }
  private horaActual(): string { const now = new Date(); return [String(now.getHours()).padStart(2, '0'), String(now.getMinutes()).padStart(2, '0')].join(':'); }
}
