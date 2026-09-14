import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, HostListener, OnInit, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';

import { environment } from '../../../../../environments/environment';
import { AsistenciaApiService } from '../../services/asistencia-api.service';
import { AsistenciaProgramacionService } from '../../services/asistencia-programacion.service';
import { AsistenciaRequest, AsistenciaResponse, MotivoAusencia, Plaza, Trabajador, Turno } from '../../models/asistencia.models';
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
  private readonly programacion = inject(AsistenciaProgramacionService);
  private readonly http = inject(HttpClient);

  readonly loadingCatalogos = signal(true);
  readonly loadingPersonal = signal(false);
  readonly loadingProgramados = signal(false);
  readonly saving = signal(false);
  readonly success = signal('');
  readonly error = signal('');
  readonly excepcionControlador = signal(false);

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
  readonly evidenciaPegadoActiva = signal<EvidenciaTipo | null>(null);
  readonly confirmRegistroVisible = signal(false);
  readonly successModalVisible = signal(false);
  readonly ultimoRegistroId = signal<number | null>(null);
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

  get ausencias(): FormArray { return this.form.controls.ausencias; }

  ngOnInit(): void {
    this.cargarCatalogos();
    this.form.controls.plazaId.valueChanges.subscribe(plazaId => this.onPlazaChange(plazaId));
    this.form.controls.turnoId.valueChanges.subscribe(() => this.syncTurno());
    this.form.controls.programados.valueChanges.subscribe(() => this.syncProgramados());
    this.form.controls.presentes.valueChanges.subscribe(() => this.syncAusencias());
  }

  @HostListener('document:paste', ['$event'])
  onDocumentPaste(event: ClipboardEvent): void {
    const tipo = this.evidenciaPegadoActiva();
    if (!tipo || this.cropperVisible() || this.confirmRegistroVisible() || this.successModalVisible()) return;
    this.procesarPegado(tipo, event);
  }

  activarPegado(tipo: EvidenciaTipo): void { this.evidenciaPegadoActiva.set(tipo); this.error.set(''); }

  private cargarCatalogos(): void {
    this.loadingCatalogos.set(true);
    this.api.getCatalogos().subscribe({
      next: data => {
        this.plazas.set((data.plazas ?? []).filter(p => p.activo));
        this.turnos.set(data.turnos ?? []);
        this.motivos.set(data.motivos ?? []);
        this.loadingCatalogos.set(false);
      },
      error: err => { this.error.set(this.errorMessage(err)); this.loadingCatalogos.set(false); }
    });
  }

  private onPlazaChange(plazaId: number | null): void {
    this.form.controls.controladorId.setValue(null, { emitEvent: false });
    this.resetAusenciasTrabajadores();
    this.controladores.set([]);
    this.agentes.set([]);
    this.syncTurno();
    if (!plazaId) { this.loadingPersonal.set(false); return; }
    this.cargarPersonalPlaza(Number(plazaId));
  }

  cambiarExcepcionControlador(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.excepcionControlador.set(checked);
    this.form.controls.controladorId.setValue(null, { emitEvent: false });
    const plazaId = Number(this.form.controls.plazaId.value ?? 0);
    if (!plazaId) return;
    if (!checked) { this.cargarPersonalPlaza(plazaId); return; }

    this.loadingPersonal.set(true);
    this.error.set('');
    forkJoin({
      agentes: this.api.getAgentesPorPlaza(plazaId),
      trabajadores: this.api.getTrabajadores()
    }).subscribe({
      next: ({ agentes, trabajadores }) => {
        this.agentes.set(agentes ?? []);
        this.controladores.set((trabajadores ?? []).filter(t => ['Controlador', 'Controlador ATF'].includes(t.puesto?.nombre ?? '')));
        this.loadingPersonal.set(false);
      },
      error: err => {
        this.loadingPersonal.set(false);
        this.error.set(`No se pudo cargar la excepción de controladores. ${this.errorMessage(err)}`);
      }
    });
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
        this.agentes.set([]); this.controladores.set([]); this.loadingPersonal.set(false);
        this.error.set(`No se pudo cargar el personal de la plaza. ${this.errorMessage(err)}`);
      }
    });
  }

  agentesFiltrados(): Trabajador[] { return this.agentes(); }

  onEvidenceFile(tipo: EvidenciaTipo, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.activarPegado(tipo); this.abrirEditorImagen(tipo, file); input.value = '';
  }

  private procesarPegado(tipo: EvidenciaTipo, event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items) { this.error.set('No se pudo acceder al portapapeles.'); return; }
    const imageItem = Array.from(items).find(item => item.type.startsWith('image/'));
    if (!imageItem) return;
    const clipboardFile = imageItem.getAsFile();
    if (!clipboardFile) { this.error.set('No se pudo leer la imagen copiada.'); return; }
    event.preventDefault();
    const file = new File([clipboardFile], `DSS_${tipo}_${Date.now()}.${this.extensionFromMime(clipboardFile.type)}`, { type: clipboardFile.type || 'image/png', lastModified: Date.now() });
    this.abrirEditorImagen(tipo, file);
  }

  private abrirEditorImagen(tipo: EvidenciaTipo, file: File): void {
    const tiposPermitidos = ['image/jpeg', 'image/png', 'image/webp'];
    if (!tiposPermitidos.includes(file.type)) { this.error.set('Solo se permiten imágenes JPG, PNG o WEBP.'); return; }
    if (file.size > 10 * 1024 * 1024) { this.error.set('Cada fotografía debe pesar como máximo 10 MB.'); return; }
    this.error.set(''); this.evidenciaPegadoActiva.set(tipo); this.cropperTipo.set(tipo); this.cropperFile.set(file); this.cropperVisible.set(true);
  }

  onCropperConfirm(file: File): void { const tipo = this.cropperTipo(); if (!tipo) return; this.setEvidenceFile(tipo, file); this.cerrarCropper(); }
  onCropperCancel(): void { this.cerrarCropper(); }
  private cerrarCropper(): void { this.cropperVisible.set(false); this.cropperFile.set(null); this.cropperTipo.set(null); }
  private setEvidenceFile(tipo: EvidenciaTipo, file: File): void {
    switch (tipo) { case 'CALENTAMIENTO': this.evidenciaCalentamiento.set(file); break; case 'INICIO_TURNO': this.evidenciaInicioTurno.set(file); break; case 'TAPONES_AUDITIVOS': this.evidenciaTapones.set(file); break; }
  }
  private extensionFromMime(mime: string): string { switch (mime) { case 'image/jpeg': return 'jpg'; case 'image/webp': return 'webp'; case 'image/png': default: return 'png'; } }
  removeEvidence(tipo: EvidenciaTipo): void { switch (tipo) { case 'CALENTAMIENTO': this.evidenciaCalentamiento.set(null); break; case 'INICIO_TURNO': this.evidenciaInicioTurno.set(null); break; case 'TAPONES_AUDITIVOS': this.evidenciaTapones.set(null); break; } }
  fileUrl(file: File): string { return URL.createObjectURL(file); }

  submit(): void { this.success.set(''); this.error.set(''); this.form.markAllAsTouched(); if (!this.validarRegistro()) return; this.confirmRegistroVisible.set(true); }
  cancelarConfirmacionRegistro(): void { this.confirmRegistroVisible.set(false); }
  confirmarRegistro(): void { this.confirmRegistroVisible.set(false); this.ejecutarRegistro(); }
  cerrarSuccessModal(): void { this.successModalVisible.set(false); }

  private validarRegistro(): boolean {
    if (this.loadingProgramados()) { this.error.set('Espera a que se cargue la programación de la plaza y turno.'); return false; }
    if (this.form.invalid) { this.error.set('Completa los campos obligatorios antes de registrar la asistencia.'); return false; }
    const programados = Number(this.form.controls.programados.value ?? 0);
    const presentes = Number(this.form.controls.presentes.value ?? 0);
    if (presentes > programados) { this.error.set('El personal presente no puede ser mayor al personal programado.'); return false; }
    const expected = this.ausentesEsperados();
    if (this.ausencias.length !== expected) { this.error.set(`Debes registrar exactamente ${expected} ausencia(s).`); return false; }
    if (this.ausencias.invalid) { this.error.set('Completa el trabajador y motivo de todas las ausencias.'); return false; }
    const absentIds = this.ausencias.controls.map(control => Number(control.get('trabajadorId')?.value));
    if (new Set(absentIds).size !== absentIds.length) { this.error.set('No puedes seleccionar al mismo trabajador ausente más de una vez.'); return false; }
    if (!this.evidenciaCalentamiento() || !this.evidenciaInicioTurno() || !this.evidenciaTapones()) {
      this.error.set('Debes registrar las tres evidencias fotográficas: calentamiento, inicio de turno e inspección de tapones auditivos.'); return false;
    }
    return true;
  }

  private ejecutarRegistro(): void {
    const calentamiento = this.evidenciaCalentamiento(), inicioTurno = this.evidenciaInicioTurno(), tapones = this.evidenciaTapones();
    if (!calentamiento || !inicioTurno || !tapones) return;
    const raw = this.form.getRawValue();
    const ausencias = raw.ausencias as AusenciaFormValue[];
    this.saving.set(true);

    const payload: AsistenciaRequest = {
      plazaId: Number(raw.plazaId), turnoId: Number(raw.turnoId), controladorId: Number(raw.controladorId), fecha: String(raw.fecha),
      programados: Number(raw.programados), presentes: Number(raw.presentes), apoyoSolicitado: Number(raw.apoyoSolicitado ?? 0),
      detalleApoyo: Number(raw.apoyoSolicitado ?? 0) > 0 ? raw.detalleApoyo?.trim() || null : null,
      notas: raw.notas?.trim() || null,
      ausencias: ausencias.map(a => ({ trabajadorId: Number(a.trabajadorId), motivoId: Number(a.motivoId), observacion: a.observacion?.trim() || null })),
      evidencias: []
    };

    const registro$ = this.excepcionControlador()
      ? this.http.post<AsistenciaResponse>(`${environment.apiUrl}/asistencias?excepcionControlador=true`, payload)
      : this.api.registrarAsistencia(payload);

    registro$.subscribe({
      next: created => {
        const uploads = [
          this.api.subirEvidencia(created.id, calentamiento, 'CALENTAMIENTO'),
          this.api.subirEvidencia(created.id, inicioTurno, 'INICIO_TURNO'),
          this.api.subirEvidencia(created.id, tapones, 'TAPONES_AUDITIVOS')
        ];
        forkJoin(uploads).subscribe({
          next: () => this.finishSuccess(created.id),
          error: err => { this.saving.set(false); this.error.set(`La asistencia #${created.id} se registró, pero una de las evidencias no pudo subirse. ${this.errorMessage(err)}`); }
        });
      },
      error: err => { this.saving.set(false); this.error.set(this.errorMessage(err)); }
    });
  }

  private syncTurno(): void {
    const plazaId = Number(this.form.controls.plazaId.value ?? 0);
    const turnoId = Number(this.form.controls.turnoId.value ?? 0);

    if (!plazaId || !turnoId) {
      this.form.controls.programados.setValue(0, { emitEvent: false });
      this.form.controls.presentes.setValue(0, { emitEvent: false });
      this.actualizarValidadorPresentes();
      this.syncAusencias();
      return;
    }

    this.loadingProgramados.set(true);
    this.programacion.obtener(plazaId, turnoId).subscribe({
      next: ({ programados }) => {
        this.form.controls.programados.setValue(programados, { emitEvent: false });
        this.form.controls.presentes.setValue(programados, { emitEvent: false });
        this.actualizarValidadorPresentes();
        this.syncAusencias();
        this.loadingProgramados.set(false);
      },
      error: err => {
        this.form.controls.programados.setValue(0, { emitEvent: false });
        this.form.controls.presentes.setValue(0, { emitEvent: false });
        this.actualizarValidadorPresentes();
        this.syncAusencias();
        this.loadingProgramados.set(false);
        this.error.set(`No se pudo cargar la cantidad programada. ${this.errorMessage(err)}`);
      }
    });
  }

  private syncProgramados(): void {
    const programados = Number(this.form.controls.programados.value ?? 0);
    let presentes = Number(this.form.controls.presentes.value ?? 0);
    if (programados >= 0 && presentes > programados) { presentes = programados; this.form.controls.presentes.setValue(presentes, { emitEvent: false }); }
    this.actualizarValidadorPresentes(); this.syncAusencias();
  }

  private actualizarValidadorPresentes(): void {
    const programados = Number(this.form.controls.programados.value ?? 0);
    this.form.controls.presentes.setValidators([Validators.required, Validators.min(0), Validators.max(Math.max(0, programados))]);
    this.form.controls.presentes.updateValueAndValidity({ emitEvent: false });
  }

  private syncAusencias(): void {
    const programados = Number(this.form.controls.programados.value ?? 0), presentes = Number(this.form.controls.presentes.value ?? 0);
    const expected = Math.max(0, programados - presentes);
    this.ausentesEsperados.set(expected);
    while (this.ausencias.length < expected) this.ausencias.push(this.fb.group({ trabajadorId: [null as number | null, Validators.required], motivoId: [null as number | null, Validators.required], observacion: [''] }));
    while (this.ausencias.length > expected) this.ausencias.removeAt(this.ausencias.length - 1);
  }

  private resetAusenciasTrabajadores(): void { for (const group of this.ausencias.controls) group.get('trabajadorId')?.setValue(null); }

  private finishSuccess(id: number): void {
    this.saving.set(false); this.ultimoRegistroId.set(id); this.success.set(`Asistencia #${id} registrada correctamente con sus tres evidencias.`); this.successModalVisible.set(true); this.evidenciaPegadoActiva.set(null);
    this.evidenciaCalentamiento.set(null); this.evidenciaInicioTurno.set(null); this.evidenciaTapones.set(null); this.excepcionControlador.set(false);
    this.form.reset({ plazaId: null, turnoId: null, controladorId: null, fecha: this.today(), programados: 0, presentes: 0, apoyoSolicitado: 0, detalleApoyo: '', notas: '' });
    this.ausentesEsperados.set(0); this.ausencias.clear(); this.agentes.set([]); this.controladores.set([]);
  }

  private today(): string { const date = new Date(); const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10); }
  private errorMessage(err: unknown): string {
    const error = err as { error?: { message?: string; error?: string } | string; message?: string };
    if (typeof error?.error === 'string') return error.error;
    return error?.error?.message ?? error?.error?.error ?? error?.message ?? 'Ocurrió un error inesperado.';
  }
}
