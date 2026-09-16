import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { AsistenciaResponse, Plaza, Turno } from '../asistencia/models/asistencia.models';
import { AsistenciaApiService } from '../asistencia/services/asistencia-api.service';

type PeriodoVista = 'SEMANA' | 'MES' | 'ANIO';

interface ChartPoint {
  label: string;
  presentes: number | null;
  programados: number | null;
  ausentes: number;
  porcentaje: number;
}

interface MotivoDetalle {
  motivo: string;
  total: number;
  porcentaje: number;
  offset: number;
  color: string;
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
  readonly loadingAnio = signal(true);
  readonly error = signal('');
  readonly errorAnio = signal('');
  readonly ultimaActualizacion = signal<Date | null>(null);

  readonly plazas = signal<Plaza[]>([]);
  readonly turnos = signal<Turno[]>([]);
  readonly registrosMesActual = signal<AsistenciaResponse[]>([]);
  readonly registrosAnio = signal<AsistenciaResponse[]>([]);

  private readonly ahora = new Date();
  readonly anio = signal(this.ahora.getFullYear());
  readonly mes = signal(this.ahora.getMonth() + 1);
  readonly semana = signal(Math.min(5, Math.ceil(this.ahora.getDate() / 7)));
  readonly periodoVista = signal<PeriodoVista>('MES');
  readonly plazaId = signal<number | null>(null);
  readonly turnoId = signal<number | null>(null);
  readonly turnoAnaliticaId = signal<number | null>(null);
  readonly puntoHover = signal<number | null>(null);

  private readonly cacheMes = new Map<string, AsistenciaResponse[]>();
  private readonly cacheAnio = new Map<string, AsistenciaResponse[]>();
  private readonly motivoColores = [
    '#2563eb', '#7c3aed', '#06b6d4', '#f59e0b', '#ef4444', '#10b981',
    '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#84cc16', '#0ea5e9'
  ];

  readonly meses = [
    { id: 1, nombre: 'Enero', corto: 'Ene' }, { id: 2, nombre: 'Febrero', corto: 'Feb' },
    { id: 3, nombre: 'Marzo', corto: 'Mar' }, { id: 4, nombre: 'Abril', corto: 'Abr' },
    { id: 5, nombre: 'Mayo', corto: 'May' }, { id: 6, nombre: 'Junio', corto: 'Jun' },
    { id: 7, nombre: 'Julio', corto: 'Jul' }, { id: 8, nombre: 'Agosto', corto: 'Ago' },
    { id: 9, nombre: 'Septiembre', corto: 'Sep' }, { id: 10, nombre: 'Octubre', corto: 'Oct' },
    { id: 11, nombre: 'Noviembre', corto: 'Nov' }, { id: 12, nombre: 'Diciembre', corto: 'Dic' }
  ];

  readonly anios = Array.from({ length: 7 }, (_, i) => this.ahora.getFullYear() - i);
  readonly semanas = [1, 2, 3, 4, 5];
  readonly yTicks = [1, .75, .5, .25, 0];

  readonly esSupervisor = computed(() => this.auth.tieneRol('SUPERVISOR'));
  readonly puedeFiltrarTodasLasPlazas = computed(() => this.auth.tieneRol('SUPERVISOR', 'CONTROLADOR'));
  readonly plazaBloqueada = computed(() => !this.puedeFiltrarTodasLasPlazas() && !!this.auth.usuario()?.plazaId);
  readonly nombreMes = computed(() => this.meses.find(item => item.id === this.mes())?.nombre ?? 'Mes');
  readonly nombreMesAnterior = computed(() => {
    const mesAnterior = this.mes() === 1 ? 12 : this.mes() - 1;
    return this.meses.find(item => item.id === mesAnterior)?.nombre ?? 'Mes anterior';
  });
  readonly plazaSeleccionada = computed(() => {
    if (!this.plazaId()) return 'Todas las plazas';
    return this.plazas().find(item => item.id === this.plazaId())?.codigo ?? this.auth.usuario()?.plaza ?? 'Plaza';
  });

  readonly registrosMes = computed(() => this.filtrarTurno(this.registrosMesActual()));
  readonly registrosAnioFiltrado = computed(() => this.filtrarTurno(this.registrosAnio()));

  readonly registrosSemana = computed(() => {
    const inicio = (this.semana() - 1) * 7 + 1;
    const fin = Math.min(inicio + 6, new Date(this.anio(), this.mes(), 0).getDate());
    return this.registrosMes().filter(item => {
      const dia = Number(item.fecha.slice(8, 10));
      return dia >= inicio && dia <= fin;
    });
  });

