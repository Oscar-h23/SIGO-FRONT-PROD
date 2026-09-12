import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { AsistenciaResponse, Plaza, Turno } from '../asistencia/models/asistencia.models';
import { AsistenciaApiService } from '../asistencia/services/asistencia-api.service';

interface LinePoint {
  label: string;
  value: number | null;
}

interface MotivoConteo {
  motivo: string;
  total: number;
}

interface TurnoResumen {
  id: number;
  nombre: string;
  porcentaje: number;
}

interface TendenciaMensual {
  delta: number;
  subiendo: boolean;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  private readonly api = inject(AsistenciaApiService);
  readonly auth = inject(AuthService);

  readonly loading = signal(true);
  readonly loadingMensual = signal(true);
  readonly error = signal('');
  readonly errorMensual = signal('');
  readonly ultimaActualizacion = signal<Date | null>(null);

  readonly plazas = signal<Plaza[]>([]);
  readonly turnos = signal<Turno[]>([]);
  readonly registrosMesActual = signal<AsistenciaResponse[]>([]);
  readonly registrosAnio = signal<AsistenciaResponse[]>([]);

  private readonly ahora = new Date();
  readonly anio = signal(this.ahora.getFullYear());
  readonly mes = signal(this.ahora.getMonth() + 1);
  readonly plazaId = signal<number | null>(null);
  readonly turnoId = signal<number | null>(null);

  private readonly cacheMes = new Map<string, AsistenciaResponse[]>();
  private readonly cacheAnio = new Map<string, AsistenciaResponse[]>();

  readonly meses = [
    { id: 1, nombre: 'Enero', corto: 'Ene' },
    { id: 2, nombre: 'Febrero', corto: 'Feb' },
    { id: 3, nombre: 'Marzo', corto: 'Mar' },
    { id: 4, nombre: 'Abril', corto: 'Abr' },
    { id: 5, nombre: 'Mayo', corto: 'May' },
    { id: 6, nombre: 'Junio', corto: 'Jun' },
    { id: 7, nombre: 'Julio', corto: 'Jul' },
    { id: 8, nombre: 'Agosto', corto: 'Ago' },
    { id: 9, nombre: 'Septiembre', corto: 'Sep' },
    { id: 10, nombre: 'Octubre', corto: 'Oct' },
    { id: 11, nombre: 'Noviembre', corto: 'Nov' },
    { id: 12, nombre: 'Diciembre', corto: 'Dic' }
  ];

  readonly anios = Array.from({ length: 7 }, (_, i) => this.ahora.getFullYear() - i);
  readonly yTicks = [100, 75, 50, 25, 0];
  readonly meta = 95;

  readonly esSupervisor = computed(() => this.auth.tieneRol('SUPERVISOR'));
  readonly plazaBloqueada = computed(() => !this.esSupervisor() && !!this.auth.usuario()?.plazaId);
  readonly nombreMes = computed(() => this.meses.find(item => item.id === this.mes())?.nombre ?? 'Mes');
  readonly plazaSeleccionada = computed(() => {
    if (!this.plazaId()) return 'Todas las plazas';
    return this.plazas().find(item => item.id === this.plazaId())?.codigo ?? this.auth.usuario()?.plaza ?? 'Plaza';
  });

  readonly registrosMes = computed(() => {
    const turnoId = this.turnoId();
    return this.registrosMesActual().filter(item => !turnoId || item.turnoId === turnoId);
  });

  readonly registrosAnioFiltrado = computed(() => {
    const turnoId = this.turnoId();
    return this.registrosAnio().filter(item => !turnoId || item.turnoId === turnoId);
  });

  readonly totalRegistros = computed(() => this.registrosMes().length);
  readonly totalProgramados = computed(() => this.registrosMes().reduce((acc, item) => acc + Number(item.programados || 0), 0));
  readonly totalPresentes = computed(() => this.registrosMes().reduce((acc, item) => acc + Number(item.presentes || 0), 0));
  readonly totalAusencias = computed(() => this.registrosMes().reduce((acc, item) => acc + Number(item.ausentes || 0), 0));
  readonly registros100 = computed(() => this.registrosMes().filter(item => Number(item.porcentaje) >= 99.995).length);
  readonly asistenciaPromedio = computed(() => this.weightedPercentage(this.registrosMes()));
  readonly sinDatos = computed(() => !this.loading() && !this.error() && this.registrosMes().length === 0);

  private readonly acumuladoPorMes = computed(() => {
    const acumulado = new Map<number, { programados: number; presentes: number }>();
    for (const item of this.registrosAnioFiltrado()) {
      const mes = Number(item.fecha.slice(5, 7));
      const actual = acumulado.get(mes) ?? { programados: 0, presentes: 0 };
      actual.programados += Number(item.programados || 0);
      actual.presentes += Number(item.presentes || 0);
      acumulado.set(mes, actual);
    }
    return acumulado;
  });

