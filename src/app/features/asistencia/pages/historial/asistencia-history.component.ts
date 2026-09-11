import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import {
  Component,
  OnInit,
  inject,
  signal
} from '@angular/core';

import { jsPDF } from 'jspdf';
import { firstValueFrom } from 'rxjs';

import {
  AsistenciaResponse,
  Plaza
} from '../../models/asistencia.models';

import {
  AsistenciaApiService
} from '../../services/asistencia-api.service';

@Component({
  selector: 'app-asistencia-history',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule
  ],
  templateUrl: './asistencia-history.component.html',
  styleUrl: './asistencia-history.component.css'
})
export class AsistenciaHistoryComponent implements OnInit {

  private readonly api =
    inject(AsistenciaApiService);

  /*
   * =========================================================
   * ASSETS DEL PDF
   * =========================================================
   */

  private readonly logoUrl =
    'assets/logo-lima-expresa.png';

  private readonly footerSeguridadUrl =
    'assets/footer-seguridad.png';

  readonly loading =
    signal(false);

  readonly loadingPlazas =
    signal(false);

  readonly generandoPdfId =
    signal<number | null>(null);

  readonly error =
    signal('');

  readonly registros =
    signal<AsistenciaResponse[]>([]);

  readonly plazas =
    signal<Plaza[]>([]);

  readonly expandedId =
    signal<number | null>(null);

  readonly detalleSeleccionado =
    signal<AsistenciaResponse | null>(null);

  inicio = '';
  fin = '';
  plazaId: number | null = null;

  turnoFiltro = '';

  readonly tamanioPagina = 12;
  paginaActual = 1;

  ngOnInit(): void {

    const hoy =
      this.obtenerFechaHoy();

    this.inicio = hoy;
    this.fin = hoy;

    this.cargarPlazas();
    this.cargar();
  }

  /*
   * =========================================================
   * PLAZAS
   * =========================================================
   */

  cargarPlazas(): void {

    this.loadingPlazas.set(true);

    this.api
      .getPlazas()
      .subscribe({

        next: (items) => {

          this.plazas.set(
            items.filter(
              plaza => plaza.activo
            )
          );

          this.loadingPlazas.set(false);
        },

        error: () => {

          this.loadingPlazas.set(false);

          this.error.set(
            'No se pudieron cargar las plazas.'
          );
        }

      });
  }

  /*
   * =========================================================
   * HISTORIAL
   * =========================================================
   */

  cargar(): void {

    this.error.set('');

    if (
      this.inicio &&
      this.fin &&
      this.inicio > this.fin
    ) {

      this.error.set(
        'La fecha inicial no puede ser posterior a la fecha final.'
      );

      return;
    }

    this.loading.set(true);

    this.api
      .listarAsistencias(
        this.inicio || undefined,
        this.fin || undefined,
        this.plazaId
      )
      .subscribe({

        next: (items) => {

          this.registros.set(items);

          this.paginaActual = 1;
          this.expandedId.set(null);

          this.loading.set(false);
        },

        error: (err) => {

          this.error.set(
            this.errorMessage(err)
          );

          this.loading.set(false);
        }

      });
  }

  cambiarPlaza(): void {

    this.paginaActual = 1;
    this.cargar();
  }

  cambiarTurno(): void {

    this.paginaActual = 1;
  }

  registrosFiltrados(): AsistenciaResponse[] {

    const turno =
      this.turnoFiltro
        .trim()
        .toUpperCase();

    if (!turno) {
      return this.registros();
    }

    return this.registros().filter(
      registro =>
        String(registro.turno ?? '')
          .trim()
          .toUpperCase() === turno
    );
  }

  registrosPaginados(): AsistenciaResponse[] {

    const registros =
      this.registrosFiltrados();

    const inicio =
      (this.paginaActual - 1) *
      this.tamanioPagina;

    return registros.slice(
      inicio,
      inicio + this.tamanioPagina
    );
  }

  totalPaginas(): number {

    return Math.max(
      1,
      Math.ceil(
        this.registrosFiltrados().length /
        this.tamanioPagina
      )
    );
  }

  paginasVisibles(): number[] {

    const total =
      this.totalPaginas();

    if (total <= 5) {
      return Array.from(
        { length: total },
        (_, index) => index + 1
      );
    }

    const inicio =
      Math.max(
        1,
        Math.min(
          this.paginaActual - 2,
          total - 4
        )
      );

    return Array.from(
      { length: 5 },
      (_, index) => inicio + index
    );
  }

  cambiarPagina(pagina: number): void {

    const total =
      this.totalPaginas();

    if (
      pagina < 1 ||
      pagina > total ||
      pagina === this.paginaActual
    ) {
      return;
    }

    this.paginaActual = pagina;
    this.expandedId.set(null);
  }

  primerRegistroPagina(): number {

    const total =
      this.registrosFiltrados().length;

    if (total === 0) {
      return 0;
    }

    return (
      (this.paginaActual - 1) *
      this.tamanioPagina
    ) + 1;
  }

  ultimoRegistroPagina(): number {

    return Math.min(
      this.paginaActual *
      this.tamanioPagina,
      this.registrosFiltrados().length
    );
  }

  abrirDetalle(
    registro: AsistenciaResponse
  ): void {

    this.detalleSeleccionado.set(
      registro
    );

    document.body.style.overflow =
      'hidden';
  }

  cerrarDetalle(): void {

    this.detalleSeleccionado.set(
      null
    );

    document.body.style.overflow =
      '';
  }


  badgeClass(
    value: number
  ): string {

    if (value >= 95) {
      return 'excellent';
    }

    if (value >= 85) {
      return 'good';
    }

    return 'warning';
  }

  /*
   * =========================================================
   * PORCENTAJE MENSUAL REAL
   * =========================================================
   */