  readonly registrosPeriodo = computed(() => {
    if (this.periodoVista() === 'SEMANA') return this.registrosSemana();
    if (this.periodoVista() === 'ANIO') return this.registrosAnioFiltrado();
    return this.registrosMes();
  });

  readonly totalRegistros = computed(() => this.registrosPeriodo().length);
  readonly totalProgramados = computed(() => this.sumar(this.registrosPeriodo(), 'programados'));
  readonly totalPresentes = computed(() => this.sumar(this.registrosPeriodo(), 'presentes'));
  readonly totalAusencias = computed(() => this.sumar(this.registrosPeriodo(), 'ausentes'));
  readonly asistenciaPromedio = computed(() => this.weightedPercentage(this.registrosPeriodo()));
  readonly asistenciaPromedioAnual = computed(() => this.weightedPercentage(this.registrosAnioFiltrado()));
  readonly variacionVsAnual = computed(() => {
    const actual = this.asistenciaPromedio();
    const anual = this.asistenciaPromedioAnual();
    if (!anual) return 0;
    return Math.round((actual - anual) * 10) / 10;
  });

  readonly diasPeriodo = computed(() => {
    if (this.periodoVista() === 'SEMANA') {
      const inicio = (this.semana() - 1) * 7 + 1;
      return Math.max(0, Math.min(7, new Date(this.anio(), this.mes(), 0).getDate() - inicio + 1));
    }
    if (this.periodoVista() === 'MES') return new Date(this.anio(), this.mes(), 0).getDate();
    return 12;
  });

  readonly tituloPeriodo = computed(() => {
    if (this.periodoVista() === 'SEMANA') return `Semana ${this.semana()} · ${this.nombreMes()} ${this.anio()}`;
    if (this.periodoVista() === 'ANIO') return `Año ${this.anio()}`;
    return `${this.nombreMes()} ${this.anio()}`;
  });

  readonly subtituloGrafica = computed(() => {
    if (this.periodoVista() === 'ANIO') return 'Comparativa mensual de personal presente y programado.';
    if (this.periodoVista() === 'SEMANA') return 'Comparativa diaria dentro de la semana seleccionada.';
    return 'Comparativa diaria dentro del mes seleccionado.';
  });

  readonly chartPoints = computed<ChartPoint[]>(() => {
    if (this.periodoVista() === 'ANIO') return this.puntosAnio();
    const inicio = this.periodoVista() === 'SEMANA' ? (this.semana() - 1) * 7 + 1 : 1;
    const ultimoDia = new Date(this.anio(), this.mes(), 0).getDate();
    const fin = this.periodoVista() === 'SEMANA' ? Math.min(inicio + 6, ultimoDia) : ultimoDia;
    return this.puntosDias(inicio, fin);
  });

  readonly chartMax = computed(() => {
    const values = this.chartPoints().flatMap(p => [p.presentes ?? 0, p.programados ?? 0]);
    const max = Math.max(...values, 1);
    return Math.ceil(max / 10) * 10;
  });

  readonly motivos = computed<MotivoDetalle[]>(() => {
    const mapa = new Map<string, number>();
    for (const registro of this.registrosPeriodo()) {
      for (const ausencia of registro.ausencias ?? []) {
        mapa.set(ausencia.motivo, (mapa.get(ausencia.motivo) ?? 0) + 1);
      }
    }

    const items = [...mapa.entries()]
      .map(([motivo, total]) => ({ motivo, total }))
      .sort((a, b) => b.total - a.total || a.motivo.localeCompare(b.motivo));
    const total = items.reduce((acc, item) => acc + item.total, 0);
    let offset = 0;

    return items.map((item, index) => {
      const porcentaje = total ? Math.round((item.total / total) * 1000) / 10 : 0;
      const detalle: MotivoDetalle = {
        ...item,
        porcentaje,
        offset,
        color: this.motivoColores[index % this.motivoColores.length]
      };
      offset += porcentaje;
      return detalle;
    });
  });

  readonly totalMotivos = computed(() => this.motivos().reduce((acc, item) => acc + item.total, 0));

  readonly turnoAnalitica = computed(() => {
    const id = this.turnoAnaliticaId() ?? this.turnos()[0]?.id ?? null;
    return this.turnos().find(t => t.id === id) ?? null;
  });

  readonly promedioTurnoAnual = computed(() => {
    const id = this.turnoAnalitica()?.id;
    if (!id) return 0;
    return this.weightedPercentage(this.registrosAnio().filter(r => r.turnoId === id));
  });