  readonly mensual = computed<LinePoint[]>(() => {
    const acumulado = this.acumuladoPorMes();
    return this.meses.map(item => {
      const datos = acumulado.get(item.id);
      return {
        label: item.corto,
        value: datos && datos.programados > 0
          ? Math.round((datos.presentes / datos.programados) * 1000) / 10
          : null
      };
    });
  });

  readonly tendenciaMensual = computed<TendenciaMensual | null>(() => {
    const indiceActual = this.mes() - 1;
    const indiceAnterior = indiceActual - 1;
    if (indiceAnterior < 0) return null;

    const actual = this.mensual()[indiceActual]?.value;
    const anterior = this.mensual()[indiceAnterior]?.value;
    if (actual === null || actual === undefined || anterior === null || anterior === undefined) return null;

    const delta = Math.round((actual - anterior) * 10) / 10;
    return { delta, subiendo: delta >= 0 };
  });

  private readonly acumuladoPorDia = computed(() => {
    const acumulado = new Map<number, { programados: number; presentes: number }>();
    for (const item of this.registrosMes()) {
      const dia = Number(item.fecha.slice(8, 10));
      const actual = acumulado.get(dia) ?? { programados: 0, presentes: 0 };
      actual.programados += Number(item.programados || 0);
      actual.presentes += Number(item.presentes || 0);
      acumulado.set(dia, actual);
    }
    return acumulado;
  });

  readonly diario = computed<LinePoint[]>(() => {
    const dias = new Date(this.anio(), this.mes(), 0).getDate();
    const acumulado = this.acumuladoPorDia();
    return Array.from({ length: dias }, (_, i) => {
      const dia = i + 1;
      const datos = acumulado.get(dia);
      return {
        label: String(dia),
        value: datos && datos.programados > 0
          ? Math.round((datos.presentes / datos.programados) * 1000) / 10
          : null
      };
    });
  });

  readonly motivos = computed<MotivoConteo[]>(() => {
    const mapa = new Map<string, number>();
    for (const registro of this.registrosMes()) {
      for (const ausencia of registro.ausencias ?? []) {
        mapa.set(ausencia.motivo, (mapa.get(ausencia.motivo) ?? 0) + 1);
      }
    }
    return [...mapa.entries()]
      .map(([motivo, total]) => ({ motivo, total }))
      .sort((a, b) => b.total - a.total || a.motivo.localeCompare(b.motivo))
      .slice(0, 6);
  });

  readonly maxMotivos = computed(() => Math.max(...this.motivos().map(item => item.total), 1));

  readonly resumenTurnos = computed<TurnoResumen[]>(() => {
    const acumulado = new Map<number, { programados: number; presentes: number }>();
    for (const registro of this.registrosMes()) {
      const actual = acumulado.get(registro.turnoId) ?? { programados: 0, presentes: 0 };
      actual.programados += Number(registro.programados || 0);
      actual.presentes += Number(registro.presentes || 0);
      acumulado.set(registro.turnoId, actual);
    }

    return this.turnos().map(turno => {
      const datos = acumulado.get(turno.id);
      return {
        id: turno.id,
        nombre: `Turno ${turno.codigo}`,
        porcentaje: datos && datos.programados > 0
          ? Math.round((datos.presentes / datos.programados) * 1000) / 10
          : 0
      };
    });
  });

  ngOnInit(): void {
    const usuario = this.auth.usuario();
    if (usuario?.rol !== 'SUPERVISOR' && usuario?.plazaId) {
      this.plazaId.set(usuario.plazaId);
    }
    this.cargarInicial();
  }

  onAnioChange(event: Event): void {
    this.anio.set(Number((event.target as HTMLSelectElement).value));
    this.cargarMesActual();
    this.cargarAnioEnSegundoPlano();
  }

  onMesChange(event: Event): void {
    this.mes.set(Number((event.target as HTMLSelectElement).value));
    this.cargarMesActual();
  }

  onPlazaChange(event: Event): void {
    if (this.plazaBloqueada()) return;
    const value = (event.target as HTMLSelectElement).value;
    this.plazaId.set(value ? Number(value) : null);
    this.cargarMesActual();
    this.cargarAnioEnSegundoPlano();
  }

  onTurnoChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.turnoId.set(value ? Number(value) : null);
  }

  actualizar(): void {
    this.cacheMes.clear();
    this.cacheAnio.clear();
    this.error.set('');
    this.errorMensual.set('');
    this.cargarInicial();
  }

  cargarInicial(): void {
    this.loading.set(true);
    this.error.set('');
    const { inicio, fin } = this.mesRange();

    forkJoin({
      plazas: this.api.getPlazas(),
      turnos: this.api.getTurnos(),
      registros: this.api.listarAsistencias(inicio, fin, this.plazaId())
    }).subscribe({
      next: ({ plazas, turnos, registros }) => {
        const activas = plazas.filter(item => item.activo);
        this.plazas.set(this.plazaBloqueada() ? activas.filter(item => item.id === this.plazaId()) : activas);
        this.turnos.set(turnos);
        this.registrosMesActual.set(registros);
        this.cacheMes.set(this.claveMes(), registros);
        this.ultimaActualizacion.set(new Date());
        this.loading.set(false);
      },
      error: err => this.handleError(err)
    });

    this.cargarAnioEnSegundoPlano();
  }

  cargarMesActual(): void {
    const clave = this.claveMes();
    const cacheado = this.cacheMes.get(clave);
    if (cacheado) {
      this.registrosMesActual.set(cacheado);
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set('');
    const { inicio, fin } = this.mesRange();

    this.api.listarAsistencias(inicio, fin, this.plazaId()).subscribe({
      next: registros => {
        this.registrosMesActual.set(registros);
        this.cacheMes.set(clave, registros);
        this.ultimaActualizacion.set(new Date());
        this.loading.set(false);
      },
      error: err => this.handleError(err)
    });
  }

  cargarAnioEnSegundoPlano(): void {
    const clave = this.claveAnio();
    const cacheado = this.cacheAnio.get(clave);
    if (cacheado) {
      this.registrosAnio.set(cacheado);
      this.loadingMensual.set(false);
      return;
    }

    this.loadingMensual.set(true);
    this.errorMensual.set('');
    const { inicio, fin } = this.yearRange();

    this.api.listarAsistencias(inicio, fin, this.plazaId()).subscribe({
      next: registros => {
        this.registrosAnio.set(registros);
        this.cacheAnio.set(clave, registros);
        this.loadingMensual.set(false);
      },
      error: err => {
        this.loadingMensual.set(false);
        const e = err as { error?: { message?: string }; message?: string };
        this.errorMensual.set(e?.error?.message ?? e?.message ?? 'No se pudo cargar la tendencia anual.');
      }
    });
  }

  chartX(index: number, total: number): number {
    const left = 50;
    const right = 20;
    const width = 1000 - left - right;
    return total <= 1 ? left + width / 2 : left + (index * width) / (total - 1);
  }

  chartY(value: number): number {
    const top = 18;
    const bottom = 238;
    const clamped = Math.max(0, Math.min(100, value));
    return bottom - (clamped / 100) * (bottom - top);
  }

  linePath(points: LinePoint[]): string {
    const segmentos: string[] = [];
    let segmento: string[] = [];

    points.forEach((point, index) => {
      if (point.value === null) {
        if (segmento.length) segmentos.push(this.segmentoPath(segmento));
        segmento = [];
        return;
      }
      segmento.push(`${this.chartX(index, points.length)},${this.chartY(point.value)}`);
    });

    if (segmento.length) segmentos.push(this.segmentoPath(segmento));
    return segmentos.join(' ');
  }

  bajoMeta(value: number | null): boolean {
    return value !== null && value < this.meta;
  }

  motivoWidth(total: number): number {
    return Math.max(4, (total / this.maxMotivos()) * 100);
  }

  private segmentoPath(puntos: string[]): string {
    return puntos.length ? `M ${puntos.join(' L ')}` : '';
  }

  private weightedPercentage(registros: AsistenciaResponse[]): number {
    const programados = registros.reduce((acc, item) => acc + Number(item.programados || 0), 0);
    const presentes = registros.reduce((acc, item) => acc + Number(item.presentes || 0), 0);
    return programados ? Math.round((presentes / programados) * 1000) / 10 : 0;
  }

  private yearRange(): { inicio: string; fin: string } {
    return { inicio: `${this.anio()}-01-01`, fin: `${this.anio()}-12-31` };
  }

  private mesRange(): { inicio: string; fin: string } {
    const ultimoDia = new Date(this.anio(), this.mes(), 0).getDate();
    const mm = String(this.mes()).padStart(2, '0');
    return {
      inicio: `${this.anio()}-${mm}-01`,
      fin: `${this.anio()}-${mm}-${String(ultimoDia).padStart(2, '0')}`
    };
  }

  private claveMes(): string {
    return `${this.anio()}-${this.mes()}-${this.plazaId() ?? 'todas'}`;
  }

  private claveAnio(): string {
    return `${this.anio()}-${this.plazaId() ?? 'todas'}`;
  }

  private handleError(err: unknown): void {
    this.loading.set(false);
    const e = err as { error?: { message?: string }; message?: string };
    this.error.set(e?.error?.message ?? e?.message ?? 'No se pudo cargar el dashboard. Verifica que Spring Boot esté ejecutándose.');
  }
}