  private async obtenerPorcentajeMensual(
    registro: AsistenciaResponse
  ): Promise<number> {

    if (!registro.fecha) {
      return 0;
    }

    const [
      anioTexto,
      mesTexto
    ] = registro.fecha.split('-');

    const anio =
      Number(anioTexto);

    const mes =
      Number(mesTexto);

    const inicioMes =
      `${anioTexto}-${mesTexto}-01`;

    const ultimoDia =
      new Date(
        anio,
        mes,
        0
      ).getDate();

    const finMes =
      `${anioTexto}-${mesTexto}-${String(
        ultimoDia
      ).padStart(
        2,
        '0'
      )}`;

    try {

      const registrosMes =
        await firstValueFrom(
          this.api.listarAsistencias(
            inicioMes,
            finMes,
            registro.plazaId
          )
        );

      if (!registrosMes.length) {
        return 0;
      }

      const totalProgramados =
        registrosMes.reduce(
          (
            total,
            item
          ) =>
            total +
            Number(
              item.programados ?? 0
            ),
          0
        );

      const totalPresentes =
        registrosMes.reduce(
          (
            total,
            item
          ) =>
            total +
            Number(
              item.presentes ?? 0
            ),
          0
        );

      if (totalProgramados <= 0) {
        return 0;
      }

      return (
        totalPresentes /
        totalProgramados
      ) * 100;

    } catch (error) {

      console.error(
        'Error obteniendo porcentaje mensual:',
        error
      );

      return Number(
        registro.porcentaje ?? 0
      );
    }
  }

  /*
   * =========================================================
   * PDF
   * =========================================================
   */

  async generarPdf(
    registro: AsistenciaResponse
  ): Promise<void> {

    if (
      this.generandoPdfId() !== null
    ) {
      return;
    }

    this.generandoPdfId.set(
      registro.id
    );

    this.error.set('');

    try {

      const pdf =
        new jsPDF({
          orientation: 'landscape',
          unit: 'mm',
          format: 'a4'
        });

      /*
       * COLORES
       */

      const navy:
        [number, number, number] =
        [0, 76, 145];

      const blue:
        [number, number, number] =
        [0, 139, 210];

      const lightBlue:
        [number, number, number] =
        [154, 214, 242];

      const white:
        [number, number, number] =
        [255, 255, 255];

      const black:
        [number, number, number] =
        [25, 35, 45];

      const green:
        [number, number, number] =
        [0, 132, 72];

      const yellow:
        [number, number, number] =
        [255, 205, 35];

      /*
       * =====================================================
       * PÁGINA 1
       * =====================================================
       */

      pdf.setFillColor(
        242,
        250,
        255
      );

      pdf.rect(
        0,
        0,
        297,
        210,
        'F'
      );

      /*
       * CABECERA
       */

      pdf.setFillColor(
        ...lightBlue
      );

      pdf.roundedRect(
        7,
        5,
        283,
        39,
        3,
        3,
        'F'
      );

      /*
       * LOGO
       */

      await this.dibujarLogo(
        pdf,
        navy
      );

      /*
       * PLAZA
       */

      const plazaTexto =
        this.obtenerNombrePlazaCompleto(
          registro.plazaId,
          registro.plaza
        );

      pdf.setTextColor(
        ...white
      );

      pdf.setFont(
        'helvetica',
        'bold'
      );

      pdf.setFontSize(21);

      pdf.text(
        'Plaza:',
        46,
        20
      );

      pdf.setFillColor(
        ...white
      );

      pdf.roundedRect(
        78,
        8,
        150,
        18,
        5,
        5,
        'F'
      );

      pdf.setTextColor(
        ...black
      );

      pdf.setFont(
        'helvetica',
        'bold'
      );

      const plazaFont =
        this.calcularFuenteParaAncho(
          pdf,
          plazaTexto,
          142,
          18,
          10
        );

      pdf.setFontSize(
        plazaFont
      );

      pdf.text(
        plazaTexto,
        153,
        19.8,
        {
          align: 'center',
          maxWidth: 142
        }
      );

      /*
       * FECHA
       */

      this.dibujarDatoCabecera(
        pdf,
        46,
        30,
        54,
        'Fecha:',
        this.formatearFecha(
          registro.fecha
        ),
        navy
      );

      /*
       * TURNO
       */

      this.dibujarDatoCabecera(
        pdf,
        104,
        30,
        40,
        'Turno:',
        registro.turno,
        navy
      );

      /*
       * CONTROLADOR
       */

      this.dibujarDatoCabeceraAdaptable(
        pdf,
        148,
        30,
        110,
        'Controlador:',
        registro.controlador,
        navy
      );

      /*
       * =====================================================
       * RESUMEN
       * =====================================================
       */

      const summaryY = 46;

      this.dibujarIndicador(
        pdf, 7, summaryY, 31, 31,
        'Programados',
        String(registro.programados).padStart(2, '0'),
        navy
      );

      this.dibujarIndicador(
        pdf, 41, summaryY, 34, 31,
        'Total asistencia',
        String(registro.presentes).padStart(2, '0'),
        navy
      );

      /*
       * Personal de apoyo:
       * no interviene en el porcentaje de asistencia.
       */
      this.dibujarIndicadorApoyo(
        pdf,
        78,
        summaryY,
        34,
        31,
        Number(registro.apoyoSolicitado ?? 0),
        registro.detalleApoyo,
        navy
      );

      /*
       * Los porcentajes se muestran sin círculos para
       * aprovechar mejor el espacio del resumen.
       */
      this.dibujarPorcentajeResumen(
        pdf, 115, summaryY, 37, 31,
        Number(registro.porcentaje ?? 0),
        'Porcentaje de asistencia',
        navy,
        green
      );

      const porcentajeMes =
        await this.obtenerPorcentajeMensual(registro);

      this.dibujarPorcentajeResumen(
        pdf, 155, summaryY, 37, 31,
        porcentajeMes,
        'Porcentaje del mes',
        navy,
        green
      );

      /*
       * No se agrega un indicador independiente de ausentes.
       * El total ya aparece en el título del listado de ausencias.
       */
      this.dibujarTablaAusenciasResumen(
        pdf, registro, 195, summaryY, 95, 31
      );

      /*
       * =====================================================
       * EVIDENCIAS
       * =====================================================
       */

      const evidencias =
  registro.evidencias ?? [];


/*
 * =====================================================
 * IDENTIFICAR EVIDENCIAS POR TIPO
 * =====================================================
 *
 * Ya no dependemos de la posición:
 *
 * evidencias[0]
 * evidencias[1]
 * evidencias[2]
 *
 * Cada fotografía se identifica mediante el tipo
 * guardado en la base de datos.
 */

const evidenciaCalentamiento =
  evidencias.find(
    evidencia =>
      evidencia.tipo === 'CALENTAMIENTO'
  );

const evidenciaInicioTurno =
  evidencias.find(
    evidencia =>
      evidencia.tipo === 'INICIO_TURNO'
  );

const evidenciaTapones =
  evidencias.find(
    evidencia =>
      evidencia.tipo === 'TAPONES_AUDITIVOS'
  );


/*
 * ¡A CALENTAR!
 */

await this.dibujarEvidencia(
  pdf,
  evidenciaCalentamiento?.urlArchivo,
  7,
  79,
  92,
  70,
  '¡A calentar!',
  [220, 0, 75]
);


/*
 * FOTO DE INICIO DE TURNO
 */

await this.dibujarEvidencia(
  pdf,
  evidenciaInicioTurno?.urlArchivo,
  102,
  79,
  92,
  70,
  'Foto de inicio de turno',
  yellow
);


/*
 * INSPECCIÓN DE TAPONES AUDITIVOS
 */

await this.dibujarEvidencia(
  pdf,
  evidenciaTapones?.urlArchivo,
  197,
  79,
  93,
  70,
  'Insp. tapones auditivos',
  blue
);

      /*
       * =====================================================
       * NOTAS
       * =====================================================
       */

      const notesY = 152;

      pdf.setFillColor(
        ...white
      );

      pdf.setDrawColor(
        150,
        205,
        235
      );

      pdf.roundedRect(
        7,
        notesY,
        283,
        20,
        2,
        2,
        'FD'
      );

      pdf.setTextColor(
        ...navy
      );

      pdf.setFont(
        'helvetica',
        'bold'
      );

      pdf.setFontSize(9.5);

      pdf.text(
        'Notas u observaciones',
        10,
        notesY + 5.5
      );

      pdf.setTextColor(
        60,
        70,
        80
      );

      pdf.setFont(
        'helvetica',
        'normal'
      );

      pdf.setFontSize(8.5);

      const notas =
        registro.notas?.trim() ||
        'Sin observaciones.';

      const lineasNotas =
        pdf.splitTextToSize(
          notas,
          275
        );

      pdf.text(
        lineasNotas.slice(
          0,
          2
        ),
        10,
        notesY + 12
      );

      /*
       * =====================================================
       * FOOTER DE SEGURIDAD
       * Imagen completa: personas + frase + peaje
       * =====================================================
       */

      await this.dibujarFooterSeguridad(
        pdf
      );

      /*
       * =====================================================
       * PÁGINA COMPLETA DE AUSENCIAS
       * Solo cuando existen más de 4.
       * =====================================================
       */

      if (
        registro.ausencias.length > 4
      ) {

        await this.dibujarListadoCompletoAusencias(
          pdf,
          registro,
          navy,
          blue
        );
      }

      /*
       * =====================================================
       * NUMERACIÓN FINAL
       * =====================================================
       */

      this.agregarNumeracionPaginas(
        pdf,
        navy
      );

      /*
       * =====================================================
       * GUARDAR
       * =====================================================
       */

      const nombrePlaza =
        registro.plaza
          .replace(
            /\s+/g,
            '_'
          )
          .replace(
            /[^\w-]/g,
            ''
          );

      pdf.save(
        `Asistencia_${nombrePlaza}_${registro.fecha}.pdf`
      );

    } catch (err) {

      console.error(
        'Error generando PDF:',
        err
      );

      this.error.set(
        'No se pudo generar el PDF de asistencia.'
      );

    } finally {

      this.generandoPdfId.set(
        null
      );
    }
  }

