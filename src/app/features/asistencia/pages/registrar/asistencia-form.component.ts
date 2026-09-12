import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';

import { AsistenciaApiService } from '../../services/asistencia-api.service';
import { MotivoAusencia, Plaza, Trabajador, Turno } from '../../models/asistencia.models';
import { ImageCropperModalComponent } from '../../shared/image-cropper-modal.component';

interface AusenciaFormValue {
  trabajadorId: number | null;
  motivoId: number | null;
  observacion: string | null;
}

type EvidenciaTipo = 'CALENTAMIENTO' | 'INICIO_TURNO' | 'TAPONES_AUDITIVOS';

@Component({
  selector: 'app-asistencia-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ImageCropperModalComponent],
  templateUrl: './asistencia-form.component.html',
  styleUrl: './asistencia-form.component.css'
})
export class AsistenciaFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(AsistenciaApiService);

  readonly loadingCatalogos = signal(true);
  readonly loadingPersonal = signal(false);
  readonly saving = signal(false);
  readonly success = signal('');
  readonly error = signal('');

  readonly plazas = signal<Plaza[]>([]);
  readonly turnos = signal<Turno[]>([]);
  readonly motivos = signal<MotivoAusencia[]>([]);
  readonly controladores = signal<Trabajador[]>([]);
  readonly agentes = signal<Trabajador[]>([]);

  readonly evidenciaCalentamiento = signal<File | null>(null);
  readonly evidenciaInicioTurno = signal<File | null>(null);
  readonly evidenciaTapones = signal<File | null>(null);

  readonly cropperVisible = signal(false);
  readonly cropperFile = signal<File | null>(null);
  readonly cropperTipo = signal<EvidenciaTipo | null>(null);

  readonly ausentesEsperados = signal(0);

  readonly form = this.fb.group({
    plazaId: [null as number | null, Validators.required],
    turnoId: [null as number | null, Validators.required],
    controladorId: [null as number | null, Validators.required],
    fecha: [this.today(), Validators.required],
    programados: [0, [Validators.required, Validators.min(1)]],
    presentes: [0, [Validators.required, Validators.min(0)]],
    apoyoSolicitado: [0, [Validators.required, Validators.min(0)]],
    detalleApoyo: [''],
    notas: [''],
    ausencias: this.fb.array([])
  });

  get ausencias(): FormArray {
    return this.form.controls.ausencias;
  }

  ngOnInit(): void {
    this.cargarCatalogos();

    this.form.controls.plazaId.valueChanges.subscribe(plazaId => this.onPlazaChange(plazaId));
    this.form.controls.turnoId.valueChanges.subscribe(() => this.syncTurno());
    this.form.controls.programados.valueChanges.subscribe(() => this.syncProgramados());
    this.form.controls.presentes.valueChanges.subscribe(() => this.syncAusencias());
  }

  private cargarCatalogos(): void {
    this.loadingCatalogos.set(true);

    this.api.getCatalogos().subscribe({
      next: data => {
        this.plazas.set((data.plazas ?? []).filter(p => p.activo));
        this.turnos.set(data.turnos ?? []);
        this.motivos.set(data.motivos ?? []);
        this.loadingCatalogos.set(false);
      },
      error: err => {
        this.error.set(this.errorMessage(err));
        this.loadingCatalogos.set(false);
      }
    });
  }

  private onPlazaChange(plazaId: number | null): void {
    this.form.controls.controladorId.setValue(null, { emitEvent: false });
    this.resetAusenciasTrabajadores();
    this.controladores.set([]);
    this.agentes.set([]);

    if (!plazaId) {
      this.loadingPersonal.set(false);
      return;
    }

    this.cargarPersonalPlaza(Number(plazaId));
  }

  private cargarPersonalPlaza(plazaId: number): void {
    this.loadingPersonal.set(true);
    this.error.set('');

    forkJoin({
      agentes: this.api.getAgentesPorPlaza(plazaId),
      controladores: this.api.getControladoresPorPlaza(plazaId)
    }).subscribe({
      next: ({ agentes, controladores }) => {
        this.agentes.set(agentes ?? []);
        this.controladores.set(controladores ?? []);
        this.loadingPersonal.set(false);
      },
      error: err => {
        this.agentes.set([]);
        this.controladores.set([]);
        this.loadingPersonal.set(false);
        this.error.set(`No se pudo cargar el personal de la plaza. ${this.errorMessage(err)}`);
      }
    });
  }

  agentesFiltrados(): Trabajador[] {
    return this.agentes();
  }

  onEvidenceFile(tipo: EvidenciaTipo, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.abrirEditorImagen(tipo, file);
    input.value = '';
  }

  onEvidencePaste(tipo: EvidenciaTipo, event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items) {
      this.error.set('No se pudo acceder al portapapeles.');
      return;
    }

    const imageItem = Array.from(items).find(item => item.type.startsWith('image/'));
    if (!imageItem) {
      this.error.set('El portapapeles no contiene una imagen. Copia la imagen desde DSS e inténtalo nuevamente.');
      return;
    }

    const clipboardFile = imageItem.getAsFile();
    if (!clipboardFile) {
      this.error.set('No se pudo leer la imagen copiada desde DSS.');
      return;
    }

    event.preventDefault();

    const file = new File(
      [clipboardFile],
      `DSS_${tipo}_${Date.now()}.${this.extensionFromMime(clipboardFile.type)}`,
      { type: clipboardFile.type || 'image/png', lastModified: Date.now() }
    );

    this.abrirEditorImagen(tipo, file);
  }

  private abrirEditorImagen(tipo: EvidenciaTipo, file: File): void {
    const tiposPermitidos = ['image/jpeg', 'image/png', 'image/webp'];
    if (!tiposPermitidos.includes(file.type)) {
      this.error.set('Solo se permiten imágenes JPG, PNG o WEBP.');
      return;
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      this.error.set('Cada fotografía debe pesar como máximo 10 MB.');
      return;
    }

    this.error.set('');
    this.cropperTipo.set(tipo);
    this.cropperFile.set(file);
    this.cropperVisible.set(true);
  }

  onCropperConfirm(file: File): void {
    const tipo = this.cropperTipo();
    if (!tipo) return;

    this.setEvidenceFile(tipo, file);
    this.cerrarCropper();
  }

  onCropperCancel(): void {
    this.cerrarCropper();
  }

  private cerrarCropper(): void {
    this.cropperVisible.set(false);
    this.cropperFile.set(null);
    this.cropperTipo.set(null);
  }

  private setEvidenceFile(tipo: EvidenciaTipo, file: File): void {
    switch (tipo) {
      case 'CALENTAMIENTO':
        this.evidenciaCalentamiento.set(file);
        break;
      case 'INICIO_TURNO':
        this.evidenciaInicioTurno.set(file);
        break;
      case 'TAPONES_AUDITIVOS':
        this.evidenciaTapones.set(file);
        break;
    }
  }

  private extensionFromMime(mime: string): string {
    switch (mime) {
      case 'image/jpeg': return 'jpg';
      case 'image/webp': return 'webp';
      case 'image/png':
      default: return 'png';
    }
  }

  removeEvidence(tipo: EvidenciaTipo): void {
    switch (tipo) {
      case 'CALENTAMIENTO': this.evidenciaCalentamiento.set(null); break;
      case 'INICIO_TURNO': this.evidenciaInicioTurno.set(null); break;
      case 'TAPONES_AUDITIVOS': this.evidenciaTapones.set(null); break;
    }
  }

  fileUrl(file: File): string {
    return URL.createObjectURL(file);
  }

  submit(): void {
    this.success.set('');
    this.error.set('');
    this.form.markAllAsTouched();

    if (this.form.invalid) {
      this.error.set('Completa los campos obligatorios antes de registrar la asistencia.');
      return;
    }

    const programados = Number(this.form.controls.programados.value ?? 0);
    const presentes = Number(this.form.controls.presentes.value ?? 0);

    if (presentes > programados) {
      this.error.set('El personal presente no puede ser mayor al personal programado.');
      return;
    }

    const expected = this.ausentesEsperados();
    if (this.ausencias.length !== expected) {
      this.error.set(`Debes registrar exactamente ${expected} ausencia(s).`);
      return;
    }

    if (this.ausencias.invalid) {
      this.error.set('Completa el trabajador y motivo de todas las ausencias.');
      return;
    }

    const absentIds = this.ausencias.controls.map(control => Number(control.get('trabajadorId')?.value));
    if (new Set(absentIds).size !== absentIds.length) {
      this.error.set('No puedes seleccionar al mismo trabajador ausente más de una vez.');
      return;
    }

    const calentamiento = this.evidenciaCalentamiento();
    const inicioTurno = this.evidenciaInicioTurno();
    const tapones = this.evidenciaTapones();

    if (!calentamiento || !inicioTurno || !tapones) {
      this.error.set('Debes registrar las tres evidencias fotográficas: calentamiento, inicio de turno e inspección de tapones auditivos.');
      return;
    }

    const raw = this.form.getRawValue();
    const ausencias = raw.ausencias as AusenciaFormValue[];

    this.saving.set(true);

    this.api.registrarAsistencia({
      plazaId: Number(raw.plazaId),
      turnoId: Number(raw.turnoId),
      controladorId: Number(raw.controladorId),
      fecha: String(raw.fecha),
      programados: Number(raw.programados),
      presentes: Number(raw.presentes),
      apoyoSolicitado: Number(raw.apoyoSolicitado ?? 0),
      detalleApoyo: Number(raw.apoyoSolicitado ?? 0) > 0 ? raw.detalleApoyo?.trim() || null : null,
      notas: raw.notas?.trim() || null,
      ausencias: ausencias.map(ausencia => ({
        trabajadorId: Number(ausencia.trabajadorId),
        motivoId: Number(ausencia.motivoId),
        observacion: ausencia.observacion?.trim() || null
      })),
      evidencias: []
    }).subscribe({
      next: created => {
        const uploads = [
          this.api.subirEvidencia(created.id, calentamiento, 'CALENTAMIENTO'),
          this.api.subirEvidencia(created.id, inicioTurno, 'INICIO_TURNO'),
          this.api.subirEvidencia(created.id, tapones, 'TAPONES_AUDITIVOS')
        ];

        forkJoin(uploads).subscribe({
          next: () => this.finishSuccess(created.id),
          error: err => {
            this.saving.set(false);
            this.error.set(`La asistencia #${created.id} se registró, pero una de las evidencias no pudo subirse. ${this.errorMessage(err)}`);
          }
        });
      },
      error: err => {
        this.saving.set(false);
        this.error.set(this.errorMessage(err));
      }
    });
  }

  private syncTurno(): void {
    const turno = this.turnos().find(item => item.id === Number(this.form.controls.turnoId.value));
    const total = turno?.personalProgramado ?? 0;

    this.form.controls.programados.setValue(total, { emitEvent: false });
    this.form.controls.presentes.setValue(total, { emitEvent: false });
    this.actualizarValidadorPresentes();
    this.syncAusencias();
  }

  private syncProgramados(): void {
    const programados = Number(this.form.controls.programados.value ?? 0);
    let presentes = Number(this.form.controls.presentes.value ?? 0);

    if (programados >= 0 && presentes > programados) {
      presentes = programados;
      this.form.controls.presentes.setValue(presentes, { emitEvent: false });
    }

    this.actualizarValidadorPresentes();
    this.syncAusencias();
  }

  private actualizarValidadorPresentes(): void {
    const programados = Number(this.form.controls.programados.value ?? 0);
    this.form.controls.presentes.setValidators([
      Validators.required,
      Validators.min(0),
      Validators.max(Math.max(0, programados))
    ]);
    this.form.controls.presentes.updateValueAndValidity({ emitEvent: false });
  }

  private syncAusencias(): void {
    const programados = Number(this.form.controls.programados.value ?? 0);
    const presentes = Number(this.form.controls.presentes.value ?? 0);
    const expected = Math.max(0, programados - presentes);

    this.ausentesEsperados.set(expected);

    while (this.ausencias.length < expected) {
      this.ausencias.push(this.fb.group({
        trabajadorId: [null as number | null, Validators.required],
        motivoId: [null as number | null, Validators.required],
        observacion: ['']
      }));
    }

    while (this.ausencias.length > expected) {
      this.ausencias.removeAt(this.ausencias.length - 1);
    }
  }

  private resetAusenciasTrabajadores(): void {
    for (const group of this.ausencias.controls) {
      group.get('trabajadorId')?.setValue(null);
    }
  }

  private finishSuccess(id: number): void {
    this.saving.set(false);
    this.success.set(`Asistencia #${id} registrada correctamente con sus tres evidencias.`);

    this.evidenciaCalentamiento.set(null);
    this.evidenciaInicioTurno.set(null);
    this.evidenciaTapones.set(null);

    this.form.reset({
      plazaId: null,
      turnoId: null,
      controladorId: null,
      fecha: this.today(),
      programados: 0,
      presentes: 0,
      apoyoSolicitado: 0,
      detalleApoyo: '',
      notas: ''
    });

    this.ausentesEsperados.set(0);
    this.ausencias.clear();
    this.agentes.set([]);
    this.controladores.set([]);
  }

  private today(): string {
    const date = new Date();
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
  }

  private errorMessage(err: unknown): string {
    const error = err as {
      error?: { message?: string; error?: string } | string;
      message?: string;
    };

    if (typeof error?.error === 'string') return error.error;

    return error?.error?.message
      ?? error?.error?.error
      ?? error?.message
      ?? 'Ocurrió un error inesperado.';
  }
}
