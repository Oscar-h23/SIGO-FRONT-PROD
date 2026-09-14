import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import {
  AsistenciaResponse,
  AsistenciaUpdateRequest,
  AusenciaRequest,
  EvidenciaResponse,
  MotivoAusencia,
  Plaza,
  Trabajador,
  Turno
} from '../../models/asistencia.models';
import { AsistenciaApiService } from '../../services/asistencia-api.service';
import { AsistenciaProgramacionService } from '../../services/asistencia-programacion.service';
import { ImageCropperModalComponent } from '../../shared/image-cropper-modal.component';

type EvidenciaTipo = 'CALENTAMIENTO' | 'INICIO_TURNO' | 'TAPONES_AUDITIVOS';

interface ArchivoEvidenciaNuevo {
  archivo: File;
  tipo: EvidenciaTipo;
}

@Component({
  selector: 'app-asistencia-edit',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ImageCropperModalComponent],
  templateUrl: './asistencia-edit.component.html',
  styleUrl: './asistencia-edit.component.css'
})
export class AsistenciaEditComponent implements OnInit {
  private readonly api = inject(AsistenciaApiService);
  private readonly programacion = inject(AsistenciaProgramacionService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly loadingCatalogos = signal(false);
  readonly loadingPersonal = signal(false);
  readonly loadingProgramados = signal(false);
  readonly saving = signal(false);
  readonly uploading = signal(false);
  readonly error = signal('');
  readonly success = signal('');

  readonly plazas = signal<Plaza[]>([]);
  readonly turnos = signal<Turno[]>([]);
  readonly motivos = signal<MotivoAusencia[]>([]);
  readonly agentes = signal<Trabajador[]>([]);
  readonly controladores = signal<Trabajador[]>([]);
  readonly evidencias = signal<EvidenciaResponse[]>([]);

  asistenciaId: number | null = null;
  plazaId: number | null = null;
  turnoId: number | null = null;
  controladorId: number | null = null;
  fecha = '';
  programados = 0;
  presentes = 0;
  apoyoSolicitado = 0;
  detalleApoyo = '';
  notas = '';
  ausencias: AusenciaRequest[] = [];
  archivosNuevos: ArchivoEvidenciaNuevo[] = [];

  readonly cropperVisible = signal(false);
  readonly cropperFile = signal<File | null>(null);
  readonly cropperTipo = signal<EvidenciaTipo | null>(null);
  readonly evidenciaPegadoActiva = signal<EvidenciaTipo | null>(null);
  readonly confirmGuardarVisible = signal(false);
  readonly successModalVisible = signal(false);
  readonly evidenciaEliminarPendiente = signal<EvidenciaResponse | null>(null);

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id || Number.isNaN(id)) {
      this.error.set('El identificador de la asistencia no es válido.');
      return;
    }
    this.asistenciaId = id;
    this.cargarDatos(id);
  }

  @HostListener('document:paste', ['$event'])
  onDocumentPaste(event: ClipboardEvent): void {
    const tipo = this.evidenciaPegadoActiva();
    if (!tipo || this.cropperVisible() || this.confirmGuardarVisible() || this.successModalVisible()) return;
    this.procesarPegado(tipo, event);
  }

  activarPegado(tipo: EvidenciaTipo): void {
    this.evidenciaPegadoActiva.set(tipo);
    this.error.set('');
  }

  cargarDatos(id: number): void {
    this.loading.set(true);
    this.loadingCatalogos.set(true);
    this.error.set('');

    forkJoin({
      asistencia: this.api.obtenerAsistencia(id),
      plazas: this.api.getPlazas(),
      turnos: this.api.getTurnos(),
      motivos: this.api.getMotivos()
    }).subscribe({
      next: ({ asistencia, plazas, turnos, motivos }) => {
        this.plazas.set(plazas.filter(plaza => plaza.activo));
        this.turnos.set(turnos);
        this.motivos.set(motivos);
        this.cargarAsistencia(asistencia);
        this.loading.set(false);
        this.loadingCatalogos.set(false);
      },
      error: err => {
        this.error.set(this.errorMessage(err));
        this.loading.set(false);
        this.loadingCatalogos.set(false);
      }
    });
  }

  private cargarAsistencia(asistencia: AsistenciaResponse): void {
    this.plazaId = asistencia.plazaId;
    this.turnoId = asistencia.turnoId;
    this.controladorId = asistencia.controladorId;
    this.fecha = asistencia.fecha;
    this.programados = asistencia.programados;
    this.presentes = asistencia.presentes;
    this.apoyoSolicitado = asistencia.apoyoSolicitado ?? 0;
    this.detalleApoyo = asistencia.detalleApoyo ?? '';
    this.notas = asistencia.notas ?? '';
    this.ausencias = asistencia.ausencias.map(ausencia => ({
      trabajadorId: ausencia.trabajadorId,
      motivoId: ausencia.motivoId,
      observacion: ausencia.observacion
    }));
    this.evidencias.set(asistencia.evidencias);

    if (this.plazaId) this.cargarPersonalPorPlaza(this.plazaId, false);
  }

  cambiarPlaza(): void {
    this.error.set('');
    this.success.set('');

    if (!this.plazaId) {
      this.agentes.set([]);
      this.controladores.set([]);
      this.controladorId = null;
      this.ausencias = [];
      this.programados = 0;
      this.presentes = 0;
      return;
    }

    this.controladorId = null;
    this.ausencias = [];
    this.cargarPersonalPorPlaza(this.plazaId, true);
    this.cargarProgramados();
  }

  private cargarPersonalPorPlaza(plazaId: number, limpiarSeleccion: boolean): void {
    this.loadingPersonal.set(true);

    forkJoin({
      agentes: this.api.getAgentesPorPlaza(plazaId),
      controladores: this.api.getControladoresPorPlaza(plazaId)
    }).subscribe({
      next: ({ agentes, controladores }) => {
        this.agentes.set(agentes);
        this.controladores.set(controladores);
        if (limpiarSeleccion) {
          this.controladorId = null;
          this.ausencias = [];
        }
        this.loadingPersonal.set(false);
      },
      error: err => {
        this.error.set(this.errorMessage(err));
        this.loadingPersonal.set(false);
      }
    });
  }

  cambiarTurno(): void {
    this.cargarProgramados();
  }

  private cargarProgramados(): void {
    if (!this.plazaId || !this.turnoId) {
      this.programados = 0;
      this.presentes = 0;
      this.ajustarCantidadAusencias();
      return;
    }

    this.loadingProgramados.set(true);
    this.programacion.obtener(this.plazaId, this.turnoId).subscribe({
      next: ({ programados }) => {
        this.programados = programados;
        if (this.presentes > programados) this.presentes = programados;
        this.ajustarCantidadAusencias();
        this.loadingProgramados.set(false);
      },
      error: err => {
        this.loadingProgramados.set(false);
        this.error.set('No se pudo cargar la cantidad programada. ' + this.errorMessage(err));
      }
    });
  }

  cambiarPresentes(): void {
    if (this.presentes < 0) this.presentes = 0;
    if (this.presentes > this.programados) this.presentes = this.programados;
    this.ajustarCantidadAusencias();
  }

  get cantidadAusentes(): number {
    return Math.max(this.programados - this.presentes, 0);
  }

  private ajustarCantidadAusencias(): void {
    while (this.ausencias.length < this.cantidadAusentes) {
      this.ausencias.push({ trabajadorId: 0, motivoId: 0, observacion: null });
    }
    while (this.ausencias.length > this.cantidadAusentes) this.ausencias.pop();
  }

  agentesDisponibles(indiceActual: number): Trabajador[] {
    const seleccionados = this.ausencias
      .map((ausencia, indice) => indice === indiceActual ? null : ausencia.trabajadorId)
      .filter(id => id !== null && id !== 0);
    return this.agentes().filter(trabajador => !seleccionados.includes(trabajador.id));
  }

  seleccionarArchivos(tipo: EvidenciaTipo, event: Event): void {
    const input = event.target as HTMLInputElement;
    const archivo = input.files?.[0];
    if (!archivo) return;
    input.value = '';
    this.activarPegado(tipo);
    this.abrirEditorImagen(tipo, archivo);
  }

  private procesarPegado(tipo: EvidenciaTipo, event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items) {
      this.error.set('No se pudo acceder al portapapeles.');
      return;
    }
    const imageItem = Array.from(items).find(item => item.type.startsWith('image/'));
    if (!imageItem) return;
    const clipboardFile = imageItem.getAsFile();
    if (!clipboardFile) {
      this.error.set('No se pudo leer la imagen copiada.');
      return;
    }
    event.preventDefault();
    const extension = this.extensionFromMime(clipboardFile.type);
    const archivo = new File(
      [clipboardFile],
      `DSS_${tipo}_${Date.now()}.${extension}`,
      { type: clipboardFile.type || 'image/png', lastModified: Date.now() }
    );
    this.abrirEditorImagen(tipo, archivo);
  }

  private abrirEditorImagen(tipo: EvidenciaTipo, archivo: File): void {
    const tiposPermitidos = ['image/jpeg', 'image/png', 'image/webp'];
    if (!tiposPermitidos.includes(archivo.type)) {
      this.error.set('Solo se permiten imágenes JPG, PNG o WEBP.');
      return;
    }
    if (archivo.size > 10 * 1024 * 1024) {
      this.error.set('Cada fotografía debe pesar como máximo 10 MB.');
      return;
    }
    this.error.set('');
    this.evidenciaPegadoActiva.set(tipo);
    this.cropperTipo.set(tipo);
    this.cropperFile.set(archivo);
    this.cropperVisible.set(true);
  }

  onCropperConfirm(archivo: File): void {
    const tipo = this.cropperTipo();
    if (!tipo) return;
    this.archivosNuevos = [
      ...this.archivosNuevos.filter(item => item.tipo !== tipo),
      { archivo, tipo }
    ];
    this.cerrarCropper();
  }

  onCropperCancel(): void { this.cerrarCropper(); }

  private cerrarCropper(): void {
    this.cropperVisible.set(false);
    this.cropperFile.set(null);
    this.cropperTipo.set(null);
  }

  archivoNuevoPorTipo(tipo: EvidenciaTipo): ArchivoEvidenciaNuevo | undefined {
    return this.archivosNuevos.find(item => item.tipo === tipo);
  }

  evidenciaExistentePorTipo(tipo: EvidenciaTipo): EvidenciaResponse | undefined {
    return this.evidencias().find(item => item.tipo === tipo);
  }

  quitarArchivoNuevoPorTipo(tipo: EvidenciaTipo): void {
    this.archivosNuevos = this.archivosNuevos.filter(item => item.tipo !== tipo);
  }

  nombreTipoEvidencia(tipo: string): string {
    switch (tipo) {
      case 'CALENTAMIENTO': return 'Calentamiento';
      case 'INICIO_TURNO': return 'Inicio de turno';
      case 'TAPONES_AUDITIVOS': return 'Tapones auditivos';
      default: return tipo || 'Evidencia';
    }
  }

  solicitarEliminarEvidencia(evidencia: EvidenciaResponse): void {
    this.evidenciaEliminarPendiente.set(evidencia);
  }

  cancelarEliminarEvidencia(): void {
    this.evidenciaEliminarPendiente.set(null);
  }

  confirmarEliminarEvidencia(): void {
    const evidencia = this.evidenciaEliminarPendiente();
    if (!this.asistenciaId || !evidencia) return;
    this.evidenciaEliminarPendiente.set(null);
    this.error.set('');
    this.success.set('');
    this.api.eliminarEvidencia(this.asistenciaId, evidencia.id).subscribe({
      next: () => {
        this.evidencias.update(items => items.filter(item => item.id !== evidencia.id));
        this.success.set(`${this.nombreTipoEvidencia(evidencia.tipo)} eliminada correctamente.`);
      },
      error: err => this.error.set(this.errorMessage(err))
    });
  }

  private validarFormulario(): boolean {
    if (this.loadingProgramados()) return this.fail('Espera a que se cargue la programación de la plaza y turno.');
    if (!this.plazaId) return this.fail('Debe seleccionar una plaza.');
    if (!this.turnoId) return this.fail('Debe seleccionar un turno.');
    if (!this.controladorId) return this.fail('Debe seleccionar un controlador.');
    if (!this.fecha) return this.fail('Debe ingresar la fecha.');
    if (this.programados < 0) return this.fail('La cantidad de programados no puede ser negativa.');
    if (this.presentes < 0 || this.presentes > this.programados) return this.fail('La cantidad de presentes no es válida.');
    if (this.apoyoSolicitado < 0 || !Number.isInteger(Number(this.apoyoSolicitado))) return this.fail('El apoyo solicitado debe ser un número entero mayor o igual a 0.');
    if (this.detalleApoyo && this.detalleApoyo.trim().length > 500) return this.fail('El detalle del apoyo no puede superar los 500 caracteres.');
    if (this.ausencias.length !== this.cantidadAusentes) return this.fail(`Debe registrar exactamente ${this.cantidadAusentes} ausencia(s).`);

    const trabajadores = this.ausencias.map(a => a.trabajadorId);
    if (trabajadores.some(id => !id)) return this.fail('Debe seleccionar al trabajador de cada ausencia.');
    if (new Set(trabajadores).size !== trabajadores.length) return this.fail('No puede registrar al mismo trabajador ausente más de una vez.');

    const motivos = this.ausencias.map(a => a.motivoId);
    if (motivos.some(id => !id)) return this.fail('Debe seleccionar el motivo de cada ausencia.');
    return true;
  }

  guardar(): void {
    if (!this.asistenciaId || !this.validarFormulario()) return;
    this.confirmGuardarVisible.set(true);
  }

  cancelarConfirmacionGuardar(): void { this.confirmGuardarVisible.set(false); }
  confirmarGuardar(): void { this.confirmGuardarVisible.set(false); this.ejecutarGuardado(); }
  cerrarSuccessModal(): void { this.successModalVisible.set(false); }

  private ejecutarGuardado(): void {
    if (!this.asistenciaId) return;
    this.saving.set(true);
    this.error.set('');
    this.success.set('');

    const request: AsistenciaUpdateRequest = {
      plazaId: this.plazaId!,
      turnoId: this.turnoId!,
      controladorId: this.controladorId!,
      fecha: this.fecha,
      programados: this.programados,
      presentes: this.presentes,
      apoyoSolicitado: Number(this.apoyoSolicitado ?? 0),
      detalleApoyo: Number(this.apoyoSolicitado ?? 0) > 0 ? this.detalleApoyo?.trim() || null : null,
      notas: this.notas?.trim() || null,
      ausencias: this.ausencias.map(ausencia => ({
        trabajadorId: Number(ausencia.trabajadorId),
        motivoId: Number(ausencia.motivoId),
        observacion: ausencia.observacion?.trim() || null
      }))
    };

    this.api.actualizarAsistencia(this.asistenciaId, request).subscribe({
      next: () => this.archivosNuevos.length ? this.reemplazarEvidencias() : this.finalizarGuardado(),
      error: err => {
        this.error.set(this.errorMessage(err));
        this.saving.set(false);
      }
    });
  }

  private reemplazarEvidencias(): void {
    if (!this.asistenciaId || !this.archivosNuevos.length) {
      this.finalizarGuardado();
      return;
    }

    this.uploading.set(true);
    const pendientes = [...this.archivosNuevos];
    const operaciones = pendientes.map(item => {
      const anteriores = this.evidencias().filter(evidencia => evidencia.tipo === item.tipo);
      return this.api.subirEvidencia(this.asistenciaId!, item.archivo, item.tipo).pipe(
        switchMap(nueva => {
          if (!anteriores.length) return of(nueva);
          return forkJoin(
            anteriores.map(anterior => this.api.eliminarEvidencia(this.asistenciaId!, anterior.id))
          ).pipe(map(() => nueva));
        })
      );
    });

    forkJoin(operaciones).subscribe({
      next: nuevas => {
        const tiposReemplazados = new Set(pendientes.map(item => item.tipo));
        this.evidencias.update(actuales => [
          ...actuales.filter(item => !tiposReemplazados.has(item.tipo as EvidenciaTipo)),
          ...nuevas
        ]);
        this.archivosNuevos = [];
        this.uploading.set(false);
        this.evidenciaPegadoActiva.set(null);
        this.finalizarGuardado();
      },
      error: err => {
        this.error.set('Los datos fueron actualizados, pero ocurrió un error al reemplazar una o más fotografías. ' + this.errorMessage(err));
        this.uploading.set(false);
        this.saving.set(false);
      }
    });
  }

  private finalizarGuardado(): void {
    this.saving.set(false);
    this.success.set('Asistencia actualizada correctamente.');
    this.successModalVisible.set(true);
  }

  volver(): void { this.router.navigate(['/asistencia/historial']); }

  private extensionFromMime(mime: string): string {
    switch (mime) {
      case 'image/jpeg': return 'jpg';
      case 'image/webp': return 'webp';
      case 'image/png':
      default: return 'png';
    }
  }

  private fail(message: string): false {
    this.error.set(message);
    return false;
  }

  private errorMessage(err: unknown): string {
    const e = err as { error?: { message?: string } | string };
    if (typeof e?.error === 'string') return e.error;
    return e?.error?.message ?? 'Ocurrió un error al procesar la solicitud.';
  }
}