  /*
   * =========================================================
   * LOGO
   * =========================================================
   */

  private async dibujarLogo(
    pdf: jsPDF,
    navy:
      [number, number, number]
  ): Promise<void> {

    try {

      const logo =
        await this.cargarImagenPdf(
          this.logoUrl
        );

      const maxWidth = 33;
      const maxHeight = 31;

      const escala =
        Math.min(
          maxWidth / logo.ancho,
          maxHeight / logo.alto
        );

      const width =
        logo.ancho *
        escala;

      const height =
        logo.alto *
        escala;

      pdf.addImage(
        logo.dataUrl,
        logo.formato,
        10 +
        (
          maxWidth -
          width
        ) /
        2,
        7 +
        (
          maxHeight -
          height
        ) /
        2,
        width,
        height
      );

    } catch {

      pdf.setTextColor(
        ...navy
      );

      pdf.setFont(
        'helvetica',
        'bold'
      );

      pdf.setFontSize(14);

      pdf.text(
        'LIMA',
        12,
        18
      );

      pdf.text(
        'EXPRESA',
        12,
        25
      );
    }
  }

  /*
   * =========================================================
   * FOOTER DE SEGURIDAD
   * =========================================================
   */

  private async dibujarFooterSeguridad(
    pdf: jsPDF
  ): Promise<void> {

    try {

      const footer =
        await this.cargarImagenPdf(
          this.footerSeguridadUrl
        );

      /*
       * A4 horizontal = 297 mm de ancho.
       * Usamos prácticamente todo el ancho del PDF,
       * dejando 4 mm de margen por lado.
       *
       * IMPORTANTE:
       * footer-seguridad.png debe ser la versión recortada,
       * sin el gran espacio transparente superior/inferior.
       */

      const x = 7;
      const y = 176;
      const ancho = 282;

      /*
       * Conservamos la proporción original del PNG.
       * Al estar recortado, ahora sí ocupará casi todo
       * el ancho útil del PDF.
       */

      const alto =
        ancho *
        footer.alto /
        footer.ancho;

      pdf.addImage(
        footer.dataUrl,
        footer.formato,
        x,
        y,
        ancho,
        alto
      );

    } catch (err) {

      console.error(
        'No se pudo cargar el footer de seguridad:',
        err
      );
    }
  }

  /*
   * =========================================================
   * PLAZA
   * =========================================================
   */

  private obtenerNombrePlazaCompleto(
    plazaId: number,
    codigoActual: string
  ): string {

    const plaza =
      this.plazas()
        .find(
          item =>
            item.id === plazaId
        );

    if (!plaza) {
      return codigoActual;
    }

    if (!plaza.descripcion) {
      return plaza.codigo;
    }

    return (
      `${plaza.codigo} - ` +
      `${plaza.descripcion}`
    );
  }

  /*
   * =========================================================
   * CABECERA
   * =========================================================
   */

