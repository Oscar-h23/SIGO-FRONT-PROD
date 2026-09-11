import {
  Component,
  OnInit,
  inject,
  signal
} from '@angular/core';

import {
  CommonModule
} from '@angular/common';

import {
  FormArray,
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';

import {
  forkJoin
} from 'rxjs';

import {
  AsistenciaApiService
} from '../../services/asistencia-api.service';

import {
  MotivoAusencia,
  Plaza,
  Trabajador,
  Turno
} from '../../models/asistencia.models';


/* =========================================================
 * TIPOS
 * ========================================================= */

interface AusenciaFormValue {
  trabajadorId: number | null;
  motivoId: number | null;
  observacion: string | null;
}

type EvidenciaTipo =
  | 'CALENTAMIENTO'
  | 'INICIO_TURNO'
  | 'TAPONES_AUDITIVOS';


@Component({
  selector: 'app-asistencia-form',

  standalone: true,

  imports: [
    CommonModule,
    ReactiveFormsModule
  ],

  templateUrl:
    './asistencia-form.component.html',

  styleUrl:
    './asistencia-form.component.css'
})
export class AsistenciaFormComponent
implements OnInit {

  /* =======================================================
   * SERVICIOS
   * ======================================================= */

  private readonly fb =
    inject(FormBuilder);

  private readonly api =
    inject(AsistenciaApiService);


  /* =======================================================
   * ESTADOS
   * ======================================================= */

  readonly loadingCatalogos =
    signal(true);

  readonly loadingPersonal =
    signal(false);

  readonly saving =
    signal(false);

  readonly success =
    signal('');

  readonly error =
    signal('');


  /* =======================================================
   * CATÁLOGOS
   * ======================================================= */

  readonly plazas =
    signal<Plaza[]>([]);

  readonly turnos =
    signal<Turno[]>([]);

  readonly motivos =
    signal<MotivoAusencia[]>([]);

  readonly controladores =
    signal<Trabajador[]>([]);

  readonly agentes =
    signal<Trabajador[]>([]);


  /* =======================================================
   * EVIDENCIAS
   * ======================================================= */

  readonly evidenciaCalentamiento =
    signal<File | null>(null);

  readonly evidenciaInicioTurno =
    signal<File | null>(null);

  readonly evidenciaTapones =
    signal<File | null>(null);


  /* =======================================================
   * AUSENCIAS
   * ======================================================= */

  readonly ausentesEsperados =
    signal(0);


  /* =======================================================
   * FORMULARIO
   * ======================================================= */

  readonly form =
    this.fb.group({

      plazaId: [
        null as number | null,
        Validators.required
      ],

      turnoId: [
        null as number | null,
        Validators.required
      ],

      controladorId: [
        null as number | null,
        Validators.required
      ],

      fecha: [
        this.today(),
        Validators.required
      ],

      programados: [
        0,
        [
          Validators.required,
          Validators.min(1)
        ]
      ],

      presentes: [
        0,
        [
          Validators.required,
          Validators.min(0)
        ]
      ],

      /*
       * Personal adicional solicitado para apoyar el turno.
       * No interviene en el cálculo de asistencia.
       */
      apoyoSolicitado: [
        0,
        [
          Validators.required,
          Validators.min(0)
        ]
      ],

      /*
       * Descripción opcional del apoyo solicitado.
       */
      detalleApoyo: [''],

      notas: [''],

      ausencias:
        this.fb.array([])
    });


  /* =======================================================
   * GETTERS
   * ======================================================= */

  get ausencias(): FormArray {

    return this.form
      .controls
      .ausencias;
  }


  /* =======================================================
   * INIT
   * ======================================================= */

  ngOnInit(): void {

    this.cargarCatalogos();

    /*
     * Cuando cambia la plaza:
     *
     * - limpia controlador
     * - limpia trabajadores ausentes
     * - carga personal de la nueva plaza
     */

    this.form
      .controls
      .plazaId
      .valueChanges
      .subscribe(
        plazaId => {

          this.onPlazaChange(
            plazaId
          );
        }
      );


    /*
     * Cuando cambia el turno:
     *
     * - carga automáticamente
     *   personal programado
     */

    this.form
      .controls
      .turnoId
      .valueChanges
      .subscribe(
        () => {

          this.syncTurno();
        }
      );


    /*
     * Cuando cambia programados:
     *
     * - corrige presentes
     * - recalcula ausencias
     */

    this.form
      .controls
      .programados
      .valueChanges
      .subscribe(
        () => {

          this.syncProgramados();
        }
      );


    /*
     * Cuando cambia presentes:
     *
     * - recalcula ausencias
     */

    this.form
      .controls
      .presentes
      .valueChanges
      .subscribe(
        () => {

          this.syncAusencias();
        }
      );
  }


  /* =======================================================
   * CATÁLOGOS
   * ======================================================= */

  private cargarCatalogos(): void {

    this.loadingCatalogos.set(
      true
    );

    this.api
      .getCatalogos()
      .subscribe({

        next: data => {

          this.plazas.set(
            data.plazas ?? []
          );

          this.turnos.set(
            data.turnos ?? []
          );

          this.motivos.set(
            data.motivos ?? []
          );

          this.loadingCatalogos.set(
            false
          );
        },

        error: err => {

          this.error.set(
            this.errorMessage(
              err
            )
          );

          this.loadingCatalogos.set(
            false
          );
        }
      });
  }


  /* =======================================================
   * CAMBIO DE PLAZA
   * ======================================================= */

  private onPlazaChange(
    plazaId: number | null
  ): void {

    /*
     * Limpiar controlador anterior.
     */

    this.form
      .controls
      .controladorId
      .setValue(
        null,
        {
          emitEvent: false
        }
      );


    /*
     * Limpiar selección de trabajadores
     * ausentes de plaza anterior.
     */

    this.resetAusenciasTrabajadores();


    /*
     * Limpiar listas.
     */

    this.controladores.set(
      []
    );

    this.agentes.set(
      []
    );


    if (!plazaId) {

      this.loadingPersonal.set(
        false
      );

      return;
    }


    this.cargarPersonalPlaza(
      Number(plazaId)
    );
  }


  /* =======================================================
   * PERSONAL POR PLAZA
   * ======================================================= */

  private cargarPersonalPlaza(
    plazaId: number
  ): void {

    this.loadingPersonal.set(
      true
    );

    this.error.set(
      ''
    );


    forkJoin({

      agentes:
        this.api
          .getAgentesPorPlaza(
            plazaId
          ),

      controladores:
        this.api
          .getControladoresPorPlaza(
            plazaId
          )

    }).subscribe({

      next: ({
        agentes,
        controladores
      }) => {

        this.agentes.set(
          agentes ?? []
        );

        this.controladores.set(
          controladores ?? []
        );

        this.loadingPersonal.set(
          false
        );

        console.log(
          `Personal cargado para plaza ${plazaId}:`,
          {
            agentes:
              agentes?.length ?? 0,

            controladores:
              controladores?.length ?? 0
          }
        );
      },

      error: err => {

        console.error(
          'Error cargando personal de la plaza:',
          err
        );

        this.agentes.set(
          []
        );

        this.controladores.set(
          []
        );

        this.loadingPersonal.set(
          false
        );

        this.error.set(
          `No se pudo cargar el personal de la plaza. ${
            this.errorMessage(err)
          }`
        );
      }
    });
  }


  /* =======================================================
   * AGENTES
   * ======================================================= */

  agentesFiltrados(): Trabajador[] {

    return this.agentes();
  }


  /* =======================================================
   * EVIDENCIAS
   * ======================================================= */

  onEvidenceFile(
    tipo: EvidenciaTipo,
    event: Event
  ): void {

    const input =
      event.target as HTMLInputElement;

    const file =
      input.files?.[0];

    if (!file) {
      return;
    }

    this.setEvidenceFile(
      tipo,
      file
    );

    /*
     * Permite volver a seleccionar
     * el mismo archivo.
     */
    input.value = '';
  }


  onEvidencePaste(
    tipo: EvidenciaTipo,
    event: ClipboardEvent
  ): void {

    const items =
      event.clipboardData?.items;

    if (!items) {

      this.error.set(
        'No se pudo acceder al portapapeles.'
      );

      return;
    }

    const imageItem =
      Array.from(items)
        .find(
          item =>
            item.type.startsWith(
              'image/'
            )
        );

    if (!imageItem) {

      this.error.set(
        'El portapapeles no contiene una imagen. Copia la imagen desde DSS e inténtalo nuevamente.'
      );

      return;
    }

    const clipboardFile =
      imageItem.getAsFile();

    if (!clipboardFile) {

      this.error.set(
        'No se pudo leer la imagen copiada desde DSS.'
      );

      return;
    }

    event.preventDefault();

    const extension =
      this.extensionFromMime(
        clipboardFile.type
      );

    const file =
      new File(
        [clipboardFile],
        `DSS_${tipo}_${Date.now()}.${extension}`,
        {
          type:
            clipboardFile.type ||
            'image/png',
          lastModified:
            Date.now()
        }
      );

    this.setEvidenceFile(
      tipo,
      file
    );
  }


  private setEvidenceFile(
    tipo: EvidenciaTipo,
    file: File
  ): void {

    const tiposPermitidos = [
      'image/jpeg',
      'image/png',
      'image/webp'
    ];

    if (
      !tiposPermitidos.includes(
        file.type
      )
    ) {

      this.error.set(
        'Solo se permiten imágenes JPG, PNG o WEBP.'
      );

      return;
    }

    const maxSize =
      10 *
      1024 *
      1024;

    if (
      file.size >
      maxSize
    ) {

      this.error.set(
        'Cada fotografía debe pesar como máximo 10 MB.'
      );

      return;
    }

    this.error.set(
      ''
    );

    switch (tipo) {

      case 'CALENTAMIENTO':

        this.evidenciaCalentamiento.set(
          file
        );

        break;


      case 'INICIO_TURNO':

        this.evidenciaInicioTurno.set(
          file
        );

        break;


      case 'TAPONES_AUDITIVOS':

        this.evidenciaTapones.set(
          file
        );

        break;
    }
  }


  private extensionFromMime(
    mime: string
  ): string {

    switch (mime) {

      case 'image/jpeg':
        return 'jpg';

      case 'image/webp':
        return 'webp';

      case 'image/png':
      default:
        return 'png';
    }
  }


  removeEvidence(
    tipo: EvidenciaTipo
  ): void {

    switch (tipo) {

      case 'CALENTAMIENTO':

        this.evidenciaCalentamiento.set(
          null
        );

        break;


      case 'INICIO_TURNO':

        this.evidenciaInicioTurno.set(
          null
        );

        break;


      case 'TAPONES_AUDITIVOS':

        this.evidenciaTapones.set(
          null
        );

        break;
    }
  }


  fileUrl(
    file: File
  ): string {

    return URL.createObjectURL(
      file
    );
  }


  /* =======================================================
   * SUBMIT
   * ======================================================= */

  submit(): void {

    this.success.set(
      ''
    );

    this.error.set(
      ''
    );


    /*
     * Marcar formulario.
     */

    this.form.markAllAsTouched();


    /*
     * Validar campos principales.
     */

    if (
      this.form.invalid
    ) {

      this.error.set(
        'Completa los campos obligatorios antes de registrar la asistencia.'
      );

      return;
    }


    const programados =
      Number(
        this.form
          .controls
          .programados
          .value ?? 0
      );


    const presentes =
      Number(
        this.form
          .controls
          .presentes
          .value ?? 0
      );


    /*
     * Presentes no puede superar
     * programados.
     */

    if (
      presentes >
      programados
    ) {

      this.error.set(
        'El personal presente no puede ser mayor al personal programado.'
      );

      return;
    }


    /*
     * Validar número exacto de ausencias.
     */

    const expected =
      this.ausentesEsperados();


    if (
      this.ausencias.length !==
      expected
    ) {

      this.error.set(
        `Debes registrar exactamente ${expected} ausencia(s).`
      );

      return;
    }


    /*
     * Validar que todos los formularios
     * de ausencia estén completos.
     */

    if (
      this.ausencias.invalid
    ) {

      this.error.set(
        'Completa el trabajador y motivo de todas las ausencias.'
      );

      return;
    }


    /*
     * Evitar trabajadores duplicados.
     */

    const absentIds =
      this.ausencias
        .controls
        .map(
          control =>
            Number(
              control
                .get(
                  'trabajadorId'
                )
                ?.value
            )
        );


    if (
      new Set(
        absentIds
      ).size !==
      absentIds.length
    ) {

      this.error.set(
        'No puedes seleccionar al mismo trabajador ausente más de una vez.'
      );

      return;
    }


    /*
     * =====================================================
     * VALIDAR LAS 3 EVIDENCIAS
     * =====================================================
     */

    const calentamiento =
      this.evidenciaCalentamiento();

    const inicioTurno =
      this.evidenciaInicioTurno();

    const tapones =
      this.evidenciaTapones();


    if (
      !calentamiento ||
      !inicioTurno ||
      !tapones
    ) {

      this.error.set(
        'Debes registrar las tres evidencias fotográficas: calentamiento, inicio de turno e inspección de tapones auditivos.'
      );

      return;
    }


    /*
     * Datos finales del formulario.
     */

    const raw =
      this.form
        .getRawValue();


    const ausencias =
      raw.ausencias as
        AusenciaFormValue[];


    /*
     * Empezar guardado.
     */

    this.saving.set(
      true
    );


    /*
     * Primero registrar asistencia.
     */

    this.api
      .registrarAsistencia({

        plazaId:
          Number(
            raw.plazaId
          ),

        turnoId:
          Number(
            raw.turnoId
          ),

        controladorId:
          Number(
            raw.controladorId
          ),

        fecha:
          String(
            raw.fecha
          ),

        programados:
          Number(
            raw.programados
          ),

        presentes:
          Number(
            raw.presentes
          ),

        /*
         * El apoyo solicitado es personal adicional.
         * No se suma a presentes ni modifica el porcentaje.
         */
        apoyoSolicitado:
          Number(
            raw.apoyoSolicitado ?? 0
          ),

        detalleApoyo:
          Number(raw.apoyoSolicitado ?? 0) > 0
            ? raw.detalleApoyo
                ?.trim() ||
              null
            : null,

        notas:
          raw.notas
            ?.trim() ||
          null,

        ausencias:
          ausencias.map(
            ausencia => ({

              trabajadorId:
                Number(
                  ausencia
                    .trabajadorId
                ),

              motivoId:
                Number(
                  ausencia
                    .motivoId
                ),

              observacion:
                ausencia
                  .observacion
                  ?.trim() ||
                null
            })
          ),

        /*
         * Primero creamos asistencia.
         * Las fotos se suben después.
         */

        evidencias: []

      })
      .subscribe({

        next: created => {

          /*
           * IMPORTANTE:
           *
           * Las imágenes se envían siempre
           * exactamente en este orden:
           *
           * 0 = CALENTAMIENTO
           * 1 = INICIO TURNO
           * 2 = TAPONES AUDITIVOS
           *
           * Esto mantiene el mismo orden que
           * actualmente usa el PDF.
           */

          const uploads = [

            this.api.subirEvidencia(
              created.id,
              calentamiento,
              'CALENTAMIENTO'
            ),

            this.api.subirEvidencia(
              created.id,
              inicioTurno,
              'INICIO_TURNO'
            ),

            this.api.subirEvidencia(
              created.id,
              tapones,
              'TAPONES_AUDITIVOS'
            )
            

          ];


          forkJoin(
            uploads
          )
          .subscribe({

            next: () => {

              this.finishSuccess(
                created.id
              );
            },

            error: err => {

              this.saving.set(
                false
              );

              this.error.set(
                `La asistencia #${created.id} se registró, pero una de las evidencias no pudo subirse. ${
                  this.errorMessage(err)
                }`
              );
            }
          });
        },

        error: err => {

          this.saving.set(
            false
          );

          this.error.set(
            this.errorMessage(
              err
            )
          );
        }
      });
  }


  /* =======================================================
   * SINCRONIZAR TURNO
   * ======================================================= */

  private syncTurno(): void {

    const turno =
      this.turnos()
        .find(
          item =>
            item.id ===
            Number(
              this.form
                .controls
                .turnoId
                .value
            )
        );


    const total =
      turno
        ?.personalProgramado ??
      0;


    /*
     * Personal programado
     * según turno.
     */

    this.form
      .controls
      .programados
      .setValue(
        total,
        {
          emitEvent: false
        }
      );


    /*
     * Por defecto:
     * todos presentes.
     */

    this.form
      .controls
      .presentes
      .setValue(
        total,
        {
          emitEvent: false
        }
      );


    this.actualizarValidadorPresentes();

    this.syncAusencias();
  }


  /* =======================================================
   * SINCRONIZAR PROGRAMADOS
   * ======================================================= */

  private syncProgramados(): void {

    const programados =
      Number(
        this.form
          .controls
          .programados
          .value ?? 0
      );


    let presentes =
      Number(
        this.form
          .controls
          .presentes
          .value ?? 0
      );


    /*
     * Si presentes supera programados,
     * corregir automáticamente.
     */

    if (
      programados >= 0 &&
      presentes >
      programados
    ) {

      presentes =
        programados;


      this.form
        .controls
        .presentes
        .setValue(
          presentes,
          {
            emitEvent: false
          }
        );
    }


    this.actualizarValidadorPresentes();

    this.syncAusencias();
  }


  /* =======================================================
   * VALIDADOR PRESENTES
   * ======================================================= */

  private actualizarValidadorPresentes(): void {

    const programados =
      Number(
        this.form
          .controls
          .programados
          .value ?? 0
      );


    this.form
      .controls
      .presentes
      .setValidators([
        Validators.required,
        Validators.min(0),
        Validators.max(
          Math.max(
            0,
            programados
          )
        )
      ]);


    this.form
      .controls
      .presentes
      .updateValueAndValidity({
        emitEvent: false
      });
  }


  /* =======================================================
   * SINCRONIZAR AUSENCIAS
   * ======================================================= */

  private syncAusencias(): void {

    const programados =
      Number(
        this.form
          .controls
          .programados
          .value ?? 0
      );


    const presentes =
      Number(
        this.form
          .controls
          .presentes
          .value ?? 0
      );


    const expected =
      Math.max(
        0,
        programados -
        presentes
      );


    this.ausentesEsperados.set(
      expected
    );


    /*
     * Crear formularios
     * faltantes.
     */

    while (
      this.ausencias.length <
      expected
    ) {

      this.ausencias.push(

        this.fb.group({

          trabajadorId: [
            null as
              number | null,
            Validators.required
          ],

          motivoId: [
            null as
              number | null,
            Validators.required
          ],

          observacion: ['']

        })
      );
    }


    /*
     * Eliminar formularios
     * sobrantes.
     */

    while (
      this.ausencias.length >
      expected
    ) {

      this.ausencias.removeAt(
        this.ausencias.length -
        1
      );
    }
  }


  /* =======================================================
   * RESET TRABAJADORES AUSENTES
   * ======================================================= */

  private resetAusenciasTrabajadores(): void {

    for (
      const group
      of this.ausencias.controls
    ) {

      group
        .get(
          'trabajadorId'
        )
        ?.setValue(
          null
        );
    }
  }


  /* =======================================================
   * FINALIZAR REGISTRO
   * ======================================================= */

  private finishSuccess(
    id: number
  ): void {

    this.saving.set(
      false
    );


    this.success.set(
      `Asistencia #${id} registrada correctamente con sus tres evidencias.`
    );


    /*
     * Limpiar evidencias.
     */

    this.evidenciaCalentamiento.set(
      null
    );

    this.evidenciaInicioTurno.set(
      null
    );

    this.evidenciaTapones.set(
      null
    );


    /*
     * Resetear formulario.
     */

    this.form.reset({

      plazaId:
        null,

      turnoId:
        null,

      controladorId:
        null,

      fecha:
        this.today(),

      programados:
        0,

      presentes:
        0,

      apoyoSolicitado:
        0,

      detalleApoyo:
        '',

      notas:
        ''

    });


    /*
     * Limpiar ausencias.
     */

    this.ausentesEsperados.set(
      0
    );

    this.ausencias.clear();


    /*
     * Limpiar personal.
     */

    this.agentes.set(
      []
    );

    this.controladores.set(
      []
    );
  }


  /* =======================================================
   * FECHA ACTUAL
   * ======================================================= */

  private today(): string {

    const date =
      new Date();


    const offset =
      date
        .getTimezoneOffset();


    return new Date(
      date.getTime() -
      offset *
      60000
    )
      .toISOString()
      .slice(
        0,
        10
      );
  }


  /* =======================================================
   * MENSAJES DE ERROR
   * ======================================================= */

  private errorMessage(
    err: unknown
  ): string {

    const error =
      err as {

        error?:
          | {
              message?: string;
              error?: string;
            }
          | string;

        message?: string;
      };


    if (
      typeof error?.error ===
      'string'
    ) {

      return error.error;
    }


    return (
      error
        ?.error
        ?.message
      ??
      error
        ?.error
        ?.error
      ??
      error
        ?.message
      ??
      'Ocurrió un error inesperado.'
    );
  }
}