  readonly promedioTurnoMes = computed(() => {
    const id = this.turnoAnalitica()?.id;
    if (!id) return 0;
    return this.weightedPercentage(this.registrosMesActual().filter(r => r.turnoId === id));
  });

  readonly registrosTurnoAnual = computed(() => {
    const id = this.turnoAnalitica()?.id;
    return id ? this.registrosAnio().filter(r => r.turnoId === id).length : 0;
  });

  readonly registrosTurnoMes = computed(() => {
    const id = this.turnoAnalitica()?.id;
    return id ? this.registrosMesActual().filter(r => r.turnoId === id).length : 0;
  });

  readonly promedioTurnoMesAnterior = computed(() => {
    const id = this.turnoAnalitica()?.id;
    if (!id) return 0;
    const mesAnterior = this.mes() === 1 ? 12 : this.mes() - 1;
    const anioAnterior = this.mes() === 1 ? this.anio() - 1 : this.anio();
    const registros = this.registrosAnio().filter(r =>
      r.turnoId === id &&
      Number(r.fecha.slice(0, 4)) === anioAnterior &&
      Number(r.fecha.slice(5, 7)) === mesAnterior
    );
    return this.weightedPercentage(registros);
  });

  readonly registrosTurnoMesAnterior = computed(() => {
    const id = this.turnoAnalitica()?.id;
    if (!id) return 0;
    const mesAnterior = this.mes() === 1 ? 12 : this.mes() - 1;
    const anioAnterior = this.mes() === 1 ? this.anio() - 1 : this.anio();
    return this.registrosAnio().filter(r =>
      r.turnoId === id &&
      Number(r.fecha.slice(0, 4)) === anioAnterior &&
      Number(r.fecha.slice(5, 7)) === mesAnterior
    ).length;
  });

  readonly anioMesAnterior = computed(() => this.mes() === 1 ? this.anio() - 1 : this.anio());

  ngOnInit(): void {
    const usuario = this.auth.usuario();
    if (!this.puedeFiltrarTodasLasPlazas() && usuario?.plazaId) this.plazaId.set(usuario.plazaId);
    this.cargarInicial();
  }

  setPeriodo(periodo: PeriodoVista): void {
    this.periodoVista.set(periodo);
    this.puntoHover.set(null);
  }

  setPuntoHover(index: number | null): void {
    this.puntoHover.set(index);
  }

  onTurnoAnaliticaChange(event: Event): void {
    this.turnoAnaliticaId.set(Number((event.target as HTMLSelectElement).value));
  }

  onAnioChange(event: Event): void {
    this.anio.set(Number((event.target as HTMLSelectElement).value));
    this.cargarMesActual();
    this.cargarAnio();
  }

  onMesChange(event: Event): void {
    this.mes.set(Number((event.target as HTMLSelectElement).value));
    this.semana.set(1);
    this.cargarMesActual();
  }

  onSemanaChange(event: Event): void {
    this.semana.set(Number((event.target as HTMLSelectElement).value));
  }

  onPlazaChange(event: Event): void {
    if (this.plazaBloqueada()) return;
    const value = (event.target as HTMLSelectElement).value;
    this.plazaId.set(value ? Number(value) : null);
    this.cargarMesActual();
    this.cargarAnio();
  }

  onTurnoChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.turnoId.set(value ? Number(value) : null);
  }

  actualizar(): void {
    this.cacheMes.clear();
    this.cacheAnio.clear();
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
        const activas = plazas.filter(p => p.activo);
        this.plazas.set(this.plazaBloqueada() ? activas.filter(p => p.id === this.plazaId()) : activas);
        this.turnos.set(turnos);
        if (!this.turnoAnaliticaId() && turnos.length) this.turnoAnaliticaId.set(turnos[0].id);
        this.registrosMesActual.set(registros);
        this.cacheMes.set(this.claveMes(), registros);
        this.ultimaActualizacion.set(new Date());
        this.loading.set(false);
      },
      error: err => this.handleError(err)
    });
    this.cargarAnio();
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

  cargarAnio(): void {
    const clave = this.claveAnio();
    const cacheado = this.cacheAnio.get(clave);
    if (cacheado) {
      this.registrosAnio.set(cacheado);
      this.loadingAnio.set(false);
      return;
    }
    this.loadingAnio.set(true);
    this.errorAnio.set('');
    const { inicio, fin } = this.yearRange();
    this.api.listarAsistencias(inicio, fin, this.plazaId()).subscribe({
      next: registros => {
        this.registrosAnio.set(registros);
        this.cacheAnio.set(clave, registros);
        this.loadingAnio.set(false);
      },
      error: err => {
        this.loadingAnio.set(false);
        const e = err as { error?: { message?: string }; message?: string };
        this.errorAnio.set(e?.error?.message ?? e?.message ?? 'No se pudo cargar la información anual.');
      }
    });
  }

  chartX(index: number, total: number): number {
    const left = 54, right = 20, width = 1000 - left - right;
    return total <= 1 ? left + width / 2 : left + (index * width) / (total - 1);
  }

  chartY(value: number): number {
    const top = 18, bottom = 238;
    const max = this.chartMax();
    return bottom - (Math.max(0, Math.min(max, value)) / max) * (bottom - top);
  }

  chartTickValue(factor: number): number {
    return Math.round(this.chartMax() * factor);
  }

  tooltipX(index: number, total: number): number {
    const x = this.chartX(index, total);
    if (x > 790) return x - 168;
    return x + 14;
  }

  linePath(points: ChartPoint[], key: 'presentes' | 'programados'): string {
    const valid = points.map((p, i) => p[key] === null ? null : `${this.chartX(i, points.length)},${this.chartY(p[key]!)}`)
      .filter((p): p is string => p !== null);
    return valid.length ? `M ${valid.join(' L ')}` : '';
  }

  areaPath(points: ChartPoint[], key: 'presentes' | 'programados'): string {
    const valid = points.map((p, i) => p[key] === null ? null : { x: this.chartX(i, points.length), y: this.chartY(p[key]!) })
      .filter((p): p is { x: number; y: number } => p !== null);
    if (!valid.length) return '';
    const bottom = 238;
    return `M ${valid[0].x},${bottom} L ${valid.map(p => `${p.x},${p.y}`).join(' L ')} L ${valid[valid.length - 1].x},${bottom} Z`;
  }

  gaugeDash(value: number): string {
    return `${Math.max(0, Math.min(100, value))} 100`;
  }

  private puntosDias(inicio: number, fin: number): ChartPoint[] {
    const mapa = new Map<number, { presentes: number; programados: number; ausentes: number }>();
    for (const r of this.registrosMes()) {
      const dia = Number(r.fecha.slice(8, 10));
      if (dia < inicio || dia > fin) continue;
      const actual = mapa.get(dia) ?? { presentes: 0, programados: 0, ausentes: 0 };
      actual.presentes += Number(r.presentes || 0);
      actual.programados += Number(r.programados || 0);
      actual.ausentes += Number(r.ausentes || 0);
      mapa.set(dia, actual);
    }
    return Array.from({ length: fin - inicio + 1 }, (_, i) => {
      const dia = inicio + i;
      const dato = mapa.get(dia);
      const presentes = dato?.presentes ?? null;
      const programados = dato?.programados ?? null;
      return {
        label: String(dia),
        presentes,
        programados,
        ausentes: dato?.ausentes ?? 0,
        porcentaje: programados ? Math.round(((presentes ?? 0) / programados) * 1000) / 10 : 0
      };
    });
  }

  private puntosAnio(): ChartPoint[] {
    const mapa = new Map<number, { presentes: number; programados: number; ausentes: number }>();
    for (const r of this.registrosAnioFiltrado()) {
      const mes = Number(r.fecha.slice(5, 7));
      const actual = mapa.get(mes) ?? { presentes: 0, programados: 0, ausentes: 0 };
      actual.presentes += Number(r.presentes || 0);
      actual.programados += Number(r.programados || 0);
      actual.ausentes += Number(r.ausentes || 0);
      mapa.set(mes, actual);
    }
    return this.meses.map(m => {
      const dato = mapa.get(m.id);
      const presentes = dato?.presentes ?? null;
      const programados = dato?.programados ?? null;
      return {
        label: m.corto,
        presentes,
        programados,
        ausentes: dato?.ausentes ?? 0,
        porcentaje: programados ? Math.round(((presentes ?? 0) / programados) * 1000) / 10 : 0
      };
    });
  }

  private filtrarTurno(registros: AsistenciaResponse[]): AsistenciaResponse[] {
    const turnoId = this.turnoId();
    return registros.filter(r => !turnoId || r.turnoId === turnoId);
  }

  private sumar(registros: AsistenciaResponse[], campo: 'programados' | 'presentes' | 'ausentes'): number {
    return registros.reduce((acc, item) => acc + Number(item[campo] || 0), 0);
  }

  private weightedPercentage(registros: AsistenciaResponse[]): number {
    const programados = this.sumar(registros, 'programados');
    const presentes = this.sumar(registros, 'presentes');
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
    this.error.set(e?.error?.message ?? e?.message ?? 'No se pudo cargar el dashboard.');
  }
}