  private dibujarDatoCabecera(
    pdf: jsPDF,
    x: number,
    y: number,
    ancho: number,
    etiqueta: string,
    valor: string,
    color:
      [number, number, number]
  ): void {

    const labelWidth = 17;

    pdf.setFillColor(
      ...color
    );

    pdf.roundedRect(
      x,
      y,
      labelWidth,
      9,
      1.5,
      1.5,
      'F'
    );

    pdf.setTextColor(
      255,
      255,
      255
    );

    pdf.setFont(
      'helvetica',
      'bold'
    );

    pdf.setFontSize(8);

    pdf.text(
      etiqueta,
      x + 2,
      y + 5.8
    );

    pdf.setFillColor(
      255,
      255,
      255
    );

    pdf.roundedRect(
      x + labelWidth,
      y,
      ancho - labelWidth,
      9,
      1.5,
      1.5,
      'F'
    );

    pdf.setTextColor(
      20,
      20,
      20
    );

    pdf.setFont(
      'helvetica',
      'bold'
    );

    const disponible =
      ancho -
      labelWidth -
      4;

    const fontSize =
      this.calcularFuenteParaAncho(
        pdf,
        valor,
        disponible,
        8,
        6
      );

    pdf.setFontSize(
      fontSize
    );

    pdf.text(
      valor,
      x +
      labelWidth +
      2,
      y + 5.8,
      {
        maxWidth:
          disponible
      }
    );
  }

  private dibujarDatoCabeceraAdaptable(
    pdf: jsPDF,
    x: number,
    y: number,
    ancho: number,
    etiqueta: string,
    valor: string,
    color:
      [number, number, number]
  ): void {

    const labelWidth = 30;

    pdf.setFillColor(
      ...color
    );

    pdf.roundedRect(
      x,
      y,
      labelWidth,
      9,
      1.5,
      1.5,
      'F'
    );

    pdf.setTextColor(
      255,
      255,
      255
    );

    pdf.setFont(
      'helvetica',
      'bold'
    );

    pdf.setFontSize(8);

    pdf.text(
      etiqueta,
      x + 2,
      y + 5.8
    );

    pdf.setFillColor(
      255,
      255,
      255
    );

    pdf.roundedRect(
      x + labelWidth,
      y,
      ancho - labelWidth,
      9,
      1.5,
      1.5,
      'F'
    );

    const disponible =
      ancho -
      labelWidth -
      5;

    pdf.setTextColor(
      20,
      20,
      20
    );

    pdf.setFont(
      'helvetica',
      'bold'
    );

    const fontSize =
      this.calcularFuenteParaAncho(
        pdf,
        valor,
        disponible,
        8.5,
        5.5
      );

    pdf.setFontSize(
      fontSize
    );

    pdf.text(
      valor,
      x +
      labelWidth +
      2,
      y + 5.8,
      {
        maxWidth:
          disponible
      }
    );
  }

  /*
   * =========================================================
   * INDICADOR
   * =========================================================
   */

  private dibujarIndicador(
    pdf: jsPDF,
    x: number,
    y: number,
    ancho: number,
    alto: number,
    titulo: string,
    valor: string,
    colorValor:
      [number, number, number]
  ): void {

    pdf.setFillColor(
      255,
      255,
      255
    );

    pdf.setDrawColor(
      150,
      205,
      235
    );

    pdf.roundedRect(
      x,
      y,
      ancho,
      alto,
      2,
      2,
      'FD'
    );

    pdf.setFillColor(
      0,
      125,
      195
    );

    pdf.roundedRect(
      x,
      y,
      ancho,
      8,
      2,
      2,
      'F'
    );

    pdf.setTextColor(
      255,
      255,
      255
    );

    pdf.setFont(
      'helvetica',
      'bold'
    );

    pdf.setFontSize(7.8);

    pdf.text(
      titulo,
      x + ancho / 2,
      y + 5.3,
      {
        align: 'center'
      }
    );

    pdf.setTextColor(
      ...colorValor
    );

    pdf.setFont(
      'helvetica',
      'bold'
    );

    pdf.setFontSize(23);

    pdf.text(
      valor,
      x + ancho / 2,
      y + 21.5,
      {
        align: 'center'
      }
    );
  }

  /*
   * =========================================================
   * PORCENTAJES DEL RESUMEN
   * =========================================================
   */

  private dibujarPorcentajeResumen(
    pdf: jsPDF,
    x: number,
    y: number,
    ancho: number,
    alto: number,
    porcentaje: number,
    titulo: string,
    azul: [number, number, number],
    verde: [number, number, number]
  ): void {

    const porcentajeSeguro =
      Math.max(
        0,
        Math.min(
          Number(porcentaje || 0),
          100
        )
      );

    pdf.setFillColor(
      255,
      255,
      255
    );

    pdf.setDrawColor(
      150,
      205,
      235
    );

    pdf.setLineWidth(0.3);

    pdf.roundedRect(
      x,
      y,
      ancho,
      alto,
      2,
      2,
      'FD'
    );

    pdf.setFillColor(
      ...azul
    );

    pdf.roundedRect(
      x,
      y,
      ancho,
      8,
      2,
      2,
      'F'
    );

    pdf.setTextColor(
      255,
      255,
      255
    );

    pdf.setFont(
      'helvetica',
      'bold'
    );

    pdf.setFontSize(
      titulo === 'Porcentaje del mes'
        ? 8
        : 7
    );

    pdf.text(
      titulo,
      x + ancho / 2,
      y + 5.3,
      {
        align: 'center',
        maxWidth: ancho - 3
      }
    );

    /*
     * Se elimina el círculo de progreso.
     * Solo se muestra el porcentaje centrado.
     */
    pdf.setTextColor(
      ...verde
    );

    pdf.setFont(
      'helvetica',
      'bold'
    );

    const texto =
      `${porcentajeSeguro.toFixed(1)}%`;

    const fontSize =
      this.calcularFuenteParaAncho(
        pdf,
        texto,
        ancho - 6,
        19,
        12
      );

    pdf.setFontSize(
      fontSize
    );

    pdf.text(
      texto,
      x + ancho / 2,
      y + 21.5,
      {
        align: 'center',
        maxWidth: ancho - 6
      }
    );
  }

  /*
   * =========================================================
   * INDICADOR DE PERSONAL DE APOYO
   * =========================================================
   */

