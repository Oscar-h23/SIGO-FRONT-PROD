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

  private readonly cacheMes = new Map<string, AsistenciaResponse[]>();
  private readonly cacheAnio = new Map<string, AsistenciaResponse[]>();

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
  readonly plazaBloqueada = computed(() => !this.esSupervisor() && !!this.auth.usuario()?.plazaId);
  readonly nombreMes = computed(() => this.meses.find(item => item.id === this.mes())?.nombre ?? 'Mes');
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

  readonly motivos = computed<MotivoConteo[]>(() => {
    const mapa = new Map<string, number>();
    for (const registro of this.registrosPeriodo()) {
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
    for (const registro of this.registrosPeriodo()) {
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
        porcentaje: datos?.programados ? Math.round((datos.presentes / datos.programados) * 1000) / 10 : 0
      };
    });
  });

  ngOnInit(): void {
    const usuario = this.auth.usuario();
    if (usuario?.rol !== 'SUPERVISOR' && usuario?.plazaId) this.plazaId.set(usuario.plazaId);
    this.cargarInicial();
  }

  setPeriodo(periodo: PeriodoVista): void {
    this.periodoVista.set(periodo);
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

  motivoWidth(total: number): number {
    return Math.max(4, (total / this.maxMotivos()) * 100);
  }

  private puntosDias(inicio: number, fin: number): ChartPoint[] {
    const mapa = new Map<number, { presentes: number; programados: number }>();
    for (const r of this.registrosMes()) {
      const dia = Number(r.fecha.slice(8, 10));
      if (dia < inicio || dia > fin) continue;
      const actual = mapa.get(dia) ?? { presentes: 0, programados: 0 };
      actual.presentes += Number(r.presentes || 0);
      actual.programados += Number(r.programados || 0);
      mapa.set(dia, actual);
    }
    return Array.from({ length: fin - inicio + 1 }, (_, i) => {
      const dia = inicio + i;
      const dato = mapa.get(dia);
      return { label: String(dia), presentes: dato?.presentes ?? null, programados: dato?.programados ?? null };
    });
  }

  private puntosAnio(): ChartPoint[] {
    const mapa = new Map<number, { presentes: number; programados: number }>();
    for (const r of this.registrosAnioFiltrado()) {
      const mes = Number(r.fecha.slice(5, 7));
      const actual = mapa.get(mes) ?? { presentes: 0, programados: 0 };
      actual.presentes += Number(r.presentes || 0);
      actual.programados += Number(r.programados || 0);
      mapa.set(mes, actual);
    }
    return this.meses.map(m => {
      const dato = mapa.get(m.id);
      return { label: m.corto, presentes: dato?.presentes ?? null, programados: dato?.programados ?? null };
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
    return { inicio: `${this.anio()}-${mm}-01`, fin: `${this.anio()}-${mm}-${String(ultimoDia).padStart(2, '0')}` };
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