  private dibujarIndicadorApoyo(
    pdf: jsPDF,
    x: number,
    y: number,
    ancho: number,
    alto: number,
    cantidad: number,
    detalle: string | null | undefined,
    colorValor: [number, number, number]
  ): void {

    pdf.setFillColor(
      255,
      255,
      255
    );

    pdf.setDrawColor(
      150,
      205,
      235
    );

    pdf.roundedRect(
      x,
      y,
      ancho,
      alto,
      2,
      2,
      'FD'
    );

    pdf.setFillColor(
      0,
      125,
      195
    );

    pdf.roundedRect(
      x,
      y,
      ancho,
      8,
      2,
      2,
      'F'
    );

    pdf.setTextColor(
      255,
      255,
      255
    );

    pdf.setFont(
      'helvetica',
      'bold'
    );

    pdf.setFontSize(7);

    pdf.text(
      'Personal de apoyo',
      x + ancho / 2,
      y + 5.3,
      {
        align: 'center',
        maxWidth: ancho - 3
      }
    );

    pdf.setTextColor(
      ...colorValor
    );

    pdf.setFont(
      'helvetica',
      'bold'
    );

    pdf.setFontSize(23);

    pdf.text(
      String(
        Math.max(
          0,
          Number(cantidad || 0)
        )
      ).padStart(
        2,
        '0'
      ),
      x + ancho / 2,
      y + 21.5,
      {
        align: 'center'
      }
    );
  }

  /*
   * =========================================================
   * TABLA RESUMEN PRIMERA PÁGINA
   * =========================================================
   */

  private dibujarTablaAusenciasResumen(
    pdf: jsPDF,
    registro: AsistenciaResponse,
    x: number,
    y: number,
    ancho: number,
    alto: number
  ): void {

    const navy:
      [number, number, number] =
      [0, 76, 145];

    const blue:
      [number, number, number] =
      [0, 139, 210];

    const white:
      [number, number, number] =
      [255, 255, 255];

    const text:
      [number, number, number] =
      [220, 0, 75];

    const border:
      [number, number, number] =
      [135, 195, 225];

    /*
     * CONTENEDOR
     */

    pdf.setFillColor(
      ...white
    );

    pdf.setDrawColor(
      ...border
    );

    pdf.setLineWidth(0.3);

    pdf.roundedRect(
      x,
      y,
      ancho,
      alto,
      2,
      2,
      'FD'
    );

    /*
     * TÍTULO
     */

    pdf.setFillColor(
      ...navy
    );

    pdf.roundedRect(
      x,
      y,
      ancho,
      7.5,
      2,
      2,
      'F'
    );

    pdf.setTextColor(
      ...white
    );

    pdf.setFont(
      'helvetica',
      'bold'
    );

    pdf.setFontSize(7.5);

    pdf.text(
      `Listado de ausencias (${registro.ausencias.length})`,
      x + ancho / 2,
      y + 5,
      {
        align: 'center'
      }
    );

    /*
     * COLUMNAS
     */

    const codigoWidth = 17;
    const nombreWidth = 57;

    const motivoWidth =
      ancho -
      codigoWidth -
      nombreWidth;

    const widths = [
      codigoWidth,
      nombreWidth,
      motivoWidth
    ];

    const headers = [
      'Código',
      'Nombre',
      'Motivo'
    ];

    const headerY =
      y + 7.5;

    const headerHeight =
      6;

    let cursorX =
      x;

    for (
      let i = 0;
      i < widths.length;
      i++
    ) {

      pdf.setFillColor(
        ...blue
      );

      pdf.setDrawColor(
        255,
        255,
        255
      );

      pdf.rect(
        cursorX,
        headerY,
        widths[i],
        headerHeight,
        'FD'
      );

      pdf.setTextColor(
        255,
        255,
        255
      );

      pdf.setFont(
        'helvetica',
        'bold'
      );

      pdf.setFontSize(6.5);

      pdf.text(
        headers[i],
        cursorX +
        widths[i] / 2,
        headerY + 4.1,
        {
          align: 'center'
        }
      );

      cursorX +=
        widths[i];
    }

    /*
     * SIN AUSENCIAS
     */

    if (
      registro.ausencias.length === 0
    ) {

      pdf.setTextColor(
        100,
        110,
        120
      );

      pdf.setFont(
        'helvetica',
        'normal'
      );

      pdf.setFontSize(7);

      pdf.text(
        'Sin ausencias registradas',
        x + ancho / 2,
        headerY + 12,
        {
          align: 'center'
        }
      );

      return;
    }

    /*
     * Hasta 4.
     */

    const mostrar =
      registro.ausencias.slice(
        0,
        4
      );

    const espacioFilas =
      alto -
      7.5 -
      headerHeight;

    const rowHeight =
      espacioFilas /
      4;

    mostrar.forEach(
      (
        ausencia,
        index
      ) => {

        const rowY =
          headerY +
          headerHeight +
          index *
          rowHeight;

        if (
          index % 2 === 0
        ) {

          pdf.setFillColor(
            255,
            255,
            255
          );

        } else {

          pdf.setFillColor(
            241,
            249,
            253
          );
        }

        cursorX =
          x;

        for (
          const width of widths
        ) {

          pdf.setDrawColor(
            ...border
          );

          pdf.rect(
            cursorX,
            rowY,
            width,
            rowHeight,
            'FD'
          );

          cursorX +=
            width;
        }

        /*
         * Código
         */

        pdf.setTextColor(
          ...text
        );

        pdf.setFont(
          'helvetica',
          'bold'
        );

        pdf.setFontSize(6);

        pdf.text(
          String(
            ausencia.codigoTrabajador
          ),
          x +
          codigoWidth / 2,
          rowY +
          rowHeight / 2 +
          1.6,
          {
            align: 'center'
          }
        );

        /*
         * Nombre
         */

        const nombreFont =
          this.calcularFuenteParaAncho(
            pdf,
            ausencia.nombreTrabajador,
            nombreWidth - 3,
            5.5,
            4
          );

        pdf.setFont(
          'helvetica',
          'normal'
        );

        pdf.setFontSize(
          nombreFont
        );

        pdf.text(
          ausencia.nombreTrabajador,
          x +
          codigoWidth +
          1.5,
          rowY +
          rowHeight / 2 +
          1.6,
          {
            maxWidth:
              nombreWidth - 3
          }
        );

        /*
         * Motivo
         */

        const motivoFont =
          this.calcularFuenteParaAncho(
            pdf,
            ausencia.motivo,
            motivoWidth - 3,
            5.5,
            4
          );

        pdf.setFontSize(
          motivoFont
        );

        pdf.text(
          ausencia.motivo,
          x +
          codigoWidth +
          nombreWidth +
          1.5,
          rowY +
          rowHeight / 2 +
          1.6,
          {
            maxWidth:
              motivoWidth - 3
          }
        );
      }
    );

    /*
     * Si hay más de cuatro,
     * indicamos que continúa.
     */

    if (
      registro.ausencias.length > 4
    ) {

      pdf.setTextColor(
        ...navy
      );

      pdf.setFont(
        'helvetica',
        'bold'
      );

      pdf.setFontSize(4.5);

      pdf.text(
        `Listado completo en la página siguiente`,
        x + ancho - 1.5,
        y + alto - 1,
        {
          align: 'right'
        }
      );
    }
  }

  /*
   * =========================================================
   * PÁGINAS DE AUSENCIAS COMPLETAS
   * =========================================================
   */

  private async dibujarListadoCompletoAusencias(
    pdf: jsPDF,
    registro: AsistenciaResponse,
    navy:
      [number, number, number],
    blue:
      [number, number, number]
  ): Promise<void> {

    /*
     * Cantidad segura por página.
     * Con esta altura caben bien 14 filas.
     */

    const filasPorPagina =
      14;

    const total =
      registro.ausencias.length;

    const cantidadPaginas =
      Math.ceil(
        total /
        filasPorPagina
      );

    for (
      let pagina = 0;
      pagina < cantidadPaginas;
      pagina++
    ) {

      const inicio =
        pagina *
        filasPorPagina;

      const fin =
        inicio +
        filasPorPagina;

      const bloque =
        registro.ausencias.slice(
          inicio,
          fin
        );

      pdf.addPage(
        'a4',
        'landscape'
      );

      /*
       * FONDO
       */

      pdf.setFillColor(
        247,
        252,
        255
      );

      pdf.rect(
        0,
        0,
        297,
        210,
        'F'
      );

      /*
       * CABECERA SUPERIOR
       */

      pdf.setFillColor(
        226,
        245,
        253
      );

      pdf.roundedRect(
        8,
        7,
        281,
        25,
        3,
        3,
        'F'
      );

      /*
       * LOGO
       */

      await this.dibujarLogoPaginaAusencias(
        pdf,
        navy
      );

      /*
       * TÍTULO
       */

      pdf.setFillColor(
        ...navy
      );

      pdf.roundedRect(
        60,
        10,
        220,
        13,
        3,
        3,
        'F'
      );

      pdf.setTextColor(
        255,
        255,
        255
      );

      pdf.setFont(
        'helvetica',
        'bold'
      );

      pdf.setFontSize(15);

      pdf.text(
        'Listado completo de ausencias',
        170,
        18.5,
        {
          align: 'center'
        }
      );

      /*
       * INFORMACIÓN
       */

      const plaza =
        this.obtenerNombrePlazaCompleto(
          registro.plazaId,
          registro.plaza
        );

      pdf.setTextColor(
        20,
        40,
        65
      );

      pdf.setFont(
        'helvetica',
        'bold'
      );

      pdf.setFontSize(8.5);

      pdf.text(
        'Plaza:',
        10,
        40
      );

      pdf.setFont(
        'helvetica',
        'normal'
      );

      pdf.text(
        plaza,
        22,
        40
      );

      pdf.setFont(
        'helvetica',
        'bold'
      );

      pdf.text(
        'Fecha:',
        115,
        40
      );

      pdf.setFont(
        'helvetica',
        'normal'
      );

      pdf.text(
        this.formatearFecha(
          registro.fecha
        ),
        128,
        40
      );

      pdf.setFont(
        'helvetica',
        'bold'
      );

      pdf.text(
        'Turno:',
        177,
        40
      );

      pdf.setFont(
        'helvetica',
        'normal'
      );

      pdf.text(
        registro.turno,
        190,
        40
      );

      pdf.setFont(
        'helvetica',
        'bold'
      );

      pdf.text(
        'Total ausencias:',
        225,
        40
      );

      pdf.setFont(
        'helvetica',
        'normal'
      );

      pdf.text(
        String(
          registro.ausencias.length
        ).padStart(
          2,
          '0'
        ),
        253,
        40
      );

      /*
       * TABLA
       */

      this.dibujarTablaAusenciasCompleta(
        pdf,
        bloque,
        10,
        48,
        277,
        navy,
        blue
      );

      /*
       * CONTINUACIÓN
       */

      if (
        cantidadPaginas > 1
      ) {

        pdf.setTextColor(
          90,
          105,
          120
        );

        pdf.setFont(
          'helvetica',
          'italic'
        );

        pdf.setFontSize(7);

        pdf.text(
          `Bloque ${pagina + 1} de ${cantidadPaginas}`,
          10,
          199
        );
      }
    }
  }

  /*
   * =========================================================
   * TABLA COMPLETA
   * =========================================================
   */

  private dibujarTablaAusenciasCompleta(
    pdf: jsPDF,
    ausencias:
      AsistenciaResponse['ausencias'],
    x: number,
    y: number,
    ancho: number,
    navy:
      [number, number, number],
    blue:
      [number, number, number]
  ): void {

    const codigoWidth =
      34;

    const nombreWidth =
      130;

    const motivoWidth =
      ancho -
      codigoWidth -
      nombreWidth;

    const widths = [
      codigoWidth,
      nombreWidth,
      motivoWidth
    ];

    const headers = [
      'Código',
      'Nombre',
      'Motivo'
    ];

    const headerHeight =
      9;

    const rowHeight =
      9.5;

    let cursorX =
      x;

    /*
     * CABECERA
     */

    for (
      let i = 0;
      i < widths.length;
      i++
    ) {

      pdf.setFillColor(
        ...blue
      );

      pdf.setDrawColor(
        255,
        255,
        255
      );

      pdf.setLineWidth(0.3);

      pdf.rect(
        cursorX,
        y,
        widths[i],
        headerHeight,
        'FD'
      );

      pdf.setTextColor(
        255,
        255,
        255
      );

      pdf.setFont(
        'helvetica',
        'bold'
      );

      pdf.setFontSize(9);

      pdf.text(
        headers[i],
        cursorX +
        widths[i] / 2,
        y + 6,
        {
          align: 'center'
        }
      );

      cursorX +=
        widths[i];
    }

    /*
     * FILAS
     */

    ausencias.forEach(
      (
        ausencia,
        index
      ) => {

        const rowY =
          y +
          headerHeight +
          index *
          rowHeight;

        /*
         * Fondo alternado
         */

        if (
          index % 2 === 0
        ) {

          pdf.setFillColor(
            255,
            255,
            255
          );

        } else {

          pdf.setFillColor(
            239,
            248,
            253
          );
        }

        cursorX =
          x;

        for (
          const width of widths
        ) {

          pdf.setDrawColor(
            145,
            195,
            220
          );

          pdf.setLineWidth(0.25);

          pdf.rect(
            cursorX,
            rowY,
            width,
            rowHeight,
            'FD'
          );

          cursorX +=
            width;
        }

        /*
         * Código
         */

        pdf.setTextColor(
          25,
          35,
          45
        );

        pdf.setFont(
          'helvetica',
          'bold'
        );

        pdf.setFontSize(8.5);

        pdf.text(
          String(
            ausencia.codigoTrabajador
          ),
          x +
          codigoWidth / 2,
          rowY + 6.2,
          {
            align: 'center'
          }
        );

        /*
         * Nombre
         */

        pdf.setFont(
          'helvetica',
          'normal'
        );

        const nombreSize =
          this.calcularFuenteParaAncho(
            pdf,
            ausencia.nombreTrabajador,
            nombreWidth - 8,
            8.5,
            6.5
          );

        pdf.setFontSize(
          nombreSize
        );

        pdf.text(
          ausencia.nombreTrabajador,
          x +
          codigoWidth +
          4,
          rowY + 6.2,
          {
            maxWidth:
              nombreWidth - 8
          }
        );

        /*
         * Motivo
         */

        const motivoSize =
          this.calcularFuenteParaAncho(
            pdf,
            ausencia.motivo,
            motivoWidth - 8,
            8.5,
            6.5
          );

        pdf.setFontSize(
          motivoSize
        );

        pdf.text(
          ausencia.motivo,
          x +
          codigoWidth +
          nombreWidth +
          4,
          rowY + 6.2,
          {
            maxWidth:
              motivoWidth - 8
          }
        );
      }
    );

    /*
     * Marco exterior
     */

    const alto =
      headerHeight +
      ausencias.length *
      rowHeight;

    pdf.setDrawColor(
      ...navy
    );

    pdf.setLineWidth(0.35);

    pdf.rect(
      x,
      y,
      ancho,
      alto
    );

    pdf.setLineWidth(0.2);
  }

  /*
   * =========================================================
   * LOGO PÁGINA AUSENCIAS
   * =========================================================
   */

  private async dibujarLogoPaginaAusencias(
    pdf: jsPDF,
    navy:
      [number, number, number]
  ): Promise<void> {

    try {

      const logo =
        await this.cargarImagenPdf(
          this.logoUrl
        );

      const maxWidth = 38;
      const maxHeight = 21;

      const escala =
        Math.min(
          maxWidth / logo.ancho,
          maxHeight / logo.alto
        );

      const width =
        logo.ancho *
        escala;

      const height =
        logo.alto *
        escala;

      pdf.addImage(
        logo.dataUrl,
        logo.formato,
        12 +
        (
          maxWidth -
          width
        ) /
        2,
        9 +
        (
          maxHeight -
          height
        ) /
        2,
        width,
        height
      );

    } catch {

      pdf.setTextColor(
        ...navy
      );

      pdf.setFont(
        'helvetica',
        'bold'
      );

      pdf.setFontSize(12);

      pdf.text(
        'LIMA',
        14,
        17
      );

      pdf.text(
        'EXPRESA',
        14,
        24
      );
    }
  }

  /*
   * =========================================================
   * NÚMERO DE PÁGINAS
   * =========================================================
   */

  private agregarNumeracionPaginas(
    pdf: jsPDF,
    navy:
      [number, number, number]
  ): void {

    const totalPaginas =
      pdf.getNumberOfPages();

    for (
      let pagina = 1;
      pagina <= totalPaginas;
      pagina++
    ) {

      pdf.setPage(
        pagina
      );

      pdf.setTextColor(
        ...navy
      );

      pdf.setFont(
        'helvetica',
        'bold'
      );

      pdf.setFontSize(7);

      pdf.text(
        `Página ${pagina} de ${totalPaginas}`,
        287,
        205,
        {
          align: 'right'
        }
      );
    }
  }

  /*
   * =========================================================
   * EVIDENCIAS
   * =========================================================
   */

  private async dibujarEvidencia(
    pdf: jsPDF,
    url: string | undefined,
    x: number,
    y: number,
    ancho: number,
    alto: number,
    titulo: string,
    colorTitulo:
      [number, number, number]
  ): Promise<void> {

    pdf.setFillColor(
      255,
      255,
      255
    );

    pdf.setDrawColor(
      ...colorTitulo
    );

    pdf.roundedRect(
      x,
      y,
      ancho,
      alto,
      2,
      2,
      'FD'
    );

    pdf.setFillColor(
      ...colorTitulo
    );

    pdf.roundedRect(
      x,
      y,
      ancho,
      8,
      2,
      2,
      'F'
    );

    const amarillo =
      colorTitulo[0] > 220 &&
      colorTitulo[1] > 160;

    if (amarillo) {

      pdf.setTextColor(
        0,
        70,
        120
      );

    } else {

      pdf.setTextColor(
        255,
        255,
        255
      );
    }

    pdf.setFont(
      'helvetica',
      'bold'
    );

    pdf.setFontSize(8.5);

    pdf.text(
      titulo,
      x + ancho / 2,
      y + 5.4,
      {
        align: 'center'
      }
    );

    if (!url) {

      pdf.setTextColor(
        110,
        120,
        130
      );

      pdf.setFont(
        'helvetica',
        'normal'
      );

      pdf.setFontSize(8.5);

      pdf.text(
        'Sin evidencia registrada',
        x + ancho / 2,
        y + 29,
        {
          align: 'center'
        }
      );

      return;
    }

    try {

      const imagen =
        await this.cargarImagenPdf(
          url
        );

      const maxWidth =
        ancho - 1;

      const maxHeight =
        alto - 8.2;

      const escala =
        Math.min(
          maxWidth /
          imagen.ancho,
          maxHeight /
          imagen.alto
        );

      const width =
        imagen.ancho *
        escala;

      const height =
        imagen.alto *
        escala;

      const imageX =
        x +
        (
          ancho -
          width
        ) /
        2;

      const imageY =
        y +
        8.2 +
        (
          maxHeight -
          height
        ) /
        2;

      pdf.addImage(
        imagen.dataUrl,
        imagen.formato,
        imageX,
        imageY,
        width,
        height
      );

    } catch (err) {

      console.error(
        'No se pudo cargar evidencia:',
        url,
        err
      );

      pdf.setTextColor(
        190,
        40,
        40
      );

      pdf.setFont(
        'helvetica',
        'normal'
      );

      pdf.setFontSize(8);

      pdf.text(
        'No se pudo cargar la fotografía',
        x + ancho / 2,
        y + 29,
        {
          align: 'center'
        }
      );
    }
  }

  /*
   * =========================================================
   * IMÁGENES
   * =========================================================
   */

  private async cargarImagenPdf(
    url: string
  ): Promise<{
    dataUrl: string;
    formato: 'JPEG' | 'PNG';
    ancho: number;
    alto: number;
  }> {

    const response =
      await fetch(url);

    if (!response.ok) {

      throw new Error(
        `No se pudo cargar la imagen (${response.status}).`
      );
    }

    const blob =
      await response.blob();

    /*
     * Convertimos cualquier formato
     * recibido a PNG/JPEG compatible
     * con jsPDF.
     */

    const originalDataUrl =
      await this.blobToDataUrl(
        blob
      );

    const imagen =
      await this.cargarHtmlImage(
        originalDataUrl
      );

    /*
     * Si ya es PNG o JPEG,
     * podemos usarlo directamente.
     */

    const mime =
      blob.type
        .toLowerCase();

    if (
      mime.includes(
        'png'
      )
    ) {

      return {
        dataUrl:
          originalDataUrl,
        formato:
          'PNG',
        ancho:
          imagen.naturalWidth,
        alto:
          imagen.naturalHeight
      };
    }

    if (
      mime.includes(
        'jpeg'
      ) ||
      mime.includes(
        'jpg'
      )
    ) {

      return {
        dataUrl:
          originalDataUrl,
        formato:
          'JPEG',
        ancho:
          imagen.naturalWidth,
        alto:
          imagen.naturalHeight
      };
    }

    /*
     * WebP / AVIF / etc.
     * Lo convertimos mediante canvas.
     */

    const canvas =
      document.createElement(
        'canvas'
      );

    canvas.width =
      imagen.naturalWidth;

    canvas.height =
      imagen.naturalHeight;

    const context =
      canvas.getContext(
        '2d'
      );

    if (!context) {

      throw new Error(
        'No se pudo preparar la imagen para el PDF.'
      );
    }

    context.drawImage(
      imagen,
      0,
      0
    );

    const jpegDataUrl =
      canvas.toDataURL(
        'image/jpeg',
        0.9
      );

    return {
      dataUrl:
        jpegDataUrl,
      formato:
        'JPEG',
      ancho:
        imagen.naturalWidth,
      alto:
        imagen.naturalHeight
    };
  }

  private blobToDataUrl(
    blob: Blob
  ): Promise<string> {

    return new Promise<string>(
      (
        resolve,
        reject
      ) => {

        const reader =
          new FileReader();

        reader.onload =
          () => {

            if (
              typeof reader.result ===
              'string'
            ) {

              resolve(
                reader.result
              );

            } else {

              reject(
                new Error(
                  'No se pudo convertir la imagen.'
                )
              );
            }
          };

        reader.onerror =
          () => {

            reject(
              new Error(
                'No se pudo leer la imagen.'
              )
            );
          };

        reader.readAsDataURL(
          blob
        );
      }
    );
  }

  private cargarHtmlImage(
    dataUrl: string
  ): Promise<HTMLImageElement> {

    return new Promise<HTMLImageElement>(
      (
        resolve,
        reject
      ) => {

        const image =
          new Image();

        image.onload =
          () => {

            resolve(
              image
            );
          };

        image.onerror =
          () => {

            reject(
              new Error(
                'No se pudo cargar la imagen.'
              )
            );
          };

        image.src =
          dataUrl;
      }
    );
  }

  /*
   * =========================================================
   * FUENTE ADAPTABLE
   * =========================================================
   */

  private calcularFuenteParaAncho(
    pdf: jsPDF,
    texto: string,
    anchoDisponible: number,
    maxFontSize: number,
    minFontSize: number
  ): number {

    const textoSeguro =
      texto ?? '';

    let fontSize =
      maxFontSize;

    pdf.setFontSize(
      fontSize
    );

    while (
      pdf.getTextWidth(
        textoSeguro
      ) >
        anchoDisponible &&
      fontSize >
        minFontSize
    ) {

      fontSize -=
        0.25;

      pdf.setFontSize(
        fontSize
      );
    }

    return fontSize;
  }

  /*
   * =========================================================
   * FECHA
   * =========================================================
   */

  private formatearFecha(
    fecha: string
  ): string {

    if (!fecha) {
      return '';
    }

    const partes =
      fecha.split('-');

    if (
      partes.length !== 3
    ) {
      return fecha;
    }

    return (
      `${partes[2]}/` +
      `${partes[1]}/` +
      `${partes[0]}`
    );
  }

  private obtenerFechaHoy(): string {

    const fecha =
      new Date();

    const anio =
      fecha.getFullYear();

    const mes =
      String(
        fecha.getMonth() + 1
      ).padStart(
        2,
        '0'
      );

    const dia =
      String(
        fecha.getDate()
      ).padStart(
        2,
        '0'
      );

    return (
      `${anio}-${mes}-${dia}`
    );
  }

  /*
   * =========================================================
   * ERRORES
   * =========================================================
   */

  private errorMessage(
    err: unknown
  ): string {

    const e =
      err as {
        error?: {
          message?: string;
        } | string;
      };

    if (
      typeof e?.error ===
      'string'
    ) {

      return e.error;
    }

    return (
      e?.error?.message ??
      'No se pudo cargar el historial de asistencias.'
    );
  }
}